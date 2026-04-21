/**
 * Unit tests for the re-verify TTL policy (Issue 7).
 *   - score >= 90  → 180-day TTL (previously "never")
 *   - score >= 70  →  90-day TTL
 *   - score >= 50  →  30-day TTL
 *   - score <  50  →   7-day TTL
 *
 * We import the module without touching the DB (the functions we test are
 * pure) — and we set DATABASE_URL to a harmless value so config.js passes
 * Zod validation when the module tree is required.
 */

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://test:test@localhost:5433/spareparts_test';
process.env.LOG_LEVEL = 'error';
process.env.GEMINI_API_KEY = 'test-key';

const { shouldReVerify } = require('../../src/services/pgCacheService');

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000);
}

describe('pgCacheService — re-verify TTL policy (Issue 7)', () => {
  it('score >= 90: fresh (under 180d) → do NOT re-verify', () => {
    expect(shouldReVerify({ score: 95, verified_at: daysAgo(100) })).toBe(false);
    expect(shouldReVerify({ score: 90, verified_at: daysAgo(179) })).toBe(false);
  });

  it('score >= 90: stale (over 180d) → re-verify', () => {
    expect(shouldReVerify({ score: 95, verified_at: daysAgo(181) })).toBe(true);
    expect(shouldReVerify({ score: 90, verified_at: daysAgo(365) })).toBe(true);
  });

  it('score 70-89: 90-day TTL', () => {
    expect(shouldReVerify({ score: 85, verified_at: daysAgo(89) })).toBe(false);
    expect(shouldReVerify({ score: 85, verified_at: daysAgo(91) })).toBe(true);
  });

  it('score 50-69: 30-day TTL', () => {
    expect(shouldReVerify({ score: 60, verified_at: daysAgo(29) })).toBe(false);
    expect(shouldReVerify({ score: 60, verified_at: daysAgo(31) })).toBe(true);
  });

  it('score < 50: 7-day TTL', () => {
    expect(shouldReVerify({ score: 30, verified_at: daysAgo(6) })).toBe(false);
    expect(shouldReVerify({ score: 30, verified_at: daysAgo(8) })).toBe(true);
  });

  it('missing verified_at → do NOT re-verify (avoids churn)', () => {
    expect(shouldReVerify({ score: 85 })).toBe(false);
    expect(shouldReVerify(null)).toBe(false);
  });
});
