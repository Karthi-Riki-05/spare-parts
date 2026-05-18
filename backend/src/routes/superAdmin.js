const express = require('express');
const { logger } = require('../utils/logger');
const { config } = require('../config');
const db = require('../services/pgService');
const authService = require('../services/authService');
const audit = require('../services/auditService');
const emailService = require('../services/emailService');
const pgCacheService = require('../services/pgCacheService');
const { requireSuperAdmin, COOKIE_NAME } = require('../middleware/authMiddleware');

const router = express.Router();

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

/**
 * POST /api/super-admin/login
 */
router.post('/login', async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const admin = await authService.findSuperAdminByEmail(email);
    const ok = admin && (await authService.verifyPassword(password, admin.password_hash));

    if (!ok) {
      logger.warn(`[SUPER-ADMIN] login failed for ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = authService.generateToken({
      role: 'super_admin',
      super_admin_id: admin.id,
      email: admin.email,
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());

    await authService.touchSuperAdminLogin(admin.id);
    await audit.log('super_admin_login', { superAdminId: admin.id, ...meta });
    logger.info(`[SUPER-ADMIN] login ok ${admin.email}`);

    return res.json({
      success: true,
      user: { id: admin.id, email: admin.email, role: 'super_admin' },
    });
  } catch (err) {
    logger.error('[SUPER-ADMIN] login error: ' + err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/super-admin/logout
 */
router.post('/logout', async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    try {
      const token = req.cookies && req.cookies[COOKIE_NAME];
      if (token) {
        const payload = authService.verifyToken(token);
        if (payload.role === 'super_admin') {
          await audit.log('super_admin_logout', { superAdminId: payload.super_admin_id, ...meta });
        }
      }
    } catch {}
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/super-admin/me
 */
router.get('/me', requireSuperAdmin, (req, res) => {
  res.json({ user: { id: req.superAdmin.id, email: req.superAdmin.email, role: 'super_admin' } });
});

/**
 * POST /api/super-admin/companies
 * Creates a new company, sends confirmation email with temp password.
 */
router.post('/companies', requireSuperAdmin, async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const { company_name, email, password } = req.body || {};
    if (!company_name || !email || !password) {
      return res.status(400).json({ error: 'company_name, email, and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existing = await authService.findCompanyByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'A company with this email already exists' });
    }

    const hash = await authService.hashPassword(password);
    const confirmationToken = authService.generateConfirmationToken();
    const expiresAt = authService.confirmationExpiryDate();

    const row = await db.getOne(
      `INSERT INTO companies
         (company_name, email, password_hash, confirmation_token,
          confirmation_token_expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, company_name, email, confirmed, is_active,
                 credits_balance, confirmation_token_expires_at, created_at`,
      [company_name, normalizedEmail, hash, confirmationToken, expiresAt, req.superAdmin.id]
    );

    emailService.sendConfirmationEmail(row, password, confirmationToken).catch(err =>
      logger.error(`[SUPER-ADMIN] confirmation email failed for ${normalizedEmail}: ${err.message}`)
    );

    await audit.log('company_created', {
      superAdminId: req.superAdmin.id,
      companyId: row.id,
      details: { company_name, email: normalizedEmail },
      ...meta,
    });
    logger.info(`[SUPER-ADMIN] created company ${normalizedEmail}`);

    return res.status(201).json({
      success: true,
      company: {
        id: row.id,
        companyName: row.company_name,
        email: row.email,
        confirmed: row.confirmed,
        isActive: row.is_active,
        creditsBalance: row.credits_balance,
        confirmationExpiresAt: row.confirmation_token_expires_at,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    logger.error('[SUPER-ADMIN] create company error: ' + err.message);
    return res.status(500).json({ error: 'Failed to create company' });
  }
});

/**
 * GET /api/super-admin/companies
 */
router.get('/companies', requireSuperAdmin, async (req, res) => {
  try {
    const rows = await db.getMany(`
      SELECT
        c.id, c.company_name, c.email, c.confirmed, c.is_active,
        c.credits_balance, c.created_at, c.confirmed_at,
        c.deactivated_at, c.deactivation_reason,
        c.confirmation_token_expires_at, c.last_login_at,
        COALESCE(j.job_count, 0)::int AS job_count
      FROM companies c
      LEFT JOIN (
        SELECT company_id, COUNT(*) AS job_count
        FROM verification_jobs
        GROUP BY company_id
      ) j ON j.company_id = c.id
      ORDER BY c.created_at DESC
    `);
    res.json({
      success: true,
      companies: rows.map(r => ({
        id: r.id,
        companyName: r.company_name,
        email: r.email,
        confirmed: r.confirmed,
        isActive: r.is_active,
        creditsBalance: r.credits_balance,
        jobCount: r.job_count,
        createdAt: r.created_at,
        confirmedAt: r.confirmed_at,
        deactivatedAt: r.deactivated_at,
        deactivationReason: r.deactivation_reason,
        confirmationExpiresAt: r.confirmation_token_expires_at,
        lastLoginAt: r.last_login_at,
      })),
    });
  } catch (err) {
    logger.error('[SUPER-ADMIN] list companies error: ' + err.message);
    res.status(500).json({ error: 'Failed to list companies' });
  }
});

/**
 * GET /api/super-admin/companies/:id
 */
router.get('/companies/:id', requireSuperAdmin, async (req, res) => {
  try {
    const company = await db.getOne(
      `SELECT id, company_name, email, confirmed, is_active, credits_balance,
              created_at, confirmed_at, deactivated_at, deactivation_reason,
              confirmation_token_expires_at, last_login_at
       FROM companies WHERE id = $1`,
      [req.params.id]
    );
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const stats = await db.getOne(
      `SELECT
         COUNT(*)::int AS job_count,
         COALESCE(SUM(total_rows), 0)::int AS rows_processed,
         MAX(created_at) AS last_job_at
       FROM verification_jobs WHERE company_id = $1`,
      [company.id]
    );

    res.json({
      success: true,
      company: {
        id: company.id,
        companyName: company.company_name,
        email: company.email,
        confirmed: company.confirmed,
        isActive: company.is_active,
        creditsBalance: company.credits_balance,
        createdAt: company.created_at,
        confirmedAt: company.confirmed_at,
        deactivatedAt: company.deactivated_at,
        deactivationReason: company.deactivation_reason,
        confirmationExpiresAt: company.confirmation_token_expires_at,
        lastLoginAt: company.last_login_at,
      },
      stats: {
        jobCount: stats.job_count,
        rowsProcessed: stats.rows_processed,
        lastJobAt: stats.last_job_at,
      },
    });
  } catch (err) {
    logger.error('[SUPER-ADMIN] get company error: ' + err.message);
    res.status(500).json({ error: 'Failed to get company' });
  }
});

/**
 * PATCH /api/super-admin/companies/:id
 * Body: { is_active?, company_name?, deactivation_reason? }
 */
router.patch('/companies/:id', requireSuperAdmin, async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const company = await db.getOne('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const { is_active, company_name, deactivation_reason } = req.body || {};
    const sets = ['updated_at = NOW()'];
    const values = [req.params.id];

    let auditAction = null;
    let auditDetails = {};

    if (company_name !== undefined) {
      sets.push(`company_name = $${values.length + 1}`);
      values.push(company_name);
    }

    if (is_active !== undefined && !!is_active !== company.is_active) {
      sets.push(`is_active = $${values.length + 1}`);
      values.push(!!is_active);

      if (!is_active) {
        sets.push('deactivated_at = NOW()');
        sets.push(`deactivation_reason = $${values.length + 1}`);
        values.push(deactivation_reason || 'Deactivated by administrator');
        auditAction = 'company_deactivated';
        auditDetails.reason = deactivation_reason || 'Deactivated by administrator';
      } else {
        sets.push('deactivated_at = NULL');
        sets.push('deactivation_reason = NULL');
        auditAction = 'company_activated';
      }
    }

    await db.execute(
      `UPDATE companies SET ${sets.join(', ')} WHERE id = $1`,
      values
    );

    if (auditAction) {
      await audit.log(auditAction, {
        superAdminId: req.superAdmin.id,
        companyId: company.id,
        details: auditDetails,
        ...meta,
      });
    }

    const updated = await db.getOne(
      `SELECT id, company_name, email, confirmed, is_active, deactivated_at,
              deactivation_reason, credits_balance, created_at, confirmed_at
       FROM companies WHERE id = $1`,
      [req.params.id]
    );

    res.json({ success: true, company: updated });
  } catch (err) {
    logger.error('[SUPER-ADMIN] patch company error: ' + err.message);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

/**
 * POST /api/super-admin/companies/:id/confirm
 * Manually mark a company as confirmed (super-admin override of email click).
 */
router.post('/companies/:id/confirm', requireSuperAdmin, async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const company = await db.getOne('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (company.confirmed) return res.status(400).json({ error: 'Company already confirmed' });

    const updated = await db.getOne(
      `UPDATE companies SET
         confirmed                     = TRUE,
         confirmed_at                  = NOW(),
         confirmation_token            = NULL,
         confirmation_token_expires_at = NULL,
         updated_at                    = NOW()
       WHERE id = $1
       RETURNING id, company_name, email, confirmed, is_active, deactivated_at,
                 deactivation_reason, credits_balance, created_at, confirmed_at`,
      [company.id]
    );

    await audit.log('company_confirmed', {
      superAdminId: req.superAdmin.id,
      companyId: company.id,
      details: { manual: true },
      ...meta,
    });

    emailService.sendWelcomeEmail(company).catch(err =>
      logger.warn(`[SUPER-ADMIN] welcome email failed for ${company.email}: ${err.message}`)
    );

    logger.info(`[SUPER-ADMIN] manually confirmed company ${company.email}`);
    return res.json({ success: true, company: updated });
  } catch (err) {
    logger.error('[SUPER-ADMIN] confirm company error: ' + err.message);
    return res.status(500).json({ error: 'Failed to confirm company' });
  }
});

/**
 * POST /api/super-admin/companies/:id/resend-confirmation
 */
router.post('/companies/:id/resend-confirmation', requireSuperAdmin, async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const company = await db.getOne('SELECT * FROM companies WHERE id = $1', [req.params.id]);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    if (company.confirmed) return res.status(400).json({ error: 'Company already confirmed' });

    const token = authService.generateConfirmationToken();
    const expiresAt = authService.confirmationExpiryDate();
    await db.execute(
      `UPDATE companies SET confirmation_token = $2,
                            confirmation_token_expires_at = $3,
                            updated_at = NOW()
       WHERE id = $1`,
      [company.id, token, expiresAt]
    );

    // Password is not known (only the hash is stored) — so resend email does NOT
    // include the plaintext password. Include a message that the super admin
    // should share it separately.
    emailService.sendConfirmationEmail(company, null, token).catch(err =>
      logger.error(`[SUPER-ADMIN] resend confirmation email failed: ${err.message}`)
    );

    await audit.log('confirmation_resent', {
      superAdminId: req.superAdmin.id,
      companyId: company.id,
      ...meta,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('[SUPER-ADMIN] resend confirmation error: ' + err.message);
    res.status(500).json({ error: 'Failed to resend confirmation' });
  }
});

/**
 * DELETE /api/super-admin/companies/:id
 * Permanently deletes a company and all associated data (jobs, results, audit refs).
 */
router.delete('/companies/:id', requireSuperAdmin, async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const company = await db.getOne(
      'SELECT id, company_name, email FROM companies WHERE id = $1',
      [req.params.id]
    );
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Log before delete so audit row captures the company_id FK before cascade nulls it.
    await audit.log('company_deleted', {
      superAdminId: req.superAdmin.id,
      details: { company_name: company.company_name, email: company.email },
      ...meta,
    });

    // CASCADE on verification_jobs → job_results is handled by FK.
    // audit_logs.company_id is ON DELETE SET NULL so history is preserved.
    await db.execute('DELETE FROM companies WHERE id = $1', [company.id]);

    logger.info(`[SUPER-ADMIN] deleted company ${company.email}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error('[SUPER-ADMIN] delete company error: ' + err.message);
    return res.status(500).json({ error: 'Failed to delete company' });
  }
});

/**
 * GET /api/super-admin/audit-logs
 * Query: company_id, action, from (ISO), to (ISO), limit, offset
 */
router.get('/audit-logs', requireSuperAdmin, async (req, res) => {
  try {
    const { company_id, action, from, to } = req.query || {};
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const clauses = [];
    const values = [];
    if (company_id) { values.push(company_id); clauses.push(`company_id = $${values.length}`); }
    if (action)     { values.push(action);     clauses.push(`action = $${values.length}`); }
    if (from)       { values.push(from);       clauses.push(`created_at >= $${values.length}`); }
    if (to)         { values.push(to);         clauses.push(`created_at <= $${values.length}`); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    values.push(limit, offset);

    const rows = await db.getMany(
      `SELECT id, company_id, super_admin_id, action, details,
              ip_address, user_agent, created_at
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({ success: true, logs: rows, limit, offset });
  } catch (err) {
    logger.error('[SUPER-ADMIN] audit-logs error: ' + err.message);
    res.status(500).json({ error: 'Failed to read audit logs' });
  }
});

/**
 * GET /api/super-admin/dashboard-stats
 */
router.get('/dashboard-stats', requireSuperAdmin, async (_req, res) => {
  try {
    const companies = await db.getOne(`
      SELECT
        COUNT(*)::int                          AS total_companies,
        COUNT(*) FILTER (WHERE confirmed)::int  AS confirmed_companies,
        COUNT(*) FILTER (WHERE is_active)::int  AS active_companies
      FROM companies
    `);
    const jobs = await db.getOne(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int               AS jobs_today,
        COUNT(*) FILTER (WHERE date_trunc('month', created_at) = date_trunc('month', NOW()))::int AS jobs_this_month,
        COUNT(*)::int                                                          AS jobs_total
      FROM verification_jobs
    `);
    const cache = await pgCacheService.getCacheStats();

    res.json({
      success: true,
      companies,
      jobs,
      cache,
    });
  } catch (err) {
    logger.error('[SUPER-ADMIN] dashboard-stats error: ' + err.message);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

module.exports = router;
