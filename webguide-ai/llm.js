import { getApiKey, setApiKey } from './storage.js';

export class MissingApiKeyError extends Error {
  constructor(message = 'Gemini API key is missing.') {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

export class InvalidApiKeyError extends Error {
  constructor(message = 'Gemini API key is invalid or unauthorized.') {
    super(message);
    this.name = 'InvalidApiKeyError';
  }
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const buildRequestBody = (prompt) => ({
  contents: [
    {
      parts: [
        {
          text: prompt
        }
      ]
    }
  ],
  generationConfig: {
    temperature: 0
  }
});

export async function sendToGemini(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Prompt must be a non-empty string.');
  }

  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const requestUrl = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  console.log('[WebGuideAI][Gemini] Sending request', {
    endpoint: requestUrl,
    promptPreview: prompt.slice(0, 60)
  });

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRequestBody(prompt))
  });

  if (response.status === 401 || response.status === 403) {
    console.warn('[WebGuideAI][Gemini] Unauthorized response', response.status);
    throw new InvalidApiKeyError();
  }

  if (!response.ok) {
    const errorPayload = await response.text();
    console.error('[WebGuideAI][Gemini] Request failed', {
      status: response.status,
      statusText: response.statusText,
      body: errorPayload
    });

    if (response.status === 400 && /API key/i.test(errorPayload)) {
      throw new InvalidApiKeyError('Gemini reports the API key is invalid.');
    }

    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} — ${errorPayload}`);
  }

  const payload = await response.json();

  const candidates = payload?.candidates || [];
  const firstCandidate = candidates[0];
  const parts = firstCandidate?.content?.parts || [];
  const textPart = parts.find((part) => typeof part?.text === 'string');

  if (!textPart) {
    return '';
  }

  return textPart.text.trim();
}

export async function updateApiKeyFromPrompt(prompt = 'Enter a valid Gemini API key.') {
  const newKey = prompt ? window.prompt(prompt) : window.prompt('Enter Gemini API key');
  if (!newKey) {
    throw new MissingApiKeyError('No API key provided.');
  }

  await setApiKey(newKey);
  return newKey;
}
