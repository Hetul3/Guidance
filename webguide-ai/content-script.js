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

  let overlayModulePromise = null;
  const loadOverlayModule = async () => {
    if (!overlayModulePromise) {
      overlayModulePromise = import(chrome.runtime.getURL('overlay.js')).catch((error) => {
        overlayModulePromise = null;
        throw error;
      });
    }

    return overlayModulePromise;
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
  };

  chrome.runtime.onMessage.addListener(handleMessage);

  ensureStylesheet();
  renderOverlayBanner();

  window.WebGuideAI = {
    ...(window.WebGuideAI || {}),
    runOverlayDemo,
    loadOverlayModule
  };
})();
