const express = require('express');
const {
  buildCompletionHtml,
  buildErrorHtml,
  buildConfirmationHtml,
  buildWelcomeHtml,
  buildPasswordResetHtml,
  sendMail,
  verifySmtp,
  emailConfigured,
} = require('../services/emailService');
const { logger } = require('../utils/logger');
const db = require('../services/pgService');

const router = express.Router();

// GET /api/dev/company-token?email=... — dev-only helper for e2e tests.
// Returns the current confirmation_token and password_reset_token so
// Playwright can drive the full confirm/reset flows without scraping SMTP.
router.get('/company-token', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const row = await db.getOne(
      `SELECT id, email, confirmed, confirmation_token,
              confirmation_token_expires_at,
              password_reset_token, password_reset_expires_at
         FROM companies WHERE email = $1`,
      [email]
    );
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, company: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const mockJob = {
  id: 'preview-123',
  user_email: 'preview@example.com',
  file_name: 'sample-spare-parts.xlsx',
  total_rows: 142,
  processed_rows: 87,
};
const mockStats = {
  scoreAbove90: 98,
  score50to89: 30,
  scoreBelow50: 14,
  webVerified: 128,
  officialSourceFound: 92,
  externalSourceFound: 28,
  notFound: 22,
};
const mockCompany = {
  id: 'preview-company',
  company_name: 'Acme Industrial AB',
  email: 'contact@acme.example',
};

function renderByType(type) {
  switch ((type || '').toLowerCase()) {
    case 'error':
      return {
        subject: `Verification Error — ${mockJob.file_name} [TEST]`,
        html: buildErrorHtml(mockJob, 'Mock error: normalization failed on row 7 (invalid manufacturer code).'),
      };
    case 'confirmation':
      return {
        subject: 'Confirm your Spare Parts Verifier account [TEST]',
        html: buildConfirmationHtml(mockCompany, 'TempPass@123', 'preview-token-uuid'),
      };
    case 'welcome':
      return {
        subject: 'Your Spare Parts Verifier account is ready [TEST]',
        html: buildWelcomeHtml(mockCompany),
      };
    case 'password-reset':
    case 'reset':
      return {
        subject: 'Reset your Spare Parts Verifier password [TEST]',
        html: buildPasswordResetHtml(mockCompany, 'preview-reset-token-uuid'),
      };
    case 'success':
    default:
      return {
        subject: `Spare Parts Verification Complete — ${mockJob.file_name} [TEST]`,
        html: buildCompletionHtml(mockJob, mockStats),
      };
  }
}

// GET /api/dev/preview-email?type=success|error|confirmation|welcome|password-reset
router.get('/preview-email', (req, res) => {
  const { html } = renderByType(req.query.type);
  res.set('Content-Type', 'text/html').send(html);
});

// POST /api/dev/send-test-email  { to?: string, type?: ... }
router.post('/send-test-email', express.json(), async (req, res) => {
  const { to = 'karthick.webronic@gmail.com', type = 'success' } = req.body || {};
  if (!emailConfigured()) {
    return res.status(400).json({ ok: false, error: 'Email not configured — set SMTP_HOST in backend/.env' });
  }
  const v = await verifySmtp();
  if (!v.ok) return res.status(500).json({ ok: false, stage: 'verify', error: v.error });

  const { subject, html } = renderByType(type);

  try {
    const result = await sendMail({ to, subject, html });
    if (!result.ok) return res.status(500).json({ ok: false, stage: 'send', error: result.error });
    logger.info(`[DEV] Test email sent to ${to} (${type})`);
    return res.json({ ok: true, id: result.id, to, type });
  } catch (err) {
    logger.error(`[DEV] Test email exception: ${err.message}`);
    return res.status(500).json({ ok: false, stage: 'send', error: err.message });
  }
});

module.exports = router;
