const manageKeysButton = document.getElementById('manage-keys');
const apiKeysCard = document.getElementById('api-keys-card');
const geminiKeySection = document.getElementById('gemini-key-section');
const tavilyKeySection = document.getElementById('tavily-key-section');
const geminiKeyInput = document.getElementById('gemini-api-key');
const geminiKeyStatus = document.getElementById('api-key-status');
const geminiCloseButton = document.getElementById('close-gemini-key');
const tavilyKeyInput = document.getElementById('tavily-api-key');
const tavilyKeyStatus = document.getElementById('tavily-key-status');
const tavilyCloseButton = document.getElementById('close-tavily-key');
const saveGeminiKeyButton = document.getElementById('save-api-key');
const saveTavilyKeyButton = document.getElementById('save-tavily-key');
const geminiToggleMaskButton = document.getElementById('gemini-toggle-mask');
const tavilyToggleMaskButton = document.getElementById('tavily-toggle-mask');

const statusMessage = document.getElementById('status-message');

const agentGoalInput = document.getElementById('agent-goal');
const agentAdvancedToggle = document.getElementById('agent-advanced-toggle');
const agentAdvancedSection = document.getElementById('agent-advanced');
const agentTimeRangeSelect = document.getElementById('agent-time-range');
const agentMaxResultsInput = document.getElementById('agent-max-results');
const agentChunksInput = document.getElementById('agent-chunks');
const agentStartButton = document.getElementById('agent-start');
const agentStopButton = document.getElementById('agent-stop');
const agentResetButton = document.getElementById('agent-reset');
const agentStatusLine = document.getElementById('agent-status-line');
const agentStatusLabel = document.getElementById('agent-status-label');
const agentModelLabel = document.getElementById('agent-model-label');
const agentToolLabel = document.getElementById('agent-tool-label');
const agentMessageLabel = document.getElementById('agent-message-label');
const agentLogList = document.getElementById('agent-log-list');
const agentLogClearButton = document.getElementById('agent-log-clear');

let hasGeminiKey = false;
let hasTavilyKey = false;
let apiKeysVisible = false;
let agentControlsLocked = false;
let lastSubmittedGoal = null;
let agentLogEntries = [];
let geminiStoredValue = '';
let geminiMasked = true;
let tavilyStoredValue = '';
let tavilyMasked = true;

const runtimeSendMessage = (payload) =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const setStatus = (message, isError = false) => {
  if (!statusMessage) {
    return;
  }
  statusMessage.textContent = message || '';
  statusMessage.style.color = isError ? 'var(--danger)' : 'var(--text-secondary)';
};

const showApiKeysCard = (show = true) => {
  apiKeysVisible = show;
  if (apiKeysCard) {
    apiKeysCard.hidden = !show;
  }
  if (manageKeysButton) {
    manageKeysButton.textContent = show ? 'Hide API Keys' : 'Manage API Keys';
  }
  if (show) {
    refreshKeyStatuses();
    updateGeminiInputDisplay();
    updateTavilyInputDisplay();
  }
  if (geminiCloseButton) {
    geminiCloseButton.hidden = !show;
  }
  if (tavilyCloseButton) {
    tavilyCloseButton.hidden = !show;
  }
};

const ensureApiKeysVisible = () => {
  if (!apiKeysVisible) {
    showApiKeysCard(true);
  }
};

const setKeyStatusMessage = (element, message, isError = false) => {
  if (!element) {
    return;
  }
  if (!message) {
    element.hidden = true;
    element.textContent = '';
    return;
  }
  element.hidden = false;
  element.textContent = message;
  element.style.color = isError ? 'var(--danger)' : 'var(--success)';
};

const focusInput = (input) => {
  if (!input) {
    return;
  }
  input.focus();
  input.select?.();
};

const updateGeminiInputDisplay = () => {
  if (!geminiKeyInput) {
    return;
  }
  if (geminiStoredValue) {
    if (geminiMasked) {
      geminiKeyInput.type = 'password';
      geminiKeyInput.value = maskValue(geminiStoredValue);
      geminiToggleMaskButton && (geminiToggleMaskButton.textContent = 'Show');
    } else {
      geminiKeyInput.type = 'text';
      geminiKeyInput.value = geminiStoredValue;
      geminiToggleMaskButton && (geminiToggleMaskButton.textContent = 'Hide');
    }
  } else {
    geminiKeyInput.type = 'password';
    geminiKeyInput.value = '';
    geminiToggleMaskButton && (geminiToggleMaskButton.textContent = 'Show');
  }
};

const updateTavilyInputDisplay = () => {
  if (!tavilyKeyInput) {
    return;
  }
  if (tavilyStoredValue) {
    if (tavilyMasked) {
      tavilyKeyInput.type = 'password';
      tavilyKeyInput.value = maskValue(tavilyStoredValue);
      tavilyToggleMaskButton && (tavilyToggleMaskButton.textContent = 'Show');
    } else {
      tavilyKeyInput.type = 'text';
      tavilyKeyInput.value = tavilyStoredValue;
      tavilyToggleMaskButton && (tavilyToggleMaskButton.textContent = 'Hide');
    }
  } else {
    tavilyKeyInput.type = 'password';
    tavilyKeyInput.value = '';
    tavilyToggleMaskButton && (tavilyToggleMaskButton.textContent = 'Show');
  }
};

const refreshKeyStatuses = () => {
  if (hasGeminiKey) {
    setKeyStatusMessage(geminiKeyStatus, 'Gemini key saved. Replace to update.');
  } else {
    setKeyStatusMessage(geminiKeyStatus, '');
  }

  if (hasTavilyKey) {
    setKeyStatusMessage(tavilyKeyStatus, 'Tavily key saved. Replace to update.');
  } else {
    setKeyStatusMessage(tavilyKeyStatus, '');
  }
};

const revealGeminiKey = (message) => {
  ensureApiKeysVisible();
  hasGeminiKey = false;
  geminiStoredValue = '';
  geminiMasked = true;
  updateGeminiInputDisplay();
  setKeyStatusMessage(geminiKeyStatus, message || 'Enter your Gemini API key to continue.', true);
  focusInput(geminiKeyInput);
};

const revealTavilyKey = (message) => {
  ensureApiKeysVisible();
  hasTavilyKey = false;
  tavilyStoredValue = '';
  tavilyMasked = true;
  updateTavilyInputDisplay();
  setKeyStatusMessage(tavilyKeyStatus, message || 'Enter your Tavily API key to continue.', true);
  focusInput(tavilyKeyInput);
};

const maskValue = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
};

const loadStoredKeys = async () => {
  try {
    const { GEMINI_API_KEY, TAVILY_API_KEY } = await chrome.storage.local.get(['GEMINI_API_KEY', 'TAVILY_API_KEY']);
    hasGeminiKey = typeof GEMINI_API_KEY === 'string' && GEMINI_API_KEY.trim().length > 0;
    hasTavilyKey = typeof TAVILY_API_KEY === 'string' && TAVILY_API_KEY.trim().length > 0;
    geminiStoredValue = hasGeminiKey ? GEMINI_API_KEY.trim() : '';
    tavilyStoredValue = hasTavilyKey ? TAVILY_API_KEY.trim() : '';
    geminiMasked = true;
    tavilyMasked = true;
    updateGeminiInputDisplay();
    updateTavilyInputDisplay();
    refreshKeyStatuses();
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to load stored keys:', error);
  }
};

const saveGeminiKey = async () => {
  if (!geminiKeyInput) {
    return;
  }
  const rawValue = geminiKeyInput.value || '';
  const trimmed = rawValue.trim();
  if (!trimmed) {
    setKeyStatusMessage(geminiKeyStatus, 'Enter a valid key.', true);
    return;
  }
  try {
    await chrome.storage.local.set({ GEMINI_API_KEY: trimmed });
    geminiStoredValue = trimmed;
    geminiMasked = true;
    hasGeminiKey = true;
    updateGeminiInputDisplay();
    setKeyStatusMessage(geminiKeyStatus, 'Gemini key saved.');
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to save Gemini key:', error);
    setKeyStatusMessage(geminiKeyStatus, 'Failed to save key. See console.', true);
  }
};

const saveTavilyKey = async () => {
  if (!tavilyKeyInput) {
    return;
  }
  const rawValue = tavilyKeyInput.value || '';
  const trimmed = rawValue.trim();
  if (!trimmed) {
    setKeyStatusMessage(tavilyKeyStatus, 'Enter a valid key.', true);
    return;
  }
  try {
    await chrome.storage.local.set({ TAVILY_API_KEY: trimmed });
    tavilyStoredValue = trimmed;
    tavilyMasked = true;
    hasTavilyKey = true;
    updateTavilyInputDisplay();
    setKeyStatusMessage(tavilyKeyStatus, 'Tavily key saved.');
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to save Tavily key:', error);
    setKeyStatusMessage(tavilyKeyStatus, 'Failed to save key. See console.', true);
  }
};

const updateAgentButtons = (status) => {
  if (agentControlsLocked) {
    return;
  }
  const normalized = (status || '').toString().toLowerCase();
  const running = normalized === 'running' || normalized === 'waiting';
  if (agentStartButton) {
    agentStartButton.disabled = running;
  }
  if (agentStopButton) {
    agentStopButton.disabled = !running;
  }
};

const setAgentControlsBusy = (busy) => {
  agentControlsLocked = busy;
  if (agentStartButton) {
    agentStartButton.disabled = busy;
  }
  if (agentStopButton) {
    agentStopButton.disabled = busy;
  }
  if (agentResetButton) {
    agentResetButton.disabled = busy;
  }
};

const formatLogTimestamp = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch (_error) {
    return '';
  }
};

const summariseLogDetail = (entry) => {
  const clone = { ...entry };
  delete clone.id;
  delete clone.timestamp;
  delete clone.stage;
  const keys = Object.keys(clone);
  if (!keys.length) {
    return '';
  }
  try {
    const json = JSON.stringify(clone, null, 2);
    return json.length > 300 ? `${json.slice(0, 300)}…` : json;
  } catch (_error) {
    return keys
      .map((key) => `${key}: ${typeof clone[key] === 'object' ? JSON.stringify(clone[key]) : clone[key]}`)
      .join(' | ');
  }
};

const clearAgentLogUI = () => {
  agentLogEntries = [];
  if (!agentLogList) {
    return;
  }
  agentLogList.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'agent-log-entry agent-log-empty';
  empty.textContent = 'Logs appear here once the agent runs.';
  agentLogList.appendChild(empty);
};

const renderAgentLogEntries = () => {
  if (!agentLogList) {
    return;
  }
  agentLogList.innerHTML = '';
  if (!agentLogEntries.length) {
    const empty = document.createElement('div');
    empty.className = 'agent-log-entry agent-log-empty';
    empty.textContent = 'Logs appear here once the agent runs.';
    agentLogList.appendChild(empty);
    return;
  }
  const sorted = [...agentLogEntries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  sorted.reverse();
  sorted.forEach((entry) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'agent-log-entry';

    const header = document.createElement('div');
    header.className = 'agent-log-entry-header';
    const time = document.createElement('span');
    time.textContent = formatLogTimestamp(entry.timestamp);
    const stage = document.createElement('span');
    stage.textContent = entry.stage || 'log';
    header.append(time, stage);
    wrapper.appendChild(header);

    const detail = summariseLogDetail(entry);
    if (detail) {
      const body = document.createElement('div');
      body.className = 'agent-log-entry-body';
      body.textContent = detail;
      wrapper.appendChild(body);
    }

    agentLogList.appendChild(wrapper);
  });
};

const appendAgentLogEntry = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return;
  }
  if (!entry.id) {
    entry.id = `${entry.stage || 'log'}-${entry.timestamp || Date.now()}`;
  }
  if (agentLogEntries.some((existing) => existing.id === entry.id)) {
    return;
  }
  agentLogEntries.push(entry);
  if (agentLogEntries.length > 200) {
    agentLogEntries = agentLogEntries.slice(-200);
  }
  renderAgentLogEntries();
  if (entry.error) {
    handleAgentError(entry.error);
  }
};

const collectAgentOptions = () => {
  const options = {};
  if (agentTimeRangeSelect) {
    options.timeRange = agentTimeRangeSelect.value;
  }
  if (agentMaxResultsInput) {
    options.maxResults = Number.parseInt(agentMaxResultsInput.value, 10) || 1;
  }
  if (agentChunksInput) {
    options.chunksPerSource = Number.parseInt(agentChunksInput.value, 10) || 3;
  }
  return options;
};

const getActiveTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) {
      setStatus('No active tab detected.', true);
      return null;
    }
    const url = tab.url || '';
    if (!/^https?:/i.test(url)) {
      setStatus('Open an https page, then try again.', true);
      return null;
    }
    return tab;
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to query active tab:', error);
    setStatus('Failed to detect active tab.', true);
    return null;
  }
};

const applyAgentUpdate = (update = {}) => {
  const statusTextRaw = update.status ?? 'Idle';
  const statusText = typeof statusTextRaw === 'string' ? statusTextRaw : String(statusTextRaw);
  const statusState = statusText.trim().toLowerCase();
  if (agentStatusLabel) {
    agentStatusLabel.textContent = statusText;
    agentStatusLabel.dataset.state = statusState;
  }
  if (agentStatusLine) {
    agentStatusLine.dataset.state = statusState;
  }
  if (agentModelLabel) {
    agentModelLabel.textContent = update.lastModel || '–';
  }
  if (agentToolLabel) {
    agentToolLabel.textContent = update.lastTool || '–';
  }
  if (agentMessageLabel) {
    const message = update.error || update.message || (update.awaitingInterrupt ? 'Awaiting page changes…' : '–');
    agentMessageLabel.textContent = message;
  }
  updateAgentButtons(statusText);
  if (update.error) {
    handleAgentError(update.error);
  }
};

const refreshAgentStatus = async () => {
  try {
    const res = await runtimeSendMessage({ type: 'wga-agent-status' });
    if (res && res.ok) {
      applyAgentUpdate(res.status || {});
    }
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to fetch agent status:', error);
  }
};

const loadAgentLogs = async () => {
  try {
    const res = await runtimeSendMessage({ type: 'wga-agent-get-logs' });
    if (res && res.ok && Array.isArray(res.logs)) {
      agentLogEntries = res.logs.slice(-200);
      renderAgentLogEntries();
    }
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to fetch agent logs:', error);
  }
};

const handleAgentError = (message) => {
  if (!message || typeof message !== 'string') {
    return;
  }
  const lower = message.toLowerCase();
  if (lower.includes('gemini') && lower.includes('api key')) {
    revealGeminiKey(message);
  }
  if (lower.includes('tavily') && lower.includes('api key')) {
    revealTavilyKey(message);
  }
};

const handleAgentStart = async () => {
  const goal = (agentGoalInput?.value || '').trim();
  if (!goal) {
    applyAgentUpdate({ status: 'error', message: 'Enter a goal to start the agent.' });
    return;
  }

  if (lastSubmittedGoal && lastSubmittedGoal === goal) {
    applyAgentUpdate({ status: 'error', message: 'Modify the goal before starting again.' });
    return;
  }

  const tab = await getActiveTab();
  if (!tab) {
    return;
  }

  setAgentControlsBusy(true);
  setStatus('Starting agent…');
  try {
    const response = await runtimeSendMessage({
      type: 'wga-agent-start',
      goal,
      tabId: tab.id,
      options: collectAgentOptions()
    });
    if (!response || response.ok === false) {
      throw new Error(response?.error || 'Failed to start agent.');
    }
    applyAgentUpdate({ status: 'running', message: 'Agent starting…' });
    setStatus('Agent running.');
    lastSubmittedGoal = goal;
  } catch (error) {
    console.error('[WebGuideAI][Popup] Agent start failed:', error);
    applyAgentUpdate({ status: 'error', message: error.message });
    setStatus(error.message || 'Agent failed to start.', true);
  } finally {
    setAgentControlsBusy(false);
    updateAgentButtons(agentStatusLabel?.textContent || '');
  }
};

const handleAgentStop = async () => {
  setAgentControlsBusy(true);
  setStatus('Stopping agent…');
  try {
    await runtimeSendMessage({ type: 'wga-agent-stop', manual: true });
    applyAgentUpdate({ status: 'stopped', message: 'Agent stopped.' });
    setStatus('Agent stopped.');
    lastSubmittedGoal = null;
    if (agentGoalInput) {
      agentGoalInput.value = '';
    }
  } catch (error) {
    console.error('[WebGuideAI][Popup] Agent stop failed:', error);
    applyAgentUpdate({ status: 'error', message: error.message });
    setStatus(error.message || 'Failed to stop agent.', true);
  } finally {
    setAgentControlsBusy(false);
    updateAgentButtons(agentStatusLabel?.textContent || '');
  }
};

const handleAgentReset = async () => {
  setAgentControlsBusy(true);
  setStatus('Resetting agent…');
  try {
    await runtimeSendMessage({ type: 'wga-agent-reset' });
    applyAgentUpdate({ status: 'idle', message: 'Session reset.' });
    clearAgentLogUI();
    setStatus('Agent reset.');
    lastSubmittedGoal = null;
    if (agentGoalInput) {
      agentGoalInput.value = '';
    }
  } catch (error) {
    console.error('[WebGuideAI][Popup] Agent reset failed:', error);
    applyAgentUpdate({ status: 'error', message: error.message });
    setStatus(error.message || 'Failed to reset agent.', true);
  } finally {
    setAgentControlsBusy(false);
    updateAgentButtons(agentStatusLabel?.textContent || '');
  }
};

const toggleApiKeys = () => {
  showApiKeysCard(!apiKeysVisible);
  if (apiKeysVisible) {
    focusInput(geminiKeyInput);
  }
};

const toggleAdvancedOptions = () => {
  if (!agentAdvancedToggle || !agentAdvancedSection) {
    return;
  }
  const isHidden = agentAdvancedSection.hasAttribute('hidden');
  if (isHidden) {
    agentAdvancedSection.removeAttribute('hidden');
  } else {
    agentAdvancedSection.setAttribute('hidden', '');
  }
  agentAdvancedToggle.setAttribute('aria-expanded', String(isHidden));
};

const clearAgentLogsRemote = async () => {
  try {
    await runtimeSendMessage({ type: 'wga-agent-clear-log' });
    clearAgentLogUI();
  } catch (error) {
    console.error('[WebGuideAI][Popup] Failed to clear agent logs:', error);
  }
};

const handleRuntimeMessage = (message) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'wga-agent-update') {
    applyAgentUpdate(message.data || {});
    return;
  }

  if (message.type === 'wga-agent-log' && message.log) {
    appendAgentLogEntry(message.log);
    return;
  }

  if (message.type === 'wga-agent-log-cleared') {
    clearAgentLogUI();
  }
};

manageKeysButton?.addEventListener('click', toggleApiKeys);
geminiCloseButton?.addEventListener('click', () => showApiKeysCard(false));
tavilyCloseButton?.addEventListener('click', () => showApiKeysCard(false));
geminiToggleMaskButton?.addEventListener('click', () => {
  if (!geminiStoredValue) {
    geminiMasked = true;
    updateGeminiInputDisplay();
    focusInput(geminiKeyInput);
    return;
  }
  geminiMasked = !geminiMasked;
  updateGeminiInputDisplay();
});
tavilyToggleMaskButton?.addEventListener('click', () => {
  if (!tavilyStoredValue) {
    tavilyMasked = true;
    updateTavilyInputDisplay();
    focusInput(tavilyKeyInput);
    return;
  }
  tavilyMasked = !tavilyMasked;
  updateTavilyInputDisplay();
});
saveGeminiKeyButton?.addEventListener('click', saveGeminiKey);
saveTavilyKeyButton?.addEventListener('click', saveTavilyKey);
agentStartButton?.addEventListener('click', handleAgentStart);
agentStopButton?.addEventListener('click', handleAgentStop);
agentResetButton?.addEventListener('click', handleAgentReset);
agentLogClearButton?.addEventListener('click', clearAgentLogsRemote);
agentAdvancedToggle?.addEventListener('click', toggleAdvancedOptions);

chrome.runtime.onMessage.addListener(handleRuntimeMessage);

loadStoredKeys();
refreshAgentStatus();
loadAgentLogs();
