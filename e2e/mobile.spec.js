const { test, expect } = require('@playwright/test');

test.describe('Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('shows upload area on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Upload your Excel file')).toBeVisible();
  });

  test('shows header on mobile', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.logo')).toBeVisible();
    await expect(page.locator('.app-title')).toBeVisible();
  });

  test('docs page renders on mobile', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByText('Documentation')).toBeVisible();
    await expect(page.getByText('Supported Excel Formats')).toBeVisible();
  });

  test('buttons have minimum touch target size', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('.btn-cyan').first();
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
    }
  });
});
