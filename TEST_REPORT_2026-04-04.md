# Spare Parts Web Verifier — Test Report

Generated: 2026-04-04
Test Excel: testing_excel.xlsx (4 sheets, ~15,008 total rows)
Environment: Node 20, Docker Compose (dev mode)

## Executive Summary

| Metric | Value |
|--------|-------|
| Total backend tests | 92 |
| Passed | 92 |
| Failed | 0 |
| Pass rate | 100% |
| Critical bugs fixed | 5 |
| Features implemented | 8 |

## Test Excel Structure

| Sheet | Name | Rows | Format |
|-------|------|------|--------|
| 1 | Explanation- Itemdata structure | 5 | Metadata (skipped) |
| 2 | Sample data, Company A | 5003 | Format A (separate columns) |
| 3 | Sample data, Company B | 5002 | Format B (single column) |
| 4 | Sample data, Company C | 5003 | Format C (incomplete) |

Row 1 = sheet title annotation, Row 2 = column definitions, Row 3+ = actual data.

---

## Phase 1: Bug Fix Verification

| Bug | Status | Evidence |
|-----|--------|----------|
| 1-A Premature "Processing..." | FIXED | Phase set to 'idle' before showing sheet selector; progress section only renders when phase is 'detecting'/'normalizing' |
| 1-A Wrong default sheet | FIXED | `selectDefaultSheet()` prefers sheets matching `/sample data/i`, `/company [abc]/i`; skips `/explanation/i` |
| 1-B Cache key collision | FIXED | `makeCacheKey()` now uses `description` as fallback when manufacturer/itemNumber/typeDesignation are all empty |
| 1-B Cache clear endpoint | FIXED | `DELETE /api/cache` → `{"success":true}`, `GET /api/cache/stats` → `{"hits":0,"misses":0,"keys":0}` |
| 1-C Item number in description | FIXED | Format B now sends only `col_1` to OpenAI; `col_0` stored separately as `internalItemNumber` |
| 1-D Metadata rows skipped | FIXED | `excelService.js` skips rowNumber <= 1 and pattern-matches metadata rows |
| 1-E Format B uniqueness (mock) | FIXED | `mockNormalizeRow()` uses heuristic text parsing instead of static data; each row returns different output |

---

## Backend API Tests (Vitest)

| Test Suite | Tests | Status |
|------------|-------|--------|
| unit/deduplication.test.js | 10 | PASS |
| unit/supplementaryLogger.test.js | 13 | PASS |
| unit/verify.test.js | 10 | PASS |
| unit/ersHandler.test.js | 5 | PASS |
| unit/normalize.test.js | 14 | PASS |
| unit/cache.test.js | 5 | PASS |
| unit/services-mock.test.js | 5 | PASS |
| unit/formatBNoise.test.js | 5 | PASS |
| unit/urlValidator.test.js | 6 | PASS |
| unit/retry.test.js | 4 | PASS |
| integration/api.test.js | 10 | PASS |
| performance/stress.test.js | 5 | PASS |
| **TOTAL** | **92** | **ALL PASS** |

### API Endpoint Smoke Tests

| Endpoint | Method | Status | Response |
|----------|--------|--------|----------|
| /api/health | GET | 200 | `{"status":"ok"}` |
| /api/cache | DELETE | 200 | `{"success":true}` |
| /api/cache/stats | GET | 200 | `{"hits":0,"misses":0,"keys":0}` |
| / (frontend) | GET | 200 | Page renders correctly |
| /docs (frontend) | GET | 200 | Page renders correctly |

---

## AI Quality Tests

| Test | Status | Notes |
|------|--------|-------|
| Format B uniqueness (mock) | PASS | `mockNormalizeRow()` extracts brand + code from each row's unique text |
| Swedish translation | PASS | Added to OpenAI `normalizeRow()` prompt; removed from Claude/Gemini |
| ERS. handler | PASS | 5/5 unit tests pass; splits on ` ERS.`, preserves existing supplementary |
| Noise cleaning | PASS | 5/5 unit tests pass; strips trailing `, -` sequences |
| Internal ID isolation | PASS | Format B sends only `col_1` to AI; `internalItemNumber` never in AI payload |
| Cache key fix | PASS | Empty fields fallback to `description` hash; `DELETE /api/cache` works |

### ERS. Handler Test Cases

| Input | Field | Supplementary | Status |
|-------|-------|---------------|--------|
| `6ES7 953-8LL31-0AA0 ERS.6ES7 953-8LL20-0AA0` | `6ES7 953-8LL31-0AA0` | `(supersedes: 6ES7 953-8LL20-0AA0)` | PASS |
| `ABC-100 ERS.ABC-050` | `ABC-100` | `(supersedes: ABC-050)` | PASS |
| `WTB27-3P2461 ERS.WTB27-3P2441` + existing supp | Canonical value | `High temp rated \| (supersedes: ...)` | PASS |
| No ERS. present | Unchanged | Unchanged | PASS |
| Already has supersedes | Canonical value | Not duplicated | PASS |

### Format B Noise Cleaning Test Cases

| Input | Output | Status |
|-------|--------|--------|
| `RITN:833.170, - , - , - , - ` | `RITN:833.170` | PASS |
| `Motor, 3-phase, 400V, SEW R77-DRS71M4` | Unchanged | PASS |
| `(empty string)` | `(empty string)` | PASS |

---

## Performance Results

| Test | Result | Target | Status |
|------|--------|--------|--------|
| Health endpoint median | 0.6ms | <10ms | PASS |
| Health endpoint P95 | 9.4ms | <50ms | PASS |
| detect-format (mock) | 21ms | <3000ms | PASS |
| normalize 5-row Format B (mock) | 6ms | <10000ms | PASS |
| 10 concurrent health checks | 3ms total | <100ms | PASS |
| Memory after 50 requests | -11.69MB growth | <50MB | PASS |

---

## Feature Implementation Status

| Feature | Files Modified | Status |
|---------|---------------|--------|
| 2-A Table horizontal scroll + sticky columns | DataTable.tsx | DONE |
| 2-B Spare Part Category (Column G) | types, normalizeController, DataTable, excelService | DONE |
| 2-C Swedish translation at normalization | openaiService, claudeService, geminiService | DONE |
| 2-D ERS. semantic handler | ersHandler.js (new), normalizeController, claudeService | DONE |
| 2-E Format B noise cleaning | normalizeController, openaiService | DONE |
| 2-F Import Ready export sheet | excelService (3rd sheet), exportController | DONE |
| 2-G Column mapping persistence | ManualMappingDialog (localStorage + LRU) | DONE |
| 2-H Mobile responsiveness | globals.css (touch targets, mobile overrides) | DONE |

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/src/utils/ersHandler.js` | ERS. semantic handler |
| `backend/src/routes/cache.js` | Cache clear + stats API endpoints |
| `backend/tests/unit/ersHandler.test.js` | 5 unit tests for ERS handler |
| `backend/tests/unit/formatBNoise.test.js` | 5 unit tests for noise cleaner |

## Files Modified

| File | Changes |
|------|---------|
| `shared/types/index.ts` | Added `sparePartCategory?`, `_originalFormat?` to NormalizedRow; `sparePartCategory?` to ColumnMapping |
| `backend/src/services/excelService.js` | Skip row 1 + metadata rows; Category column in export; Import Ready sheet (3rd) |
| `backend/src/services/cacheService.js` | `makeCacheKey` uses description fallback for empty fields |
| `backend/src/controllers/normalizeController.js` | Format B sends only col_1; noise cleaning; ERS handler; Category; _originalFormat |
| `backend/src/controllers/verifyController.js` | Pass description to makeCacheKey |
| `backend/src/controllers/exportController.js` | Pass originalFormat to Excel builder |
| `backend/src/controllers/manualMapController.js` | Category + ERS handler + _originalFormat |
| `backend/src/services/openaiService.js` | Swedish translation; noise instructions; heuristic mock |
| `backend/src/services/claudeService.js` | Removed Swedish + ERS rules |
| `backend/src/services/geminiService.js` | Removed Swedish + ERS rules from prompt |
| `backend/src/services/mocks/openaiMock.js` | Added `mockNormalizeRow()` heuristic parser |
| `backend/src/middleware/validation.js` | Added sparePartCategory + _originalFormat to schemas |
| `backend/src/server.js` | Health before rate limiter; cache route |
| `frontend/components/DataTable.tsx` | Sticky cols/header; score badges; website links; empty cells; hover; scroll indicator; keyboard nav |
| `frontend/components/SheetSelector.tsx` | Smart default sheet selection |
| `frontend/components/ManualMappingDialog.tsx` | localStorage persistence + LRU + Category field |
| `frontend/components/SparePartsApp.tsx` | Fixed header; passes sheetName to dialog |
| `frontend/hooks/useVerification.ts` | Phase reset to idle before sheet selector |
| `frontend/app/globals.css` | Empty cell style; touch targets; mobile overrides |

---

## Critical Security Checks

| Check | Status |
|-------|--------|
| `internalItemNumber` NEVER sent to AI | PASS — Format B sends only col_1; verify controller excludes it from Gemini/Claude payloads |
| `sparePartCategory` NEVER sent to AI | PASS — Not included in any AI prompt or verification payload |
| No XSS in table rendering | PASS — React auto-escapes; URLs validated via new URL() |
| Rate limiter active | PASS — Health check exempt; all other routes rate-limited |

---

## Recommendations

1. **HIGH**: Run full integration test with MOCK_MODE=false against real AI providers before production
2. **MEDIUM**: Add column sorting to DataTable (visual indicators already in place)
3. **MEDIUM**: Add search/filter bar for quick row lookup in large datasets
4. **LOW**: Consider Redis instead of node-cache for cache persistence across restarts
5. **LOW**: Add cost tracking per verification run (token usage from each AI provider)
