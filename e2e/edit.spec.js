const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', 'backend', 'tests', 'fixtures');

test.describe('Inline Editing (R12)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('#file-input').setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.locator('#data-table')).toBeVisible({ timeout: 15000 });
  });

  test('clicking a cell shows edit input', async ({ page }) => {
    const cell = page.locator('#data-table tbody td').nth(1);
    await cell.click();
    await expect(page.locator('.cell-edit-input')).toBeVisible({ timeout: 3000 });
  });

  test('Enter saves the edit', async ({ page }) => {
    const cell = page.locator('#data-table tbody td').nth(1);
    await cell.click();
    const input = page.locator('.cell-edit-input');
    await input.fill('Updated Value');
    await input.press('Enter');
    await expect(input).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Updated Value').first()).toBeVisible();
  });

  test('Escape cancels the edit', async ({ page }) => {
    const cell = page.locator('#data-table tbody td').nth(1);
    const original = await cell.textContent();
    await cell.click();
    const input = page.locator('.cell-edit-input');
    await input.fill('Should Not Save');
    await input.press('Escape');
    await expect(input).not.toBeVisible({ timeout: 3000 });
    if (original) {
      await expect(page.locator('#data-table tbody td').nth(1)).toHaveText(original);
    }
  });

  test('col 0 (Internal Item #) does not trigger edit', async ({ page }) => {
    const cell = page.locator('#data-table tbody td').first();
    await cell.click();
    await expect(page.locator('.cell-edit-input')).not.toBeVisible({ timeout: 1000 });
  });
});
