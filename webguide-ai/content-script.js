(() => {
  if (window.__WEBGUIDE_AI_CONTENT_ACTIVE__) {
    return;
  }
  window.__WEBGUIDE_AI_CONTENT_ACTIVE__ = true;

  const overlayId = 'webguide-ai-overlay';
  const styleSelector = 'link[data-webguide-ai-style="true"]';

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

  const renderOverlayBanner = () => {
    const host = document.body || document.documentElement;
    if (!host) {
      return;
    }

    const existingOverlay = document.getElementById(overlayId);
    if (existingOverlay) {
      existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.textContent = 'WebGuide AI is active.';

    host.appendChild(overlay);
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

  const handleMessage = (message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'wga-run-overlay-demo') {
      runOverlayDemo().then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
      return true;
    }

    if (message.type === 'wga-run-dom-snapshot') {
      runDomSnapshot({ includeHidden: Boolean(message.includeHidden) }).then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: error.message });
      });
      return true;
    }
  };

  chrome.runtime.onMessage.addListener(handleMessage);

  ensureStylesheet();
  renderOverlayBanner();

  runDomSnapshot();

  window.WebGuideAI = {
    ...(window.WebGuideAI || {}),
    runOverlayDemo,
    loadOverlayModule,
    runDomSnapshot,
    loadDomSnapshotModule
  };
})();
