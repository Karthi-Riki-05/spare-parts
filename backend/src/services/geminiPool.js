const { config } = require('../config');
const { logger } = require('../utils/logger');

// Collect all configured API keys
const apiKeys = [
  config.geminiApiKey,
  config.geminiApiKey2,
  config.geminiApiKey3,
].filter(Boolean);

if (apiKeys.length === 0) {
  logger.warn('[GEMINI_POOL] No API keys configured! Set GEMINI_API_KEY in .env');
}

let keyIndex = 0;

/**
 * Get the next API key in round-robin fashion
 * Returns the primary key if no keys are available
 */
function getNextKey() {
  if (apiKeys.length === 0) {
    return config.geminiApiKey;
  }
  const key = apiKeys[keyIndex % apiKeys.length];
  keyIndex++;
  return key;
}

/**
 * Get current key count (for logging/monitoring)
 */
function getKeyCount() {
  return apiKeys.length;
}

/**
 * Get key index for logging (1-based)
 */
function getKeyIndex() {
  return (keyIndex % apiKeys.length) + 1;
}

module.exports = {
  getNextKey,
  getKeyCount,
  getKeyIndex,
  apiKeys,
};
