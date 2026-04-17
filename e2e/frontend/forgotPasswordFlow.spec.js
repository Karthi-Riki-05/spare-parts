const { test, expect } = require('@playwright/test');
const {
  BACKEND,
  apiSuperAdminLogin,
  apiCreateCompany,
  apiConfirmCompany,
  apiGetCompanyTokens,
  uniqueEmail,
} = require('./_helpers');

test.describe('Forgot / Reset password UI flow', () => {
  test('submit forgot-password form, get token from dev API, reset via UI, login with new password', async ({
    page,
    request,
  }) => {
    // Setup: create and confirm a company
    await apiSuperAdminLogin(request);
    const email = uniqueEmail('forgot');
    const oldPassword = 'ForgotOld@2026';
    const newPassword = 'ForgotNew@2026';

    await apiCreateCompany(request, {
      company_name: 'Forgot Co',
      email,
      password: oldPassword,
    });
    await apiConfirmCompany(request, email);

    // 1. Visit /forgot-password
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: /forgot|reset/i })).toBeVisible();

    // 2. Submit the email
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: /send|reset|submit/i }).click();

    // 3. Should see stock success message
    await expect(
      page.getByText(/if that email exists|reset link|check your email/i)
    ).toBeVisible({ timeout: 10000 });

    // 4. Grab the reset token from the dev API
    const tokenRes = await request.get(
      `${BACKEND}/api/dev/company-token?email=${encodeURIComponent(email)}`
    );
    expect(tokenRes.ok()).toBeTruthy();
    const { password_reset_token } = (await tokenRes.json()).company;
    expect(password_reset_token).toBeTruthy();

    // 5. Visit /reset-password/:token
    await page.goto(`/reset-password/${password_reset_token}`);
    await expect(
      page.getByRole('heading', { name: /reset|new password/i })
    ).toBeVisible();

    // 6. Fill new password + confirm
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm').fill(newPassword);
    await page.getByRole('button', { name: /reset|save|submit/i }).click();

    // 7. Should redirect to /login with ?reset=true or show success
    await page.waitForURL('**/login**', { timeout: 10000 });
    await expect(
      page.getByText(/reset|updated|changed|success/i)
    ).toBeVisible({ timeout: 5000 });

    // 8. Login with new password
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(newPassword);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test('forgot-password shows same message for unknown email (no info leak)', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nonexistent-nobody@e2e.local');
    await page.getByRole('button', { name: /send|reset|submit/i }).click();
    await expect(
      page.getByText(/if that email exists|reset link|check your email/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
