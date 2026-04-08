const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', '..', 'backend', 'tests', 'fixtures');

test.describe('Frontend — Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.getByRole('button', { name: 'Verify All' })).toBeVisible({ timeout: 15000 });
  });

  test('shows Verify All button when data loaded', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Verify All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify All' })).toBeEnabled();
  });

  test('shows Reset button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
  });

  test('shows format badge after upload', async ({ page }) => {
    await expect(page.getByText('Format A (Correct)')).toBeVisible();
  });

  test('shows stats dashboard with all 9 cards', async ({ page }) => {
    const labels = [
      'Total Rows', 'Web Verified', 'Empty Cells',
      'Score ≥90', 'Score 50-89', 'Score <50',
      'Official', 'External', 'Not Found',
    ];
    for (const label of labels) {
      await expect(page.getByText(label)).toBeVisible();
    }
  });

  test('shows row count in badge', async ({ page }) => {
    await expect(page.getByText(/\d+ rows/).first()).toBeVisible();
  });

  test('shows progress during verification', async ({ page }) => {
    await page.getByRole('button', { name: 'Verify All' }).click();
    // Wait for completion message specifically
    await expect(page.getByText('Verification complete')).toBeVisible({ timeout: 15000 });
  });

  test('shows Download button after completion', async ({ page }) => {
    await page.getByRole('button', { name: 'Verify All' }).click();
    await expect(page.getByRole('button', { name: 'Download Excel' })).toBeVisible({ timeout: 30000 });
  });

  test('shows verification log entries after completion', async ({ page }) => {
    await page.getByRole('button', { name: 'Verify All' }).click();
    await expect(page.getByText('Verification Log')).toBeVisible({ timeout: 15000 });
  });

  test('stats update after verification', async ({ page }) => {
    await page.getByRole('button', { name: 'Verify All' }).click();
    await expect(page.getByRole('button', { name: 'Download Excel' })).toBeVisible({ timeout: 30000 });
    // Score cells should have color classes
    await expect(page.locator('.score-hi').first()).toBeVisible({ timeout: 5000 });
  });

  test('reset clears all state', async ({ page }) => {
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('Drop your Excel file here')).toBeVisible({ timeout: 5000 });
  });
});
