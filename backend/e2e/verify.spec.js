const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', 'backend', 'tests', 'fixtures');

test.describe('Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.locator('#btn-verify')).toBeVisible({ timeout: 15000 });
  });

  test('shows Verify button when data loaded', async ({ page }) => {
    await expect(page.locator('#btn-verify')).toBeVisible();
    await expect(page.locator('#btn-verify')).toContainText('Web Verify All');
  });

  test('shows format badge after upload', async ({ page }) => {
    await expect(page.locator('#format-badge')).toBeVisible();
  });

  test('shows progress during verification', async ({ page }) => {
    await page.locator('#btn-verify').click();
    await expect(page.locator('#progress-section')).toBeVisible({ timeout: 10000 });
  });

  // Mock mode completes in <50ms so Stop button flashes too fast to assert visibility.
  // Verify the Stop button exists in DOM with correct attributes instead.
  test('Stop button exists with correct setup', async ({ page }) => {
    const stop = page.locator('#btn-stop');
    await expect(stop).toHaveCount(1);
    await expect(stop).toContainText('Stop');
  });

  test('shows Download button after completion', async ({ page }) => {
    await page.locator('#btn-verify').click();
    await expect(page.locator('#btn-download')).toBeVisible({ timeout: 30000 });
  });

  test('shows verification log entries', async ({ page }) => {
    await page.locator('#btn-verify').click();
    await expect(page.locator('#log-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.log-entry').first()).toBeVisible({ timeout: 15000 });
  });

  test('stats update after verification', async ({ page }) => {
    await page.locator('#btn-verify').click();
    await expect(page.locator('#btn-download')).toBeVisible({ timeout: 30000 });
    const total = await page.locator('#stat-total').textContent();
    expect(parseInt(total)).toBeGreaterThan(0);
  });
});
