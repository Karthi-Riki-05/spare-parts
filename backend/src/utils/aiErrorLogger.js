const { logger } = require('./logger');
const db = require('../services/pgService');

function classifyAiError(error) {
  const msg = (error && (error.message || String(error))) || '';
  if (/429|Too Many Requests|quota|RESOURCE_EXHAUSTED|spending cap/i.test(msg)) {
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

/**
 * Log an AI error. Fire-and-forget from the caller's perspective — exceptions
 * never propagate up.
 *
 * jobId may be null for pre-job errors (e.g. format detection before a
 * verification_jobs row exists). The schema allows job_id = NULL.
 */
async function logAiError(stage, correlationId, error, rowData, { jobId, companyId } = {}) {
  const { kind, short } = classifyAiError(error);
  logger.error(`[${stage}] Row ${correlationId} → ${short} (${kind})`);
  logger.error(`[${stage}] Row ${correlationId} → raw: ${(error.message || String(error)).split('\n')[0].slice(0, 300)}`);

  try {
    // Only use a job_id if one was explicitly passed by the caller.
    // Never extract a UUID from the correlation ID — it's a request ID,
    // not a verification_jobs FK, and causes FK violations.
    const safeJobId = jobId || null;
    const safeCompanyId = companyId || null;

    await db.execute(
      `INSERT INTO ai_errors (job_id, company_id, model, error_type, error_msg, row_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        safeJobId,
        safeCompanyId,
        stage || null,
        kind,
        (error.message || String(error)).slice(0, 1000),
        rowData || null,
      ]
    );
  } catch (dbErr) {
    logger.error(`[AI_ERROR_LOG] DB write failed: ${dbErr.message}`);
  }
}

async function getRecentErrors(limit = 50) {
  try {
    return await db.getMany(
      'SELECT * FROM ai_errors ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
  } catch (err) {
    logger.error(`[AI_ERROR_LOG] Read failed: ${err.message}`);
    return [];
  }
}

module.exports = { classifyAiError, logAiError, getRecentErrors };
