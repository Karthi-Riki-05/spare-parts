/**
 * Integration tests for auth routes — password reset flow, change-password,
 * and edge cases not covered in multiTenant.test.js.
 */
const request = require('supertest');
const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');
const db = require('../../src/services/pgService');

const { app } = require('../../src/server');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

// ── Helpers ──────────────────────────────────────────────────
async function saCookie() {
  const res = await request(app)
    .post('/api/super-admin/login')
    .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return extractCookie(res);
}

function extractCookie(res) {
  const setCookie = res.headers['set-cookie'] || [];
  return setCookie.map(c => c.split(';')[0]).join('; ');
}

async function createAndConfirm(sa, email = 'pw@test.local', password = 'TestPass@2026') {
  const create = await request(app)
    .post('/api/super-admin/companies')
    .set('Cookie', sa)
    .send({ company_name: 'PW Co', email, password });
  expect(create.status).toBe(201);
  const token = (await db.getOne(
    'SELECT confirmation_token FROM companies WHERE email = $1', [email]
  )).confirmation_token;
  await request(app).get(`/api/auth/confirm/${token}`);
  return create.body.company;
}

async function loginCookie(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  expect(res.status).toBe(200);
  return extractCookie(res);
}

// ── Password reset flow ──────────────────────────────────────
describe('password reset flow (forgot → reset)', () => {
  it('full flow: forgot-password → DB token → reset-password → login with new', async () => {
    const sa = await saCookie();
    const email = 'reset@test.local';
    const oldPw = 'OldPass@2026';
    const newPw = 'NewPass@2026';
    await createAndConfirm(sa, email, oldPw);

    // Request password reset
    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    expect(forgot.status).toBe(200);
    expect(forgot.body.message).toMatch(/if that email exists/i);

    // Grab token from DB
    const row = await db.getOne(
      'SELECT password_reset_token, password_reset_expires_at FROM companies WHERE email = $1',
      [email]
    );
    expect(row.password_reset_token).toBeTruthy();
    expect(new Date(row.password_reset_expires_at).getTime()).toBeGreaterThan(Date.now());

    // Reset password
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: row.password_reset_token, newPassword: newPw });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    // Token consumed — row cleared
    const after = await db.getOne(
      'SELECT password_reset_token FROM companies WHERE email = $1', [email]
    );
    expect(after.password_reset_token).toBeNull();

    // Old password fails
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: oldPw });
    expect(oldLogin.status).toBe(401);

    // New password works
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPw });
    expect(newLogin.status).toBe(200);
  });

  it('rejects reset with expired token', async () => {
    const sa = await saCookie();
    const email = 'exp-reset@test.local';
    await createAndConfirm(sa, email, 'Pass@2026');

    await request(app).post('/api/auth/forgot-password').send({ email });
    // Manually expire the token
    await db.execute(
      `UPDATE companies SET password_reset_expires_at = NOW() - INTERVAL '1 hour' WHERE email = $1`,
      [email]
    );
    const { password_reset_token: token } = await db.getOne(
      'SELECT password_reset_token FROM companies WHERE email = $1', [email]
    );
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'NewNew@2026' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('rejects reset with short password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: '00000000-0000-0000-0000-000000000000', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });

  it('rejects reset with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Change password (authenticated) ──────────────────────────
describe('change-password (authenticated)', () => {
  it('changes password for an authenticated company user', async () => {
    const sa = await saCookie();
    const email = 'chg@test.local';
    const oldPw = 'ChgOld@2026';
    const newPw = 'ChgNew@2026';
    await createAndConfirm(sa, email, oldPw);
    const cookie = await loginCookie(email, oldPw);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: oldPw, newPassword: newPw });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Login with new password
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPw });
    expect(login.status).toBe(200);
  });

  it('rejects change when current password is wrong', async () => {
    const sa = await saCookie();
    const email = 'chgbad@test.local';
    await createAndConfirm(sa, email, 'Good@2026');
    const cookie = await loginCookie(email, 'Good@2026');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'Wrong@2026', newPassword: 'NewOne@2026' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorrect/i);
  });

  it('rejects change-password without auth cookie', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'a', newPassword: 'b' });
    expect(res.status).toBe(401);
  });

  it('rejects change when new password is too short', async () => {
    const sa = await saCookie();
    const email = 'chgshort@test.local';
    await createAndConfirm(sa, email, 'Good@2026');
    const cookie = await loginCookie(email, 'Good@2026');

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'Good@2026', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/i);
  });
});

// ── /api/auth/me ─────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('returns user info for authenticated company', async () => {
    const sa = await saCookie();
    await createAndConfirm(sa, 'me@test.local', 'MePass@2026');
    const cookie = await loginCookie('me@test.local', 'MePass@2026');

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@test.local');
    expect(res.body.user.companyName).toBe('PW Co');
    expect(res.body.user.creditsBalance).toBeDefined();
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ── /api/auth/logout ─────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  it('clears the cookie and returns success', async () => {
    const sa = await saCookie();
    await createAndConfirm(sa, 'out@test.local', 'OutPass@2026');
    const cookie = await loginCookie('out@test.local', 'OutPass@2026');

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Cookie cleared — /me should now 401
    const me = await request(app).get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});

// ── Email confirmation edge cases ────────────────────────────
describe('email confirmation edge cases', () => {
  it('expired confirmation token returns 400 expired', async () => {
    const sa = await saCookie();
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Exp', email: 'exp@test.local', password: 'ExpPass@2026' });

    // Manually expire the token
    await db.execute(
      `UPDATE companies SET confirmation_token_expires_at = NOW() - INTERVAL '1 hour' WHERE email = $1`,
      ['exp@test.local']
    );
    const { confirmation_token: token } = await db.getOne(
      'SELECT confirmation_token FROM companies WHERE email = $1', ['exp@test.local']
    );
    const res = await request(app).get(`/api/auth/confirm/${token}`);
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('expired');
  });

  it('already-confirmed token returns ok + alreadyConfirmed flag', async () => {
    const sa = await saCookie();
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Dup', email: 'dup@test.local', password: 'DupPass@2026' });

    const { confirmation_token: token } = await db.getOne(
      'SELECT confirmation_token FROM companies WHERE email = $1', ['dup@test.local']
    );
    // Confirm once
    await request(app).get(`/api/auth/confirm/${token}`);
    // Token is now cleared, so second call should get 'invalid'
    const res2 = await request(app).get(`/api/auth/confirm/${token}`);
    expect(res2.status).toBe(400);
    expect(res2.body.reason).toBe('invalid');
  });
});
