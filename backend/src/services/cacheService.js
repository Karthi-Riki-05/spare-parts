const NodeCache = require('node-cache');
const { createHash } = require('crypto');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const pgCache = require('./pgCacheService');

const cache = new NodeCache({
  stdTTL: config.cacheTtlSeconds,
  checkperiod: Math.floor(config.cacheTtlSeconds / 10),
  useClones: true,
});

let hits = 0;
let misses = 0;
let l1Hits = 0;
let l2Hits = 0;

function makeCacheKey(row) {
  const parts = [
    String(row.manufacturer || '').toLowerCase().trim(),
    String(row.itemNumber || '').trim(),
    String(row.typeDesignation || '').trim(),
    String(row.description || '').toLowerCase().trim().slice(0, 50),
  ];

  const nonEmpty = parts.filter(p => p.length > 0);

  if (nonEmpty.length < 2) {
    return createHash('sha256')
      .update('unique|' + (row.internalItemNumber || '') + '|' + parts.join('|'))
      .digest('hex');
  }

  return createHash('sha256').update(parts.join('|')).digest('hex');
}

async function get(key) {
  // L1 — node-cache (RAM)
  const l1 = cache.get(key);
  if (l1) {
    hits++;
    l1Hits++;
    logger.info('[CACHE] L1 HIT key=' + key.slice(0, 8) + '...');
    try { Object.defineProperty(l1, '__cacheLayer', { value: 'L1', enumerable: false, configurable: true }); } catch {}
    return l1;
  }

  // L2 — Postgres
  const l2 = await pgCache.getCachedResult(key);
  if (l2) {
    hits++;
    l2Hits++;
    cache.set(key, l2);
    logger.info('[CACHE] L2 HIT key=' + key.slice(0, 8) + '... (written to L1)');
    try { Object.defineProperty(l2, '__cacheLayer', { value: 'L2', enumerable: false, configurable: true }); } catch {}
    return l2;
  }

  misses++;
  logger.info('[CACHE] MISS key=' + key.slice(0, 8) + '...');
  return null;
}

async function set(key, result, inputFields) {
  cache.set(key, result);
  if (inputFields) {
    await pgCache.setCachedResult(key, inputFields, result);
  }
}

async function getStats() {
  const pgStats = await pgCache.getCacheStats();
  return {
    hits,
    misses,
    l1Hits,
    l2Hits,
    keys: cache.keys().length,
    hitRate: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0,
    pg: pgStats,
    // Legacy alias — several call sites still reference `.sqlite`. Point them at
    // the PG stats object so behavior stays identical through the P2 swap.
    sqlite: pgStats,
  };
}

async function flush() {
  cache.flushAll();
  await pgCache.clearCache();
  hits = 0;
  misses = 0;
  l1Hits = 0;
  l2Hits = 0;
  logger.info('[CACHE] Flushed all entries (L1 + L2)');
}

module.exports = { makeCacheKey, get, set, getStats, flush };
