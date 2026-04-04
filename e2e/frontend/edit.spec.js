const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', '..', 'backend', 'tests', 'fixtures');

test.describe('Frontend — Inline Editing (R12)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    // Wait for the data table footer to appear
    await expect(page.getByText('Enter to save, Escape to cancel')).toBeVisible({ timeout: 15000 });
  });

  test('clicking an editable cell shows input', async ({ page }) => {
    // Click on a description cell with known content
    await page.getByText('SIMATIC S7-300 CPU Module').first().click();
    await expect(page.locator('input[class*="border-brand-cyan"]')).toBeVisible({ timeout: 3000 });
  });

  test('Enter saves the edit', async ({ page }) => {
    await page.getByText('SIMATIC S7-300 CPU Module').first().click();
    const input = page.locator('input[class*="border-brand-cyan"]');
    await input.fill('Updated PLC Module');
    await input.press('Enter');
    await expect(input).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Updated PLC Module').first()).toBeVisible();
  });

  test('Escape cancels the edit', async ({ page }) => {
    await page.getByText('SIMATIC S7-300 CPU Module').first().click();
    const input = page.locator('input[class*="border-brand-cyan"]');
    await input.fill('Should Not Save');
    await input.press('Escape');
    await expect(input).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('SIMATIC S7-300 CPU Module').first()).toBeVisible();
  });

  test('col 0 (Internal Item #) does not trigger edit', async ({ page }) => {
    await page.getByText('INT-001').first().click();
    await expect(page.locator('input[class*="border-brand-cyan"]')).not.toBeVisible({ timeout: 1000 });
  });

  test('edit hint text visible in table footer', async ({ page }) => {
    await expect(page.getByText('Enter to save, Escape to cancel')).toBeVisible();
  });
});
