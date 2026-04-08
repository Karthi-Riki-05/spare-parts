const { test } = require('@playwright/test');
test('select Company C', async ({ page }) => {
  page.on('request', r => {
    if (r.url().includes('/api/detect-format') || r.url().includes('/api/normalize')) {
      try {
        const j = JSON.parse(r.postData() || '{}');
        console.log('REQ', r.url().split('/').pop(), 'sheetIndex=', j.sheetIndex, 'format=', j.format);
      } catch {}
    }
  });
  await page.goto('http://localhost');
  await page.setInputFiles('input[type=file]', '/Users/webronicdesigner/Webronic/Docker/projects/spare-parts-verifier/test_excel.xlsx');
  await page.waitForSelector('select');
  await page.selectOption('select', { label: 'Company C' });
  console.log('SELECT VALUE AFTER PICK:', await page.$eval('select', s => s.value));
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(30000);
});
