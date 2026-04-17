const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');

const authService = require('../../src/services/authService');
const db = require('../../src/services/pgService');
const { requireCompany, requireSuperAdmin, COOKIE_NAME } = require('../../src/middleware/authMiddleware');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

// ── Helpers ──────────────────────────────────────────────────
function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    cleared: false,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    clearCookie() { res.cleared = true; },
  };
  return res;
}

function mockReq(cookies = {}) {
  return { cookies };
}

async function seedCompany({ email = 'mw@test.local', confirmed = true, isActive = true } = {}) {
  const hash = await authService.hashPassword('x');
  const { rows } = await db.query(
    `INSERT INTO companies (company_name, email, password_hash, confirmed, is_active)
     VALUES ('MWCo', $1, $2, $3, $4) RETURNING id`,
    [email, hash, confirmed, isActive]
  );
  return rows[0].id;
}

async function seedSuperAdmin(email = 'sa-mw@test.local') {
  const hash = await authService.hashPassword('x');
  const { rows } = await db.query(
    `INSERT INTO super_admins (email, password_hash) VALUES ($1, $2) RETURNING id`,
    [email, hash]
  );
  return rows[0].id;
}

// ── requireCompany ───────────────────────────────────────────
describe('requireCompany', () => {
  it('returns 401 when no cookie present', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid/tampered token', async () => {
    const req = mockReq({ [COOKIE_NAME]: 'garbage.token.here' });
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.cleared).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when token role is super_admin', async () => {
    const saId = await seedSuperAdmin();
    const token = authService.generateToken({ role: 'super_admin', super_admin_id: saId, email: 'sa@test.local' });
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/company access/i);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when company row is deleted', async () => {
    const id = await seedCompany();
    const token = authService.generateToken({ role: 'company', company_id: id, email: 'mw@test.local' });
    // Delete the company row
    await db.execute('DELETE FROM companies WHERE id = $1', [id]);
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 403 when company is not confirmed', async () => {
    const id = await seedCompany({ confirmed: false });
    const token = authService.generateToken({ role: 'company', company_id: id, email: 'mw@test.local' });
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/not confirmed/i);
  });

  it('returns 403 when company is suspended', async () => {
    const id = await seedCompany({ isActive: false });
    const token = authService.generateToken({ role: 'company', company_id: id, email: 'mw@test.local' });
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  it('calls next() and attaches req.company + req.user for a valid confirmed active company', async () => {
    const id = await seedCompany();
    const token = authService.generateToken({ role: 'company', company_id: id, email: 'mw@test.local' });
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireCompany(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.company.id).toBe(id);
    expect(req.company.email).toBe('mw@test.local');
    expect(req.user.companyId).toBe(id);
    expect(req.user.role).toBe('company');
  });
});

// ── requireSuperAdmin ────────────────────────────────────────
describe('requireSuperAdmin', () => {
  it('returns 401 when no cookie present', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    await requireSuperAdmin(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when token role is company', async () => {
    const id = await seedCompany();
    const token = authService.generateToken({ role: 'company', company_id: id, email: 'mw@test.local' });
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireSuperAdmin(req, res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/super admin/i);
  });

  it('returns 401 when super admin row is deleted', async () => {
    const id = await seedSuperAdmin('gone@test.local');
    const token = authService.generateToken({ role: 'super_admin', super_admin_id: id, email: 'gone@test.local' });
    await db.execute('DELETE FROM super_admins WHERE id = $1', [id]);
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireSuperAdmin(req, res, next);
    expect(res.statusCode).toBe(401);
  });

  it('calls next() and attaches req.superAdmin for a valid super admin', async () => {
    const id = await seedSuperAdmin('valid-sa@test.local');
    const token = authService.generateToken({ role: 'super_admin', super_admin_id: id, email: 'valid-sa@test.local' });
    const req = mockReq({ [COOKIE_NAME]: token });
    const res = mockRes();
    const next = vi.fn();
    await requireSuperAdmin(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.superAdmin.id).toBe(id);
    expect(req.superAdmin.email).toBe('valid-sa@test.local');
  });
});
