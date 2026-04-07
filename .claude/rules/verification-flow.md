# Verification Flow Rules

## SSE Stream Events (in order)
- progress     → { batch, totalBatches, completed, total, elapsedSeconds }
- row_complete → { result: VerificationResult }
- complete     → { response: VerificationResponse } (results, changeLogs, stats, cacheHits)
- error        → { rowIndex, message } (rowIndex >= 0 = per-row, -1 = fatal)
- cancelled    → client-side abort

## Score Thresholds
- ≥ 90: green  (high confidence)
- 70-89: yellow (medium confidence)
- 50-69: orange (low confidence)
- < 50:  red    (very low)
- < 70:  triggers Claude fallback (D-010)

## URL Validation (always after Gemini) — D-006, R26
- HEAD request to every websiteId
- 5 second timeout
- Status: valid | redirected (with finalUrl) | broken | timeout | unchecked
- broken/timeout → clear websiteId + sourceType
- File: backend/src/services/urlValidatorService.js

## Cache
- Key: SHA256(manufacturer|itemNumber|typeDesignation)
- TTL: 86400 seconds (24h, config.cacheTtlSeconds)
- Hit → skip ALL AI calls
- Stats reported in SSE complete event (cacheHits)
- In-memory node-cache — lost on restart (D-002)

## ETA Display (frontend)
- Only shown when total > 1000 rows
- ETA = (elapsed / completed) * remaining
