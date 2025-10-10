import { loadState, saveState, resetState, createSessionId, mergeOptions, updatePlan, markStepComplete, pushDiagnostic } from './memory.js';
import { withRateLimit } from './rateLimiter.js';
import { getFunctionDeclarations, getToolSchema, isVisualTool } from './tools.js';
import { validateActionPlan } from './validators.js';
import { selectBestCandidate } from './grounding.js';
import { tavilySearch } from '../tavily.js';
import { plannerGenerate, executorGenerate, extractFunctionCalls, extractTextResponse } from '../llm.js';

const PROMPT_CACHE = new Map();
const STEP_STATUS = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING: 'waiting',
  STOPPED: 'stopped',
  ERROR: 'error'
};

// Runtime state that lives inside the background service worker. This is kept
// lightweight so we can persist richer data in chrome.storage via memory.js.
const agentRuntime = {
  status: STEP_STATUS.IDLE,
  tabId: null,
  sessionId: null,
  goal: null,
  active: false,
  processing: false,
  awaitingInterrupt: false,
  options: {},
  lastModelUsed: null,
  lastTool: null,
  lastError: null,
  lastSnapshot: null,
  cooldownUntil: null
};

const LOG_PREFIX = '[WebGuideAI][Agent]';

const log = {
  debug(message, context) {
    if (context !== undefined) {
      console.debug(`${LOG_PREFIX} ${message}`, context);
    } else {
      console.debug(`${LOG_PREFIX} ${message}`);
    }
  },
  info(message, context) {
    if (context !== undefined) {
      console.info(`${LOG_PREFIX} ${message}`, context);
    } else {
      console.info(`${LOG_PREFIX} ${message}`);
    }
  },
  warn(message, context) {
    if (context !== undefined) {
      console.warn(`${LOG_PREFIX} ${message}`, context);
    } else {
      console.warn(`${LOG_PREFIX} ${message}`);
    }
  },
  error(message, context) {
    if (context !== undefined) {
      console.error(`${LOG_PREFIX} ${message}`, context);
    } else {
      console.error(`${LOG_PREFIX} ${message}`);
    }
  }
};

function normalizeJsonPayload(text) {
  if (typeof text !== 'string') {
    return '';
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/^```(?:json)?\n([\s\S]*?)\n```$/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  const withoutLeading = trimmed.replace(/^```(?:json)?\n?/i, '');
  const withoutTrailing = withoutLeading.replace(/```$/, '');
  return withoutTrailing.trim();
}

function broadcast(update = {}) {
  const payload = {
    type: 'wga-agent-update',
    data: {
      status: agentRuntime.status,
      goal: agentRuntime.goal,
      sessionId: agentRuntime.sessionId,
      lastModel: agentRuntime.lastModelUsed,
      lastTool: agentRuntime.lastTool,
      lastError: agentRuntime.lastError,
      awaitingInterrupt: agentRuntime.awaitingInterrupt,
      ...update
    }
  };
  chrome.runtime.sendMessage(payload).catch(() => {});
}

async function loadPrompt(path) {
  if (!PROMPT_CACHE.has(path)) {
    const url = chrome.runtime.getURL(path);
    const response = await fetch(url);
    const text = await response.text();
    PROMPT_CACHE.set(path, text);
  }
  return PROMPT_CACHE.get(path);
}

async function getPlannerPrompt() {
  return loadPrompt('prompts/system_planner.txt');
}

async function getExecutorPrompt() {
  return loadPrompt('prompts/system_executor.txt');
}

function formatSnapshotForPrompt(snapshot) {
  if (!Array.isArray(snapshot) || !snapshot.length) {
    return 'No actionable elements detected.';
  }
  return snapshot
    .map((entry, index) => {
      const parts = [
        `#${index + 1} id=${entry.id}`,
        entry.tag ? `tag=${entry.tag}` : null,
        entry.text ? `text="${entry.text}"` : null,
        entry.title ? `title="${entry.title}"` : null,
        entry.ariaLabel ? `aria="${entry.ariaLabel}"` : null,
        entry.placeholder ? `placeholder="${entry.placeholder}"` : null,
        entry.associatedLabel ? `label="${entry.associatedLabel}"` : null
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .join('\n');
}

function formatPlanForPrompt(stepPlan) {
  if (!Array.isArray(stepPlan) || !stepPlan.length) {
    return 'No plan yet.';
  }
  return stepPlan
    .map((step, idx) => `${idx + 1}. [${step.status || 'pending'}] ${step.description}`)
    .join('\n');
}

function formatSearchSummary(lastSearch) {
  if (!lastSearch) {
    return 'No web search performed yet.';
  }
  const lines = [`Query: ${lastSearch.query}`];
  if (lastSearch.answer) {
    lines.push(`Answer: ${lastSearch.answer}`);
  }
  if (Array.isArray(lastSearch.results) && lastSearch.results.length) {
    lastSearch.results.slice(0, 3).forEach((result, idx) => {
      lines.push(`Result ${idx + 1}: ${result.title} — ${result.url}`);
      if (result.content) {
        lines.push(`Snippet: ${result.content}`);
      }
    });
  }
  return lines.join('\n');
}

async function resolveActiveTab(preferredTabId) {
  if (preferredTabId) {
    try {
      const tab = await chrome.tabs.get(preferredTabId);
      if (tab) {
        log.debug('Resolved preferred tab', { tabId: tab.id, url: tab.url });
        return tab;
      }
    } catch (error) {
      log.warn('Preferred tab lookup failed; falling back to active tab', {
        preferredTabId,
        error: error?.message
      });
    }
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active) {
    throw new Error('No active tab available for agent.');
  }
  log.debug('Resolved active tab', { tabId: active.id, url: active.url });
  return active;
}

async function ensureContentScript(tabId) {
  try {
    log.debug('Ensuring content script is injected', { tabId });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
  } catch (error) {
    const message = error?.message || '';
    if (/extension context invalidated/i.test(message) || /cannot access contents of the page/i.test(message)) {
      log.warn('Content script injection warning', { tabId, message });
      return;
    }
    log.error('Content script injection failed', { tabId, error: error?.message, stack: error?.stack });
    throw error;
  }
}

async function sendMessageToTab(message, { retry = true } = {}) {
  if (!agentRuntime.tabId) {
    throw new Error('Agent tabId is not set.');
  }
  try {
    log.debug('Sending message to tab', { tabId: agentRuntime.tabId, messageType: message?.type });
    return await chrome.tabs.sendMessage(agentRuntime.tabId, message);
  } catch (error) {
    const messageText = error?.message || '';
    const receivingEndMissing = /Receiving end does not exist/i.test(messageText) || /Could not establish connection/i.test(messageText);

    if (receivingEndMissing && retry) {
      log.warn('Message delivery failed; attempting content script reinjection', {
        tabId: agentRuntime.tabId,
        messageType: message?.type
      });
      await ensureContentScript(agentRuntime.tabId);
      // small delay to allow script to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));
      return sendMessageToTab(message, { retry: false });
    }

    log.error('Failed to send message to tab', {
      tabId: agentRuntime.tabId,
      messageType: message?.type,
      error: messageText,
      stack: error?.stack
    });
    throw error;
  }
}

async function requestDomSnapshot() {
  log.debug('Requesting DOM snapshot');
  const snapshot = await sendMessageToTab({ type: 'wga-get-dom-snapshot' });
  if (!snapshot || snapshot.ok === false) {
    const errorMessage = snapshot?.error || 'Unable to collect DOM snapshot.';
    log.warn('DOM snapshot request reported failure', {
      error: errorMessage,
      details: snapshot
    });
    throw new Error(errorMessage);
  }

  agentRuntime.lastSnapshot = snapshot;
  await saveState({
    lastDomSnapshotMeta: {
      rawCount: snapshot.rawCount,
      llmCount: snapshot.llmCount,
      mutationVersion: snapshot.mutationVersion
    }
  });

  log.debug('DOM snapshot metadata recorded', {
    rawCount: snapshot.rawCount,
    llmCount: snapshot.llmCount,
    mutationVersion: snapshot.mutationVersion
  });

  return snapshot.snapshot || [];
}

async function executeVisualAction(action, targetId, message) {
  const payload = { type: 'wga-run-overlay', action, targetId, message };
  agentRuntime.lastTool = action;
  return sendMessageToTab(payload);
}

async function executeScroll(direction, targetId) {
  agentRuntime.lastTool = 'scroll';
  return sendMessageToTab({ type: 'wga-scroll', direction, targetId });
}

async function executeToolCall(call) {
  const { name, args } = call;
  if (!name) {
    throw new Error('Tool call missing name.');
  }
  let parsedArgs = {};
  if (args && typeof args === 'string') {
    try {
      parsedArgs = JSON.parse(args);
    } catch (error) {
      log.error('Failed to parse tool arguments', { name, args, error: error.message });
      throw new Error(`Tool ${name} received invalid JSON args.`);
    }
  } else if (args && typeof args === 'object') {
    parsedArgs = args;
  }
  if (name === 'search') {
    const result = await tavilySearch(parsedArgs.query, {
      timeRange: parsedArgs.time_range,
      maxResults: parsedArgs.max_results,
      chunksPerSource: parsedArgs.chunks_per_source
    });
    await saveState({ lastSearch: result });
    agentRuntime.lastTool = 'search';
    return result;
  }
  if (name === 'get_dom_snapshot') {
    agentRuntime.lastTool = 'get_dom_snapshot';
    return requestDomSnapshot();
  }
  if (isVisualTool(name)) {
    await executeVisualAction(name, parsedArgs.targetId, parsedArgs.message);
    return { ok: true };
  }
  throw new Error(`Unsupported tool call: ${name}`);
}

async function runPlanner(state, snapshot) {
  const maxToolLoops = 2;
  let toolLoopCount = 0;

  while (true) {
    const plannerPrompt = await getPlannerPrompt();
    const contextLines = [
      `Current URL: ${agentRuntime.currentUrl || 'unknown'}`,
      `User goal: ${state.userGoal}`,
      `Plan so far:\n${formatPlanForPrompt(state.stepPlan)}`,
      `Latest search:\n${formatSearchSummary(state.lastSearch)}`,
      `DOM snapshot:\n${formatSnapshotForPrompt(snapshot)}`
    ];

    log.debug('Planner invocation prepared', {
      snapshotElements: snapshot.length,
      planSize: Array.isArray(state.stepPlan) ? state.stepPlan.length : 0,
      toolLoopCount
    });

    const { model, data } = await withRateLimit('planner', async (modelName) => {
      try {
        const response = await plannerGenerate({
          model: modelName,
          systemPrompt: plannerPrompt,
          userPrompt: 'Provide the next immediate actions as JSON.',
          context: contextLines.join('\n\n'),
          tools: getFunctionDeclarations()
        });
        log.debug('Planner response received', { model: modelName });
        return response;
      } catch (plannerError) {
        log.error('Planner request failed', {
          model: modelName,
          error: plannerError?.message,
          stack: plannerError?.stack
        });
        throw plannerError;
      }
    });

    agentRuntime.lastModelUsed = model;

    const functionCalls = extractFunctionCalls(data);
    if (functionCalls.length) {
      if (toolLoopCount >= maxToolLoops) {
        throw new Error('Planner exceeded tool call retries.');
      }

      log.debug('Planner issued tool calls', {
        count: functionCalls.length,
        toolLoopCount
      });

      for (const call of functionCalls) {
        try {
          await executeToolCall(call);
        } catch (error) {
          await pushDiagnostic({ tool: call?.name, error: error.message });
          throw error;
        }
      }

      state = await loadState();
      snapshot = await requestDomSnapshot();
      toolLoopCount += 1;
      continue;
    }

    const text = extractTextResponse(data);
    if (!text) {
      throw new Error('Planner returned no JSON payload.');
    }

    let parsed;
    try {
      log.debug('Planner text payload preview', text.slice(0, 240));
      const cleaned = normalizeJsonPayload(text);
      parsed = JSON.parse(cleaned);
    } catch (error) {
      log.error('Planner JSON parse failed', {
        error: error.message,
        preview: text.slice(0, 240)
      });
      throw new Error('Planner JSON parse failed.');
    }

    const validation = validateActionPlan(parsed);
    if (!validation.valid) {
      throw new Error(`Planner output invalid: ${validation.errors.join('; ')}`);
    }

    return validation.value;
  }
}

async function callExecutor(instruction, snapshot) {
  const executorPrompt = await getExecutorPrompt();
  const contextLines = [
    `Instruction: ${instruction}`,
    `DOM snapshot:\n${formatSnapshotForPrompt(snapshot)}`
  ];

  log.debug('Executor request prepared', {
    instruction,
    snapshotElements: snapshot.length
  });

  const { model, data } = await withRateLimit('executor', async (modelName) => {
    try {
      const response = await executorGenerate({
        model: modelName,
        systemPrompt: executorPrompt,
        userPrompt: 'Return the best action as JSON.',
        context: contextLines.join('\n\n'),
        tools: getFunctionDeclarations()
      });
      log.debug('Executor response received', { model: modelName });
      return response;
    } catch (executorError) {
      log.error('Executor request failed', {
        model: modelName,
        error: executorError?.message,
        stack: executorError?.stack
      });
      throw executorError;
    }
  });

  agentRuntime.lastModelUsed = model;
  const functionCalls = extractFunctionCalls(data);
  if (functionCalls.length) {
    for (const call of functionCalls) {
      await executeToolCall(call);
    }
    // After executor tool calls, request latest snapshot and fallback to heuristic.
  }

  const text = extractTextResponse(data);
  if (text) {
    try {
      log.debug('Executor text payload preview', text.slice(0, 240));
      const cleaned = normalizeJsonPayload(text);
      const parsed = JSON.parse(cleaned);
      const validation = validateActionPlan(parsed);
      if (validation.valid) {
        return validation.value.steps;
      }
    } catch (_error) {
      // fall-through to heuristic
    }
  }

  // Fallback heuristic grounding
  const ranked = selectBestCandidate(instruction, snapshot);
  if (!ranked) {
    return [
      {
        action: 'ask_user',
        message: `I cannot find an element that matches "${instruction}". Could you try a different description?`
      }
    ];
  }

  return [
    {
      action: 'highlight',
      targetId: ranked.element.id,
      message: `Try "${instruction}" here`
    }
  ];
}

async function executeStep(step, snapshot) {
  switch (step.action) {
    case 'search': {
      const result = await tavilySearch(step.message || agentRuntime.goal, {
        timeRange: agentRuntime.options.timeRange,
        maxResults: agentRuntime.options.maxResults,
        chunksPerSource: agentRuntime.options.chunksPerSource
      });
      await saveState({ lastSearch: result });
      agentRuntime.lastTool = 'search';
      broadcast({ lastSearch: result });
      return true;
    }
    case 'ground': {
      const groundingSteps = await callExecutor(step.message || step.reason || step.description || '', snapshot);
      for (const action of groundingSteps) {
        await executeStep(action, snapshot);
      }
      return true;
    }
    case 'highlight': {
      await executeVisualAction('highlight', step.targetId, step.message);
      return true;
    }
    case 'pulse': {
      await executeVisualAction('pulse', step.targetId, step.message);
      return true;
    }
    case 'scroll': {
      await executeScroll(step.direction || 'down', step.targetId);
      return true;
    }
    case 'wait': {
      agentRuntime.awaitingInterrupt = true;
      agentRuntime.status = STEP_STATUS.WAITING;
      broadcast({ awaitingInterrupt: true });
      return false;
    }
    case 'ask_user': {
      agentRuntime.status = STEP_STATUS.WAITING;
      agentRuntime.awaitingInterrupt = false;
      broadcast({ message: step.message || 'Agent requested assistance.' });
      return false;
    }
    case 'noop':
    default:
      return true;
  }
}

async function executePlanSteps(steps, snapshot) {
  let halted = false;
  let currentSnapshot = snapshot;

  for (const step of steps) {
    log.debug('Executing plan step', step);

    if (step.action === 'get_dom_snapshot') {
      log.debug('Plan requested fresh DOM snapshot');
      currentSnapshot = await requestDomSnapshot();
      continue;
    }

    const continueLoop = await executeStep(step, currentSnapshot);
    if (!continueLoop) {
      log.debug('Execution halted waiting for external event', step);
      halted = true;
      break;
    }
  }

  return { halted, snapshot: currentSnapshot };
}

async function runPlannerCycle(reason = 'manual') {
  if (!agentRuntime.active || agentRuntime.processing) {
    log.debug('Planner cycle skipped', {
      reason,
      active: agentRuntime.active,
      processing: agentRuntime.processing
    });
    return;
  }

  agentRuntime.processing = true;
  agentRuntime.awaitingInterrupt = false;
  agentRuntime.status = STEP_STATUS.RUNNING;
  broadcast({ reason });
  log.debug('Planner cycle started', { reason, currentUrl: agentRuntime.currentUrl });

  try {
    const tab = await resolveActiveTab(agentRuntime.tabId);
    agentRuntime.tabId = tab.id;
    agentRuntime.currentUrl = tab.url;

    const state = await loadState();
    log.debug('State loaded for planner cycle', { sessionId: state.sessionId, goal: state.userGoal });

    const snapshot = await requestDomSnapshot();
    log.debug('DOM snapshot ready for planner', {
      elementCount: snapshot.length,
      mutationVersion: agentRuntime.lastSnapshot?.mutationVersion ?? null
    });

    const plan = await runPlanner(state, snapshot);
    log.debug('Planner returned steps', plan.steps);
    await updatePlan(plan.steps, 0);

    const { halted } = await executePlanSteps(plan.steps, snapshot);
    if (!halted) {
      agentRuntime.awaitingInterrupt = true;
    }

    agentRuntime.status = agentRuntime.awaitingInterrupt ? STEP_STATUS.WAITING : STEP_STATUS.RUNNING;
  } catch (error) {
    agentRuntime.status = STEP_STATUS.ERROR;
    agentRuntime.lastError = error.message;
    await pushDiagnostic({ error: error.message });
    broadcast({ error: error.message });
    log.error('Planner cycle failed', { reason, error: error.message, stack: error.stack });
  } finally {
    agentRuntime.processing = false;
    broadcast();
    log.debug('Planner cycle finished', {
      status: agentRuntime.status,
      awaitingInterrupt: agentRuntime.awaitingInterrupt
    });
  }
}

export async function startAgent({ goal, tabId, options } = {}) {
  if (!goal || typeof goal !== 'string') {
    throw new Error('Agent requires a non-empty goal to start.');
  }

  if (agentRuntime.active) {
    log.debug('Existing session detected; stopping before restart');
    await stopAgent();
  }

  const tab = await resolveActiveTab(tabId);
  agentRuntime.tabId = tab.id;
  agentRuntime.currentUrl = tab.url;
  agentRuntime.goal = goal;
  agentRuntime.sessionId = createSessionId();
  agentRuntime.active = true;
  agentRuntime.awaitingInterrupt = false;
  agentRuntime.status = STEP_STATUS.RUNNING;
  const mergedOptions = mergeOptions(await loadState(), options);
  agentRuntime.options = mergedOptions;
  agentRuntime.lastError = null;
  agentRuntime.lastTool = null;

  await ensureContentScript(tab.id);

  await saveState({
    sessionId: agentRuntime.sessionId,
    userGoal: goal,
    currentUrl: agentRuntime.currentUrl,
    stepPlan: [],
    currentStepIndex: 0,
    options: mergedOptions
  });

  try {
    await sendMessageToTab({ type: 'wga-show-overlay', reason: 'agent-start' });
  } catch (_error) {
    // overlay may already be visible; ignore
    log.debug('Overlay activation message failed (likely already visible)');
  }

  broadcast({ sessionId: agentRuntime.sessionId, goal });
  log.info('Session started', { goal, sessionId: agentRuntime.sessionId, tabId: agentRuntime.tabId });
  await runPlannerCycle('agent-start');
}

export async function stopAgent({ manual = false } = {}) {
  agentRuntime.active = false;
  agentRuntime.awaitingInterrupt = false;
  agentRuntime.status = STEP_STATUS.STOPPED;
  broadcast();
  try {
    await sendMessageToTab({ type: 'wga-hide-overlay', manual });
  } catch (_error) {
    // ignore
  }
}

export async function resetAgent() {
  await resetState();
  agentRuntime.active = false;
  agentRuntime.status = STEP_STATUS.IDLE;
  agentRuntime.goal = null;
  agentRuntime.sessionId = null;
  agentRuntime.lastError = null;
  agentRuntime.awaitingInterrupt = false;
  broadcast();
}

export function getAgentStatus() {
  return {
    status: agentRuntime.status,
    goal: agentRuntime.goal,
    sessionId: agentRuntime.sessionId,
    active: agentRuntime.active,
    awaitingInterrupt: agentRuntime.awaitingInterrupt,
    lastModel: agentRuntime.lastModelUsed,
    lastTool: agentRuntime.lastTool,
    lastError: agentRuntime.lastError
  };
}

export async function handleScanEvent(detail) {
  if (!agentRuntime.active) {
    log.debug('Ignoring scan event – agent inactive');
    return;
  }
  if (agentRuntime.awaitingInterrupt || agentRuntime.status === STEP_STATUS.WAITING) {
    log.debug('Scan event received, resuming planner', detail);
    agentRuntime.awaitingInterrupt = false;
    await runPlannerCycle(detail?.reason || 'scan-event');
  } else {
    log.debug('Scan event ignored – agent not waiting', { status: agentRuntime.status });
  }
}

export async function handlePageChange({ tabId, url, reason }) {
  if (!agentRuntime.active || tabId !== agentRuntime.tabId) {
    log.debug('Ignoring page change', { active: agentRuntime.active, tabId, runtimeTabId: agentRuntime.tabId });
    return;
  }
  log.debug('Page change detected', { url, reason });
  agentRuntime.currentUrl = url;
  agentRuntime.awaitingInterrupt = false;
  await runPlannerCycle(reason || 'page-change');
}
