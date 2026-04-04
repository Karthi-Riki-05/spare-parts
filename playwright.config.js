const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

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
