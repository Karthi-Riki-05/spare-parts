const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', '..', 'backend', 'tests', 'fixtures');

test.describe('Frontend — Excel Export (R14)', () => {
  test('downloads verified Excel after verification', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.getByRole('button', { name: 'Verify All' })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Verify All' }).click();
    await expect(page.getByRole('button', { name: 'Download Excel' })).toBeVisible({ timeout: 30000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Excel' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('verified_');
    expect(download.suggestedFilename()).toContain('.xlsx');
  });
});
