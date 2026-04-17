const express = require('express');
const { config } = require('../config');
const { logger } = require('../utils/logger');
const db = require('../services/pgService');
const authService = require('../services/authService');
const audit = require('../services/auditService');
const companyService = require('../services/companyService');
const emailService = require('../services/emailService');
const { requireCompany, COOKIE_NAME } = require('../middleware/authMiddleware');

const router = express.Router();

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d cap; token itself uses JWT_EXPIRES_IN
    path: '/',
  };
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const company = await authService.findCompanyByEmail(email);
    const ok = company && (await authService.verifyPassword(password, company.password_hash));

    if (!ok) {
      await audit.log('company_login_failed', {
        companyId: company ? company.id : null,
        details: { email: normalizeEmail(email) },
        ...meta,
      });
      logger.warn(`[AUTH] login failed for ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
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

    const token = authService.generateToken({
      role: 'company',
      company_id: company.id,
      email: company.email,
      company_name: company.company_name,
    });
    res.cookie(COOKIE_NAME, token, cookieOptions());

    await authService.touchCompanyLogin(company.id);
    companyService.invalidateEmailCache(company.email);
    await audit.log('company_login', { companyId: company.id, ...meta });
    logger.info(`[AUTH] login ok ${company.email}`);

    return res.json({
      success: true,
      user: {
        id: company.id,
        email: company.email,
        companyName: company.company_name,
      },
    });
  } catch (err) {
    logger.error('[AUTH] login error: ' + err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    // Best-effort audit — try to decode the token to attach companyId.
    try {
      const token = req.cookies && req.cookies[COOKIE_NAME];
      if (token) {
        const payload = authService.verifyToken(token);
        if (payload.role === 'company') {
          await audit.log('company_logout', { companyId: payload.company_id, ...meta });
        }
      }
    } catch { /* invalid token — just clear the cookie */ }

    res.clearCookie(COOKIE_NAME, { path: '/' });
    return res.json({ success: true });
  } catch (err) {
    logger.error('[AUTH] logout error: ' + err.message);
    return res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireCompany, (req, res) => {
  res.json({
    user: {
      id: req.company.id,
      email: req.company.email,
      companyName: req.company.company_name,
      creditsBalance: req.company.credits_balance,
    },
  });
});

/**
 * GET /api/auth/confirm/:token
 * Verifies the confirmation token, activates the company, sends welcome email.
 * Returns JSON (frontend redirects based on response).
 */
router.get('/confirm/:token', async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const { token } = req.params;
    const company = await authService.findCompanyByConfirmationToken(token);

    if (!company) {
      return res.status(400).json({ ok: false, reason: 'invalid' });
    }
    if (company.confirmed) {
      return res.json({ ok: true, alreadyConfirmed: true });
    }
    if (company.confirmation_token_expires_at && new Date(company.confirmation_token_expires_at) < new Date()) {
      return res.status(400).json({ ok: false, reason: 'expired' });
    }

    await db.execute(
      `UPDATE companies SET
         confirmed                     = TRUE,
         confirmed_at                  = NOW(),
         confirmation_token            = NULL,
         confirmation_token_expires_at = NULL,
         updated_at                    = NOW()
       WHERE id = $1`,
      [company.id]
    );

    await audit.log('company_confirmed', { companyId: company.id, ...meta });
    logger.info(`[AUTH] company confirmed: ${company.email}`);

    emailService.sendWelcomeEmail(company).catch(err =>
      logger.warn(`[AUTH] welcome email failed for ${company.email}: ${err.message}`)
    );

    return res.json({ ok: true, email: company.email });
  } catch (err) {
    logger.error('[AUTH] confirm error: ' + err.message);
    return res.status(500).json({ ok: false, reason: 'server_error' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Always returns the same success message regardless of email existence.
 */
router.post('/forgot-password', async (req, res) => {
  const meta = audit.reqMeta(req);
  const stock = { message: 'If that email exists, a reset link has been sent.' };
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });

    const company = await authService.findCompanyByEmail(email);
    if (!company) {
      logger.info(`[AUTH] forgot-password for unknown email ${email}`);
      return res.json(stock);
    }

    const token = authService.generatePasswordResetToken();
    const expiresAt = authService.passwordResetExpiryDate();
    await db.execute(
      `UPDATE companies SET password_reset_token = $2,
                            password_reset_expires_at = $3,
                            updated_at = NOW()
       WHERE id = $1`,
      [company.id, token, expiresAt]
    );

    emailService.sendPasswordResetEmail(company, token).catch(err =>
      logger.warn(`[AUTH] password reset email failed: ${err.message}`)
    );

    await audit.log('password_reset_requested', { companyId: company.id, ...meta });
    return res.json(stock);
  } catch (err) {
    logger.error('[AUTH] forgot-password error: ' + err.message);
    return res.json(stock); // never reveal
  }
});

/**
 * POST /api/auth/reset-password
 */
router.post('/reset-password', async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and newPassword required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const company = await authService.findCompanyByPasswordResetToken(token);
    if (!company) return res.status(400).json({ error: 'Invalid or expired token' });
    if (company.password_reset_expires_at && new Date(company.password_reset_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hash = await authService.hashPassword(newPassword);
    await db.execute(
      `UPDATE companies SET password_hash = $2,
                            password_reset_token = NULL,
                            password_reset_expires_at = NULL,
                            updated_at = NOW()
       WHERE id = $1`,
      [company.id, hash]
    );

    await audit.log('password_reset', { companyId: company.id, ...meta });
    logger.info(`[AUTH] password reset for ${company.email}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error('[AUTH] reset-password error: ' + err.message);
    return res.status(500).json({ error: 'Reset failed' });
  }
});

/**
 * POST /api/auth/change-password
 */
router.post('/change-password', requireCompany, async (req, res) => {
  const meta = audit.reqMeta(req);
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const full = await authService.findCompanyById(req.company.id);
    const ok = await authService.verifyPassword(currentPassword, full.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await authService.hashPassword(newPassword);
    await db.execute(
      'UPDATE companies SET password_hash = $2, updated_at = NOW() WHERE id = $1',
      [req.company.id, hash]
    );

    await audit.log('password_changed', { companyId: req.company.id, ...meta });
    logger.info(`[AUTH] password changed for ${req.company.email}`);
    return res.json({ success: true });
  } catch (err) {
    logger.error('[AUTH] change-password error: ' + err.message);
    return res.status(500).json({ error: 'Change failed' });
  }
});

module.exports = router;
