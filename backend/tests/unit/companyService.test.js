const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');

const companyService = require('../../src/services/companyService');
const authService = require('../../src/services/authService');
const db = require('../../src/services/pgService');

beforeAll(setupTestDb);
beforeEach(async () => {
  await truncateAll();
  // Clear in-memory cache between tests
  companyService.invalidateEmailCache();
});
afterAll(closeTestDb);

async function seedCompany(email = 'acme@test.local') {
  const hash = await authService.hashPassword('Test@2026');
  const { rows } = await db.query(
    `INSERT INTO companies (company_name, email, password_hash, confirmed, is_active)
     VALUES ('Acme', $1, $2, TRUE, TRUE) RETURNING id`,
    [email, hash]
  );
  return rows[0].id;
}

describe('companyService.getCompanyIdByEmail', () => {
  it('returns null for null/undefined/empty input', async () => {
    expect(await companyService.getCompanyIdByEmail(null)).toBeNull();
    expect(await companyService.getCompanyIdByEmail(undefined)).toBeNull();
    expect(await companyService.getCompanyIdByEmail('')).toBeNull();
  });

  it('returns the company id for a known email', async () => {
    const id = await seedCompany('lookup@test.local');
    const result = await companyService.getCompanyIdByEmail('lookup@test.local');
    expect(result).toBe(id);
  });

  it('is case-insensitive and trims whitespace', async () => {
    const id = await seedCompany('mixed@test.local');
    expect(await companyService.getCompanyIdByEmail('  MIXED@Test.Local  ')).toBe(id);
  });

  it('returns null for an unknown email', async () => {
    expect(await companyService.getCompanyIdByEmail('ghost@test.local')).toBeNull();
  });

  it('caches the result on second call (no extra DB hit)', async () => {
    const id = await seedCompany('cached@test.local');
    // First call — hits DB
    expect(await companyService.getCompanyIdByEmail('cached@test.local')).toBe(id);
    // Spy on DB after cache is warm
    const spy = vi.spyOn(db, 'getOne');
    expect(await companyService.getCompanyIdByEmail('cached@test.local')).toBe(id);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('companyService.getCompanyById', () => {
  it('returns null for null/undefined', async () => {
    expect(await companyService.getCompanyById(null)).toBeNull();
    expect(await companyService.getCompanyById(undefined)).toBeNull();
  });

  it('returns the company row for a valid id', async () => {
    const id = await seedCompany('byid@test.local');
    const co = await companyService.getCompanyById(id);
    expect(co).not.toBeNull();
    expect(co.email).toBe('byid@test.local');
    expect(co.company_name).toBe('Acme');
    expect(co.confirmed).toBe(true);
    expect(co.is_active).toBe(true);
  });

  it('returns null for a non-existent id', async () => {
    expect(await companyService.getCompanyById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('companyService.invalidateEmailCache', () => {
  it('clears a specific email from cache', async () => {
    const id = await seedCompany('inv@test.local');
    await companyService.getCompanyIdByEmail('inv@test.local'); // warm cache

    companyService.invalidateEmailCache('inv@test.local');

    // Next call should hit DB again
    const spy = vi.spyOn(db, 'getOne');
    await companyService.getCompanyIdByEmail('inv@test.local');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('clears entire cache when called with no argument', async () => {
    await seedCompany('a@test.local');
    await seedCompany('b@test.local');
    await companyService.getCompanyIdByEmail('a@test.local');
    await companyService.getCompanyIdByEmail('b@test.local');

    companyService.invalidateEmailCache(); // clear all

    const spy = vi.spyOn(db, 'getOne');
    await companyService.getCompanyIdByEmail('a@test.local');
    await companyService.getCompanyIdByEmail('b@test.local');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
