const { test, expect } = require('@playwright/test');
const {
  apiSuperAdminLogin,
  apiCreateCompany,
  apiGetCompanyTokens,
  uniqueEmail,
} = require('./_helpers');

test.describe('Email confirmation flow', () => {
  test('create company → visit confirm URL → confirmed in DB', async ({ page, request }) => {
    await apiSuperAdminLogin(request);

    const email = uniqueEmail('confirm');
    const company = await apiCreateCompany(request, {
      company_name: 'Confirm Co',
      email,
      password: 'Confirm@2026',
    });
    expect(company).toBeTruthy();
    expect(company.confirmed).toBe(false);

    const before = await apiGetCompanyTokens(request, email);
    expect(before.confirmation_token).toBeTruthy();

    await page.goto(`/confirm-email/${before.confirmation_token}`);
    await expect(
      page.getByText(/confirmed|ready|Login now|Sign in/i)
    ).toBeVisible({ timeout: 10000 });

    const after = await apiGetCompanyTokens(request, email);
    expect(after.confirmed).toBe(true);
    expect(after.confirmation_token).toBeNull();
  });

  test('invalid confirmation token shows error', async ({ page }) => {
    await page.goto('/confirm-email/00000000-0000-0000-0000-000000000000');
    await expect(
      page.getByText(/invalid|expired|not found/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
