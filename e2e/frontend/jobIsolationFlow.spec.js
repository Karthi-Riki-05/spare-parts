const { test, expect } = require('@playwright/test');
const {
  BACKEND,
  apiSuperAdminLogin,
  apiCreateCompany,
  apiConfirmCompany,
  uniqueEmail,
} = require('./_helpers');

async function companyLogin(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
}

async function apiLoginAndGetCookie(request, email, password) {
  const res = await request.post(`${BACKEND}/api/auth/login`, {
    data: { email, password },
  });
  expect(res.ok(), `company login failed: ${res.status()}`).toBeTruthy();
  return res;
}

test.describe('Multi-tenant job isolation', () => {
  test('company A cannot access company B jobs', async ({ page, request }) => {
    await apiSuperAdminLogin(request);

    const emailA = uniqueEmail('isoA');
    const emailB = uniqueEmail('isoB');
    const password = 'IsolationTest@2026';

    await apiCreateCompany(request, { company_name: 'Co A', email: emailA, password });
    await apiCreateCompany(request, { company_name: 'Co B', email: emailB, password });
    await apiConfirmCompany(request, emailA);
    await apiConfirmCompany(request, emailB);

    // Login as company A and create a job via API
    const ctxA = await request.newContext();
    await apiLoginAndGetCookie(ctxA, emailA, password);

    const submitRes = await ctxA.post(`${BACKEND}/api/jobs/submit`, {
      data: {
        rows: [{ internalItemNumber: 'A-1', description: 'ISO A test' }],
        fileName: 'iso-a.xlsx',
      },
    });
    expect([200, 201]).toContain(submitRes.status());
    const submitBody = await submitRes.json();
    const jobIdA = submitBody.jobId || submitBody.job_id || submitBody.id;
    expect(jobIdA).toBeTruthy();

    // Login as company B in same browser
    await companyLogin(page, emailB, password);

    // Company B hits /api/jobs/:idA/status → 404
    const crossRes = await page.request.get(`${BACKEND}/api/jobs/${jobIdA}/status`);
    expect([403, 404]).toContain(crossRes.status());

    // Company B job list does NOT contain job A
    const listRes = await page.request.get(`${BACKEND}/api/jobs`);
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    const jobs = list.jobs || list.data || [];
    const ids = jobs.map((j) => j.jobId || j.job_id || j.id);
    expect(ids).not.toContain(jobIdA);

    await ctxA.dispose();
  });
});
