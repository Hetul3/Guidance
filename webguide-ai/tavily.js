import { getTavilyKey } from './storage.js';

export class MissingTavilyKeyError extends Error {
  constructor(message = 'Tavily API key is missing.') {
    super(message);
    this.name = 'MissingTavilyKeyError';
    this.code = 'MissingTavilyKeyError';
  }
}

export class InvalidTavilyKeyError extends Error {
  constructor(message = 'Tavily API key is invalid or unauthorized.') {
    super(message);
    this.name = 'InvalidTavilyKeyError';
    this.code = 'InvalidTavilyKeyError';
  }
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

const MAX_QUERY_LENGTH = 400;

const DEFAULT_REQUEST_OPTIONS = {
  includeAnswer: 'advanced',
  searchDepth: 'advanced',
  maxResults: 1,
  includeRawContent: 'text',
  chunksPerSource: 3,
  topic: 'general',
  timeRange: 'year',
  includeImages: false,
  includeImageDescriptions: false,
  includeFavicon: false,
  autoParameters: false
};

const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const clampNumber = (value, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (typeof min === 'number' && parsed < min) {
    return null;
  }
  if (typeof max === 'number' && parsed > max) {
    return null;
  }
  return parsed;
};

const buildRequestBody = (query, overrides = {}) => {
  const sanitized = { ...DEFAULT_REQUEST_OPTIONS, query };

  if (typeof overrides.timeRange === 'string' && overrides.timeRange.trim()) {
    sanitized.timeRange = overrides.timeRange.trim();
  }

  if (isIsoDate(overrides.startDate)) {
    sanitized.startDate = overrides.startDate;
  }

  if (isIsoDate(overrides.endDate)) {
    sanitized.endDate = overrides.endDate;
  }

  const maxResults = clampNumber(overrides.maxResults, 1, 5);
  if (maxResults) {
    sanitized.maxResults = maxResults;
  }

  const chunksPerSource = clampNumber(overrides.chunksPerSource, 1, 10);
  if (chunksPerSource) {
    sanitized.chunksPerSource = chunksPerSource;
  }

  const allowedFormats = new Set(['text', 'markdown', 'html']);
  if (typeof overrides.includeRawContent === 'string' && allowedFormats.has(overrides.includeRawContent)) {
    sanitized.includeRawContent = overrides.includeRawContent;
  }

  if (typeof overrides.autoParameters === 'boolean') {
    sanitized.autoParameters = overrides.autoParameters;
  }

  return sanitized;
};

const normalizeResults = (payload) => {
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return results.map((entry) => {
    const title = typeof entry?.title === 'string' ? entry.title : '';
    const url = typeof entry?.url === 'string' ? entry.url : '';
    const content = typeof entry?.content === 'string' && entry.content.trim() ? entry.content.trim() : null;
    const score = typeof entry?.score === 'number' ? entry.score : null;

    return { title, url, content, score };
  });
};

export async function tavilySearch(query, options = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Search query must be a non-empty string.');
  }

  const apiKey = await getTavilyKey();

  if (!apiKey) {
    throw new MissingTavilyKeyError();
  }

  let trimmedQuery = query.trim();
  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    trimmedQuery = trimmedQuery.slice(0, MAX_QUERY_LENGTH);
  }
  const requestBody = buildRequestBody(trimmedQuery, options);

  console.log('[WebGuideAI][Tavily] Sending request', {
    endpoint: TAVILY_ENDPOINT,
    queryPreview: trimmedQuery.slice(0, 60),
    request: requestBody
  });

  const response = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    console.error('[WebGuideAI][Tavily] Failed to parse JSON response.', error);
    throw new Error('Tavily response could not be parsed as JSON.');
  }

  if (response.status === 401 || response.status === 403) {
    console.warn('[WebGuideAI][Tavily] Unauthorized response received.', payload);
    throw new InvalidTavilyKeyError();
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload?.error === 'string'
        ? payload.error
        : typeof payload?.message === 'string'
        ? payload.message
        : `${response.status} ${response.statusText}`;

    console.error('[WebGuideAI][Tavily] Request failed.', {
      status: response.status,
      statusText: response.statusText,
      payload
    });

    throw new Error(`Tavily request failed: ${errorMessage}`);
  }

  const answer = typeof payload?.answer === 'string' && payload.answer.trim() ? payload.answer.trim() : null;

  return {
    query: payload?.query || trimmedQuery,
    answer,
    results: normalizeResults(payload),
    raw: payload
  };
}
