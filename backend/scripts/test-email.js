#!/usr/bin/env node
// Usage:
//   node backend/scripts/test-email.js                         → sends success template
//   node backend/scripts/test-email.js error                   → sends error template
//   node backend/scripts/test-email.js success you@foo.com     → override recipient
//
// Reads SMTP config from backend/.env via config.js.

const { verifySmtp, sendMail, buildCompletionHtml, buildErrorHtml, emailConfigured } = require('../src/services/emailService');

const mode = (process.argv[2] || 'success').toLowerCase();
const to = process.argv[3] || 'karthick.webronic@gmail.com';

const mockJob = {
  id: 'test-' + Date.now(),
  user_email: to,
  file_name: 'sample-spare-parts.xlsx',
  total_rows: 142,
};
const mockStats = {
  scoreAbove90: 98,
  score50to89: 30,
  scoreBelow50: 14,
  webVerified: 128,
};

(async () => {
  if (!emailConfigured()) {
    console.error('[TEST] No email transport configured. Set SMTP_HOST (+ user/pass) in backend/.env.');
    process.exit(1);
  }

  console.log('[TEST] Verifying SMTP connection...');
  const v = await verifySmtp();
  if (!v.ok) {
    console.error(`[TEST] SMTP verify failed: ${v.error}`);
    console.error('[TEST] Check SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE in backend/.env');
    process.exit(1);
  }
  console.log('[TEST] SMTP OK. Sending test email...');

  const { subject, html } = mode === 'error'
    ? { subject: `Verification Error — ${mockJob.file_name} [TEST]`, html: buildErrorHtml(mockJob, 'Mock error: normalization failed on row 7 (invalid manufacturer code).') }
    : { subject: `Spare Parts Verification Complete — ${mockJob.file_name} [TEST]`, html: buildCompletionHtml(mockJob, mockStats) };

  try {
    const result = await sendMail({ to, subject, html });
    if (result.ok) {
      console.log(`[TEST] Sent. messageId=${result.id}  to=${to}  mode=${mode}`);
      process.exit(0);
    }
    console.error(`[TEST] Send failed: ${result.error}`);
    process.exit(1);
  } catch (err) {
    console.error(`[TEST] Exception: ${err.message}`);
    process.exit(1);
  }
})();
