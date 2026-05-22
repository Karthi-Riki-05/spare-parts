const { test, expect } = require('@playwright/test');
const path = require('path');
const {
  BACKEND,
  apiSuperAdminLogin,
  apiCreateCompany,
  apiConfirmCompany,
  uniqueEmail,
} = require('./_helpers');

const FIXTURE = path.join(__dirname, '../../Spare_parts_test_20rows.xlsx');
const PASSWORD = 'Cancel@2026';

async function createAndLogin(request, page, label = 'cancel') {
  await apiSuperAdminLogin(request);
  const email = uniqueEmail(label);
  await apiCreateCompany(request, { company_name: `${label} Co`, email, password: PASSWORD });
  await apiConfirmCompany(request, email);

  await page.goto('/login');
  // Login page labels are not associated via htmlFor — use placeholder selector
  await page.getByPlaceholder('Enter Email').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign In/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 });

  return email;
}

// Shared normalized rows mock payload (Format A, 3 rows — under background-normalize threshold)
const MOCK_ROWS = Array.from({ length: 3 }, (_, i) => ({
  internalItemNumber: `IIN-${i + 1}`,
  description: `Test part ${i + 1}`,
  manufacturer: 'SKF',
  itemNumber: `P${i + 1}00`,
  typeDesignation: 'bearing',
  supplementary: '',
  rowIndex: i,
  _originalFormat: 'A',
}));

// A single partial result returned from /results after cancel
const MOCK_PARTIAL_RESULT = {
  rowIndex: 0,
  internalItemNumber: 'IIN-1',
  description: 'Test part 1',
  manufacturer: 'SKF',
  itemNumber: 'P100',
  typeDesignation: 'bearing',
  supplementary: '',
  verifiedSource: 'Manufacturer website',
  verificationScore: 88,
  websiteId: 'https://skf.com',
  sourceType: 'official',
  manufacturerWebsite: 'https://skf.com',
  manufacturerInferred: false,
  supplementaryUsed: false,
  supplementaryChanged: false,
  supplementaryOriginal: '',
  supplementaryType: 'unknown',
  urlValidationStatus: 'confirmed',
};

function makeJobStatusBody(jobId, status, processed = 0) {
  return JSON.stringify({
    success: true,
    job: {
      id: jobId,
      status,
      jobType: 'verify',
      currentPhase: 'verifying',
      fileName: 'test.xlsx',
      totalRows: 3,
      processedRows: processed,
      progress: status === 'cancelled' ? 100 : 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:01.000Z',
      completedAt: null,
      errorMessage: null,
    },
    stats: null,
    previewRows: null,
  });
}

// Wire up all mock routes needed to reach the background-job-tracking banner.
// Returns the jobId used so callers can add job-specific cancel/status overrides.
async function setupUploadMocks(page, jobId) {
  await page.route('**/api/get-sheets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sheets: [{ index: 0, name: 'Sheet1' }] }),
    })
  );

  await page.route('**/api/detect-format', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        format: 'A',
        confidence: 95,
        rowCount: 3,
        mapping: { description: 1, manufacturer: 2, itemNumber: 3, typeDesignation: 4, supplementary: 5 },
        headers: ['internalItemNumber', 'description', 'manufacturer', 'itemNumber', 'typeDesignation', 'supplementary'],
        needsManualMapping: false,
        detectedLanguage: 'english',
        languageCode: 'en',
        translationNeeded: false,
      }),
    })
  );

  await page.route('**/api/normalize', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows: MOCK_ROWS, originalData: [], totalOriginalRows: 3 }),
    })
  );

  await page.route('**/api/jobs/submit', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, jobId, message: 'Job submitted' }),
    })
  );

  // Suppress the periodic list-jobs polling so it doesn't interfere
  await page.route('**/api/jobs', (route) => {
    if (route.request().method() === 'GET' && !route.request().url().includes('/status') && !route.request().url().includes('/results') && !route.request().url().includes('/cancel')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, jobs: [] }),
      });
    }
    return route.continue();
  });
}

async function uploadAndReachVerifyAll(page) {
  await page.goto('/');
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE);
  // Wait until the "Verify All" button is enabled (normalizedRows loaded)
  await expect(page.getByRole('button', { name: /Verify All/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Verify All/i })).toBeEnabled({ timeout: 5000 });
}

async function openBackgroundModal(page) {
  await page.getByRole('button', { name: /Verify All/i }).click();
  // BackgroundJobModal shows — wait for the button specifically (heading also says "Start Verification")
  await expect(page.getByRole('button', { name: 'Start Verification' })).toBeVisible({ timeout: 5000 });
}

async function startBackgroundJob(page) {
  await page.getByRole('button', { name: 'Start Verification' }).click();
  // Banner with Cancel Job button appears
  await expect(page.getByRole('button', { name: /Cancel Job/i })).toBeVisible({ timeout: 10000 });
}

// ─── Suite 1: API-level cancel ────────────────────────────────────────────────

test.describe('Cancel flow — API level', () => {
  test('submit then immediately cancel → reaches terminal state', async ({ request }) => {
    await apiSuperAdminLogin(request);
    const email = uniqueEmail('apicancel');
    await apiCreateCompany(request, { company_name: 'API Cancel Co', email, password: PASSWORD });
    await apiConfirmCompany(request, email);

    // Login as company user — this replaces super-admin session on the shared request context
    const loginRes = await request.post(`${BACKEND}/api/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(loginRes.ok(), `login failed: ${loginRes.status()}`).toBeTruthy();

    const submitRes = await request.post(`${BACKEND}/api/jobs/submit`, {
      data: {
        rows: [
          { internalItemNumber: 'C-1', description: 'Test bearing alpha', manufacturer: 'SKF', itemNumber: '6204', typeDesignation: 'deep groove ball bearing', supplementary: '', rowIndex: 0 },
          { internalItemNumber: 'C-2', description: 'Test bearing beta', manufacturer: 'FAG', itemNumber: '6205', typeDesignation: 'deep groove ball bearing', supplementary: '', rowIndex: 1 },
        ],
        fileName: 'api-cancel-test.xlsx',
      },
    });
    expect([200, 201]).toContain(submitRes.status());
    const { jobId } = await submitRes.json();
    expect(jobId).toBeTruthy();

    // Cancel immediately
    const cancelRes = await request.post(`${BACKEND}/api/jobs/${jobId}/cancel`);
    expect(cancelRes.ok(), `cancel failed: ${cancelRes.status()}`).toBeTruthy();

    // Poll until terminal (max 60s)
    const TERMINAL = new Set(['cancelled', 'completed', 'failed']);
    let finalStatus = 'processing';
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await request.get(`${BACKEND}/api/jobs/${jobId}/status`);
      expect(statusRes.ok()).toBeTruthy();
      const body = await statusRes.json();
      finalStatus = body.job.status;
      if (TERMINAL.has(finalStatus)) break;
    }
    expect(TERMINAL.has(finalStatus), `expected terminal status, got: ${finalStatus}`).toBeTruthy();

    // Results endpoint returns 200 (even if empty)
    const resultsRes = await request.get(`${BACKEND}/api/jobs/${jobId}/results`);
    expect(resultsRes.ok()).toBeTruthy();
  });
});

// ─── Suite 2: UI cancel flow (mocked APIs) ────────────────────────────────────

test.describe('Cancel flow — UI with mocked APIs', () => {
  test('Cancel Job → confirm → Cancelling... → partial results shown', async ({ page, request }) => {
    await createAndLogin(request, page, 'cancelui');

    const jobId = 'mock-cancel-job-001';
    let cancelCalled = false;

    await setupUploadMocks(page, jobId);

    await page.route(`**/api/jobs/${jobId}/cancel`, (route) => {
      cancelCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Cancellation requested' }) });
    });

    await page.route(`**/api/jobs/${jobId}/status`, (route) => {
      const status = cancelCalled ? 'cancelled' : 'processing';
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: makeJobStatusBody(jobId, status, cancelCalled ? 1 : 0),
      });
    });

    await page.route(`**/api/jobs/${jobId}/results`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, results: [MOCK_PARTIAL_RESULT], stats: { total: 1, completed: 1, cacheHits: 0 }, dataType: 'verified' }),
      })
    );

    await uploadAndReachVerifyAll(page);
    await openBackgroundModal(page);
    await startBackgroundJob(page);

    // Click Cancel Job — ConfirmDialog should appear
    await page.getByRole('button', { name: 'Cancel Job' }).click();
    await expect(page.getByText('Cancel verification job?')).toBeVisible({ timeout: 5000 });

    // Confirm the cancellation
    // Use 'last()' to pick the confirm button inside the modal (not the banner button)
    await page.getByRole('button', { name: 'Cancel Job' }).last().click();

    // Button changes to "Cancelling..."
    await expect(page.getByRole('button', { name: /Cancelling/i })).toBeVisible({ timeout: 5000 });

    // Backend cancel was called
    expect(cancelCalled).toBe(true);

    // Poll detects "cancelled" → results load → banner disappears
    await expect(page.getByRole('button', { name: /Cancelling/i })).not.toBeVisible({ timeout: 20000 });

    // Partial result row shown in DataTable (manufacturer cell, exact to avoid matching skf.com URL)
    await expect(page.getByText('SKF', { exact: true }).first()).toBeVisible({ timeout: 5000 });
  });

  test('"Keep running" dismisses modal without cancelling', async ({ page, request }) => {
    await createAndLogin(request, page, 'keeprunning');

    const jobId = 'mock-keep-running-001';
    let cancelCalled = false;

    await setupUploadMocks(page, jobId);

    await page.route(`**/api/jobs/${jobId}/cancel`, (route) => {
      cancelCalled = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Cancellation requested' }) });
    });

    await page.route(`**/api/jobs/${jobId}/status`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: makeJobStatusBody(jobId, 'processing', 0),
      })
    );

    await uploadAndReachVerifyAll(page);
    await openBackgroundModal(page);
    await startBackgroundJob(page);

    // Open the cancel modal
    await page.getByRole('button', { name: 'Cancel Job' }).click();
    await expect(page.getByText('Cancel verification job?')).toBeVisible({ timeout: 5000 });

    // Dismiss with "Keep running"
    await page.getByRole('button', { name: 'Keep running' }).click();

    // Modal gone, Cancel Job still present, cancel NOT called
    await expect(page.getByText('Cancel verification job?')).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Cancel Job' })).toBeVisible();
    expect(cancelCalled).toBe(false);
  });
});
