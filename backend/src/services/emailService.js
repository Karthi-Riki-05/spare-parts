const nodemailer = require('nodemailer');
const { config } = require('../config');
const { logger } = require('../utils/logger');

// SMTP via nodemailer — Hostinger in our deployment.
const smtpEnabled = !!config.smtpHost;
const transporter = smtpEnabled
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure, // true for 465, false for 587
      auth: { user: config.smtpUser, pass: config.smtpPass },
    })
  : null;

function emailConfigured() {
  return !!transporter;
}

async function sendMail({ to, subject, html }) {
  if (!transporter) return { ok: false, error: 'no email transport configured' };
  const info = await transporter.sendMail({
    from: `Spare Parts Verifier <${config.notifyFromEmail}>`,
    to,
    subject,
    html,
  });
  return { ok: true, id: info.messageId };
}

async function verifySmtp() {
  if (!transporter) return { ok: false, error: 'SMTP not configured' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ────────────────────────────────────────────────────────────
// Shared HTML shell
// ────────────────────────────────────────────────────────────
const BASE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; margin: 0; padding: 0; background: #f5f6f8; }
  .container { max-width: 600px; margin: 24px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  .header { padding: 24px; color: white; }
  .header h1 { margin: 0 0 6px; font-size: 22px; }
  .header p  { margin: 0; opacity: 0.9; font-size: 14px; }
  .content { padding: 24px; background: #fff; }
  .stats   { margin: 18px 0; border: 1px solid #eee; border-radius: 6px; }
  .stat-row { display: flex; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid #eee; }
  .stat-row:last-child { border-bottom: none; }
  .stat-label { color: #555; }
  .stat-value { font-weight: 600; text-align: right; }
  .button    { display: inline-block; background: #00bcd4; color: white; padding: 12px 22px; border-radius: 5px; text-decoration: none; font-weight: 600; margin: 14px 0; }
  .button.red { background: #f44336; }
  .error-box { background: #ffebee; border: 1px solid #f44336; padding: 15px; border-radius: 4px; margin: 18px 0; color: #c62828; }
  .info-box  { background: #e3f2fd; border: 1px solid #90caf9; padding: 15px; border-radius: 4px; margin: 18px 0; color: #1565c0; }
  .cred      { background: #f5f5f5; border: 1px dashed #999; padding: 14px; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; margin: 14px 0; }
  .footer    { text-align: center; color: #999; font-size: 12px; padding: 18px; background: #fafafa; }
`;

function shell({ headerColor, headerTitle, headerTagline, bodyHtml }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body>
  <div class="container">
    <div class="header" style="background: ${headerColor};">
      <h1>${headerTitle}</h1>
      <p>${headerTagline}</p>
    </div>
    <div class="content">${bodyHtml}</div>
    <div class="footer">Spare Parts Web Verifier · Powered by AI</div>
  </div>
</body></html>`;
}

// ────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────
function buildCompletionHtml(jobData, stats) {
  const resultsUrl = `${config.appUrl}/results/${jobData.id}`;
  const body = `
    <p>File: <strong>${escapeHtml(jobData.file_name)}</strong></p>
    <p>Total rows: <strong>${jobData.total_rows}</strong></p>

    <div class="stats">
      <div class="stat-row"><span class="stat-label">Score ≥ 90 (Official)</span><span class="stat-value">${stats.scoreAbove90 || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Score 50–89 (Distributor)</span><span class="stat-value">${stats.score50to89 || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Score &lt; 50 (Partial / not found)</span><span class="stat-value">${stats.scoreBelow50 || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Web verified</span><span class="stat-value">${stats.webVerified || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Official source found</span><span class="stat-value">${stats.officialSourceFound || 0}</span></div>
      <div class="stat-row"><span class="stat-label">External / distributor source</span><span class="stat-value">${stats.externalSourceFound || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Not found</span><span class="stat-value">${stats.notFound || 0}</span></div>
    </div>

    <p><a href="${resultsUrl}" class="button">View Results</a></p>
    <p style="color: #666; font-size: 13px;">Or download the Excel file from the results page.</p>
  `;
  return shell({
    headerColor: 'linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)',
    headerTitle: 'Verification Complete',
    headerTagline: 'Your spare parts verification job has finished.',
    bodyHtml: body,
  });
}

function buildErrorHtml(jobData, errorMessage) {
  const body = `
    <p>File: <strong>${escapeHtml(jobData.file_name)}</strong></p>
    <p>Rows processed before failure: <strong>${jobData.processed_rows || 0} / ${jobData.total_rows || 0}</strong></p>
    <div class="error-box">
      <p style="margin: 0 0 6px;"><strong>Error</strong></p>
      <p style="margin: 0;">${escapeHtml(errorMessage)}</p>
    </div>
    <p><a href="${config.appUrl}" class="button red">Re-submit</a></p>
    <p style="color: #666; font-size: 13px;">If this keeps happening, please contact support.</p>
  `;
  return shell({
    headerColor: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
    headerTitle: 'Verification Error',
    headerTagline: 'Your spare parts verification job could not complete.',
    bodyHtml: body,
  });
}

function buildConfirmationHtml(company, plainPassword, token) {
  const confirmUrl = `${config.appUrl}/confirm-email/${token}`;
  const credsBlock = plainPassword
    ? `
    <p>Your login credentials:</p>
    <div class="cred">
      <div>Email: <strong>${escapeHtml(company.email)}</strong></div>
      <div>Temporary password: <strong>${escapeHtml(plainPassword)}</strong></div>
    </div>
    <p style="color: #666; font-size: 13px;">You can change this password after signing in.</p>
  `
    : `
    <div class="info-box">
      Your administrator will share your login credentials separately.
    </div>
  `;
  const body = `
    <p>Hi ${escapeHtml(company.company_name)},</p>
    <p>An account has been created for your organisation on the Spare Parts Verifier.</p>
    ${credsBlock}
    <p>Click the button below to confirm your email address. The link expires in <strong>${config.confirmationTokenHours} hours</strong>.</p>
    <p><a href="${confirmUrl}" class="button">Confirm Email</a></p>
    <p style="color: #666; font-size: 12px; word-break: break-all;">
      Or paste this link into your browser:<br>${confirmUrl}
    </p>
  `;
  return shell({
    headerColor: 'linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)',
    headerTitle: 'Confirm your account',
    headerTagline: 'Welcome to Spare Parts Verifier.',
    bodyHtml: body,
  });
}

function buildWelcomeHtml(company) {
  const loginUrl = `${config.appUrl}/login`;
  const body = `
    <p>Hi ${escapeHtml(company.company_name)},</p>
    <p>Your account is confirmed and ready to use. 🎉</p>
    <p><a href="${loginUrl}" class="button">Sign in</a></p>
    <p><strong>Quick start:</strong></p>
    <ol>
      <li>Upload your Excel file of spare parts.</li>
      <li>Review the auto-detected / normalised data.</li>
      <li>Click <em>Verify All</em> to run AI web verification.</li>
      <li>Download the annotated Excel when complete.</li>
    </ol>
    <p style="color: #666; font-size: 13px;">Questions? Just reply to this email.</p>
  `;
  return shell({
    headerColor: 'linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%)',
    headerTitle: 'Account confirmed',
    headerTagline: "You're in — let's get verifying.",
    bodyHtml: body,
  });
}

function buildPasswordResetHtml(company, token) {
  const resetUrl = `${config.appUrl}/reset-password/${token}`;
  const body = `
    <p>Hi ${escapeHtml(company.company_name)},</p>
    <p>We received a request to reset the password for <strong>${escapeHtml(company.email)}</strong>.</p>
    <p><a href="${resetUrl}" class="button">Reset password</a></p>
    <p style="color: #666; font-size: 13px;">
      This link expires in <strong>${config.passwordResetMinutes} minutes</strong>.
      If you didn't request a reset, you can safely ignore this email.
    </p>
    <p style="color: #666; font-size: 12px; word-break: break-all;">
      Or paste this link into your browser:<br>${resetUrl}
    </p>
  `;
  return shell({
    headerColor: 'linear-gradient(135deg, #ef6c00 0%, #e65100 100%)',
    headerTitle: 'Reset your password',
    headerTagline: 'A password reset was requested for your account.',
    bodyHtml: body,
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ────────────────────────────────────────────────────────────
// Senders — all no-op safely if email not configured
// ────────────────────────────────────────────────────────────
async function trySend({ to, subject, html, context }) {
  if (!emailConfigured()) {
    logger.warn(`[EMAIL] No transport configured, skipping ${context} to ${to}`);
    return false;
  }
  try {
    const result = await sendMail({ to, subject, html });
    if (!result.ok) {
      logger.error(`[EMAIL] ${context} failed to ${to}: ${result.error}`);
      return false;
    }
    logger.info(`[EMAIL] Sent ${context} to ${to} (${result.id})`);
    return true;
  } catch (err) {
    logger.error(`[EMAIL] Exception sending ${context}: ${err.message}`);
    return false;
  }
}

async function sendJobCompletionEmail(jobData, stats) {
  return trySend({
    to: jobData.user_email,
    subject: `Spare Parts Verification Complete — ${jobData.file_name}`,
    html: buildCompletionHtml(jobData, stats || {}),
    context: `completion email (job ${jobData.id})`,
  });
}

async function sendErrorEmail(jobData, errorMessage) {
  return trySend({
    to: jobData.user_email,
    subject: `Verification Error — ${jobData.file_name}`,
    html: buildErrorHtml(jobData, errorMessage),
    context: `error email (job ${jobData.id})`,
  });
}

async function sendConfirmationEmail(company, plainPassword, token) {
  return trySend({
    to: company.email,
    subject: 'Confirm your Spare Parts Verifier account',
    html: buildConfirmationHtml(company, plainPassword, token),
    context: `confirmation email (company ${company.id})`,
  });
}

async function sendWelcomeEmail(company) {
  return trySend({
    to: company.email,
    subject: 'Your Spare Parts Verifier account is ready',
    html: buildWelcomeHtml(company),
    context: `welcome email (company ${company.id})`,
  });
}

async function sendPasswordResetEmail(company, token) {
  return trySend({
    to: company.email,
    subject: 'Reset your Spare Parts Verifier password',
    html: buildPasswordResetHtml(company, token),
    context: `password reset email (company ${company.id})`,
  });
}

module.exports = {
  sendMail,
  verifySmtp,
  emailConfigured,
  sendJobCompletionEmail,
  sendErrorEmail,
  sendConfirmationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  // Exposed for /api/dev preview routes + tests
  buildCompletionHtml,
  buildErrorHtml,
  buildConfirmationHtml,
  buildWelcomeHtml,
  buildPasswordResetHtml,
};
