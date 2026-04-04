const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', 'backend', 'tests', 'fixtures');

test.describe('Excel Export (R14)', () => {
  test('downloads verified Excel after verification', async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.locator('#btn-verify')).toBeVisible({ timeout: 15000 });

    await page.locator('#btn-verify').click();
    await expect(page.locator('#btn-download')).toBeVisible({ timeout: 30000 });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-download').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('verified_');
    expect(download.suggestedFilename()).toContain('.xlsx');
  });
});
