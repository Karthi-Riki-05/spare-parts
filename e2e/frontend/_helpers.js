const { expect } = require('@playwright/test');

const BACKEND = process.env.E2E_BACKEND_URL || 'http://localhost:3001';
const FRONTEND = process.env.E2E_FRONTEND_URL || 'http://localhost:3000';

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'change-me';

async function apiSuperAdminLogin(request) {
  const res = await request.post(`${BACKEND}/api/super-admin/login`, {
    data: { email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD },
  });
  expect(res.ok(), `super admin login failed: ${res.status()}`).toBeTruthy();
  return res;
}

async function apiCreateCompany(request, { company_name, email, password }) {
  const res = await request.post(`${BACKEND}/api/super-admin/companies`, {
    data: { company_name, email, password },
  });
  expect([201, 409]).toContain(res.status());
  if (res.status() === 409) return null;
  return (await res.json()).company;
}

async function apiGetCompanyTokens(request, email) {
  const res = await request.get(
    `${BACKEND}/api/dev/company-token?email=${encodeURIComponent(email)}`
  );
  expect(res.ok(), `dev/company-token failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.company;
}

async function apiConfirmCompany(request, email) {
  const info = await apiGetCompanyTokens(request, email);
  if (info.confirmed) return;
  const res = await request.get(
    `${BACKEND}/api/auth/confirm/${info.confirmation_token}`,
    { maxRedirects: 0 }
  );
  expect([200, 302, 303]).toContain(res.status());
}

function uniqueEmail(label = 'co') {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${label}-${Date.now()}-${rand}@e2e.local`;
}

module.exports = {
  BACKEND,
  FRONTEND,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  apiSuperAdminLogin,
  apiCreateCompany,
  apiGetCompanyTokens,
  apiConfirmCompany,
  uniqueEmail,
};
