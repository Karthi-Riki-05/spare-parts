const { test, expect } = require('@playwright/test');
const {
  apiSuperAdminLogin,
  apiCreateCompany,
  apiConfirmCompany,
  uniqueEmail,
} = require('./_helpers');

const PASSWORD = 'Toggle@2026';

async function createAndLogin(request, page, label = 'toggle') {
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

// Verified rows with both originalFields (raw Excel) and svFields (AI-extracted Swedish)
const MOCK_VERIFIED_ROWS = Array.from({ length: 3 }, (_, i) => ({
  rowIndex: i,
  internalItemNumber: `IIN-${i + 1}`,
  description: `Deep groove ball bearing ${i + 1}`,   // English (AI translated)
  manufacturer: 'SKF',
  itemNumber: `620${4 + i}`,
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
  originalFields: {
    description: `Kullager-orig-${i + 1}`,            // Original Swedish from Excel
    manufacturer: '',
    itemNumber: `ORIG-${i + 1}`,
    typeDesignation: '',
    supplementary: '',
  },
  svFields: {
    description: `Spårkullager typ ${i + 1}`,         // Swedish normalized by AI
    manufacturer: 'SKF',
    itemNumber: `620${4 + i}`,
    typeDesignation: '',
    supplementary: '',
  },
}));

// Verified rows with NO originalFields/svFields — toggle buttons should not appear
const MOCK_EN_ONLY_ROWS = Array.from({ length: 3 }, (_, i) => ({
  rowIndex: i,
  internalItemNumber: `EN-${i + 1}`,
  description: `Ball bearing ${i + 1}`,
  manufacturer: 'FAG',
  itemNumber: `630${i + 1}`,
  typeDesignation: 'ball bearing',
  supplementary: '',
  verifiedSource: 'Manufacturer website',
  verificationScore: 90,
  websiteId: 'https://fag.de',
  sourceType: 'official',
  manufacturerWebsite: 'https://fag.de',
  manufacturerInferred: false,
  supplementaryUsed: false,
  supplementaryChanged: false,
  supplementaryOriginal: '',
  supplementaryType: 'unknown',
  urlValidationStatus: 'confirmed',
  originalFields: null,
  svFields: null,
}));

function makeCompletedStatusBody(jobId, rows) {
  return JSON.stringify({
    success: true,
    job: {
      id: jobId,
      status: 'completed',
      jobType: 'verify',
      currentPhase: 'completed',
      fileName: 'test.xlsx',
      totalRows: rows.length,
      processedRows: rows.length,
      progress: 100,
      createdAt: '2026-01-01T00:00:00.000Z',
      startedAt: '2026-01-01T00:00:01.000Z',
      completedAt: '2026-01-01T00:01:00.000Z',
      errorMessage: null,
    },
    stats: {
      totalRows: rows.length, webVerified: rows.length, emptyCells: 0,
      scoreAbove90: 0, score70to89: rows.length, scoreBelow70: 0,
      officialSourceFound: rows.length, externalSourceFound: 0, notFound: 0,
    },
    previewRows: null,
  });
}

function makeCompletedResultsBody(rows) {
  return JSON.stringify({
    success: true,
    results: rows,
    stats: {
      totalRows: rows.length, webVerified: rows.length, emptyCells: 0,
      scoreAbove90: 0, score70to89: rows.length, scoreBelow70: 0,
      officialSourceFound: rows.length, externalSourceFound: 0, notFound: 0,
    },
    dataType: 'verified',
  });
}

async function setupJobMocks(page, jobId, rows) {
  await page.route(`**/api/jobs/${jobId}/status`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: makeCompletedStatusBody(jobId, rows),
    })
  );

  await page.route(`**/api/jobs/${jobId}/results`, (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: makeCompletedResultsBody(rows),
    })
  );

  // Suppress periodic list-jobs polling
  await page.route('**/api/jobs', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'GET' && !url.includes('/status') && !url.includes('/results')) {
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, jobs: [] }),
      });
    }
    return route.continue();
  });
}

// ─── Suite: Language toggle ───────────────────────────────────────────────────

test.describe('Language toggle after verification', () => {
  test('EN/SV/Original toggle shows correct descriptions', async ({ page, request }) => {
    await createAndLogin(request, page, 'toggle1');

    const jobId = 'mock-toggle-job-001';
    await setupJobMocks(page, jobId, MOCK_VERIFIED_ROWS);

    // Deep-link: SparePartsApp useEffect calls loadJobData(jobId) on mount
    await page.goto(`/?jobId=${jobId}`);

    // Wait for verified results to load (EN description from row 0)
    await expect(page.getByText('Deep groove ball bearing 1').first()).toBeVisible({ timeout: 15000 });

    // All three toggle buttons visible (both originalFields and svFields present)
    await expect(page.getByRole('button', { name: 'EN' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'SV' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Original' })).toBeVisible({ timeout: 5000 });

    // ── SV toggle ────────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'SV' }).click();
    // Swedish normalized description now visible
    await expect(page.getByText('Spårkullager typ 1').first()).toBeVisible({ timeout: 5000 });
    // English description for row 1 no longer in DOM
    await expect(page.getByText('Deep groove ball bearing 1')).not.toBeVisible();

    // ── Original toggle ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Original' }).click();
    // Raw Excel text visible
    await expect(page.getByText('Kullager-orig-1').first()).toBeVisible({ timeout: 5000 });
    // Swedish description no longer in DOM
    await expect(page.getByText('Spårkullager typ 1')).not.toBeVisible();

    // ── EN toggle (return to default) ────────────────────────────────────────
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.getByText('Deep groove ball bearing 1').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Kullager-orig-1')).not.toBeVisible();
  });

  test('EN button is active by default; SV becomes active after toggle', async ({ page, request }) => {
    await createAndLogin(request, page, 'toggle2');

    const jobId = 'mock-toggle-job-002';
    await setupJobMocks(page, jobId, MOCK_VERIFIED_ROWS);

    await page.goto(`/?jobId=${jobId}`);
    await expect(page.getByText('Deep groove ball bearing 1').first()).toBeVisible({ timeout: 15000 });

    // EN button has active highlight; SV/Original do not
    const enBtn = page.getByRole('button', { name: 'EN' });
    const svBtn = page.getByRole('button', { name: 'SV' });
    await expect(enBtn).toHaveClass(/bg-brand-cyan/);
    await expect(svBtn).not.toHaveClass(/bg-brand-cyan/);

    // After clicking SV, active button switches
    await svBtn.click();
    await expect(svBtn).toHaveClass(/bg-brand-cyan/);
    await expect(enBtn).not.toHaveClass(/bg-brand-cyan/);
  });

  test('Toggle buttons hidden when no original/SV data in results', async ({ page, request }) => {
    await createAndLogin(request, page, 'toggle3');

    const jobId = 'mock-toggle-job-003';
    await setupJobMocks(page, jobId, MOCK_EN_ONLY_ROWS);

    await page.goto(`/?jobId=${jobId}`);
    await expect(page.getByText('Ball bearing 1').first()).toBeVisible({ timeout: 15000 });

    // With originalFields/svFields null, toggle group must not render
    await expect(page.getByRole('button', { name: 'SV' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Original' })).not.toBeVisible();
  });
});
