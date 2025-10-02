chrome.runtime.onInstalled.addListener(() => {
  console.log('WebGuide AI base extension installed.');
});

const activeOverlayTabs = new Set();
const overlayState = new Map();
const LOG_HISTORY_LIMIT = 50;

const getOrCreateOverlayState = (tabId) => {
  let state = overlayState.get(tabId);
  if (!state) {
    state = { active: false, logs: [], closedManually: false };
    overlayState.set(tabId, state);
  }
  return state;
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number' || tabId < 0) {
    return false;
  }

  const state = getOrCreateOverlayState(tabId);

  switch (message.type) {
    case 'wga-overlay-activated': {
      activeOverlayTabs.add(tabId);
      state.active = true;
      state.closedManually = false;
      sendResponse?.({ ok: true, tracked: true });
      return true;
    }

    case 'wga-overlay-deactivated': {
      activeOverlayTabs.delete(tabId);
      state.active = false;
      state.closedManually = true;
      sendResponse?.({ ok: true, tracked: false });
      return true;
    }

    case 'wga-log-entry': {
      const entry = message.entry;
      if (entry && typeof entry === 'object') {
        const globalCrypto = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : undefined;
        if (!entry.id) {
          entry.id = globalCrypto && typeof globalCrypto.randomUUID === 'function'
            ? globalCrypto.randomUUID()
            : `wga-log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }

        const logs = state.logs || [];
        const existingIndex = logs.findIndex((item) => item.id === entry.id);
        if (existingIndex >= 0) {
          logs.splice(existingIndex, 1, entry);
        } else {
          logs.push(entry);
          if (logs.length > LOG_HISTORY_LIMIT) {
            logs.splice(0, logs.length - LOG_HISTORY_LIMIT);
          }
        }
        state.logs = logs;
      }
      sendResponse?.({ ok: true });
      return true;
    }

    case 'wga-request-log': {
      sendResponse?.({
        ok: true,
        logs: [...(state.logs || [])],
        active: state.active,
        closedManually: state.closedManually
      });
      return true;
    }

    case 'wga-clear-log': {
      state.logs = [];
      sendResponse?.({ ok: true });
      return true;
    }

    default:
      return false;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeOverlayTabs.delete(tabId);
  overlayState.delete(tabId);
});

const sendPageChangedToTab = (tabId, reason, url) => {
  if (typeof tabId !== 'number' || tabId < 0) {
    return;
  }

  chrome.tabs.sendMessage(
    tabId,
    {
      type: 'wga-page-changed',
      reason,
      url,
      timestamp: Date.now()
    },
    (response) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message || '';
        if (!/Receiving end does not exist/i.test(message)) {
          console.debug('[WebGuideAI][background] Failed to notify tab of page change:', message);
        }
        return;
      }

      if (response && response.ok) {
        console.debug('[WebGuideAI][background] Page change acknowledged by tab.', { tabId, reason });
      }
    }
  );
};

const navigationFilter = { url: [{ schemes: ['http', 'https'] }] };

const injectContentScript = async (tabId) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js']
    });
  } catch (error) {
    console.debug('[WebGuideAI][background] Failed to inject content script:', error?.message || error);
    throw error;
  }
};

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }

  if (activeOverlayTabs.has(details.tabId)) {
    injectContentScript(details.tabId)
      .then(() => {
        sendPageChangedToTab(details.tabId, 'navigation-completed', details.url);
      })
      .catch(() => {
        // Injection failed; message would not be received anyway.
      });
  }
}, navigationFilter);

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }

  if (activeOverlayTabs.has(details.tabId)) {
    sendPageChangedToTab(details.tabId, 'history-state-updated', details.url);
  }
}, navigationFilter);
