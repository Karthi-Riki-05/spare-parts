const { test, expect } = require('@playwright/test');
const {
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

test.describe('Profile page', () => {
  test('displays company info and allows logout', async ({ page, request }) => {
    await apiSuperAdminLogin(request);
    const email = uniqueEmail('profile');
    const password = 'Profile@2026';

    await apiCreateCompany(request, {
      company_name: 'Profile Co',
      email,
      password,
    });
    await apiConfirmCompany(request, email);
    await companyLogin(page, email, password);

    // Navigate to profile
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /Profile/i })).toBeVisible();

    // Company info visible
    await expect(page.getByText('Profile Co')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Logout
    await page.getByRole('button', { name: /Sign out|Logout/i }).click();
    await page.waitForURL('**/login**', { timeout: 10000 });
    // Should show logout banner
    await expect(
      page.getByText(/logged out|signed out/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('redirects to /login when not authenticated', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForURL('**/login**', { timeout: 10000 });
  });
});
