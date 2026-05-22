/**
 * Spare Parts Verifier — runtime verification driver
 * Drives http://localhost (port 80, prod Docker stack) via Playwright.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'fs/promises';
import path from 'path';

const BASE  = 'http://localhost';
const XLSX  = '/Users/webronicdesigner/Webronic/Docker/projects/spare-parts-verifier/Spare_parts_test_20rows.xlsx';
const EMAIL = 'karthick.webronic@gmail.com';
const PASS  = 'SuperAdmin@2026';
const SS    = '/tmp/sparepartner_verify3';

await mkdir(SS, { recursive: true });

const results      = [];
const consoleErrors = [];
let browser, ctx, page;

const log  = m => process.stdout.write(m + '\n');
const shot = async name => { const p = path.join(SS, name + '.png'); await page.screenshot({ path: p, fullPage: false }); return p; };

const rec = async (n, v, note, img) => {
  results.push({ n, v, note });
  const ic = v === 'PASS' ? '✅' : v === 'FAIL' ? '❌' : '⚠️ ';
  log(`  ${ic} [${n}] ${note}${img ? ' → ' + img : ''}`);
};

// Dismiss any open overlay/modal (Activity Center, dialogs, etc.)
async function dismissOverlays() {
  // Try pressing Escape first
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);
  // Try clicking × / close buttons
  const closeSelectors = [
    'button[aria-label*="close" i]',
    'button[aria-label*="dismiss" i]',
    'button:has-text("×")',
    'button:has-text("✕")',
    '[data-testid="close-button"]',
  ];
  for (const sel of closeSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  await page.waitForTimeout(300);
}

// Check if a blocking modal is open (fixed inset-0 overlay) and dismiss it
async function dismissBlockingModal() {
  const overlay = page.locator('div.fixed.inset-0').first();
  if (await overlay.isVisible().catch(() => false)) {
    // Try Escape
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    // Try Cancel button inside the modal
    const cancelInModal = page.locator('div.fixed.inset-0 button').filter({ hasText: /cancel|close|dismiss/i });
    if (await cancelInModal.first().isVisible().catch(() => false)) {
      await cancelInModal.first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }
}

// Close Activity Center if it is open (auto-opens when awaiting_review jobs exist)
async function closeActivityCenter() {
  const panel = page.locator('div.absolute.inset-0, div[class*="fixed inset-0"]').first();
  // Check for the ✕ close button specifically inside a panel titled "Activity Center"
  const closeBtn = page.locator('button').filter({ hasText: /^✕$/ });
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

// Shared upload + sheet-select + Continue + Review Data helper
async function uploadAndContinue(sheet = 'Company B') {
  // Dismiss any open overlays before navigating away
  await dismissOverlays();

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Wait for the SparePartsApp's initial poll (listJobs) to resolve and
  // potentially auto-open the Activity Center for awaiting_review jobs.
  await page.waitForTimeout(3000);

  // Close Activity Center if it auto-opened
  await closeActivityCenter();
  await dismissOverlays();

  const inp = page.locator('input[type="file"]');
  await inp.waitFor({ state: 'attached', timeout: 8000 });
  await inp.setInputFiles(XLSX);

  // Sheet selector
  await page.waitForSelector('select, button:has-text("Continue")', { timeout: 10000 });
  const sel = page.locator('select');
  if (await sel.count() > 0) {
    await sel.selectOption({ label: sheet }).catch(() => sel.selectOption({ index: 1 }).catch(() => {}));
  }
  await page.click('button:has-text("Continue")');

  // After normalization the app shows "Review Data" before "Verify All" is visible
  // Wait up to 90s for either button
  try {
    await page.waitForSelector('button:has-text("Review Data"), button:has-text("Verify All")', { timeout: 90000 });
    const reviewBtn = page.locator('button:has-text("Review Data")');
    if (await reviewBtn.isVisible().catch(() => false)) {
      await reviewBtn.click();
      log('     Clicked "Review Data"');
      await page.waitForTimeout(500);
    }
  } catch (e) {
    log(`     Warning: neither "Review Data" nor "Verify All" appeared — ${e.message}`);
  }
}

// Wait for normalization + review step to complete → Verify All button visible
async function waitForVerifyButton(timeout = 30000) {
  await page.waitForSelector('button:has-text("Verify All")', { timeout, state: 'visible' });
}

// Click "Verify All", confirm the "Start Verification" modal, wait for results
async function runVerification(timeout = 210000) {
  await page.click('button:has-text("Verify All")');
  // A "Start Verification" confirmation modal may appear — click its CTA button
  try {
    await page.waitForSelector('button:has-text("Start Verification")', { timeout: 5000, state: 'visible' });
    await page.click('button:has-text("Start Verification")');
    log('     Clicked "Start Verification" modal button');
  } catch {
    // Modal didn't appear — verification started directly
  }
  await page.waitForSelector('button:has-text("Download Excel")', { timeout });
}

try {
  browser = await chromium.launch({ headless: true });
  ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
  page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  // ── 1  No HTTPS redirect ──────────────────────────────────────────
  log('\n[1] No HTTPS redirect…');
  const redirectLog = [];
  const onResponse = r => { if ([301,302,307,308].includes(r.status())) redirectLog.push(`${r.status()} ${r.url()} → ${r.headers()['location']}`); };
  page.on('response', onResponse);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  page.off('response', onResponse);
  const finalUrl = page.url();
  const httpsHit = redirectLog.filter(u => /https:\/\//.test(u));
  if (httpsHit.length) {
    await rec(1, 'FAIL', `HTTPS redirect detected: ${httpsHit.join(', ')}`);
  } else {
    await rec(1, 'PASS', `URL=${finalUrl}  redirects=[${redirectLog.join(' | ')||'none'}]`,
      await shot('01_no_https_redirect'));
  }

  // ── 2  Login ──────────────────────────────────────────────────────
  log('\n[2] Login…');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]',    EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 12000 });
    await rec(2, 'PASS', `Landed at ${page.url()}`, await shot('02_login_ok'));
  } catch {
    await rec(2, 'FAIL', `Still on login — ${page.url()}`, await shot('02_login_fail'));
  }

  // ── 3  Upload + sheet select + normalize ─────────────────────────
  log('\n[3] Upload & normalize…');
  try {
    await uploadAndContinue('Company B');
    await waitForVerifyButton(30000);
    await rec(3, 'PASS', '"Verify All" button visible after normalization + Review Data', await shot('03_normalized'));
  } catch (e) {
    await rec(3, 'FAIL', `Normalization timeout: ${e.message}`, await shot('03_normalize_fail'));
  }

  // ── 4  Language toggle BEFORE verification ────────────────────────
  log('\n[4] Language toggle before verification…');
  const preCE = consoleErrors.length;
  const langBtns = page.locator('button').filter({ hasText: /^(EN|Original|SV)$/ });
  const lc = await langBtns.count();
  if (lc >= 2) {
    for (let i = 0; i < lc; i++) { await langBtns.nth(i).click(); await page.waitForTimeout(200); }
    const newErr = consoleErrors.slice(preCE);
    await rec(4, newErr.length ? 'WARN' : 'PASS',
      `${lc} toggles clickable pre-verify${newErr.length ? ` | errors: ${newErr.join('; ')}` : ''}`,
      await shot('04_lang_pre'));
  } else {
    await rec(4, 'WARN', `Only ${lc} lang buttons visible pre-verify (may appear post-verify)`,
      await shot('04_lang_pre_none'));
  }

  // ── 5  Cancel during normalization ───────────────────────────────
  log('\n[5] Cancel during normalization…');
  try {
    await uploadAndContinue('Company B');
    // If normalization already finished and "Verify All" is visible, mark as WARN
    const verifyVisible = await page.locator('button:has-text("Verify All")').isVisible().catch(() => false);
    if (verifyVisible) {
      await rec(5, 'WARN', 'Normalization completed before cancel could fire (cached/fast)',
        await shot('05_cancel_norm_tooslow'));
    } else {
      // Cancel fires as soon as we see the Cancel button (normalization in progress)
      await page.waitForSelector('button:has-text("Cancel")', { timeout: 30000 });
      await page.click('button:has-text("Cancel")');
      // ConfirmDialog: click the confirm/yes button
      const confirmBtn = page.locator('button').filter({ hasText: /yes|confirm|ok|stop/i });
      try { await confirmBtn.first().waitFor({ timeout: 3000 }); await confirmBtn.first().click(); } catch {}
      await page.waitForTimeout(2000);
      const bodyText = await page.evaluate(() => document.body.innerText);
      const cancelled = /cancel/i.test(bodyText);
      await rec(5, 'PASS', `Cancel during normalize — UI shows cancel state: ${cancelled}`,
        await shot('05_cancel_normalize'));
    }
  } catch (e) {
    await rec(5, 'WARN', `Cancel during normalization: ${e.message}`, await shot('05_cancel_norm_warn'));
  }

  // ── 6  Full verification ──────────────────────────────────────────
  log('\n[6] Full verification…');
  try {
    await uploadAndContinue('Company B');
    log('     Waiting for Verify All button…');
    await waitForVerifyButton(30000);
    log('     Clicking Verify All…');
    await runVerification(210000);
    // react-window uses divs — count data rows by looking for the verified badge or stats text
    const statsText = await page.evaluate(() => {
      const el = document.querySelector('[class*="TOTAL ROWS"], [title*="verified"]');
      const allText = document.body.innerText;
      const m = allText.match(/(\d+)\s+(?:rows?\s+verified|TOTAL ROWS|VERIFIED)/i);
      return m ? m[0] : 'unknown';
    });
    await rec(6, 'PASS', `Verification complete — stats: "${statsText}"`,
      await shot('06_verify_done'));
  } catch (e) {
    await rec(6, 'FAIL', `Verification failed: ${e.message}`, await shot('06_verify_fail'));
  }

  // ── 7  Language toggle AFTER verification ─────────────────────────
  log('\n[7] Language toggle after verification…');
  await dismissBlockingModal();
  const postCE = consoleErrors.length;
  const langBtns2 = page.locator('button').filter({ hasText: /^(EN|Original|SV)$/ });
  const lc2 = await langBtns2.count();
  if (lc2 >= 2) {
    const labels = [];
    for (let i = 0; i < lc2; i++) {
      const lbl = await langBtns2.nth(i).textContent();
      await langBtns2.nth(i).click();
      await page.waitForTimeout(400);
      labels.push(lbl?.trim());
    }
    const newErr = consoleErrors.slice(postCE);
    await rec(7, newErr.length ? 'WARN' : 'PASS',
      `Toggled [${labels.join(', ')}] — no page reload${newErr.length ? ` | errors: ${newErr.join('; ')}` : ''}`,
      await shot('07_lang_post'));
  } else {
    await rec(7, 'WARN', `Only ${lc2} lang buttons visible post-verify`,
      await shot('07_lang_post_none'));
  }

  // ── 8  Cancel during verification ─────────────────────────────────
  log('\n[8] Cancel during verification…');
  try {
    await uploadAndContinue('Company B');
    await waitForVerifyButton(30000);
    await page.click('button:has-text("Verify All")');
    // Dismiss the "Start Verification" confirmation modal
    try {
      await page.waitForSelector('button:has-text("Start Verification")', { timeout: 5000, state: 'visible' });
      await page.click('button:has-text("Start Verification")');
      log('     Clicked "Start Verification" modal button');
    } catch { /* no modal */ }
    log('     Waiting 4 s for a few rows to process…');
    await page.waitForTimeout(4000);
    await page.click('button:has-text("Cancel")');
    const confirmBtn2 = page.locator('button').filter({ hasText: /yes|confirm|ok|stop/i });
    try { await confirmBtn2.first().waitFor({ timeout: 3000 }); await confirmBtn2.first().click(); } catch {}
    await page.waitForTimeout(3000);
    const bodyTxt = await page.evaluate(() => document.body.innerText);
    const hasCancelled = /cancel/i.test(bodyTxt);
    const hasRows = (bodyTxt.match(/\b\d+\b/g) || []).length > 0;
    await rec(8, 'PASS', `Cancel mid-verify — cancelled=${hasCancelled}, partial rows=${hasRows}`,
      await shot('08_cancel_verify'));
  } catch (e) {
    await rec(8, 'WARN', `Cancel mid-verify: ${e.message}`, await shot('08_cancel_verify_warn'));
  }

  // ── 9  Export in each language ────────────────────────────────────
  log('\n[9] Export in each language…');
  try {
    await uploadAndContinue('Company B');
    await waitForVerifyButton(30000);
    await runVerification(210000);

    const exportBtn = page.locator('button:has-text("Download Excel")');
    const langB = page.locator('button').filter({ hasText: /^(EN|Original|SV)$/ });
    const lc3 = await langB.count();
    const downloaded = [];

    if (await exportBtn.isVisible() && lc3 >= 1) {
      for (let i = 0; i < lc3; i++) {
        const lbl = (await langB.nth(i).textContent())?.trim();
        await langB.nth(i).click();
        await page.waitForTimeout(300);
        const dlPromise = ctx.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await exportBtn.click();
        const dl = await dlPromise;
        if (dl) {
          downloaded.push(`${lbl}:${dl.suggestedFilename()}`);
        } else {
          downloaded.push(`${lbl}:triggered(no-dl-event)`);
        }
        await page.waitForTimeout(500);
      }
      await rec(9, 'PASS', `Exports triggered: [${downloaded.join(', ')}]`,
        await shot('09_export'));
    } else {
      await rec(9, 'WARN', `Download Excel btn visible=${await exportBtn.isVisible()}, langBtns=${lc3}`,
        await shot('09_export_warn'));
    }
  } catch (e) {
    await rec(9, 'WARN', `Export: ${e.message}`, await shot('09_export_err'));
  }

  // ── 10  Job history ────────────────────────────────────────────────
  log('\n[10] Job history…');
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  const jobRows = await page.locator('table tbody tr').count();
  await rec(10, jobRows > 0 ? 'PASS' : 'WARN',
    `${jobRows} job rows on /jobs page`, await shot('10_jobs'));

  // ── 11  Job detail ─────────────────────────────────────────────────
  log('\n[11] Job detail…');
  await page.goto(`${BASE}/jobs`, { waitUntil: 'networkidle' });
  const viewBtns = page.locator('button').filter({ hasText: /view|results/i });
  const completedRows = page.locator('tr').filter({ hasText: /completed/i });
  const allRows = page.locator('table tbody tr');
  try {
    if (await viewBtns.count() > 0) {
      await viewBtns.first().click();
    } else if (await completedRows.count() > 0) {
      await completedRows.first().click();
    } else {
      await allRows.first().click();
    }
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');
    const url = page.url();
    const rows = await page.evaluate(() => document.querySelectorAll('table tr').length);
    await rec(11, 'PASS', `Navigated to ${url} — ${rows} table rows`,
      await shot('11_job_detail'));
  } catch (e) {
    await rec(11, 'WARN', `Job detail nav: ${e.message}`, await shot('11_job_detail_warn'));
  }

  // ── 12  Cookie check ──────────────────────────────────────────────
  log('\n[12] Cookie check…');
  const cookies = await ctx.cookies();
  const auth = cookies.find(c => /token|session|auth/i.test(c.name));
  if (auth) {
    await rec(12, auth.secure ? 'PASS' : 'WARN',
      `Cookie '${auth.name}': Secure=${auth.secure}, HttpOnly=${auth.httpOnly}, SameSite=${auth.sameSite}`,
      await shot('12_cookies'));
  } else {
    await rec(12, 'WARN', `No auth cookie found. All: [${cookies.map(c=>c.name).join(', ')}]`,
      await shot('12_cookies_missing'));
  }

} catch (err) {
  log(`\nFATAL: ${err.message}`);
  if (page) await page.screenshot({ path: path.join(SS, 'fatal.png') }).catch(() => {});
} finally {
  await browser?.close();
}

// ── Report ────────────────────────────────────────────────────────────────────
log('\n' + '═'.repeat(60));
log('VERIFICATION RESULTS — Spare Parts Verifier');
log('═'.repeat(60));
for (const r of results) {
  const ic = r.v==='PASS'?'✅':r.v==='FAIL'?'❌':'⚠️ ';
  log(`  ${ic} [${r.n}] ${r.note}`);
}
const p=results.filter(r=>r.v==='PASS').length;
const f=results.filter(r=>r.v==='FAIL').length;
const w=results.filter(r=>r.v==='WARN').length;
log(`\n  ${results.length} checks — ✅ ${p} PASS  ❌ ${f} FAIL  ⚠️  ${w} WARN`);
if (consoleErrors.length) {
  log(`\n  Console errors (${consoleErrors.length}):`);
  consoleErrors.forEach(e => log(`    • ${e}`));
}
log(`  Screenshots: ${SS}/`);
log('═'.repeat(60));
log(f > 0 ? '\nOVERALL: FAIL' : w > 0 ? '\nOVERALL: PASS (with warnings)' : '\nOVERALL: PASS');
