const NodeCache = require('node-cache');
const { createHash } = require('crypto');
const { config } = require('../config');
const { logger } = require('../utils/logger');

const cache = new NodeCache({ stdTTL: config.cacheTtlSeconds, checkperiod: Math.floor(config.cacheTtlSeconds / 10), useClones: true });
let hits = 0;
let misses = 0;

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
  const result = cache.get(key);
  if (result) { hits++; return result; }
  misses++;
  return null;
}

function set(key, result) { cache.set(key, result); }

function getStats() {
  return { hits, misses, keys: cache.keys().length, hitRate: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0 };
}

function flush() { cache.flushAll(); hits = 0; misses = 0; logger.info('[Cache] Flushed all entries'); }

module.exports = { makeCacheKey, get, set, getStats, flush };
