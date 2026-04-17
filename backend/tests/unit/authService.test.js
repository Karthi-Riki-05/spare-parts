const { setupTestDb, truncateAll, closeTestDb } = require('../helpers/testDb');

const authService = require('../../src/services/authService');
const db = require('../../src/services/pgService');

beforeAll(setupTestDb);
beforeEach(truncateAll);
afterAll(closeTestDb);

describe('authService — password helpers', () => {
  it('hashPassword returns a bcrypt-shaped string', async () => {
    const hash = await authService.hashPassword('s3cret!');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(hash.length).toBe(60);
  });

  it('verifyPassword accepts the correct password', async () => {
    const hash = await authService.hashPassword('HelloWorld@2026');
    expect(await authService.verifyPassword('HelloWorld@2026', hash)).toBe(true);
  });

  it('verifyPassword rejects the wrong password', async () => {
    const hash = await authService.hashPassword('HelloWorld@2026');
    expect(await authService.verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('authService — JWT helpers', () => {
  it('generateToken + verifyToken round-trip with the same payload', () => {
    const token = authService.generateToken({ role: 'company', company_id: 'abc', email: 'x@y.z' });
    const decoded = authService.verifyToken(token);
    expect(decoded.role).toBe('company');
    expect(decoded.company_id).toBe('abc');
    expect(decoded.email).toBe('x@y.z');
    // exp claim should be present and in the future
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('verifyToken throws on a tampered token', () => {
    const token = authService.generateToken({ role: 'company', company_id: 'a', email: 'e' });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(() => authService.verifyToken(tampered)).toThrow();
  });
});

describe('authService — confirmation/reset tokens', () => {
  it('generateConfirmationToken returns a UUID v4', () => {
    const t = authService.generateConfirmationToken();
    expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generatePasswordResetToken returns a UUID v4', () => {
    const t = authService.generatePasswordResetToken();
    expect(t).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('confirmationExpiryDate is in the future (~72h)', () => {
    const d = authService.confirmationExpiryDate();
    const hoursFromNow = (d.getTime() - Date.now()) / 3600000;
    expect(hoursFromNow).toBeGreaterThan(71.9);
    expect(hoursFromNow).toBeLessThan(72.1);
  });

  it('passwordResetExpiryDate is ~60 minutes out', () => {
    const d = authService.passwordResetExpiryDate();
    const minsFromNow = (d.getTime() - Date.now()) / 60000;
    expect(minsFromNow).toBeGreaterThan(59.9);
    expect(minsFromNow).toBeLessThan(60.1);
  });
});

describe('authService — DB lookups', () => {
  it('findCompanyByEmail is case-insensitive and trims', async () => {
    const hash = await authService.hashPassword('x');
    await db.execute(
      `INSERT INTO companies (company_name, email, password_hash, confirmed)
       VALUES ($1, $2, $3, TRUE)`,
      ['Acme', 'acme@example.com', hash]
    );
    expect(await authService.findCompanyByEmail('  ACME@Example.COM ')).not.toBeNull();
    expect(await authService.findCompanyByEmail('unknown@example.com')).toBeNull();
  });

  it('touchCompanyLogin updates last_login_at', async () => {
    const hash = await authService.hashPassword('x');
    const { rows } = await db.query(
      `INSERT INTO companies (company_name, email, password_hash, confirmed)
       VALUES ('X','x@x.io',$1,TRUE) RETURNING id`,
      [hash]
    );
    const id = rows[0].id;
    expect((await authService.findCompanyById(id)).last_login_at).toBeNull();
    await authService.touchCompanyLogin(id);
    expect((await authService.findCompanyById(id)).last_login_at).not.toBeNull();
  });
});
