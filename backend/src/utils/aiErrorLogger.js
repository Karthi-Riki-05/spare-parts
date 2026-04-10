const { logger } = require('./logger');

let db = null;

function getDb() {
  if (db) return db;
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');
    const dbDir = process.env.SQLITE_DIR || path.join(__dirname, '../../data');
    fs.mkdirSync(dbDir, { recursive: true });
    db = new Database(path.join(dbDir, 'jobs.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_errors (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id     TEXT,
        model      TEXT,
        error_type TEXT,
        error_msg  TEXT,
        row_data   TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    logger.error('[AI_ERROR_LOG] Failed to init DB: ' + err.message);
    db = null;
  }
  return db;
}

function classifyAiError(error) {
  const msg = (error && (error.message || String(error))) || '';
  if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return { kind: 'QUOTA', short: 'AI NOT WORKING — Gemini quota exceeded / billing not enabled' };
  }
  if (/401|API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(msg)) {
    return { kind: 'AUTH', short: 'AI NOT WORKING — Gemini API key invalid or unauthorized' };
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    return { kind: 'NETWORK', short: 'AI NOT WORKING — network failure reaching Gemini' };
  }
  if (/No JSON found|Empty response/i.test(msg)) {
    return { kind: 'PARSE', short: 'AI NOT WORKING — Gemini returned unparseable response' };
  }
  return { kind: 'UNKNOWN', short: 'AI NOT WORKING — unknown error' };
}

function logAiError(stage, correlationId, error, rowData) {
  const { kind, short } = classifyAiError(error);
  logger.error(`[${stage}] Row ${correlationId} → ${short} (${kind})`);
  logger.error(`[${stage}] Row ${correlationId} → raw: ${(error.message || String(error)).split('\n')[0].slice(0, 300)}`);

  // Persist to SQLite
  try {
    const database = getDb();
    if (database) {
      database.prepare(`
        INSERT INTO ai_errors (job_id, model, error_type, error_msg, row_data)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        correlationId || null,
        stage || null,
        kind,
        (error.message || String(error)).slice(0, 1000),
        rowData ? JSON.stringify(rowData).slice(0, 2000) : null
      );
    }
  } catch (dbErr) {
    logger.error('[AI_ERROR_LOG] DB write failed: ' + dbErr.message);
  }
}

function getRecentErrors(limit = 50) {
  try {
    const database = getDb();
    if (!database) return [];
    return database.prepare('SELECT * FROM ai_errors ORDER BY created_at DESC LIMIT ?').all(limit);
  } catch (err) {
    logger.error('[AI_ERROR_LOG] Read failed: ' + err.message);
    return [];
  }
}

module.exports = { classifyAiError, logAiError, getRecentErrors };
