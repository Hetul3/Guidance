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
const GEMINI_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

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

async function callGenerativeModel({ model, contents, tools, responseMimeType = 'application/json', safetySettings }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const endpoint = `${GEMINI_ROOT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents,
    generationConfig: {
      temperature: 0
    }
  };

  const hasTools = Array.isArray(tools) && tools.length;
  if (!hasTools && responseMimeType) {
    body.generationConfig.responseMimeType = responseMimeType;
  }

  if (hasTools) {
    body.tools = [
      {
        functionDeclarations: tools
      }
    ];
  }

  if (safetySettings) {
    body.safetySettings = safetySettings;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401 || response.status === 403) {
    throw new InvalidApiKeyError();
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} — ${errorText}`);
  }

  return response.json();
}

function composeContents({ systemPrompt, userPrompt, context }) {
  const parts = [];
  if (systemPrompt) {
    parts.push({ text: systemPrompt });
  }
  if (context) {
    parts.push({ text: context });
  }
  if (userPrompt) {
    parts.push({ text: userPrompt });
  }
  return [
    {
      role: 'user',
      parts
    }
  ];
}

export async function plannerGenerate({ model, systemPrompt, userPrompt, context, tools }) {
  const contents = composeContents({ systemPrompt, userPrompt, context });
  return callGenerativeModel({ model, contents, tools });
}

export async function executorGenerate({ model, systemPrompt, userPrompt, context, tools }) {
  const contents = composeContents({ systemPrompt, userPrompt, context });
  return callGenerativeModel({ model, contents, tools });
}

export function extractTextResponse(payload) {
  const candidates = payload?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const primary = candidates[0];
  if (!primary?.content?.parts) {
    return null;
  }

  for (const part of primary.content.parts) {
    if (typeof part.text === 'string') {
      return part.text;
    }
  }

  return null;
}

export function extractFunctionCalls(payload) {
  const calls = [];
  const candidates = payload?.candidates || [];
  candidates.forEach((candidate) => {
    const parts = candidate?.content?.parts || [];
    parts.forEach((part) => {
      if (part.functionCall) {
        calls.push(part.functionCall);
      }
    });
  });
  return calls;
}
