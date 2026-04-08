const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

const DB_DIR = process.env.SQLITE_DIR || '/app/data';
const DB_PATH = path.join(DB_DIR, 'cache.db');

let db = null;

function getDb() {
  if (db) return db;
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS verification_cache (
        sha256_key            TEXT PRIMARY KEY,
        manufacturer          TEXT,
        item_number           TEXT,
        type_designation      TEXT,
        description           TEXT,
        verified_source       TEXT,
        score                 INTEGER,
        website_id            TEXT,
        source_type           TEXT,
        manufacturer_website  TEXT,
        manufacturer_inferred INTEGER DEFAULT 0,
        full_json             TEXT,
        verified_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        hit_count             INTEGER DEFAULT 0,
        re_verify_after       DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_sha256 ON verification_cache(sha256_key);
      CREATE INDEX IF NOT EXISTS idx_re_verify ON verification_cache(re_verify_after);
    `);
    // Backward-compat: add full_json column if upgrading an existing DB
    try {
      const cols = db.prepare('PRAGMA table_info(verification_cache)').all();
      if (!cols.some(c => c.name === 'full_json')) {
        db.exec('ALTER TABLE verification_cache ADD COLUMN full_json TEXT');
      }
    } catch (e) { /* ignore */ }
    logger.info('[SQLITE] Cache database ready at ' + DB_PATH);
  } catch (err) {
    logger.error('[SQLITE] Failed to init DB: ' + err.message);
    db = null;
  }
  return db;
}

function shouldReVerify(row) {
  if (row.score >= 90) return false;
  const daysSince = (Date.now() - new Date(row.verified_at).getTime()) / 86400000;
  if (row.score >= 70 && daysSince < 90) return false;
  if (row.score >= 50 && daysSince < 30) return false;
  if (row.score < 50 && daysSince < 7) return false;
  return true;
}

function sqliteGet(sha256Key) {
  try {
    const database = getDb();
    if (!database) return null;

    const row = database
      .prepare('SELECT * FROM verification_cache WHERE sha256_key = ?')
      .get(sha256Key);

    if (!row) return null;

    if (shouldReVerify(row)) {
      logger.info(
        '[SQLITE] EXPIRED key=' + sha256Key.slice(0, 8) +
        '... score=' + row.score + ' → re-verifying'
      );
      return null;
    }

    database.prepare(
      'UPDATE verification_cache SET last_seen_at = CURRENT_TIMESTAMP, hit_count = hit_count + 1 WHERE sha256_key = ?'
    ).run(sha256Key);

    logger.info(
      '[SQLITE] HIT key=' + sha256Key.slice(0, 8) +
      '... score=' + row.score +
      ' verified ' + Math.floor((Date.now() - new Date(row.verified_at).getTime()) / 86400000) +
      ' days ago hits=' + (row.hit_count + 1)
    );

    // Prefer the stored camelCase object so the verify pipeline gets the
    // exact shape it cached originally.
    if (row.full_json) {
      try { return JSON.parse(row.full_json); } catch { /* fall through */ }
    }
    return {
      description:          row.description,
      manufacturer:         row.manufacturer,
      itemNumber:           row.item_number,
      typeDesignation:      row.type_designation,
      verifiedSource:       row.verified_source,
      verificationScore:    row.score,
      websiteId:            row.website_id,
      sourceType:           row.source_type,
      manufacturerWebsite:  row.manufacturer_website,
      manufacturerInferred: !!row.manufacturer_inferred,
    };
  } catch (err) {
    logger.error('[SQLITE] GET error: ' + err.message);
    return null;
  }
}

function sqliteSet(sha256Key, inputFields, result) {
  try {
    const database = getDb();
    if (!database) return;

    const score = result.verification_score || result.verificationScore || 0;

    let reVerifyAfter = null;
    if (score < 90) {
      const days = score >= 70 ? 90 : score >= 50 ? 30 : 7;
      const d = new Date();
      d.setDate(d.getDate() + days);
      reVerifyAfter = d.toISOString();
    }

    let fullJson = null;
    try { fullJson = JSON.stringify(result); } catch { fullJson = null; }

    database.prepare(`
      INSERT OR REPLACE INTO verification_cache (
        sha256_key, manufacturer, item_number,
        type_designation, description,
        verified_source, score, website_id,
        source_type, manufacturer_website,
        manufacturer_inferred, full_json,
        verified_at, last_seen_at,
        hit_count, re_verify_after
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        0, ?
      )
    `).run(
      sha256Key,
      inputFields.manufacturer     || null,
      inputFields.item_number      || null,
      inputFields.type_designation || null,
      inputFields.description      || null,
      result.verified_source || result.verifiedSource || null,
      score,
      result.website_id || result.websiteId || null,
      result.source_type || result.sourceType || null,
      result.manufacturer_website || result.manufacturerWebsite || null,
      (result.manufacturer_inferred || result.manufacturerInferred) ? 1 : 0,
      fullJson,
      reVerifyAfter
    );

    logger.info(
      '[SQLITE] SET key=' + sha256Key.slice(0, 8) +
      '... score=' + score +
      ' re_verify_after=' + (reVerifyAfter ? reVerifyAfter.slice(0, 10) : 'never')
    );
  } catch (err) {
    logger.error('[SQLITE] SET error: ' + err.message);
  }
}

function sqliteGetStats() {
  try {
    const database = getDb();
    if (!database) return null;

    const total = database.prepare('SELECT COUNT(*) as c FROM verification_cache').get().c;
    const official = database.prepare('SELECT COUNT(*) as c FROM verification_cache WHERE score >= 90').get().c;
    const distributor = database.prepare('SELECT COUNT(*) as c FROM verification_cache WHERE score >= 70 AND score < 90').get().c;
    const low = database.prepare('SELECT COUNT(*) as c FROM verification_cache WHERE score < 70').get().c;
    const totalHits = database.prepare('SELECT SUM(hit_count) as s FROM verification_cache').get().s || 0;
    const oldest = database.prepare('SELECT MIN(verified_at) as d FROM verification_cache').get().d;
    const newest = database.prepare('SELECT MAX(verified_at) as d FROM verification_cache').get().d;

    let dbSizeKb = 0;
    try {
      dbSizeKb = Math.round(fs.statSync(DB_PATH).size / 1024);
    } catch {}

    const estimatedCostSaved = '$' + (totalHits * 0.0002).toFixed(4);

    return {
      totalCached:      total,
      officialCount:    official,
      distributorCount: distributor,
      lowCount:         low,
      totalHits,
      oldestEntry:      oldest,
      newestEntry:      newest,
      dbSizeKb,
      estimatedCostSaved,
    };
  } catch (err) {
    logger.error('[SQLITE] STATS error: ' + err.message);
    return null;
  }
}

module.exports = { sqliteGet, sqliteSet, sqliteGetStats, getDb };
