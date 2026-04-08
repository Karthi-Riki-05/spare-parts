const NodeCache = require('node-cache');
const { createHash } = require('crypto');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const { sqliteGet, sqliteSet, sqliteGetStats, sqliteClear } = require('./sqliteCacheService');

const cache = new NodeCache({ stdTTL: config.cacheTtlSeconds, checkperiod: Math.floor(config.cacheTtlSeconds / 10), useClones: true });
let hits = 0;
let misses = 0;
let l1Hits = 0;
let l2Hits = 0;

function makeCacheKey(row) {
  const parts = [
    String(row.manufacturer || '').toLowerCase().trim(),
    String(row.itemNumber || '').trim(),
    String(row.typeDesignation || '').trim(),
    // Always include description (first 50 chars) to differentiate rows
    // with same manufacturer but different parts
    String(row.description || '').toLowerCase().trim().slice(0, 50),
  ];

  const nonEmpty = parts.filter(p => p.length > 0);

  // If fewer than 2 identifying fields populated, use internalItemNumber
  // as disambiguator — it never leaves the backend, only used as hash seed
  if (nonEmpty.length < 2) {
    return createHash('sha256')
      .update('unique|' + (row.internalItemNumber || '') + '|' + parts.join('|'))
      .digest('hex');
  }

  return createHash('sha256')
    .update(parts.join('|'))
    .digest('hex');
}

function get(key) {
  // L1 — node-cache (RAM)
  const l1 = cache.get(key);
  if (l1) {
    hits++;
    l1Hits++;
    logger.info('[CACHE] L1 HIT key=' + key.slice(0, 8) + '...');
    // Tag layer so callers can log which tier served the hit.
    try { Object.defineProperty(l1, '__cacheLayer', { value: 'L1', enumerable: false, configurable: true }); } catch {}
    return l1;
  }

  // L2 — SQLite (disk)
  const l2 = sqliteGet(key);
  if (l2) {
    hits++;
    l2Hits++;
    // Write back to L1 for session speed
    cache.set(key, l2);
    logger.info('[CACHE] L2 HIT key=' + key.slice(0, 8) + '... (written to L1)');
    try { Object.defineProperty(l2, '__cacheLayer', { value: 'L2', enumerable: false, configurable: true }); } catch {}
    return l2;
  }

  misses++;
  logger.info('[CACHE] MISS key=' + key.slice(0, 8) + '...');
  return null;
}

function set(key, result, inputFields) {
  // L1 write
  cache.set(key, result);

  // L2 write (permanent) — fail-safe: sqliteSet swallows all errors internally.
  if (inputFields) {
    sqliteSet(key, inputFields, result);
  }
}

function getStats() {
  return {
    hits,
    misses,
    l1Hits,
    l2Hits,
    keys: cache.keys().length,
    hitRate: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0,
    sqlite: sqliteGetStats(),
  };
}

function flush() { 
  cache.flushAll(); 
  sqliteClear();
  hits = 0; 
  misses = 0; 
  l1Hits = 0; 
  l2Hits = 0; 
  logger.info('[Cache] Flushed all entries (L1 + L2)'); 
}

module.exports = { makeCacheKey, get, set, getStats, flush };
