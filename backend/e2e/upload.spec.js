const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', 'backend', 'tests', 'fixtures');

test.describe('File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows upload dropzone on load', async ({ page }) => {
    await expect(page.getByText('Upload your Excel file')).toBeVisible();
  });

  test('shows header with logo and title', async ({ page }) => {
    await expect(page.locator('.logo')).toHaveText('SP');
    await expect(page.locator('.app-title')).toHaveText('Spare Parts Web Verifier');
  });

  test('accepts xlsx file and shows format badge', async ({ page }) => {
    const input = page.locator('#file-input');
    await input.setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.locator('#format-badge')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#format-badge')).toContainText('Format');
  });

  test('shows sheet selector for multi-sheet file', async ({ page }) => {
    const input = page.locator('#file-input');
    await input.setInputFiles(path.join(fixtures, 'multi-sheet-sample.xlsx'));
    await expect(page.locator('#sheet-selector')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#sheet-select')).toBeVisible();
  });

  test('file input only accepts xlsx/xls', async ({ page }) => {
    const accept = await page.locator('#file-input').getAttribute('accept');
    expect(accept).toContain('.xlsx');
    expect(accept).toContain('.xls');
  });
});
