const { test, expect } = require('@playwright/test');
const path = require('path');

const fixtures = path.join(__dirname, '..', '..', 'backend', 'tests', 'fixtures');

test.describe('Frontend — File Upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows upload dropzone on load', async ({ page }) => {
    await expect(page.getByText('Drop your Excel file here')).toBeVisible();
  });

  test('shows header with logo and title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Spare Parts Web Verifier' })).toBeVisible();
  });

  test('shows Docs link in header', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Docs' })).toBeVisible();
  });

  test('accepts xlsx file and shows format badge', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(path.join(fixtures, 'company-a-sample.xlsx'));
    await expect(page.getByText(/Format A/)).toBeVisible({ timeout: 15000 });
  });

  test('shows sheet selector for multi-sheet file', async ({ page }) => {
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(path.join(fixtures, 'multi-sheet-sample.xlsx'));
    await expect(page.getByText('Multiple sheets detected')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('file input only accepts xlsx/xls', async ({ page }) => {
    const accept = await page.locator('input[type="file"]').getAttribute('accept');
    expect(accept).toContain('.xlsx');
    expect(accept).toContain('.xls');
  });

  test('shows error for non-Excel file', async ({ page }) => {
    // Create a temp txt file via evaluate
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an excel file'),
    });
    await expect(page.getByText('Only .xlsx and .xls files are supported')).toBeVisible({ timeout: 3000 });
  });
});
