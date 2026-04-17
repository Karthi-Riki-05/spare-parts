/**
 * emailService unit tests — template builders + no-op behaviour when SMTP
 * is unconfigured (which it always is in the test env).
 */
const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');

const emailService = require('../../src/services/emailService');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

// ── emailConfigured ──────────────────────────────────────────
describe('emailService.emailConfigured', () => {
  it('returns false when SMTP_HOST is empty (test env)', () => {
    expect(emailService.emailConfigured()).toBe(false);
  });
});

// ── sendMail no-op ───────────────────────────────────────────
describe('emailService.sendMail (no transport)', () => {
  it('returns { ok: false } when no transport configured', async () => {
    const result = await emailService.sendMail({
      to: 'x@test.local',
      subject: 'test',
      html: '<p>hi</p>',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no email transport/i);
  });
});

// ── verifySmtp no-op ─────────────────────────────────────────
describe('emailService.verifySmtp (no transport)', () => {
  it('returns { ok: false } when SMTP not configured', async () => {
    const result = await emailService.verifySmtp();
    expect(result.ok).toBe(false);
  });
});

// ── Sender functions (no-op when unconfigured) ───────────────
describe('sender functions return false when unconfigured', () => {
  const company = { id: 'abc', company_name: 'Test Co', email: 'co@test.local' };
  const jobData = { id: 'j1', file_name: 'test.xlsx', total_rows: 10, processed_rows: 10, user_email: 'x@y.z' };

  it('sendConfirmationEmail returns false', async () => {
    expect(await emailService.sendConfirmationEmail(company, 'pass123', 'tok')).toBe(false);
  });

  it('sendWelcomeEmail returns false', async () => {
    expect(await emailService.sendWelcomeEmail(company)).toBe(false);
  });

  it('sendPasswordResetEmail returns false', async () => {
    expect(await emailService.sendPasswordResetEmail(company, 'tok')).toBe(false);
  });

  it('sendJobCompletionEmail returns false', async () => {
    expect(await emailService.sendJobCompletionEmail(jobData, {})).toBe(false);
  });

  it('sendErrorEmail returns false', async () => {
    expect(await emailService.sendErrorEmail(jobData, 'boom')).toBe(false);
  });
});

// ── Template builders ────────────────────────────────────────
describe('buildConfirmationHtml', () => {
  const company = { company_name: 'Acme Corp', email: 'acme@test.local', id: '123' };

  it('includes confirm URL, company name, and email', () => {
    const html = emailService.buildConfirmationHtml(company, 'TempPass1', 'abc-token');
    expect(html).toContain('Acme Corp');
    expect(html).toContain('acme@test.local');
    expect(html).toContain('/confirm-email/abc-token');
    expect(html).toContain('Confirm Email');
  });

  it('includes credentials block when plainPassword is provided', () => {
    const html = emailService.buildConfirmationHtml(company, 'TempPass1', 'tok');
    expect(html).toContain('TempPass1');
    expect(html).toContain('Temporary password');
  });

  it('shows info box instead of creds when plainPassword is null (resend)', () => {
    const html = emailService.buildConfirmationHtml(company, null, 'tok');
    expect(html).not.toContain('Temporary password');
    expect(html).toContain('administrator will share');
  });

  it('escapes HTML in company name', () => {
    const xss = { ...company, company_name: '<script>alert(1)</script>' };
    const html = emailService.buildConfirmationHtml(xss, null, 'tok');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildWelcomeHtml', () => {
  it('includes sign-in link and company name', () => {
    const html = emailService.buildWelcomeHtml({ company_name: 'Bolt', email: 'b@b.io' });
    expect(html).toContain('Bolt');
    expect(html).toContain('/login');
    expect(html).toContain('Sign in');
    expect(html).toContain('confirmed');
  });
});

describe('buildPasswordResetHtml', () => {
  it('includes reset URL and expiry info', () => {
    const html = emailService.buildPasswordResetHtml(
      { company_name: 'Reset Co', email: 'r@r.io' },
      'reset-tok-123'
    );
    expect(html).toContain('/reset-password/reset-tok-123');
    expect(html).toContain('Reset password');
    expect(html).toContain('minutes');
  });
});

describe('buildCompletionHtml', () => {
  it('includes file name and stats', () => {
    const html = emailService.buildCompletionHtml(
      { id: 'j1', file_name: 'parts.xlsx', total_rows: 100 },
      { scoreAbove90: 80, score50to89: 15, scoreBelow50: 5, webVerified: 90, officialSourceFound: 70, externalSourceFound: 20, notFound: 10 }
    );
    expect(html).toContain('parts.xlsx');
    expect(html).toContain('100');
    expect(html).toContain('Verification Complete');
    expect(html).toContain('View Results');
  });
});

describe('buildErrorHtml', () => {
  it('includes error message and file name', () => {
    const html = emailService.buildErrorHtml(
      { id: 'j2', file_name: 'fail.xlsx', total_rows: 50, processed_rows: 20 },
      'Rate limit exceeded'
    );
    expect(html).toContain('fail.xlsx');
    expect(html).toContain('Rate limit exceeded');
    expect(html).toContain('Verification Error');
    expect(html).toContain('20 / 50');
  });

  it('escapes HTML in error message', () => {
    const html = emailService.buildErrorHtml(
      { id: 'j3', file_name: 'x.xlsx', total_rows: 1, processed_rows: 0 },
      '<img onerror=alert(1) src=x>'
    );
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img');
  });
});
