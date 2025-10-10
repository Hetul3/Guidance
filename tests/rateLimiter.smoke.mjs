import { withRateLimit, clearRateLimiter } from '../webguide-ai/agent/rateLimiter.js';

async function main() {
  clearRateLimiter();
  const results = [];
  for (let i = 0; i < 3; i += 1) {
    const res = await withRateLimit('executor', async (model) => ({ model }));
    results.push(res.model);
  }
  console.log('rateLimiter models:', results.join(', '));
}

main().catch((err) => {
  console.error('rateLimiter smoke test failed:', err);
  process.exitCode = 1;
});
