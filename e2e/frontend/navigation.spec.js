const { test, expect } = require('@playwright/test');

test.describe('Frontend — Navigation & Routing', () => {
  test('homepage loads and shows upload zone', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Spare Parts/);
    await expect(page.getByText('Drop your Excel file here')).toBeVisible();
  });

  test('docs page loads with documentation', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Documentation')).toBeVisible();
    await expect(page.getByText('Output Columns')).toBeVisible();
  });

  test('header Docs link navigates to docs page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Docs' }).click();
    await expect(page.getByText('Documentation')).toBeVisible({ timeout: 5000 });
  });

  test('download button hidden on initial load', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Download Excel' })).toHaveCount(0);
  });

  test('dark theme applied to body', async ({ page }) => {
    await page.goto('/');
    const bgColor = await page.evaluate(() => {
      return getComputedStyle(document.body).backgroundColor;
    });
    // bg-bg-primary is #0b0e14 = rgb(11, 14, 20)
    expect(bgColor).toContain('11');
  });
});
