const express = require('express');
const { requireSuperAdmin } = require('../middleware/authMiddleware');
const { isEmailConfigured, verifySmtp } = require('../services/emailService');
const { config } = require('../config');

const router = express.Router();

/**
 * GET /api/email-status
 * Returns SMTP configuration status. Super admin only.
 */
router.get('/email-status', requireSuperAdmin, async (_req, res) => {
  const configured = isEmailConfigured();

  if (!configured) {
    const missing = [];
    if (!config.smtpHost) missing.push('SMTP_HOST');
    if (!config.smtpUser) missing.push('SMTP_USER');
    if (!config.smtpPass) missing.push('SMTP_PASS');
    return res.json({
      configured: false,
      reason: `Missing environment variables: ${missing.join(', ')}`,
      host: null,
    });
  }

  // Run a live SMTP verify so the admin knows if credentials are actually valid.
  const verify = await verifySmtp();
  return res.json({
    configured: true,
    verified: verify.ok,
    reason: verify.ok ? null : verify.error,
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    from: config.notifyFromEmail,
  });
});

module.exports = router;
