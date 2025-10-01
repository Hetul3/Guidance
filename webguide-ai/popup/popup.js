const activateButton = document.getElementById('activate-overlay');
const overlayDemoButton = document.getElementById('run-overlay-demo');
const domSnapshotButton = document.getElementById('run-dom-snapshot');
const statusMessage = document.getElementById('status-message');
const apiKeyInput = document.getElementById('gemini-api-key');
const saveApiKeyButton = document.getElementById('save-api-key');
const apiKeyStatus = document.getElementById('api-key-status');
const userMessageInput = document.getElementById('gemini-user-message');
const sendGeminiButton = document.getElementById('send-gemini-message');
const geminiResponseBlock = document.getElementById('gemini-response');
const geminiChatStatus = document.getElementById('gemini-chat-status');

const loadLlmModule = (() => {
  let modulePromise;
  return () => {
    if (!modulePromise) {
      const moduleUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('llm.js') : null;
      if (!moduleUrl) {
        return Promise.reject(new Error('Unable to resolve LLM module URL'));
      }
      modulePromise = import(moduleUrl).catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  };
})();

const maskKey = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
};

const loadStoredApiKey = async () => {
  if (!apiKeyInput) {
    return;
  }

  try {
    const { GEMINI_API_KEY } = await chrome.storage.local.get(['GEMINI_API_KEY']);
    if (typeof GEMINI_API_KEY === 'string' && GEMINI_API_KEY.trim()) {
      apiKeyInput.dataset.hasValue = 'true';
      apiKeyInput.value = maskKey(GEMINI_API_KEY.trim());
    }
  } catch (error) {
    console.error('WebGuide AI: Failed to load stored API key.', error);
  }
};

const setApiStatus = (message, isError = false) => {
  if (!apiKeyStatus) {
    return;
  }

  if (!message) {
    apiKeyStatus.hidden = true;
    apiKeyStatus.textContent = '';
    return;
  }

  apiKeyStatus.hidden = false;
  apiKeyStatus.textContent = message;
  apiKeyStatus.style.color = isError ? '#b91c1c' : '#047857';
};

const handleSaveApiKey = async () => {
  if (!apiKeyInput) {
    return;
  }

  const rawValue = apiKeyInput.value || '';
  const trimmed = rawValue.trim();

  if (!trimmed || /^\*+$/.test(trimmed)) {
    setApiStatus('Enter a valid key to save.', true);
    return;
  }

  try {
    setApiStatus('Saving key...');
    await chrome.storage.local.set({ GEMINI_API_KEY: trimmed });
    apiKeyInput.value = maskKey(trimmed);
    apiKeyInput.dataset.hasValue = 'true';
    setApiStatus('Gemini API key saved.');
  } catch (error) {
    console.error('WebGuide AI: Failed to save API key.', error);
    setApiStatus('Failed to save key. See console.', true);
  }
};

if (saveApiKeyButton) {
  saveApiKeyButton.addEventListener('click', handleSaveApiKey);
}

if (apiKeyInput) {
  apiKeyInput.addEventListener('focus', () => {
    if (apiKeyInput.dataset.hasValue === 'true') {
      apiKeyInput.value = '';
      apiKeyInput.dataset.hasValue = 'false';
    }
    setApiStatus('');
  });
}

const setChatStatus = (message, isError = false) => {
  if (!geminiChatStatus) {
    return;
  }

  geminiChatStatus.textContent = message || '';
  geminiChatStatus.style.color = isError ? '#b91c1c' : '#6b7280';
};

const setGeminiResponse = (message, isError = false) => {
  if (!geminiResponseBlock) {
    return;
  }

  if (!message) {
    geminiResponseBlock.textContent = 'Model responses appear here.';
    geminiResponseBlock.classList.add('empty');
    geminiResponseBlock.classList.remove('error');
    return;
  }

  const parsed = window.marked ? window.marked.parse(message) : message;
  const sanitized = window.DOMPurify ? window.DOMPurify.sanitize(parsed) : parsed;

  geminiResponseBlock.innerHTML = sanitized;
  geminiResponseBlock.classList.remove('empty');
  geminiResponseBlock.classList.toggle('error', isError);

  if (window.hljs && typeof window.hljs.highlightAll === 'function') {
    window.hljs.highlightAll();
  }
};

const promptForKeyAndRetry = async (retryCallback) => {
  if (!apiKeyInput) {
    setApiStatus('Open the extension options to set an API key.', true);
    return;
  }

  apiKeyInput.focus();
  apiKeyInput.value = '';
  apiKeyInput.dataset.hasValue = 'false';
  setApiStatus('Enter your Gemini API key to continue.', true);

  if (typeof retryCallback === 'function') {
    const onSaveClick = async () => {
      try {
        await handleSaveApiKey();
        await retryCallback();
      } catch (error) {
        console.error('WebGuide AI: Retry after API key save failed.', error);
      }
    };

    saveApiKeyButton?.addEventListener('click', onSaveClick, { once: true });
  }
};

const setSendButtonLoading = (isLoading) => {
  if (!sendGeminiButton) {
    return;
  }

  sendGeminiButton.disabled = isLoading;
  sendGeminiButton.textContent = isLoading ? 'Sending…' : 'Send';
};

const sendGeminiMessage = async () => {
  if (!userMessageInput) {
    return;
  }

  const message = (userMessageInput.value || '').trim();
  if (!message) {
    setChatStatus('Enter a message to send.', true);
    return;
  }

  setChatStatus('Sending…');
  setGeminiResponse('');
  setSendButtonLoading(true);

  try {
    const { sendToGemini, MissingApiKeyError, InvalidApiKeyError } = await loadLlmModule();

    try {
      const reply = await sendToGemini(message);
      if (reply) {
        setGeminiResponse(reply);
      } else {
        setGeminiResponse('(Gemini returned no text.)');
      }
      setChatStatus('Response received.');
    } catch (error) {
      if (error instanceof MissingApiKeyError || error instanceof InvalidApiKeyError) {
        setChatStatus('');
        setGeminiResponse(error.message, true);
        await promptForKeyAndRetry(sendGeminiMessage);
        return;
      }

      console.error('WebGuide AI: Gemini request failed.', error);
      setGeminiResponse(`Error: ${error.message || error}`, true);
      setChatStatus('Gemini error.');
    }
  } finally {
    setSendButtonLoading(false);
  }
};

if (sendGeminiButton) {
  sendGeminiButton.addEventListener('click', sendGeminiMessage);
}

if (userMessageInput) {
  userMessageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      sendGeminiMessage();
    }
  });
}

const setStatus = (message, isError = false) => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#b91c1c' : '#1f2933';
};

const getActiveTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || tab.id === undefined) {
      console.warn('WebGuide AI: No active tab available.');
      setStatus('No active tab detected.');
      return null;
    }

    const url = tab.url || '';
    if (!/^https?:/i.test(url)) {
      setStatus('Open a standard web page, then try again.', true);
      return null;
    }

    return tab;
  } catch (error) {
    console.error('WebGuide AI: Failed to query active tab.', error);
    setStatus('Chrome tab query failed. See console for details.', true);
    return null;
  }
};

async function injectOverlay() {
  try {
    const tab = await getActiveTab();
    if (!tab) {
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-script.js']
    });

    setStatus('Overlay injected.');
  } catch (error) {
    console.error('WebGuide AI: Failed to inject overlay.', error);
    setStatus('Could not inject overlay. See console for details.', true);
  }
}

if (activateButton) {
  activateButton.addEventListener('click', injectOverlay);
}

const sendMessageToTab = (tabId, payload) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const runOverlayDemo = async () => {
  const tab = await getActiveTab();
  if (!tab) {
    return;
  }

  setStatus('Running overlay demo...');

  try {
    const response = await sendMessageToTab(tab.id, { type: 'wga-run-overlay-demo' });

    if (response && response.ok) {
      setStatus('Overlay demo complete.');
    } else {
      setStatus('Overlay demo finished with warnings.', true);
    }
  } catch (error) {
    if (/Receiving end does not exist/i.test(error.message)) {
      setStatus('Inject overlay first, then run the demo.', true);
      return;
    }

    console.error('WebGuide AI: Overlay demo failed.', error);
    setStatus('Overlay demo failed. See console for details.', true);
  }
};

if (overlayDemoButton) {
  overlayDemoButton.addEventListener('click', runOverlayDemo);
}

const runDomSnapshot = async () => {
  const tab = await getActiveTab();
  if (!tab) {
    return;
  }

  setStatus('Collecting clickable elements...');

  try {
    const response = await sendMessageToTab(tab.id, { type: 'wga-run-dom-snapshot' });

    if (response && response.ok) {
      const rawCount = typeof response.rawCount === 'number' ? response.rawCount : 'unknown';
      const llmCount = typeof response.llmCount === 'number' ? response.llmCount : 'unknown';
      setStatus(`Snapshot captured (raw: ${rawCount}, llm: ${llmCount})`);
    } else {
      setStatus('DOM snapshot completed with notices.', true);
    }
  } catch (error) {
    if (/Receiving end does not exist/i.test(error.message)) {
      setStatus('Inject overlay/content script before running snapshot.', true);
      return;
    }

    console.error('WebGuide AI: DOM snapshot failed.', error);
    setStatus('DOM snapshot failed. See console for details.', true);
  }
};

if (domSnapshotButton) {
  domSnapshotButton.addEventListener('click', runDomSnapshot);
}

loadStoredApiKey();
