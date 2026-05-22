const { test, expect } = require('@playwright/test');
const path = require('path');
const {
  apiSuperAdminLogin,
  apiCreateCompany,
  apiConfirmCompany,
  uniqueEmail,
} = require('./_helpers');

const FIXTURE = path.join(__dirname, '../../Spare_parts_test_20rows.xlsx');
const PASSWORD = 'NormCancel@2026';

async function createAndLogin(request, page, label = 'normcancel') {
  await apiSuperAdminLogin(request);
  const email = uniqueEmail(label);
  await apiCreateCompany(request, { company_name: `${label} Co`, email, password: PASSWORD });
  await apiConfirmCompany(request, email);

  await page.goto('/login');
  await page.getByPlaceholder('Enter Email').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });
}

// Partial normalized rows returned after normalization is cancelled.
// No verificationScore — frontend treats these as normalized (not verified).
const PARTIAL_NORM_ROWS = Array.from({ length: 3 }, (_, i) => ({
  internalItemNumber: `IIN-${i + 1}`,
  description: `Stoppklack Marposs W-${i + 1}`,
  manufacturer: 'SKF',
  itemNumber: `P${i + 1}00`,
  typeDesignation: 'bearing',
  supplementary: '',
  rowIndex: i,
  _originalFormat: 'B',
}));

function makeStatusBody(jobId, status, phase = 'formatting', processed = 0) {
  return JSON.stringify({
    success: true,
    job: {
      id: jobId,
      status,
      jobType: 'normalize',
      currentPhase: phase,
      fileName: 'test.xlsx',
      totalRows: 20,
      processedRows: processed,
      progress: processed > 0 ? Math.round((processed / 20) * 100) : 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:01.000Z',
      completedAt: null,
      errorMessage: null,
    },
    stats: null,
    previewRows: null,
  });
}

// Mocks common to all tests in this file: sheet detection, Format B detect, normalize submit, list-jobs.
async function setupMocks(page, jobId) {
  await page.route('**/api/get-sheets', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sheets: [{ index: 0, name: 'Sheet1' }] }),
    })
  );

  // Format B triggers background normalization (needsAiNormalize = true → useBackground = true)
  await page.route('**/api/detect-format', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        format: 'B', confidence: 95, rowCount: 20,
        headers: ['col_0', 'col_1'], needsManualMapping: false,
        detectedLanguage: 'swedish', languageCode: 'sv', translationNeeded: true,
      }),
    })
  );

  // Background normalization submit
  await page.route('**/api/jobs/normalize/submit', (route) =>
    route.fulfill({
      status: 201, contentType: 'application/json',
      body: JSON.stringify({ success: true, jobId, message: 'Normalization job submitted' }),
    })
  );

  // Suppress periodic list-jobs polling so it doesn't interfere with job-specific routes
  await page.route('**/api/jobs', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'GET' && !url.includes('/status') && !url.includes('/results') && !url.includes('/cancel')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, jobs: [] }),
      });
    }
    return route.continue();
  });
}

// ─── Suite: Cancel during normalization (Format B background job) ─────────────

test.describe('Cancel during normalization', () => {
  test('Cancel formatting → partial rows shown and Verify All enabled', async ({ page, request }) => {
    await createAndLogin(request, page, 'cancelnorm1');

    const jobId = 'mock-norm-cancel-001';
    let cancelCalled = false;

    await setupMocks(page, jobId);

    await page.route(`**/api/jobs/${jobId}/cancel`, (route) => {
      cancelCalled = true;
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Cancellation requested' }),
      });
    });

    // Status switches to 'cancelled' only after cancel endpoint is hit
    await page.route(`**/api/jobs/${jobId}/status`, (route) => {
      const status = cancelCalled ? 'cancelled' : 'processing';
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: makeStatusBody(jobId, status, 'formatting', cancelCalled ? 3 : 0),
      });
    });

    // Results contain partial normalized rows (dataType 'normalized' — no verificationScore)
    await page.route(`**/api/jobs/${jobId}/results`, (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          results: PARTIAL_NORM_ROWS,
          stats: null,
          dataType: 'normalized',
        }),
      })
    );

    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);

    // Background banner shows with Cancel Job button (jobTrackingMode=true, phase=idle, hasData=false)
    await expect(page.getByRole('button', { name: /Cancel Job/i })).toBeVisible({ timeout: 15000 });

    // Open cancel confirm dialog
    await page.getByRole('button', { name: 'Cancel Job' }).click();
    await expect(page.getByText('Cancel verification job?')).toBeVisible({ timeout: 5000 });

    // Confirm cancellation — use last() to target the confirm button inside the modal
    await page.getByRole('button', { name: 'Cancel Job' }).last().click();

    // Button transitions to "Cancelling..." immediately
    await expect(page.getByRole('button', { name: /Cancelling/i })).toBeVisible({ timeout: 5000 });
    expect(cancelCalled).toBe(true);

    // Poll detects 'cancelled' → results fetched → normalizedRows populated → banner disappears
    // DataTable + ActionBar appear with Verify All enabled
    await expect(page.getByRole('button', { name: /Verify All/i })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Verify All/i })).toBeEnabled({ timeout: 3000 });

    // Partial normalized rows visible in data table
    await expect(page.getByText('Stoppklack Marposs W-1').first()).toBeVisible({ timeout: 5000 });
  });

  test('"Keep running" dismisses dialog without cancelling', async ({ page, request }) => {
    await createAndLogin(request, page, 'normkeeprunning');

    const jobId = 'mock-norm-keeprunning-001';
    let cancelCalled = false;

    await setupMocks(page, jobId);

    await page.route(`**/api/jobs/${jobId}/cancel`, (route) => {
      cancelCalled = true;
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route(`**/api/jobs/${jobId}/status`, (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: makeStatusBody(jobId, 'processing', 'formatting', 0),
      })
    );

    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);

    await expect(page.getByRole('button', { name: /Cancel Job/i })).toBeVisible({ timeout: 15000 });

    // Open confirm dialog
    await page.getByRole('button', { name: 'Cancel Job' }).click();
    await expect(page.getByText('Cancel verification job?')).toBeVisible({ timeout: 5000 });

    // Dismiss without cancelling
    await page.getByRole('button', { name: 'Keep running' }).click();

    // Dialog gone, Cancel Job still visible, cancel not called
    await expect(page.getByText('Cancel verification job?')).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: /Cancel Job/i })).toBeVisible();
    expect(cancelCalled).toBe(false);
  });
});
