export async function getApiKey() {
  try {
    const { GEMINI_API_KEY: apiKey } = await chrome.storage.local.get(['GEMINI_API_KEY']);
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
    await chrome.storage.local.set({ GEMINI_API_KEY: trimmed });
    return true;
  } catch (error) {
    console.error('WebGuide AI: Failed to save Gemini API key to storage.', error);
    throw error;
  }
}
