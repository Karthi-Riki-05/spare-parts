const { logger } = require('./logger');

// Paid-tier delays: 500ms, 1s, 2s (was exponential 1s, 2s, 4s for free-tier rate limits)
const PAID_TIER_DELAYS_MS = [500, 1000, 2000];

async function withRetry(fn, maxRetries = 3, delayMs = 1000, correlationId, timeoutMs = 60000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms (Attempt ${attempt + 1})`)), timeoutMs);
      });
      return await Promise.race([fn(), timeoutPromise]);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoff = PAID_TIER_DELAYS_MS[attempt] ?? delayMs;
        logger.warn(`Retry ${attempt + 1}/${maxRetries} in ${backoff}ms`, {
          correlationId,
          error: error.message || String(error),
        });
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };
