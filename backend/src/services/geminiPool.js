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

// Per-key concurrency pools (created lazily after p-limit is imported)
let pools = null;
let poolIndex = 0;
const CONCURRENCY_PER_KEY = 15;

/**
 * Initialize p-limit pools (one per key)
 * Must be called with await since p-limit is ESM
 */
async function initPools() {
  if (pools) return pools;
  const pLimit = (await import('p-limit')).default;
  pools = apiKeys.map(() => pLimit(CONCURRENCY_PER_KEY));
  const totalWorkers = apiKeys.length * CONCURRENCY_PER_KEY;
  logger.info(`[GEMINI POOL] ${apiKeys.length} keys × ${CONCURRENCY_PER_KEY} = ${totalWorkers} total concurrent workers`);
  return pools;
}

/**
 * Get the next API key in round-robin fashion
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
 * Get the next p-limit pool in round-robin fashion
 * Returns null if pools not yet initialized
 */
function getNextPool() {
  if (!pools || pools.length === 0) return null;
  const pool = pools[poolIndex % pools.length];
  poolIndex++;
  return pool;
}

/**
 * Get current key count
 */
function getKeyCount() {
  return apiKeys.length;
}

/**
 * Get key index for logging (1-based)
 */
function getKeyIndex() {
  return ((keyIndex - 1) % Math.max(1, apiKeys.length)) + 1;
}

module.exports = {
  getNextKey,
  getNextPool,
  getKeyCount,
  getKeyIndex,
  initPools,
  apiKeys,
  CONCURRENCY_PER_KEY,
};
