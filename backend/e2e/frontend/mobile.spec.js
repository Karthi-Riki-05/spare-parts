const { test, expect } = require('@playwright/test');

test.describe('Frontend — Mobile Responsive', () => {
  test('shows upload area on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Drop your Excel file here')).toBeVisible();
  });

  test('shows header with title on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Spare Parts Web Verifier' })).toBeVisible();
  });

  test('docs page renders on mobile', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Documentation')).toBeVisible();
    await expect(page.getByText('How It Works')).toBeVisible();
    await expect(page.getByText('Score Guide')).toBeVisible();
    await expect(page.getByText('Supported Formats')).toBeVisible();
  });

  test('docs page shows score color guide', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText(/90.*100/)).toBeVisible();
  });

  test('navigation: back link on docs page', async ({ page }) => {
    await page.goto('/docs');
    const backLink = page.getByRole('link', { name: /Back to Verifier/ });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page.getByText('Drop your Excel file here')).toBeVisible({ timeout: 5000 });
  });
});
