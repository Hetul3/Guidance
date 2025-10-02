const GEMINI_KEY_FIELD = 'GEMINI_API_KEY';
const TAVILY_KEY_FIELD = 'TAVILY_API_KEY';

export async function getApiKey() {
  try {
    const { [GEMINI_KEY_FIELD]: apiKey } = await chrome.storage.local.get([GEMINI_KEY_FIELD]);
    if (typeof apiKey === 'string' && apiKey.trim()) {
      return apiKey.trim();
    }
    return null;
  } catch (error) {
    console.error('WebGuide AI: Failed to read Gemini API key from storage.', error);
    return null;
  }
}

export async function setApiKey(apiKey) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Gemini API key must be a non-empty string.');
  }

  const trimmed = apiKey.trim();

  try {
    await chrome.storage.local.set({ [GEMINI_KEY_FIELD]: trimmed });
    return true;
  } catch (error) {
    console.error('WebGuide AI: Failed to save Gemini API key to storage.', error);
    throw error;
  }
}

export async function getTavilyKey() {
  try {
    const { [TAVILY_KEY_FIELD]: apiKey } = await chrome.storage.local.get([TAVILY_KEY_FIELD]);
    if (typeof apiKey === 'string' && apiKey.trim()) {
      return apiKey.trim();
    }
    return null;
  } catch (error) {
    console.error('WebGuide AI: Failed to read Tavily API key from storage.', error);
    return null;
  }
}

export async function setTavilyKey(apiKey) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Tavily API key must be a non-empty string.');
  }

  const trimmed = apiKey.trim();

  try {
    await chrome.storage.local.set({ [TAVILY_KEY_FIELD]: trimmed });
    return true;
  } catch (error) {
    console.error('WebGuide AI: Failed to save Tavily API key to storage.', error);
    throw error;
  }
}
