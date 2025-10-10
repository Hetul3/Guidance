(() => {
  const MARKER_KEY = '__WEBGUIDE_AI_CONTENT_ACTIVE__';
  const runtimeId = chrome?.runtime?.id || `legacy-${Date.now()}`;
  const marker = window[MARKER_KEY];

  if (marker && marker.runtimeId === runtimeId) {
    console.debug('[WebGuideAI][content] Existing content script instance detected for runtime', runtimeId);
    return;
  }

  if (marker && typeof marker.cleanup === 'function') {
    console.debug('[WebGuideAI][content] Cleaning up previous instance for runtime', marker.runtimeId);
    try {
      marker.cleanup();
    } catch (error) {
      console.warn('[WebGuideAI][content] Cleanup from previous instance failed', error);
    }
  }

  const cleanupCallbacks = [];
  const registerCleanup = (fn) => {
    if (typeof fn === 'function') {
      cleanupCallbacks.push(fn);
    }
  };

  let destroyed = false;
  const cleanupSelf = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    console.debug('[WebGuideAI][content] Running cleanup for runtime', runtimeId);
    cleanupCallbacks.splice(0).forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.warn('[WebGuideAI][content] Cleanup callback failed', error);
      }
    });
  };

  window[MARKER_KEY] = {
    runtimeId,
    ts: Date.now(),
    cleanup: cleanupSelf
  };

  const historyOriginals = new Map();

  console.info('[WebGuideAI][content] Initialising content script');

  const overlayId = 'webguide-ai-overlay';
  const styleSelector = 'link[data-webguide-ai-style="true"]';
  const MAX_OVERLAY_LOG_ENTRIES = 6;

  const ensureStylesheet = () => {
    if (document.querySelector(styleSelector)) {
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles/overlay.css');
    link.dataset.webguideAiStyle = 'true';

    const target = document.head || document.documentElement;
    target.appendChild(link);
  };

  const safeSendMessage = (payload, callback) => {
    if (destroyed) {
      if (typeof callback === 'function') {
        callback(undefined, new Error('Content script shutdown'));
      }
      return;
    }
    if (!chrome?.runtime?.id) {
      console.warn('[WebGuideAI][content] runtime ID unavailable (likely reloading)');
      cleanupSelf();
      if (typeof callback === 'function') {
        callback(undefined, new Error('Extension context invalidated'));
      }
      return;
    }
    try {
      if (typeof callback === 'function') {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            const err = new Error(chrome.runtime.lastError.message);
            console.warn('[WebGuideAI][content] runtime message failed', payload?.type, err.message);
            if (/Extension context invalidated/i.test(err.message)) {
              cleanupSelf();
            }
            callback(undefined, err);
            return;
          }
          callback(response, null);
        });
        return;
      }

      chrome.runtime.sendMessage(payload, () => {
        if (chrome.runtime.lastError && /Extension context invalidated/i.test(chrome.runtime.lastError.message)) {
          cleanupSelf();
        }
      });
    } catch (error) {
      console.error('[WebGuideAI][content] runtime message threw', payload?.type, error);
      if (/Extension context invalidated/i.test(error?.message || '')) {
        cleanupSelf();
      }
      if (typeof callback === 'function') {
        callback(undefined, error);
      }
    }
  };

  const overlayLogMap = new Map();
  const pendingOverlayLogs = [];
  let overlayElement = null;
  let overlayStatusElement = null;
  let overlayLogElement = null;
  let overlayCloseButton = null;
  let overlayClearButton = null;
  let overlayVisible = false;
  let detectionEnabled = false;
  let overlayReportedActive = false;
  let overlayLogsLoaded = false;

  const getElementFromRegistry = (targetId) => {
    if (!targetId) {
      return null;
    }

    const registry = window.WebGuideAI?.elementRegistry;
    if (!registry) {
      return null;
    }

    try {
      if (typeof registry.get === 'function') {
        return registry.get(targetId) || null;
      }

      if (registry[targetId]) {
        return registry[targetId];
      }
    } catch (_error) {
      return null;
    }

    return null;
  };

  const runVisualOverlayAction = async ({ action, targetId, message }) => {
    if (!targetId) {
      throw new Error('Missing targetId for overlay action');
    }

    const element = getElementFromRegistry(targetId);
    if (!element) {
      throw new Error(`Element ${targetId} is not available in the current DOM snapshot.`);
    }

    const module = await loadOverlayModule();
    if (action === 'highlight') {
      module.highlightElement(element, message || '');
      return { ok: true };
    }

    if (action === 'pulse') {
      module.pulseAtElement(element);
      return { ok: true };
    }

    throw new Error(`Unsupported overlay action: ${action}`);
  };

  const scrollViewport = ({ direction, targetId }) => {
    if (direction === 'toElement' && targetId) {
      const element = getElementFromRegistry(targetId);
      if (element && element.scrollIntoView) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { ok: true };
      }
      throw new Error(`Element ${targetId} is not available for scrolling.`);
    }

    const delta = direction === 'up' ? -window.innerHeight * 0.6 : window.innerHeight * 0.6;
    window.scrollBy({ top: delta, behavior: 'smooth' });
    return { ok: true };
  };

  const generateLogId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `wga-log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const ensureOverlayElements = () => {
    const host = document.body || document.documentElement;
    if (!host) {
      return null;
    }

    if (overlayElement && host.contains(overlayElement)) {
      overlayElement.hidden = !overlayVisible;
      return overlayElement;
    }

    if (overlayElement && overlayElement.parentElement) {
      overlayElement.parentElement.removeChild(overlayElement);
    }

    const container = document.createElement('div');
    container.id = overlayId;

    const header = document.createElement('div');
    header.className = 'wga-overlay-header';

    const title = document.createElement('span');
    title.className = 'wga-overlay-title';
    title.textContent = 'WebGuide AI Active';

    const actions = document.createElement('div');
    actions.className = 'wga-overlay-actions';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'wga-overlay-action';
    clearButton.title = 'Clear history';
    clearButton.textContent = 'Clear';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'wga-overlay-close';
    closeButton.setAttribute('aria-label', 'Close WebGuide AI panel');
    closeButton.textContent = '×';

    actions.appendChild(clearButton);
    actions.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'wga-overlay-body';

    const status = document.createElement('p');
    status.className = 'wga-overlay-status';
    status.textContent = 'Waiting for page changes…';

    const log = document.createElement('div');
    log.className = 'wga-overlay-log';
    log.setAttribute('aria-live', 'polite');

    body.appendChild(status);
    body.appendChild(log);

    container.appendChild(header);
    container.appendChild(body);

    host.appendChild(container);

    overlayElement = container;
    overlayElement.hidden = !overlayVisible;
    overlayStatusElement = status;
    overlayLogElement = log;
    overlayCloseButton = closeButton;
    overlayClearButton = clearButton;

    overlayCloseButton.addEventListener('click', () => {
      hideOverlay({ manual: true });
    });

    overlayClearButton.addEventListener('click', () => {
      clearOverlayLog(true);
      overlayLogsLoaded = true;
      updateOverlayStatus('Log cleared.');
    });

    return overlayElement;
  };

  const updateOverlayStatus = (message, variant = 'default') => {
    if (!overlayStatusElement) {
      return;
    }

    if (!message) {
      overlayStatusElement.textContent = '';
      return;
    }

    overlayStatusElement.textContent = message;

    if (variant === 'warning') {
      overlayStatusElement.style.color = '#facc15';
    } else {
      overlayStatusElement.style.color = 'rgba(226, 232, 240, 0.9)';
    }
  };

  const createOverlayPill = (label, variant) => {
    const span = document.createElement('span');
    span.className = 'wga-overlay-pill';
    if (variant) {
      span.dataset.variant = variant;
    }
    span.textContent = label;
    return span;
  };

  const buildLogElement = (entry) => {
    const element = document.createElement('div');
    element.className = 'wga-overlay-log-entry';
    element.dataset.logId = entry.id;

    if (entry.ok === false) {
      element.classList.add('wga-overlay-log-entry--error');
    } else if (entry.error) {
      element.classList.add('wga-overlay-log-entry--warning');
    }

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '8px';

    const pillLabel = entry.reason ? entry.reason.replace(/-/g, ' ') : 'scan';
    const pillVariant = entry.ok === false
      ? 'warning'
      : entry.reason && entry.reason.startsWith('mutation')
      ? 'mutation'
      : entry.reason && entry.reason.includes('navigation')
      ? 'navigation'
      : undefined;

    header.appendChild(createOverlayPill(pillLabel, pillVariant));

    const counts = document.createElement('span');
    counts.style.fontSize = '11px';
    counts.style.color = '#cbd5f5';
    if (entry.ok === false) {
      counts.textContent = 'scan failed';
    } else {
      counts.textContent = `${entry.rawCount ?? '–'} raw • ${entry.llmCount ?? '–'} llm`;
    }
    header.appendChild(counts);

    element.appendChild(header);

    const time = document.createElement('time');
    const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : Date.now();
    time.textContent = new Date(timestamp).toLocaleTimeString();
    element.appendChild(time);

    if (entry.url) {
      const urlText = document.createElement('span');
      urlText.textContent = entry.url;
      urlText.style.color = 'rgba(148, 163, 184, 0.9)';
      urlText.style.fontSize = '11px';
      urlText.style.wordBreak = 'break-word';
      element.appendChild(urlText);
    }

    if (entry.error) {
      const errorText = document.createElement('span');
      errorText.textContent = entry.error;
      errorText.style.color = '#f87171';
      errorText.style.fontSize = '11px';
      errorText.style.wordBreak = 'break-word';
      element.appendChild(errorText);
    }

    return element;
  };

  const appendOverlayLogEntry = (entry, options = {}) => {
    if (destroyed) {
      return;
    }
    if (!entry) {
      return;
    }

    const { persist = false, fromHistory = false } = options;
    const enrichedEntry = { ...entry };
    enrichedEntry.id = enrichedEntry.id || generateLogId();
    enrichedEntry.timestamp = typeof enrichedEntry.timestamp === 'number' ? enrichedEntry.timestamp : Date.now();

    if (persist) {
      safeSendMessage({ type: 'wga-log-entry', entry: enrichedEntry });
    }

    ensureOverlayElements();

    if (!overlayLogsLoaded && !fromHistory) {
      pendingOverlayLogs.push({ entry: enrichedEntry, options: { ...options, persist: false } });
      return;
    }

    ensureOverlayElements();

    if (!overlayLogElement) {
      return;
    }

    const existing = overlayLogMap.get(enrichedEntry.id);
    if (existing?.element && existing.element.parentElement === overlayLogElement) {
      overlayLogElement.removeChild(existing.element);
    }

    const element = buildLogElement(enrichedEntry);
    overlayLogElement.insertBefore(element, overlayLogElement.firstChild);
    overlayLogMap.set(enrichedEntry.id, { data: enrichedEntry, element });

    while (overlayLogElement.childElementCount > MAX_OVERLAY_LOG_ENTRIES) {
      const last = overlayLogElement.lastElementChild;
      if (!last) {
        break;
      }
      const logId = last.getAttribute('data-log-id');
      overlayLogElement.removeChild(last);
      if (logId) {
        overlayLogMap.delete(logId);
      }
    }
  };

  const flushPendingOverlayLogs = () => {
    if (!overlayLogsLoaded || pendingOverlayLogs.length === 0) {
      return;
    }

    const queue = pendingOverlayLogs.splice(0);
    queue.forEach(({ entry: queuedEntry }) => {
      if (queuedEntry && !overlayLogMap.has(queuedEntry.id)) {
        appendOverlayLogEntry(queuedEntry, { persist: false, fromHistory: false });
      }
    });
  };

  const clearOverlayLog = (persist = false) => {
    overlayLogMap.clear();
    pendingOverlayLogs.length = 0;
    if (overlayLogElement) {
      overlayLogElement.innerHTML = '';
    }
    overlayLogsLoaded = true;
    if (persist) {
      safeSendMessage({ type: 'wga-clear-log' });
    }
  };

  const requestExistingLogs = (callback) => {
    overlayLogsLoaded = false;
    ensureOverlayElements();
    safeSendMessage({ type: 'wga-request-log' }, (response, error) => {
      if (error) {
        overlayLogsLoaded = true;
        flushPendingOverlayLogs();
        if (typeof callback === 'function') {
          callback(null);
        }
        return;
      }

      const logs = Array.isArray(response?.logs) ? response.logs : [];
      if (overlayLogElement) {
        overlayLogElement.innerHTML = '';
      }
      overlayLogMap.clear();

      logs.forEach((log) => {
        appendOverlayLogEntry({ ...log }, { persist: false, fromHistory: true });
      });

      overlayLogsLoaded = true;
      flushPendingOverlayLogs();

      if (typeof callback === 'function') {
        callback(response);
      }
    });
  };

  const setOverlayVisibility = (visible) => {
    const overlay = ensureOverlayElements();
    if (!overlay) {
      return;
    }

    overlay.hidden = !visible;
    overlayVisible = visible;
  };

  let domMutationObserver = null;

  const ensureDomObserverActive = () => {
    if (!detectionEnabled) {
      return;
    }

    if (domMutationObserver) {
      return;
    }

    const target = document.body || document.documentElement;
    if (!target || typeof MutationObserver === 'undefined') {
      return;
    }

    domMutationObserver = new MutationObserver((mutations) => {
      if (!detectionEnabled) {
        return;
      }

      if (shouldTreatAsMajorMutation(mutations)) {
        queueDomRescan('mutation');
      }
    });

    domMutationObserver.observe(target, {
      childList: true,
      subtree: true
    });
  };

  const stopDomObserver = () => {
    if (domMutationObserver) {
      try {
        domMutationObserver.disconnect();
      } catch (_error) {
        // noop
      }
      domMutationObserver = null;
    }
  };

  const showOverlay = (triggerReason = 'overlay-open', options = {}) => {
    if (destroyed) {
      return;
    }
    const { skipLogSync = false } = options;
    setOverlayVisibility(true);
    detectionEnabled = true;
    updateOverlayStatus('Monitoring for page and UI changes…');
    ensureDomObserverActive();
    if (!skipLogSync) {
      if (!overlayLogsLoaded) {
        requestExistingLogs();
      } else {
        flushPendingOverlayLogs();
      }
    } else {
      flushPendingOverlayLogs();
    }
    queueDomRescan(triggerReason, 0);

    if (!overlayReportedActive) {
      overlayReportedActive = true;
      safeSendMessage({ type: 'wga-overlay-activated' });
    }
  };

  const hideOverlay = (options = {}) => {
    if (destroyed) {
      return;
    }
    const { manual = false } = options;
    setOverlayVisibility(false);
    detectionEnabled = false;
    updateOverlayStatus('Monitoring paused.', 'warning');
    stopDomObserver();

    if (scheduledScanTimer) {
      clearTimeout(scheduledScanTimer);
      scheduledScanTimer = null;
    }

    if (cooldownTimer) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }

    pendingReason = null;

    if (overlayReportedActive) {
      overlayReportedActive = false;
      chrome.runtime
        .sendMessage({ type: 'wga-overlay-deactivated', closedManually: manual })
        .catch(() => {});
    }
  };

  const ensureTrustedScriptURL = (url) => {
    if (!url) {
      return url;
    }

    const trustedTypes = window.trustedTypes;
    if (!trustedTypes || typeof trustedTypes.createPolicy !== 'function') {
      return url;
    }

    if (!window.__WEBGUIDE_AI_TRUSTED_POLICY__) {
      try {
        window.__WEBGUIDE_AI_TRUSTED_POLICY__ = trustedTypes.createPolicy('webguide-ai#modules', {
          createScriptURL: (unsafeUrl) => unsafeUrl
        });
      } catch (_err) {
        // Policy might already exist; fallback to returning original URL.
        return url;
      }
    }

    try {
      return window.__WEBGUIDE_AI_TRUSTED_POLICY__.createScriptURL(url);
    } catch (_err) {
      return url;
    }
  };

  let overlayModulePromise = null;
  const loadOverlayModule = async () => {
    if (!overlayModulePromise) {
      const moduleUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('overlay.js') : null;
      if (!moduleUrl) {
        return Promise.reject(new Error('Unable to resolve overlay module URL'));
      }

      const trustedUrl = ensureTrustedScriptURL(moduleUrl);

      overlayModulePromise = import(trustedUrl).catch((error) => {
        overlayModulePromise = null;
        throw error;
      });
    }

    return overlayModulePromise;
  };

  let domSnapshotModulePromise = null;
  const loadDomSnapshotModule = async () => {
    if (!domSnapshotModulePromise) {
      const moduleUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('dom-snapshot.js') : null;
      if (!moduleUrl) {
        return Promise.reject(new Error('Unable to resolve dom-snapshot module URL'));
      }

      const trustedUrl = ensureTrustedScriptURL(moduleUrl);

      domSnapshotModulePromise = import(trustedUrl).catch((error) => {
        domSnapshotModulePromise = null;
        throw error;
      });
    }

    return domSnapshotModulePromise;
  };

  const runOverlayDemo = async () => {
    try {
      const module = await loadOverlayModule();
      const { pulseAtElement, highlightElement } = module;

      const firstButton = document.querySelector('button, [role="button"], input[type="button"], input[type="submit"]');
      const firstLink = document.querySelector('a[href]');

      if (firstButton) {
        pulseAtElement(firstButton);
      }

      if (firstLink) {
        highlightElement(firstLink, 'This is a test highlight');
      }

      return { ok: true, pulsed: Boolean(firstButton), highlighted: Boolean(firstLink) };
    } catch (error) {
      console.error('WebGuide AI: Overlay module failed to run demo.', error);
      return { ok: false, error: error.message };
    }
  };

  const runDomSnapshot = async ({ includeHidden = false } = {}) => {
    if (destroyed) {
      return { ok: false, error: 'Content script shutdown' };
    }
    if (!chrome?.runtime?.id) {
      console.warn('[WebGuideAI][content] DOM snapshot aborted – runtime unavailable');
      cleanupSelf();
      return { ok: false, error: 'Extension context invalidated' };
    }
    try {
      const moduleUrl = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('dom-snapshot.js') : null;
      if (!moduleUrl) {
        throw new Error('Missing module URL for dom-snapshot.js');
      }

      console.debug('[WebGuideAI] Loading DOM snapshot module from', moduleUrl);

      const module = await loadDomSnapshotModule();
      const { collectClickableElements } = module;
      const snapshot = collectClickableElements(includeHidden);
      const rawCount = Array.isArray(snapshot.raw) ? snapshot.raw.length : 0;
      const llmCount = Array.isArray(snapshot.llm) ? snapshot.llm.length : 0;

      console.log(`Found ${rawCount} elements (raw), filtered down to ${llmCount} elements (llm).`);
      console.log(`Raw snapshot (${rawCount} elements):`, snapshot.raw);
      console.log(`LLM snapshot (${llmCount} elements):`, snapshot.llm);

      window.WebGuideAI = {
        ...(window.WebGuideAI || {}),
        lastDomSnapshot: snapshot,
        elementRegistry: snapshot.registry
      };

      return { ok: true, rawCount, llmCount };
    } catch (error) {
      console.error('WebGuide AI: DOM snapshot failed.', error);
      return { ok: false, error: error.message };
    }
  };

  let lastKnownUrl = window.location.href;
  const SCAN_DEBOUNCE_MS = 500;
  const SCAN_COOLDOWN_MS = 1500;
  const MUTATION_NODE_THRESHOLD = 40;

  let scheduledScanTimer = null;
  let cooldownTimer = null;
  let pendingReason = null;
  let isScanning = false;
  let lastScanTime = 0;

  const dispatchScanEvent = (reason, result, extra = {}) => {
    if (destroyed) {
      return;
    }
    const detail = {
      reason,
      url: window.location.href,
      timestamp: Date.now(),
      rawCount: typeof result?.rawCount === 'number' ? result.rawCount : null,
      llmCount: typeof result?.llmCount === 'number' ? result.llmCount : null,
      ok: Boolean(result?.ok),
      error: result?.error || null,
      ...extra
    };

    const logEntry = {
      id: generateLogId(),
      reason,
      url: detail.url,
      timestamp: detail.timestamp,
      rawCount: detail.rawCount,
      llmCount: detail.llmCount,
      ok: detail.ok,
      error: detail.error
    };

    appendOverlayLogEntry(logEntry, { persist: true });

    window.dispatchEvent(new CustomEvent('webguide:scan-complete', { detail }));
    safeSendMessage({ type: 'wga-scan-event', detail });

    if (overlayVisible) {
      const label = reason ? reason.replace(/-/g, ' ') : 'scan complete';
      const statusText = result?.ok
        ? `Scan "${label}" captured ${detail.rawCount ?? '0'} elements.`
        : `Scan "${label}" failed.`;
      updateOverlayStatus(statusText, result?.ok ? 'default' : 'warning');
    }
  };

  const markPendingTargetStatus = (reason) => {
    if (destroyed) {
      return;
    }
    const guideState = window.WebGuideAI || {};
    const targetId = guideState.pendingTargetId;
    const registry = guideState.elementRegistry;

    if (!targetId || !registry) {
      return;
    }

    let exists = false;
    try {
      if (typeof registry.has === 'function') {
        exists = registry.has(targetId);
      } else if (registry[targetId]) {
        exists = true;
      }
    } catch (_error) {
      exists = false;
    }

    if (!exists) {
      guideState.pendingTargetMissing = true;
      window.dispatchEvent(new CustomEvent('webguide:pending-target-missing', {
        detail: { targetId, reason, timestamp: Date.now() }
      }));
    } else {
      guideState.pendingTargetMissing = false;
    }
  };

  const finalizeScan = (reason, result) => {
    if (destroyed) {
      return;
    }
    if (result?.ok) {
      lastKnownUrl = window.location.href;
      window.WebGuideAI = {
        ...(window.WebGuideAI || {}),
        lastScanReason: reason,
        lastScanTimestamp: Date.now()
      };
      markPendingTargetStatus(reason);
    } else if (result && !result.ok) {
      console.warn('[WebGuideAI] DOM scan failed', result.error);
    }

    if (result?.ok && result.rawCount === 0) {
      console.warn('[WebGuideAI] DOM scan succeeded but no clickable elements were detected; waiting for further changes.');
    }

    dispatchScanEvent(reason, result);
  };

  const invokeDomSnapshot = async (reason) => {
    try {
      const result = await runDomSnapshot({ includeHidden: false });
      finalizeScan(reason, result);
    } catch (error) {
      console.error('[WebGuideAI] DOM scan threw an error', error);
      dispatchScanEvent(reason, { ok: false, error: error.message });
    }
  };

  const triggerDomRescan = (reason) => {
    if (destroyed || !detectionEnabled) {
      return;
    }

    const now = Date.now();

    if (isScanning) {
      pendingReason = reason;
      return;
    }

    const elapsed = now - lastScanTime;
    if (elapsed < SCAN_COOLDOWN_MS) {
      pendingReason = reason;
      if (!cooldownTimer) {
        cooldownTimer = setTimeout(() => {
          cooldownTimer = null;
          if (pendingReason) {
            const queuedReason = pendingReason;
            pendingReason = null;
            triggerDomRescan(queuedReason);
          }
        }, SCAN_COOLDOWN_MS - elapsed);
      }
      return;
    }

    isScanning = true;
    lastScanTime = now;

    invokeDomSnapshot(reason).finally(() => {
      isScanning = false;
      if (pendingReason) {
        const queuedReason = pendingReason;
        pendingReason = null;
        triggerDomRescan(queuedReason);
      }
    });
  };

  const queueDomRescan = (reason, debounceMs = SCAN_DEBOUNCE_MS) => {
    if (destroyed || !detectionEnabled) {
      return;
    }

    if (debounceMs <= 0) {
      triggerDomRescan(reason);
      return;
    }

    if (scheduledScanTimer) {
      clearTimeout(scheduledScanTimer);
    }

    scheduledScanTimer = setTimeout(() => {
      scheduledScanTimer = null;
      triggerDomRescan(reason);
    }, debounceMs);
  };

  function shouldTreatAsMajorMutation(mutations) {
    let addedElements = 0;
    let removedElements = 0;
    let bodyLevelChange = false;

    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue;
      }

      if (mutation.target === document.body || mutation.target === document.documentElement) {
        bodyLevelChange = true;
      }

      mutation.addedNodes?.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          addedElements += 1;

          if (!bodyLevelChange && node instanceof Element) {
            if (node.matches('main, [role="main"], header, nav, section, article, #root, #app, [data-page], [data-view]')) {
              bodyLevelChange = true;
            }
          }
        }
      });

      mutation.removedNodes?.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          removedElements += 1;
        }
      });
    }

    return bodyLevelChange || addedElements + removedElements >= MUTATION_NODE_THRESHOLD;
  }

  const beforeUnloadHandler = () => {
    stopDomObserver();
  };
  window.addEventListener('beforeunload', beforeUnloadHandler, { once: true });
  registerCleanup(() => window.removeEventListener('beforeunload', beforeUnloadHandler));

  const patchHistoryMethod = (method) => {
    if (!window.history || typeof window.history[method] !== 'function') {
      return;
    }

    if (historyOriginals.has(method)) {
      return;
    }

    const original = window.history[method];
    historyOriginals.set(method, original);
    window.history[method] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      queueDomRescan('history-state');
      return result;
    };
  };

  patchHistoryMethod('pushState');
  patchHistoryMethod('replaceState');

  const popstateHandler = () => {
    if (destroyed) {
      return;
    }
    if (window.location.href === lastKnownUrl) {
      queueDomRescan('popstate');
    } else {
      queueDomRescan('popstate-url');
    }
  };
  window.addEventListener('popstate', popstateHandler);
  registerCleanup(() => window.removeEventListener('popstate', popstateHandler));

  function handleMessage(message, _sender, sendResponse) {
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (message.type === 'wga-page-changed') {
      if (!detectionEnabled) {
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: false, disabled: true });
        }
        return false;
      }

      const reason = message.reason || 'navigation';
      if (!message.url || message.url !== lastKnownUrl) {
        queueDomRescan(reason, 0);
      } else {
        queueDomRescan(reason);
      }
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true, scheduled: true });
      }
      return false;
    }

    if (message.type === 'wga-run-overlay-demo') {
      runOverlayDemo().then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
      return true;
    }

    if (message.type === 'wga-run-dom-snapshot') {
      if (!detectionEnabled) {
        runDomSnapshot({ includeHidden: Boolean(message.includeHidden) })
          .then((result) => {
            sendResponse?.({ ...result, warning: 'Detection disabled' });
          })
          .catch((error) => {
            sendResponse?.({ ok: false, error: error.message, warning: 'Detection disabled' });
          });
        return true;
      }

      runDomSnapshot({ includeHidden: Boolean(message.includeHidden) }).then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
      return true;
    }

    if (message.type === 'wga-show-overlay') {
      const reason = typeof message.reason === 'string' ? message.reason : 'manual';
      showOverlay(reason, { skipLogSync: Boolean(message.skipLogSync) });
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: true });
      }
      return false;
    }

    if (message.type === 'wga-hide-overlay') {
      hideOverlay({ manual: Boolean(message.manual) });
      sendResponse?.({ ok: true });
      return false;
    }

    if (message.type === 'wga-get-dom-snapshot') {
      ensureDomObserverActive();
      runDomSnapshot({ includeHidden: Boolean(message.includeHidden) })
        .then((result) => {
          const latestSnapshot = window.WebGuideAI?.lastDomSnapshot || {};
          const currentMutationVersion = typeof latestSnapshot.mutationVersion === 'number'
            ? latestSnapshot.mutationVersion
            : null;
          const responsePayload = {
            ok: result.ok,
            rawCount: result.rawCount,
            llmCount: result.llmCount,
            mutationVersion: currentMutationVersion,
            snapshot: Array.isArray(latestSnapshot.llm) ? latestSnapshot.llm : [],
            url: window.location.href
          };
          sendResponse?.(responsePayload);
        })
        .catch((error) => {
          sendResponse?.({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'wga-run-overlay') {
      runVisualOverlayAction({
        action: message.action,
        targetId: message.targetId,
        message: message.message
      })
        .then((res) => sendResponse?.(res))
        .catch((error) => {
          sendResponse?.({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === 'wga-scroll') {
      try {
        const result = scrollViewport({ direction: message.direction, targetId: message.targetId });
        sendResponse?.(result);
      } catch (error) {
        sendResponse?.({ ok: false, error: error.message });
      }
      return false;
    }

    if (message.type === 'wga-clear-overlay-log') {
      clearOverlayLog(Boolean(message.persist));
      sendResponse?.({ ok: true });
      return false;
    }

    return false;
  }

  chrome.runtime.onMessage.addListener(handleMessage);
  registerCleanup(() => {
    if (chrome?.runtime?.onMessage?.removeListener) {
      chrome.runtime.onMessage.removeListener(handleMessage);
    }
  });

  ensureStylesheet();

  requestExistingLogs((response) => {
    const wasActive = Boolean(response?.active);
    const wasClosedManually = Boolean(response?.closedManually);

    if (wasActive || !wasClosedManually) {
      showOverlay(wasActive ? 'restore' : 'initial-load', { skipLogSync: true });
      return;
    }

    // Overlay should remain hidden until user reactivates via popup.
    detectionEnabled = false;
    overlayReportedActive = false;
    ensureOverlayElements();
    setOverlayVisibility(false);
    flushPendingOverlayLogs();
  });

  window.WebGuideAI = {
    ...(window.WebGuideAI || {}),
    runOverlayDemo,
    loadOverlayModule,
    runDomSnapshot,
    loadDomSnapshotModule,
    queueDomRescan: (reason = 'manual') => {
      queueDomRescan(reason, 0);
    },
    showOverlay,
    hideOverlay,
    isOverlayVisible() {
      return overlayVisible;
    },
    clearOverlayLog: () => {
      clearOverlayLog(true);
    },
    setPendingTargetId(targetId) {
      this.pendingTargetId = typeof targetId === 'string' ? targetId : null;
      if (!this.pendingTargetId) {
        this.pendingTargetMissing = false;
      }
    },
    getElementFromRegistry(targetId) {
      if (!targetId) {
        return null;
      }

      const registry = this.elementRegistry;
      if (!registry) {
        return null;
      }

      try {
        if (typeof registry.get === 'function') {
          return registry.get(targetId) || null;
        }

        return registry[targetId] || null;
      } catch (_error) {
        return null;
      }
    }
  };

  const pendingTargetListener = (event) => {
    if (destroyed || !overlayVisible) {
      return;
    }

    const detail = event?.detail || {};
    const targetId = detail.targetId || '(unknown)';
    const reason = detail.reason || 'target-missing';
    updateOverlayStatus(`Waiting for ${targetId} (after ${reason}).`, 'warning');
    appendOverlayLogEntry({
      id: generateLogId(),
      reason: reason ? `${reason}-target` : 'target-missing',
      url: window.location.href,
      timestamp: Date.now(),
      rawCount: null,
      llmCount: null,
      ok: false,
      error: 'Pending target not found'
    }, { persist: true });
  };
  window.addEventListener('webguide:pending-target-missing', pendingTargetListener);
  registerCleanup(() => window.removeEventListener('webguide:pending-target-missing', pendingTargetListener));

  registerCleanup(() => {
    detectionEnabled = false;
    stopDomObserver();
    if (scheduledScanTimer) {
      clearTimeout(scheduledScanTimer);
      scheduledScanTimer = null;
    }
    if (cooldownTimer) {
      clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }
    pendingReason = null;
    isScanning = false;
    historyOriginals.forEach((original, method) => {
      if (window.history && typeof original === 'function') {
        window.history[method] = original;
      }
    });
    historyOriginals.clear();
    console.debug('[WebGuideAI][content] Cleanup executed');
  });

})();
