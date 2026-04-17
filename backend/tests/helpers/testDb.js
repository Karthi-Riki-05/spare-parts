/**
 * Test DB helpers. Assumes:
 *   - A separate PostgreSQL database named `spareparts_test` exists and is
 *     reachable via DATABASE_URL (set in test env).
 *   - Migrations are applied at first connect; subsequent tests truncate all
 *     app tables between runs for isolation.
 *
 * Usage:
 *   import { setupTestDb, truncateAll, closeTestDb } from '../helpers/testDb';
 *   beforeAll(setupTestDb);
 *   beforeEach(truncateAll);
 *   afterAll(closeTestDb);
 */

const path = require('path');

// Force NODE_ENV=test + test DATABASE_URL BEFORE requiring config/server.
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://spare_partner_user:SuperAdmin%402026@localhost:5433/spareparts_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'super@test.local';
process.env.SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'SuperTest@2026';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.local';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminTest@2026';
// Skip email + mock AI for speed
process.env.SMTP_HOST = '';
process.env.MOCK_MODE = 'true';
process.env.GEMINI_API_KEY = 'test-key';
// Silence routine migration logs
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

// App tables whose data we wipe between tests. schema_migrations is preserved.
const APP_TABLES = [
  'audit_logs',
  'ai_errors',
  'job_results',
  'verification_jobs',
  'verification_cache',
  'companies',
  'super_admins',
];

async function setupTestDb() {
  const { runMigrations } = require('../../src/migrations/run');
  await runMigrations();
}

async function truncateAll() {
  const pool = require('../../src/config/database');
  // Disable FK checks implicitly via CASCADE
  await pool.query(`TRUNCATE TABLE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  // Re-seed super_admin + default_company by re-running the Node seeders.
  const { runMigrations } = require('../../src/migrations/run');
  await runMigrations();
}

async function closeTestDb() {
  const pool = require('../../src/config/database');
  await pool.end();
}

module.exports = { setupTestDb, truncateAll, closeTestDb, APP_TABLES };
