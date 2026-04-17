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

test.describe('Password change flow', () => {
  test('change password, logout, login with new password, old password rejected', async ({ page, request }) => {
    await apiSuperAdminLogin(request);
    const email = uniqueEmail('pw');
    const oldPassword = 'Initial@2026';
    const newPassword = 'Rotated@2026!';

    await apiCreateCompany(request, {
      company_name: 'Password Co',
      email,
      password: oldPassword,
    });
    await apiConfirmCompany(request, email);

    // Login with initial password
    await companyLogin(page, email, oldPassword);

    // Go to /profile
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /Profile/i })).toBeVisible();

    // Change password
    await page.getByLabel('Current password').fill(oldPassword);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: /Save password/i }).click();
    await expect(page.getByText(/updated/i)).toBeVisible({ timeout: 10000 });

    // Logout
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.waitForURL('**/login**');

    // Login with new password works
    await companyLogin(page, email, newPassword);
    expect(page.url()).not.toMatch(/\/login/);

    // Logout again
    await page.goto('/profile');
    await page.getByRole('button', { name: /Sign out/i }).click();
    await page.waitForURL('**/login**');

    // Login with old password fails
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(oldPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 10000 });
  });
});
