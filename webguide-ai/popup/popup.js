import { getTavilyKey, setTavilyKey } from '../storage.js';

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
const tavilyKeyInputWrapper = document.getElementById('tavily-key-input-wrapper');
const tavilyKeyPreviewRow = document.getElementById('tavily-key-preview');
const tavilyKeyInput = document.getElementById('tavily-api-key');
const saveTavilyKeyButton = document.getElementById('save-tavily-key');
const updateTavilyKeyButton = document.getElementById('update-tavily-key');
const tavilyKeyMask = document.getElementById('tavily-key-mask');
const tavilyKeyStatus = document.getElementById('tavily-key-status');
const tavilyQueryInput = document.getElementById('tavily-query');
const tavilySearchButton = document.getElementById('run-tavily-search');
const tavilyResultBlock = document.getElementById('tavily-result');
const tavilySearchStatus = document.getElementById('tavily-search-status');
const tavilyTimeRangeSelect = document.getElementById('tavily-time-range');
const tavilyStartDateInput = document.getElementById('tavily-start-date');
const tavilyEndDateInput = document.getElementById('tavily-end-date');
const tavilyMaxResultsInput = document.getElementById('tavily-max-results');
const tavilyChunksInput = document.getElementById('tavily-chunks-per-source');
const tavilyRawContentSelect = document.getElementById('tavily-raw-content');
const tavilyAutoParametersCheckbox = document.getElementById('tavily-auto-parameters');

const agentGoalInput = document.getElementById('agent-goal');
const agentTimeRangeSelect = document.getElementById('agent-time-range');
const agentMaxResultsInput = document.getElementById('agent-max-results');
const agentChunksInput = document.getElementById('agent-chunks');
const agentStartButton = document.getElementById('agent-start');
const agentStopButton = document.getElementById('agent-stop');
const agentResetButton = document.getElementById('agent-reset');
const agentStatusLabel = document.getElementById('agent-status-label');
const agentModelLabel = document.getElementById('agent-model-label');
const agentToolLabel = document.getElementById('agent-tool-label');
const agentMessageLabel = document.getElementById('agent-message-label');

let tavilyRetryAfterSave = false;
let lastTavilyRequest = null;

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

const loadTavilyModule = (() => {
  let modulePromise;
  return () => {
    if (!modulePromise) {
      const moduleUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('tavily.js') : null;
      if (!moduleUrl) {
        return Promise.reject(new Error('Unable to resolve Tavily module URL'));
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

const setTavilyKeyStatus = (message, isError = false) => {
  if (!tavilyKeyStatus) {
    return;
  }

  if (!message) {
    tavilyKeyStatus.hidden = true;
    tavilyKeyStatus.textContent = '';
    return;
  }

  tavilyKeyStatus.hidden = false;
  tavilyKeyStatus.textContent = message;
  tavilyKeyStatus.style.color = isError ? '#b91c1c' : '#047857';
};

const showTavilyKeyInput = () => {
  if (tavilyKeyInputWrapper) {
    tavilyKeyInputWrapper.hidden = false;
  }
  if (tavilyKeyPreviewRow) {
    tavilyKeyPreviewRow.hidden = true;
  }
  if (tavilyKeyInput) {
    tavilyKeyInput.dataset.hasValue = 'false';
    tavilyKeyInput.value = '';
    tavilyKeyInput.type = 'password';
    tavilyKeyInput.focus();
  }
  setTavilyKeyStatus('');
};

const showTavilyKeyPreview = (key) => {
  if (tavilyKeyPreviewRow) {
    tavilyKeyPreviewRow.hidden = false;
  }
  if (tavilyKeyInputWrapper) {
    tavilyKeyInputWrapper.hidden = true;
  }
  if (tavilyKeyMask) {
    tavilyKeyMask.textContent = maskKey(key);
  }
  if (tavilyKeyInput) {
    tavilyKeyInput.dataset.hasValue = 'true';
    tavilyKeyInput.value = maskKey(key);
  }
  setTavilyKeyStatus('');
};

const loadStoredTavilyKey = async () => {
  try {
    const storedKey = await getTavilyKey();
    if (storedKey) {
      showTavilyKeyPreview(storedKey);
      return;
    }
  } catch (error) {
    console.error('WebGuide AI: Failed to load Tavily key from storage.', error);
  }

  showTavilyKeyInput();
};

const handleSaveTavilyKey = async () => {
  if (!tavilyKeyInput) {
    return;
  }

  const rawValue = tavilyKeyInput.value || '';
  const trimmed = rawValue.trim();

  if (!trimmed || /^\*+$/.test(trimmed)) {
    setTavilyKeyStatus('Enter a valid key to save.', true);
    return;
  }

  try {
    setTavilyKeyStatus('Saving key...');
    await setTavilyKey(trimmed);
    showTavilyKeyPreview(trimmed);
    setTavilyKeyStatus('Tavily API key saved.');

    if (tavilyRetryAfterSave && lastTavilyRequest) {
      tavilyRetryAfterSave = false;
      await runTavilySearch(true);
    }
  } catch (error) {
    console.error('WebGuide AI: Failed to save Tavily key.', error);
    setTavilyKeyStatus('Failed to save key. See console.', true);
  }
};

if (saveTavilyKeyButton) {
  saveTavilyKeyButton.addEventListener('click', handleSaveTavilyKey);
}

if (updateTavilyKeyButton) {
  updateTavilyKeyButton.addEventListener('click', () => {
    tavilyRetryAfterSave = false;
    showTavilyKeyInput();
  });
}

if (tavilyKeyInput) {
  tavilyKeyInput.addEventListener('focus', () => {
    if (tavilyKeyInput.dataset.hasValue === 'true') {
      tavilyKeyInput.dataset.hasValue = 'false';
      tavilyKeyInput.value = '';
    }
    setTavilyKeyStatus('');
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

const setTavilySearchStatus = (message, isError = false) => {
  if (!tavilySearchStatus) {
    return;
  }

  tavilySearchStatus.textContent = message || '';
  tavilySearchStatus.style.color = isError ? '#b91c1c' : '#6b7280';
};

const resetTavilyResult = () => {
  if (!tavilyResultBlock) {
    return;
  }

  tavilyResultBlock.classList.add('empty');
  tavilyResultBlock.classList.remove('error');
  tavilyResultBlock.textContent = 'Tavily answers appear here.';
};

const renderTavilyMessage = (message, isError = false) => {
  if (!tavilyResultBlock) {
    return;
  }

  tavilyResultBlock.classList.remove('empty');
  tavilyResultBlock.classList.toggle('error', isError);
  tavilyResultBlock.textContent = message;
};

const renderTavilyResult = (payload, rawContentFormat = 'text') => {
  if (!tavilyResultBlock) {
    return;
  }

  tavilyResultBlock.classList.remove('empty');
  tavilyResultBlock.classList.remove('error');
  tavilyResultBlock.textContent = '';

  const fragment = document.createDocumentFragment();

  if (payload?.answer) {
    const answerHeading = document.createElement('h3');
    answerHeading.textContent = 'Synthesised Answer';
    const answerBody = document.createElement('p');
    answerBody.textContent = payload.answer;
    fragment.appendChild(answerHeading);
    fragment.appendChild(answerBody);
  }

  if (Array.isArray(payload?.results) && payload.results.length > 0) {
    payload.results.forEach((result, index) => {
      const sourceHeading = document.createElement('h4');
      sourceHeading.textContent = payload.results.length === 1 ? 'Top Source' : `Source ${index + 1}`;

      const link = document.createElement('a');
      const linkLabel = result.title || result.url || 'View source';
      link.textContent = linkLabel;
      if (result.url) {
        link.href = result.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }

      const linkWrapper = document.createElement('p');
      linkWrapper.appendChild(link);

      fragment.appendChild(sourceHeading);
      fragment.appendChild(linkWrapper);

      if (typeof result.score === 'number') {
        const score = document.createElement('p');
        score.classList.add('help-text');
        score.textContent = `Relevance score: ${result.score.toFixed(3)}`;
        fragment.appendChild(score);
      }

      if (result.content) {
        const snippetsHeading = document.createElement('h5');
        snippetsHeading.textContent = 'Content';
        fragment.appendChild(snippetsHeading);

        if (rawContentFormat === 'markdown' && window.marked) {
          const html = window.marked.parse(result.content);
          const sanitized = window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
          const markdownWrapper = document.createElement('div');
          markdownWrapper.innerHTML = sanitized;
          markdownWrapper.style.marginTop = '6px';
          fragment.appendChild(markdownWrapper);
        } else if (rawContentFormat === 'html') {
          const sanitizedHtml = window.DOMPurify ? window.DOMPurify.sanitize(result.content) : result.content;
          const htmlWrapper = document.createElement('div');
          htmlWrapper.innerHTML = sanitizedHtml;
          htmlWrapper.style.marginTop = '6px';
          fragment.appendChild(htmlWrapper);
        } else {
          const contentBlock = document.createElement('pre');
          contentBlock.textContent = result.content;
          contentBlock.style.whiteSpace = 'pre-wrap';
          contentBlock.style.margin = '6px 0 0';
          contentBlock.style.fontFamily = 'inherit';
          contentBlock.style.fontSize = '13px';
          contentBlock.style.lineHeight = '1.55';
          contentBlock.style.background = 'rgba(15, 23, 42, 0.04)';
          contentBlock.style.border = '1px solid rgba(148, 163, 184, 0.35)';
          contentBlock.style.borderRadius = '10px';
          contentBlock.style.padding = '10px 12px';

          fragment.appendChild(contentBlock);
        }
      }
    });
  }

  if (!fragment.childNodes.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = '(Tavily returned no content.)';
    fragment.appendChild(emptyMessage);
  }

  tavilyResultBlock.replaceChildren(fragment);

  if (rawContentFormat !== 'text' && window.hljs && typeof window.hljs.highlightAll === 'function') {
    window.hljs.highlightAll();
  }
};

const setTavilySearchButtonLoading = (isLoading) => {
  if (!tavilySearchButton) {
    return;
  }

  tavilySearchButton.disabled = isLoading;
  tavilySearchButton.textContent = isLoading ? 'Searching…' : 'Search';
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

const getDateInputValue = (input) => {
  if (!input) {
    return undefined;
  }
  const value = (input.value || '').trim();
  return value || undefined;
};

const parseBoundedInteger = (value, min, max, fallback = null) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  let clamped = parsed;
  if (typeof min === 'number' && clamped < min) {
    clamped = min;
  }
  if (typeof max === 'number' && clamped > max) {
    clamped = max;
  }
  return clamped;
};

const runTavilySearch = async (isRetry = false) => {
  if (!tavilyQueryInput) {
    return;
  }

  let query;
  let options;

  if (isRetry && lastTavilyRequest) {
    ({ query, options } = lastTavilyRequest);
  } else {
    query = (tavilyQueryInput.value || '').trim();

    if (!query) {
      setTavilySearchStatus('Enter a query to search.', true);
      renderTavilyMessage('Enter a query to search.', true);
      return;
    }

    const timeRange = tavilyTimeRangeSelect ? tavilyTimeRangeSelect.value : undefined;
    const startDate = getDateInputValue(tavilyStartDateInput);
    const endDate = getDateInputValue(tavilyEndDateInput);
    const maxResults = tavilyMaxResultsInput ? parseBoundedInteger(tavilyMaxResultsInput.value, 1, 5, 1) : 1;
    const chunksPerSource = tavilyChunksInput ? parseBoundedInteger(tavilyChunksInput.value, 1, 10, 3) : 3;
    const requestedRawFormat = tavilyRawContentSelect ? tavilyRawContentSelect.value : 'text';
    const allowedFormats = new Set(['text', 'markdown', 'html']);
    const includeRawContent = allowedFormats.has(requestedRawFormat) ? requestedRawFormat : 'text';
    const autoParameters = Boolean(tavilyAutoParametersCheckbox?.checked);

    if (startDate && endDate && startDate > endDate) {
      setTavilySearchStatus('Start date must be before end date.', true);
      renderTavilyMessage('Start date must be before end date.', true);
      return;
    }

    options = {
      timeRange,
      startDate,
      endDate,
      maxResults,
      chunksPerSource,
      includeRawContent,
      autoParameters
    };

    lastTavilyRequest = { query, options: { ...options } };
  }

  options = options || {};

  if (!isRetry) {
    tavilyRetryAfterSave = false;
  }

  setTavilySearchStatus('Searching…');
  resetTavilyResult();
  setTavilySearchButtonLoading(true);

  try {
    const { tavilySearch, MissingTavilyKeyError, InvalidTavilyKeyError } = await loadTavilyModule();

    try {
      const result = await tavilySearch(query, options);
      renderTavilyResult(result, options?.includeRawContent || 'text');
      tavilyRetryAfterSave = false;
      setTavilySearchStatus('Results ready.');
    } catch (error) {
      if (error instanceof MissingTavilyKeyError || error?.code === 'MissingTavilyKeyError') {
        tavilyRetryAfterSave = true;
        showTavilyKeyInput();
        setTavilyKeyStatus('Enter your Tavily API key to continue.', true);
        setTavilySearchStatus('');
        renderTavilyMessage('Enter your Tavily API key to continue.', true);
        return;
      }

      if (error instanceof InvalidTavilyKeyError || error?.code === 'InvalidTavilyKeyError') {
        tavilyRetryAfterSave = true;
        showTavilyKeyInput();
        setTavilyKeyStatus('Your Tavily API key appears invalid. Please enter a new key.', true);
        setTavilySearchStatus('');
        renderTavilyMessage('Your Tavily API key appears invalid. Please enter a new key.', true);
        return;
      }

      console.error('WebGuide AI: Tavily search failed.', error);
      const message = typeof error?.message === 'string' ? error.message : 'Tavily request failed.';
      setTavilySearchStatus('Tavily error.', true);
      renderTavilyMessage(`Error: ${message}`, true);
    }
  } catch (error) {
    console.error('WebGuide AI: Unable to load Tavily module.', error);
    setTavilySearchStatus('Unable to load Tavily module.', true);
    renderTavilyMessage(`Error: ${error.message || error}`, true);
  } finally {
    setTavilySearchButtonLoading(false);
  }
};

if (tavilySearchButton) {
  tavilySearchButton.addEventListener('click', () => runTavilySearch(false));
}

if (tavilyQueryInput) {
  tavilyQueryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      runTavilySearch(false);
    }
  });
}

const setAgentControlsBusy = (busy) => {
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

const applyAgentUpdate = (update = {}) => {
  if (agentStatusLabel) {
    agentStatusLabel.textContent = update.status || 'Idle';
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

const handleAgentStart = async () => {
  const goal = (agentGoalInput?.value || '').trim();
  if (!goal) {
    applyAgentUpdate({ status: 'error', message: 'Enter a goal to start the agent.' });
    return;
  }

  const tab = await getActiveTab();
  if (!tab) {
    applyAgentUpdate({ status: 'error', message: 'No active tab detected.' });
    return;
  }

  setAgentControlsBusy(true);
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
  } catch (error) {
    console.error('[WebGuideAI][Popup] Agent start failed:', error);
    applyAgentUpdate({ status: 'error', message: error.message });
  } finally {
    setAgentControlsBusy(false);
  }
};

const handleAgentStop = async () => {
  setAgentControlsBusy(true);
  try {
    await runtimeSendMessage({ type: 'wga-agent-stop', manual: true });
    applyAgentUpdate({ status: 'stopped', message: 'Agent stopped.' });
  } catch (error) {
    console.error('[WebGuideAI][Popup] Agent stop failed:', error);
    applyAgentUpdate({ status: 'error', message: error.message });
  } finally {
    setAgentControlsBusy(false);
  }
};

const handleAgentReset = async () => {
  setAgentControlsBusy(true);
  try {
    await runtimeSendMessage({ type: 'wga-agent-reset' });
    applyAgentUpdate({ status: 'idle', message: 'Session reset.' });
  } catch (error) {
    console.error('[WebGuideAI][Popup] Agent reset failed:', error);
    applyAgentUpdate({ status: 'error', message: error.message });
  } finally {
    setAgentControlsBusy(false);
  }
};

if (agentStartButton) {
  agentStartButton.addEventListener('click', handleAgentStart);
}

if (agentStopButton) {
  agentStopButton.addEventListener('click', handleAgentStop);
}

if (agentResetButton) {
  agentResetButton.addEventListener('click', handleAgentReset);
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

    try {
      await sendMessageToTab(tab.id, { type: 'wga-show-overlay', reason: 'manual-activate', skipLogSync: true });
      setStatus('Overlay activated.');
    } catch (messageError) {
      setStatus('Overlay injected.');
    }
  } catch (error) {
    console.error('WebGuide AI: Failed to inject overlay.', error);
    setStatus('Could not inject overlay. See console for details.', true);
  }
}

if (activateButton) {
  activateButton.addEventListener('click', injectOverlay);
}

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
refreshAgentStatus();

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.type === 'wga-agent-update') {
    applyAgentUpdate(message.data || {});
  }
});
loadStoredTavilyKey();
