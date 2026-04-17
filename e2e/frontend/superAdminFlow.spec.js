const { test, expect } = require('@playwright/test');
const {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASSWORD,
  uniqueEmail,
} = require('./_helpers');

test.describe('Super admin — create company flow', () => {
  test('login, open dashboard, add company, see it in list', async ({ page }) => {
    // 1. Navigate to /super-admin/login
    await page.goto('/super-admin/login');
    await expect(page.getByRole('heading', { name: /Super Admin/i })).toBeVisible();

    // 2. Login with correct credentials
    await page.getByLabel('Email').fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel('Password').fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Sign in/i }).click();

    // 3. Redirected to /super-admin/dashboard
    await page.waitForURL('**/super-admin/dashboard');
    await expect(page.getByRole('heading', { name: /Companies/i })).toBeVisible();

    // 4. Click "Add Company"
    await page.getByRole('link', { name: /Add Company/i }).click();
    await page.waitForURL('**/super-admin/companies/new');

    // 5. Fill company name, email, password
    const email = uniqueEmail('sa-flow');
    await page.getByLabel('Company name').fill('Playwright Co');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel(/Temporary password/i).fill('E2eTest@2026');

    // 6. Submit → redirects back to dashboard
    await page.getByRole('button', { name: /Create company/i }).click();
    await page.waitForURL('**/super-admin/dashboard');

    // 7. Company appears in list with Pending status
    const row = page.locator('tr', { hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByText(/Pending/i)).toBeVisible();
  });

  test('wrong super admin password shows error', async ({ page }) => {
    await page.goto('/super-admin/login');
    await page.getByLabel('Email').fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel('Password').fill('wrong-password-123');
    await page.getByRole('button', { name: /Sign in/i }).click();
    await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
  });
});
