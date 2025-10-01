const activateButton = document.getElementById('activate-overlay');
const overlayDemoButton = document.getElementById('run-overlay-demo');
const statusMessage = document.getElementById('status-message');

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
