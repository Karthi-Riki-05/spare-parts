const { logger } = require('./logger');

async function withRetry(fn, maxRetries = 3, delayMs = 1000, correlationId) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoff = delayMs * Math.pow(2, attempt);
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
