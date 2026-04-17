const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { config } = require('../config');
const { logger } = require('../utils/logger');

const MIGRATIONS_DIR = __dirname;
const BCRYPT_ROUNDS = 12;

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function appliedMigrations(client) {
  const { rows } = await client.query('SELECT name FROM schema_migrations ORDER BY name');
  return new Set(rows.map(r => r.name));
}

async function applySqlMigrations(client) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  const already = await appliedMigrations(client);

  for (const file of files) {
    if (already.has(file)) {
      logger.info(`[MIGRATE] skip  ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    logger.info(`[MIGRATE] apply ${file}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`[MIGRATE] FAILED ${file}: ${err.message}`);
      throw err;
    }
  }
}

async function seedSuperAdmin(client) {
  const email = (config.superAdminEmail || '').trim().toLowerCase();
  const password = config.superAdminPassword;

  if (!email || !password) {
    logger.warn('[MIGRATE] SUPER_ADMIN_EMAIL/PASSWORD not set — skipping seed');
    return;
  }

  const { rows } = await client.query(
    'SELECT id FROM super_admins WHERE email = $1',
    [email]
  );
  if (rows.length > 0) {
    logger.info(`[MIGRATE] super admin ${email} already exists — skipping seed`);
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await client.query(
    'INSERT INTO super_admins (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [email, hash]
  );
  logger.info(`[MIGRATE] seeded super admin: ${email}`);
}

/**
 * P2 bridge: the legacy single-admin auth has no companies table, but
 * verification_jobs.company_id is NOT NULL. We seed a "default company" keyed
 * off ADMIN_EMAIL so legacy admin activity can own rows. P3 supersedes this
 * with real company signup / creation via the super-admin portal.
 */
async function seedDefaultCompany(client) {
  const email = (config.adminEmail || '').trim().toLowerCase();
  const password = config.adminPassword;

  if (!email || !password) {
    logger.warn('[MIGRATE] ADMIN_EMAIL/PASSWORD not set — skipping default company seed');
    return;
  }

  const { rows } = await client.query(
    'SELECT id FROM companies WHERE email = $1',
    [email]
  );
  if (rows.length > 0) {
    logger.info(`[MIGRATE] default company ${email} already exists — skipping seed`);
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await client.query(`
    INSERT INTO companies (
      company_name, email, password_hash,
      confirmed, confirmed_at, is_active
    ) VALUES ($1, $2, $3, TRUE, NOW(), TRUE)
    ON CONFLICT (email) DO NOTHING
  `, ['Default (legacy admin)', email, hash]);
  logger.info(`[MIGRATE] seeded default company: ${email}`);
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    await applySqlMigrations(client);
    await seedSuperAdmin(client);
    await seedDefaultCompany(client);
    logger.info('[MIGRATE] done');
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };

// Allow `node src/migrations/run.js` standalone invocation for local dev / CI
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch(err => {
      logger.error(`[MIGRATE] fatal: ${err.message}`);
      process.exit(1);
    });
}
