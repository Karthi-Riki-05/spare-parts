const request = require('supertest');
const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');
const db = require('../../src/services/pgService');

// Import app AFTER the helper set NODE_ENV=test (so server.listen is skipped).
const { app } = require('../../src/server');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

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

async function getConfirmationToken(email) {
  const row = await db.getOne(
    'SELECT confirmation_token FROM companies WHERE email = $1',
    [email]
  );
  return row && row.confirmation_token;
}

describe('multi-tenant flow', () => {
  it('super-admin login returns JWT cookie with super_admin role', async () => {
    const res = await request(app)
      .post('/api/super-admin/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('super_admin');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects super-admin login on wrong password', async () => {
    const res = await request(app)
      .post('/api/super-admin/login')
      .send({ email: process.env.SUPER_ADMIN_EMAIL, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('creates a company, blocks login until confirmed, then lets them in', async () => {
    const sa = await saCookie();

    // Create Company A
    const create = await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Acme', email: 'a@acme.test', password: 'AcmePass@2026' });
    expect(create.status).toBe(201);
    expect(create.body.company.confirmed).toBe(false);

    // Login blocked — unconfirmed
    const blocked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@acme.test', password: 'AcmePass@2026' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/not confirmed/i);

    // Confirm via token pulled from DB
    const token = await getConfirmationToken('a@acme.test');
    const conf = await request(app).get(`/api/auth/confirm/${token}`);
    expect(conf.status).toBe(200);
    expect(conf.body.ok).toBe(true);

    // Login now works
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@acme.test', password: 'AcmePass@2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe('a@acme.test');
  });

  it('deactivated company cannot log in', async () => {
    const sa = await saCookie();
    // Create + confirm
    const c = await request(app)
      .post('/api/super-admin/companies').set('Cookie', sa)
      .send({ company_name: 'Bolt', email: 'b@bolt.test', password: 'BoltPass@2026' });
    expect(c.status).toBe(201);
    const token = await getConfirmationToken('b@bolt.test');
    await request(app).get(`/api/auth/confirm/${token}`);

    // Deactivate
    const deact = await request(app)
      .patch(`/api/super-admin/companies/${c.body.company.id}`)
      .set('Cookie', sa)
      .send({ is_active: false, deactivation_reason: 'testing' });
    expect(deact.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'b@bolt.test', password: 'BoltPass@2026' });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/suspended/i);
  });

  it('company A cannot see company B\'s job (cross-tenant isolation)', async () => {
    const sa = await saCookie();

    // Create + confirm two companies
    for (const email of ['a@iso.test', 'b@iso.test']) {
      await request(app)
        .post('/api/super-admin/companies').set('Cookie', sa)
        .send({ company_name: `Co-${email}`, email, password: 'IsoPass@2026' });
      const tok = await getConfirmationToken(email);
      await request(app).get(`/api/auth/confirm/${tok}`);
    }

    // Login as A
    const loginA = await request(app)
      .post('/api/auth/login').send({ email: 'a@iso.test', password: 'IsoPass@2026' });
    const cookieA = extractCookie(loginA);

    // Manually insert a verification_jobs row for A to avoid kicking off the real verify pipeline
    const { rows } = await db.query(
      `SELECT id FROM companies WHERE email='a@iso.test'`
    );
    const companyAId = rows[0].id;
    const jobInsert = await db.getOne(
      `INSERT INTO verification_jobs (company_id, file_name, status, total_rows, processed_rows, job_type)
       VALUES ($1, 'iso.xlsx', 'completed', 0, 0, 'verify')
       RETURNING job_id`,
      [companyAId]
    );
    const jobId = jobInsert.job_id;

    // Login as B
    const loginB = await request(app)
      .post('/api/auth/login').send({ email: 'b@iso.test', password: 'IsoPass@2026' });
    const cookieB = extractCookie(loginB);

    // B requests A's job status — must be 404
    const crossB = await request(app).get(`/api/jobs/${jobId}/status`).set('Cookie', cookieB);
    expect(crossB.status).toBe(404);

    // A can see their own job
    const ownA = await request(app).get(`/api/jobs/${jobId}/status`).set('Cookie', cookieA);
    expect(ownA.status).toBe(200);
    expect(ownA.body.job.id).toBe(jobId);
  });

  it('audit log records company_created, company_confirmed, company_login', async () => {
    const sa = await saCookie();

    await request(app)
      .post('/api/super-admin/companies').set('Cookie', sa)
      .send({ company_name: 'Aud', email: 'a@aud.test', password: 'AudPass@2026' });
    const token = await getConfirmationToken('a@aud.test');
    await request(app).get(`/api/auth/confirm/${token}`);
    await request(app)
      .post('/api/auth/login').send({ email: 'a@aud.test', password: 'AudPass@2026' });

    const logs = await request(app)
      .get('/api/super-admin/audit-logs').set('Cookie', sa);
    const actions = logs.body.logs.map(l => l.action);
    expect(actions).toEqual(
      expect.arrayContaining(['company_created', 'company_confirmed', 'company_login', 'super_admin_login'])
    );
  });

  it('forgot-password returns the stock message for unknown emails', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'noone@nowhere.test' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email exists/i);
  });
});
