const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

// Load backend .env so SUPER_ADMIN_EMAIL/PASSWORD are available to test helpers
// without requiring manual env var exports before running playwright.
try {
  const fs = require('fs');
  const envFile = fs.readFileSync(path.join(__dirname, 'backend/.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // backend/.env not readable — env vars must be set externally
}

module.exports = defineConfig({
  timeout: 30000,
  retries: 1,
  workers: 1,

  projects: [
    // ── Backend EJS UI (port 3001) ──────────────────────
    {
      name: 'Backend EJS - Desktop',
      testDir: path.resolve(__dirname, 'e2e'),
      testMatch: /^(?!.*\/frontend\/).*\.spec\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3001',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
      },
    },

    // ── Next.js Frontend (port 3000) ────────────────────
    {
      name: 'Frontend Next.js - Desktop',
      testDir: path.resolve(__dirname, 'e2e/frontend'),
      testMatch: /.*\.spec\.js$/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
      },
    },
    {
      name: 'Frontend Next.js - Mobile',
      testDir: path.resolve(__dirname, 'e2e/frontend'),
      testMatch: /.*\.spec\.js$/,
      use: {
        ...devices['iPhone 12'],
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
      },
    },
  ],

  webServer: [
    {
      command: 'cd backend && MOCK_MODE=true RATE_LIMIT_MAX=10000 node src/server.js',
      cwd: __dirname,
      port: 3001,
      timeout: 15000,
      reuseExistingServer: true,
      env: { MOCK_MODE: 'true', RATE_LIMIT_MAX: '10000' },
    },
    {
      command: 'cd frontend && npx next dev -p 3000',
      cwd: __dirname,
      port: 3000,
      timeout: 30000,
      reuseExistingServer: true,
    },
  ],
});
