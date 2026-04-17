const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');

const audit = require('../../src/services/auditService');
const db = require('../../src/services/pgService');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

describe('auditService.log', () => {
  it('inserts a row with the given action + details', async () => {
    await audit.log('company_login', {
      companyId: null,
      details: { email: 'a@b.c' },
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });
    const row = await db.getOne('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1');
    expect(row.action).toBe('company_login');
    expect(row.ip_address).toBe('127.0.0.1');
    expect(row.user_agent).toBe('vitest');
    expect(row.details).toEqual({ email: 'a@b.c' });
  });

  it('works with super_admin_id set and company_id null', async () => {
    // Seed a super admin we can reference
    const { rows } = await db.query(
      `INSERT INTO super_admins (email, password_hash) VALUES ($1, 'hash') RETURNING id`,
      ['sa-test@audit.local']
    );
    await audit.log('super_admin_login', { superAdminId: rows[0].id });
    // Query by the FK we set so we don't pick up unrelated rows.
    const row = await db.getOne(
      'SELECT * FROM audit_logs WHERE super_admin_id = $1 ORDER BY created_at DESC LIMIT 1',
      [rows[0].id]
    );
    expect(row).not.toBeNull();
    expect(row.action).toBe('super_admin_login');
    expect(row.company_id).toBeNull();
  });

  it('NEVER throws — DB errors are swallowed', async () => {
    // Temporarily break the execute call
    const spy = vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('boom'));
    await expect(audit.log('whatever', {})).resolves.not.toThrow();
    spy.mockRestore();
  });
});

describe('auditService.reqMeta', () => {
  it('extracts ip and user-agent from an Express-like request', () => {
    const mockReq = {
      ip: '10.0.0.5',
      get: (h) => (h.toLowerCase() === 'user-agent' ? 'curl/8.0' : null),
    };
    expect(audit.reqMeta(mockReq)).toEqual({ ipAddress: '10.0.0.5', userAgent: 'curl/8.0' });
  });

  it('returns nulls when req is missing fields', () => {
    expect(audit.reqMeta({})).toEqual({ ipAddress: null, userAgent: null });
    expect(audit.reqMeta(null)).toEqual({ ipAddress: null, userAgent: null });
  });
});
