const db = require('./pgService');
const { logger } = require('../utils/logger');

function shouldReVerify(row) {
  if (!row) return false;
  if (!row.verified_at) return false;
  const daysSince = (Date.now() - new Date(row.verified_at).getTime()) / 86400000;
  if (row.score >= 90 && daysSince < 180) return false;
  if (row.score >= 70 && daysSince < 90) return false;
  if (row.score >= 50 && daysSince < 30) return false;
  if (row.score < 50 && daysSince < 7) return false;
  return true;
}

function computeReVerifyAfter(score) {
  const days = score >= 90 ? 180 : score >= 70 ? 90 : score >= 50 ? 30 : 7;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function getCachedResult(sha256Key) {
  try {
    const row = await db.getOne(
      'SELECT * FROM verification_cache WHERE sha256_key = $1',
      [sha256Key]
    );
    if (!row) return null;

    if (shouldReVerify(row)) {
      logger.info(`[PG CACHE] EXPIRED key=${sha256Key.slice(0, 8)}... score=${row.score} → re-verifying`);
      return null;
    }

    await db.execute(
      'UPDATE verification_cache SET hit_count = hit_count + 1 WHERE sha256_key = $1',
      [sha256Key]
    );

    const days = Math.floor((Date.now() - new Date(row.verified_at).getTime()) / 86400000);
    logger.info(`[PG CACHE] HIT key=${sha256Key.slice(0, 8)}... score=${row.score} verified ${days}d ago hits=${row.hit_count + 1}`);

    // Prefer the full JSONB payload so verify pipeline gets the exact cached shape
    if (row.result) return row.result;

    return {
      manufacturer:        row.manufacturer,
      itemNumber:          row.item_number,
      typeDesignation:     row.type_designation,
      verificationScore:   row.score,
      websiteId:           row.website_id,
      sourceType:          row.source_type,
    };
  } catch (err) {
    logger.error(`[PG CACHE] GET error: ${err.message}`);
    return null;
  }
}

async function setCachedResult(sha256Key, inputFields, result) {
  try {
    const score = result.verification_score ?? result.verificationScore ?? 0;
    const reVerifyAfter = computeReVerifyAfter(score);

    const urlStatus =
      result.url_validation_status ||
      result.urlValidationStatus ||
      'unverified';

    await db.execute(
      `
      INSERT INTO verification_cache (
        sha256_key, manufacturer, item_number, type_designation,
        score, website_id, source_type, result,
        verified_at, hit_count, re_verify_after, url_validation_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 0, $9, $10)
      ON CONFLICT (sha256_key) DO UPDATE SET
        manufacturer           = EXCLUDED.manufacturer,
        item_number            = EXCLUDED.item_number,
        type_designation       = EXCLUDED.type_designation,
        score                  = EXCLUDED.score,
        website_id             = EXCLUDED.website_id,
        source_type            = EXCLUDED.source_type,
        result                 = EXCLUDED.result,
        verified_at            = NOW(),
        re_verify_after        = EXCLUDED.re_verify_after,
        url_validation_status  = EXCLUDED.url_validation_status,
        hit_count              = verification_cache.hit_count + 1
      `,
      [
        sha256Key,
        inputFields.manufacturer     || null,
        inputFields.item_number      || null,
        inputFields.type_designation || null,
        score,
        result.website_id  || result.websiteId  || null,
        result.source_type || result.sourceType || null,
        result,
        reVerifyAfter,
        urlStatus,
      ]
    );

    logger.info(
      `[PG CACHE] SET key=${sha256Key.slice(0, 8)}... score=${score} ` +
      `re_verify_after=${reVerifyAfter ? reVerifyAfter.toISOString().slice(0, 10) : 'never'}`
    );
  } catch (err) {
    logger.error(`[PG CACHE] SET error: ${err.message}`);
  }
}

async function getCacheStats() {
  try {
    const row = await db.getOne(`
      SELECT
        COUNT(*)::int                                           AS total_cached,
        COUNT(*) FILTER (WHERE score >= 90)::int                AS official_count,
        COUNT(*) FILTER (WHERE score >= 70 AND score < 90)::int AS distributor_count,
        COUNT(*) FILTER (WHERE score < 70)::int                 AS low_count,
        COALESCE(SUM(hit_count), 0)::int                        AS total_hits,
        MIN(verified_at)                                        AS oldest_entry,
        MAX(verified_at)                                        AS newest_entry
      FROM verification_cache
    `);
    if (!row) {
      return { totalCached: 0, officialCount: 0, distributorCount: 0, lowCount: 0, totalHits: 0, estimatedCostSaved: '$0.0000' };
    }
    return {
      totalCached:      row.total_cached,
      officialCount:    row.official_count,
      distributorCount: row.distributor_count,
      lowCount:         row.low_count,
      totalHits:        row.total_hits,
      oldestEntry:      row.oldest_entry,
      newestEntry:      row.newest_entry,
      dbSizeKb:         0, // table-scan size is expensive in PG; exposed via /api/cache-stats if ever needed
      estimatedCostSaved: '$' + (row.total_hits * 0.0002).toFixed(4),
    };
  } catch (err) {
    logger.error(`[PG CACHE] STATS error: ${err.message}`);
    return null;
  }
}

async function clearCache() {
  try {
    await db.execute('DELETE FROM verification_cache');
    logger.info('[PG CACHE] Cleared all cached entries');
  } catch (err) {
    logger.error(`[PG CACHE] CLEAR error: ${err.message}`);
  }
}

module.exports = { getCachedResult, setCachedResult, getCacheStats, clearCache, shouldReVerify };
