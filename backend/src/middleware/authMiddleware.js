const authService = require('../services/authService');
const db = require('../services/pgService');
const { logger } = require('../utils/logger');

const COOKIE_NAME = 'spare_parts_token';

function getToken(req) {
  return req && req.cookies && req.cookies[COOKIE_NAME];
}

function clear(res) {
  try { res.clearCookie(COOKIE_NAME, { path: '/' }); } catch {}
}

/**
 * Company auth. Verifies JWT, re-reads the company row so confirmed/is_active
 * toggles take effect without requiring the token to be re-issued.
 *
 * Attaches req.company = { id, company_name, email, confirmed, is_active, credits_balance }.
 * Also exposes req.user = { email, companyId } for P2-era handlers that still
 * read that shape.
 */
async function requireCompany(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = authService.verifyToken(token);
    if (payload.role !== 'company') {
      return res.status(403).json({ error: 'Company access required' });
    }

    const company = await db.getOne(
      `SELECT id, company_name, email, confirmed, is_active, credits_balance
       FROM companies WHERE id = $1`,
      [payload.company_id]
    );

    if (!company) {
      clear(res);
      return res.status(401).json({ error: 'Company not found' });
    }
    if (!company.confirmed) {
      return res.status(403).json({
        error: 'Email not confirmed. Please check your email.',
      });
    }
    if (!company.is_active) {
      return res.status(403).json({
        error: 'Account suspended. Contact administrator.',
      });
    }

    req.company = company;
    // Back-compat: routes written in P2 still reference req.user.companyId.
    req.user = { email: company.email, companyId: company.id, role: 'company' };
    next();
  } catch (err) {
    clear(res);
    logger.warn('[AUTH] company token rejected: ' + (err && err.message));
    return res.status(401).json({ error: 'Session expired' });
  }
}

/**
 * Super admin auth. Simpler than company — no confirmation/active gates.
 * Attaches req.superAdmin = { id, email }.
 */
async function requireSuperAdmin(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = authService.verifyToken(token);
    if (payload.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const admin = await db.getOne(
      'SELECT id, email FROM super_admins WHERE id = $1',
      [payload.super_admin_id]
    );
    if (!admin) {
      clear(res);
      return res.status(401).json({ error: 'Super admin not found' });
    }

    req.superAdmin = admin;
    next();
  } catch (err) {
    clear(res);
    logger.warn('[AUTH] super-admin token rejected: ' + (err && err.message));
    return res.status(401).json({ error: 'Session expired' });
  }
}

// Legacy alias — used by any route that hasn't migrated yet. Defaults to
// company auth. Remove once all routes are migrated.
const requireAuth = requireCompany;

module.exports = { requireAuth, requireCompany, requireSuperAdmin, COOKIE_NAME };
