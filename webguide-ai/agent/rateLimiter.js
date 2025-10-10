const WINDOW_MS = 60_000;
const MAX_WAIT_MS = 6_000;
const RETRY_DELAY_MS = 300;
const RATE_LIMIT_ERROR_CODES = new Set([429]);
const RATE_LIMIT_ERROR_PHRASES = [
  'resource has been exhausted',
  'rate limit',
  'too many requests',
  'quota',
  'please wait'
];

const MODEL_BUCKETS = {
  planner: [
    { key: 'planner_primary', model: 'gemini-2.5-pro', rpm: 5 },
    { key: 'planner_fallback_1', model: 'gemini-2.5-flash', rpm: 10 },
    { key: 'planner_fallback_2', model: 'gemini-2.0-flash', rpm: 15 }
  ],
  executor: [
    { key: 'executor_primary', model: 'gemini-2.0-flash-lite', rpm: 30 },
    { key: 'executor_fallback', model: 'gemini-2.0-flash', rpm: 15 }
  ]
};

const bucketUsage = new Map();

function prune(bucketKey, now) {
  const usage = bucketUsage.get(bucketKey);
  if (!usage) {
    return [];
  }
  const fresh = usage.filter((ts) => now - ts < WINDOW_MS);
  bucketUsage.set(bucketKey, fresh);
  return fresh;
}

function canUseBucket(bucket, now) {
  const usage = prune(bucket.key, now);
  return usage.length < bucket.rpm;
}

function recordUsage(bucket, now) {
  const usage = prune(bucket.key, now);
  usage.push(now);
  bucketUsage.set(bucket.key, usage);
}

function isRateLimitError(error) {
  if (!error) {
    return false;
  }
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const status = typeof error?.status === 'number' ? error.status : undefined;
  if (status && RATE_LIMIT_ERROR_CODES.has(status)) {
    return true;
  }
  return RATE_LIMIT_ERROR_PHRASES.some((phrase) => message.includes(phrase));
}

export async function withRateLimit(role, task) {
  const buckets = MODEL_BUCKETS[role];
  if (!buckets) {
    throw new Error(`Unknown rate limit role: ${role}`);
  }

  const start = Date.now();
  let attempt = 0;
  let lastError;

  while (Date.now() - start < MAX_WAIT_MS) {
    attempt += 1;
    const now = Date.now();

    for (const bucket of buckets) {
      if (!canUseBucket(bucket, now)) {
        continue;
      }

      recordUsage(bucket, now);
      try {
        const data = await task(bucket.model);
        return {
          model: bucket.model,
          data
        };
      } catch (error) {
        lastError = error;
        if (!isRateLimitError(error)) {
          throw error;
        }
        // rate limit hit; continue to next bucket
      }
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Agent rate limiter is cooling down; please retry shortly.');
}

export function clearRateLimiter() {
  bucketUsage.clear();
}
