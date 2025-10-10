const WINDOW_MS = 60_000;
const MAX_WAIT_MS = 2_000;
const RETRY_DELAY_MS = 400;

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

export async function withRateLimit(role, task) {
  const buckets = MODEL_BUCKETS[role];
  if (!buckets) {
    throw new Error(`Unknown rate limit role: ${role}`);
  }

  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < MAX_WAIT_MS) {
    attempt += 1;
    const now = Date.now();

    for (const bucket of buckets) {
      if (canUseBucket(bucket, now)) {
        recordUsage(bucket, now);
        return {
          model: bucket.model,
          data: await task(bucket.model)
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  throw new Error('Agent rate limiter is cooling down; please retry shortly.');
}

export function clearRateLimiter() {
  bucketUsage.clear();
}
