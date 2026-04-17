const { test, expect } = require('@playwright/test');
const {
  apiSuperAdminLogin,
  apiCreateCompany,
  apiConfirmCompany,
  uniqueEmail,
} = require('./_helpers');

test.describe('Company login flow', () => {
  test('unconfirmed company cannot login, confirmed company can', async ({ page, request }) => {
    await apiSuperAdminLogin(request);
    const email = uniqueEmail('login');
    const password = 'Login@2026';
    await apiCreateCompany(request, {
      company_name: 'Login Co',
      email,
      password,
    });

    // Login as unconfirmed → error
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByText(/not confirmed/i)).toBeVisible({ timeout: 10000 });

    // Confirm company via API
    await apiConfirmCompany(request, email);

    // Retry login → redirects to /
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test('wrong password shows invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@e2e.local');
    await page.getByLabel('Password').fill('wrong-pass-123');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByText(/invalid credentials|invalid/i)).toBeVisible({ timeout: 10000 });
  });
});
