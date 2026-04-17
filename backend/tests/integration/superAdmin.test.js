/**
 * Integration tests for super-admin routes — company CRUD, dashboard stats,
 * audit logs, resend confirmation.
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
  return res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
}

// ── Company CRUD ─────────────────────────────────────────────
describe('super-admin company management', () => {
  it('creates a company and lists it', async () => {
    const sa = await saCookie();

    const create = await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'List Co', email: 'list@test.local', password: 'ListPass@2026' });
    expect(create.status).toBe(201);
    expect(create.body.company.email).toBe('list@test.local');
    expect(create.body.company.confirmed).toBe(false);

    const list = await request(app)
      .get('/api/super-admin/companies')
      .set('Cookie', sa);
    expect(list.status).toBe(200);
    // Should include the newly created company + the seeded default company
    const emails = list.body.companies.map(c => c.email);
    expect(emails).toContain('list@test.local');
  });

  it('rejects duplicate email', async () => {
    const sa = await saCookie();
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Dup1', email: 'dup@test.local', password: 'DupPass@2026' });

    const res = await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Dup2', email: 'dup@test.local', password: 'DupPass@2026' });
    expect(res.status).toBe(409);
  });

  it('gets company detail with stats', async () => {
    const sa = await saCookie();
    const create = await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Detail Co', email: 'detail@test.local', password: 'Detail@2026' });
    const companyId = create.body.company.id;

    const detail = await request(app)
      .get(`/api/super-admin/companies/${companyId}`)
      .set('Cookie', sa);
    expect(detail.status).toBe(200);
    expect(detail.body.company.email).toBe('detail@test.local');
    expect(detail.body.stats).toBeDefined();
    expect(detail.body.stats.jobCount).toBe(0);
  });

  it('patches company name and active status', async () => {
    const sa = await saCookie();
    const create = await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Old Name', email: 'patch@test.local', password: 'Patch@2026' });
    const companyId = create.body.company.id;

    // Rename
    const rename = await request(app)
      .patch(`/api/super-admin/companies/${companyId}`)
      .set('Cookie', sa)
      .send({ company_name: 'New Name' });
    expect(rename.status).toBe(200);
    expect(rename.body.company.company_name).toBe('New Name');

    // Deactivate
    const deact = await request(app)
      .patch(`/api/super-admin/companies/${companyId}`)
      .set('Cookie', sa)
      .send({ is_active: false, deactivation_reason: 'test suspension' });
    expect(deact.status).toBe(200);
    expect(deact.body.company.is_active).toBe(false);

    // Reactivate
    const react = await request(app)
      .patch(`/api/super-admin/companies/${companyId}`)
      .set('Cookie', sa)
      .send({ is_active: true });
    expect(react.status).toBe(200);
    expect(react.body.company.is_active).toBe(true);
  });
});

// ── Resend confirmation ──────────────────────────────────────
describe('resend confirmation', () => {
  it('generates a new confirmation token', async () => {
    const sa = await saCookie();
    const create = await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Resend Co', email: 'resend@test.local', password: 'Resend@2026' });
    const companyId = create.body.company.id;

    const oldToken = (await db.getOne(
      'SELECT confirmation_token FROM companies WHERE id = $1', [companyId]
    )).confirmation_token;

    const res = await request(app)
      .post(`/api/super-admin/companies/${companyId}/resend-confirmation`)
      .set('Cookie', sa);
    expect(res.status).toBe(200);

    const newToken = (await db.getOne(
      'SELECT confirmation_token FROM companies WHERE id = $1', [companyId]
    )).confirmation_token;
    expect(newToken).not.toBeNull();
    expect(newToken).not.toBe(oldToken);
  });
});

// ── Dashboard stats ──────────────────────────────────────────
describe('dashboard stats', () => {
  it('returns company and job counts', async () => {
    const sa = await saCookie();
    // Create two companies
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Stats A', email: 'sa@test.local', password: 'Stats@2026' });
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Stats B', email: 'sb@test.local', password: 'Stats@2026' });

    const res = await request(app)
      .get('/api/super-admin/dashboard-stats')
      .set('Cookie', sa);
    expect(res.status).toBe(200);
    expect(res.body.companies).toBeDefined();
    // At least the 2 created + the seeded default company
    expect(res.body.companies.total_companies).toBeGreaterThanOrEqual(2);
    expect(res.body.jobs).toBeDefined();
    expect(res.body.jobs.jobs_total).toBeDefined();
  });
});

// ── Audit logs ───────────────────────────────────────────────
describe('audit logs via super admin', () => {
  it('returns audit logs filtered by action', async () => {
    const sa = await saCookie();
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Audit Co', email: 'audit@test.local', password: 'Audit@2026' });

    const res = await request(app)
      .get('/api/super-admin/audit-logs?action=company_created')
      .set('Cookie', sa);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
    expect(res.body.logs.every(l => l.action === 'company_created')).toBe(true);
  });

  it('respects limit and offset', async () => {
    const sa = await saCookie();

    const res = await request(app)
      .get('/api/super-admin/audit-logs?limit=2&offset=0')
      .set('Cookie', sa);
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeLessThanOrEqual(2);
    expect(res.body.limit).toBe(2);
    expect(res.body.offset).toBe(0);
  });
});

// ── Auth guards ──────────────────────────────────────────────
describe('super admin auth guards', () => {
  it('all SA routes return 401 without cookie', async () => {
    const routes = [
      ['GET', '/api/super-admin/me'],
      ['GET', '/api/super-admin/companies'],
      ['GET', '/api/super-admin/dashboard-stats'],
      ['GET', '/api/super-admin/audit-logs'],
    ];
    for (const [method, path] of routes) {
      const res = await request(app)[method.toLowerCase()](path);
      expect(res.status).toBe(401);
    }
  });

  it('company cookie cannot access super admin routes', async () => {
    const sa = await saCookie();
    await request(app)
      .post('/api/super-admin/companies')
      .set('Cookie', sa)
      .send({ company_name: 'Guard Co', email: 'guard@test.local', password: 'Guard@2026' });
    // Confirm it
    const token = (await db.getOne(
      'SELECT confirmation_token FROM companies WHERE email = $1', ['guard@test.local']
    )).confirmation_token;
    await request(app).get(`/api/auth/confirm/${token}`);

    // Login as company
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'guard@test.local', password: 'Guard@2026' });
    const companyCookie = login.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');

    // Try super admin endpoint
    const res = await request(app)
      .get('/api/super-admin/companies')
      .set('Cookie', companyCookie);
    expect(res.status).toBe(403);
  });
});
