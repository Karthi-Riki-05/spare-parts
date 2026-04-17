const db = require('./pgService');
const { logger } = require('../utils/logger');

/**
 * Record an audit log row. Fire-and-forget from the caller's perspective —
 * the DB write is awaited internally but any exception is swallowed so audit
 * failures never break the business flow.
 *
 * Recognized actions (application-enforced, not DB-enforced):
 *   company_created, company_confirmed, confirmation_resent
 *   company_login, company_logout, company_login_failed
 *   password_changed, password_reset
 *   file_uploaded, job_started, job_completed, job_failed
 *   excel_downloaded
 *   company_deactivated, company_activated
 *   super_admin_login, super_admin_logout
 */
async function log(action, opts = {}) {
  const {
    companyId = null,
    superAdminId = null,
    details = {},
    ipAddress = null,
    userAgent = null,
  } = opts;

  try {
    await db.execute(
      `INSERT INTO audit_logs
         (company_id, super_admin_id, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, superAdminId, action, details || {}, ipAddress, userAgent]
    );
  } catch (err) {
    logger.warn(`[AUDIT] Failed to log ${action}: ${err.message}`);
  }
}

/**
 * Extract request metadata for audit records.
 * Handles trust-proxy=1 (so x-forwarded-for reveals real client) via Express's
 * req.ip.
 */
function reqMeta(req) {
  if (!req) return { ipAddress: null, userAgent: null };
  return {
    ipAddress: req.ip || null,
    userAgent: req.get ? (req.get('user-agent') || null) : null,
  };
}

module.exports = { log, reqMeta };
