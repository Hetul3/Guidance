const STORAGE_KEY = 'wga_agent_state';

const DEFAULT_STATE = {
  sessionId: null,
  userGoal: null,
  currentUrl: null,
  lastDomFingerprint: null,
  stepPlan: [],
  currentStepIndex: 0,
  lastSearch: null,
  lastDomSnapshotMeta: null,
  diagnostics: null,
  options: {
    timeRange: 'year',
    maxResults: 1,
    chunksPerSource: 3
  }
};

export async function loadState() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const state = stored[STORAGE_KEY];
    if (!state) {
      return { ...DEFAULT_STATE };
    }
    return { ...DEFAULT_STATE, ...state };
  } catch (error) {
    console.warn('[WebGuideAI][Memory] Failed to load state:', error);
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(patch) {
  const current = await loadState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export async function resetState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...DEFAULT_STATE } });
  return { ...DEFAULT_STATE };
}

export async function pushDiagnostic(entry) {
  const state = await loadState();
  const diagnostics = {
    ...(state.diagnostics || {}),
    lastError: entry?.error || null,
    lastTool: entry?.tool || null,
    ts: Date.now()
  };
  return saveState({ diagnostics });
}

export async function updatePlan(plan, currentStepIndex = 0) {
  if (!Array.isArray(plan)) {
    throw new Error('Plan must be an array.');
  }
  const safePlan = plan.map((step, idx) => ({
    id: step.id || `step-${idx + 1}`,
    description: step.description || `Step ${idx + 1}`,
    status: step.status || 'pending',
    notes: step.notes || null
  }));
  return saveState({ stepPlan: safePlan, currentStepIndex });
}

export async function markStepComplete(stepId, status = 'done', notes = null) {
  const state = await loadState();
  const plan = [...(state.stepPlan || [])];
  const idx = plan.findIndex((step) => step.id === stepId);
  if (idx === -1) {
    return state;
  }
  plan[idx] = { ...plan[idx], status, notes: notes || plan[idx].notes || null };
  return saveState({ stepPlan: plan, currentStepIndex: Math.min(idx + 1, plan.length - 1) });
}

export function createSessionId() {
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function mergeOptions(state, overrides) {
  const options = { ...(state.options || DEFAULT_STATE.options) };
  if (overrides && typeof overrides === 'object') {
    if (overrides.timeRange) {
      options.timeRange = overrides.timeRange;
    }
    if (overrides.maxResults) {
      options.maxResults = overrides.maxResults;
    }
    if (overrides.chunksPerSource) {
      options.chunksPerSource = overrides.chunksPerSource;
    }
  }
  return options;
}
