const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');

const pgCache = require('../../src/services/pgCacheService');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

describe('pgCacheService.shouldReVerify', () => {
  it('score >= 90 never re-verifies', () => {
    expect(pgCache.shouldReVerify({ score: 95, verified_at: daysAgo(365) })).toBe(false);
  });

  it('score 70-89 re-verifies after 90 days', () => {
    expect(pgCache.shouldReVerify({ score: 80, verified_at: daysAgo(30) })).toBe(false);
    expect(pgCache.shouldReVerify({ score: 80, verified_at: daysAgo(95) })).toBe(true);
  });

  it('score 50-69 re-verifies after 30 days', () => {
    expect(pgCache.shouldReVerify({ score: 55, verified_at: daysAgo(10) })).toBe(false);
    expect(pgCache.shouldReVerify({ score: 55, verified_at: daysAgo(45) })).toBe(true);
  });

  it('score < 50 re-verifies after 7 days', () => {
    expect(pgCache.shouldReVerify({ score: 20, verified_at: daysAgo(2) })).toBe(false);
    expect(pgCache.shouldReVerify({ score: 20, verified_at: daysAgo(10) })).toBe(true);
  });
});

describe('pgCacheService.setCachedResult + getCachedResult', () => {
  const KEY = 'a'.repeat(64);
  const INPUTS = {
    manufacturer: 'SKF',
    item_number: '6205',
    type_designation: 'Deep groove',
  };

  it('writes a row then retrieves the full result', async () => {
    await pgCache.setCachedResult(KEY, INPUTS, {
      verificationScore: 92,
      websiteId: 'https://skf.com/6205',
      sourceType: 'official',
      manufacturer: 'SKF',
      itemNumber: '6205',
    });
    const got = await pgCache.getCachedResult(KEY);
    expect(got).not.toBeNull();
    expect(got.verificationScore).toBe(92);
    expect(got.websiteId).toBe('https://skf.com/6205');
    expect(got.sourceType).toBe('official');
  });

  it('returns null when the key is not in cache', async () => {
    expect(await pgCache.getCachedResult('nope'.padEnd(64, '0'))).toBeNull();
  });

  it('re-set on the same key increments hit_count (via ON CONFLICT update)', async () => {
    await pgCache.setCachedResult(KEY, INPUTS, { verificationScore: 92 });
    await pgCache.setCachedResult(KEY, INPUTS, { verificationScore: 92 });
    const db = require('../../src/services/pgService');
    const row = await db.getOne('SELECT hit_count FROM verification_cache WHERE sha256_key=$1', [KEY]);
    expect(row.hit_count).toBe(1); // 0 (insert) → 1 after second upsert
  });

  it('getCachedResult increments hit_count for a valid hit', async () => {
    await pgCache.setCachedResult(KEY, INPUTS, { verificationScore: 92 });
    await pgCache.getCachedResult(KEY);
    await pgCache.getCachedResult(KEY);
    const db = require('../../src/services/pgService');
    const row = await db.getOne('SELECT hit_count FROM verification_cache WHERE sha256_key=$1', [KEY]);
    expect(row.hit_count).toBe(2);
  });
});

describe('pgCacheService.getCacheStats', () => {
  it('aggregates totals across buckets', async () => {
    await pgCache.setCachedResult('k1'.padEnd(64, '0'), { manufacturer: 'A' }, { verificationScore: 95 });
    await pgCache.setCachedResult('k2'.padEnd(64, '0'), { manufacturer: 'B' }, { verificationScore: 75 });
    await pgCache.setCachedResult('k3'.padEnd(64, '0'), { manufacturer: 'C' }, { verificationScore: 40 });
    const stats = await pgCache.getCacheStats();
    expect(stats.totalCached).toBe(3);
    expect(stats.officialCount).toBe(1);     // score >= 90
    expect(stats.distributorCount).toBe(1);  // 70-89
    expect(stats.lowCount).toBe(1);          // < 70
  });
});

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}
