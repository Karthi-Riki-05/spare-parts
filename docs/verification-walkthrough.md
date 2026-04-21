# Verification phase walkthrough — with a concrete example

This document traces a **real row** through every stage of the verification
pipeline, so new developers can see exactly how the Spare Parts Web Verifier
turns a messy Excel row into a verified, scored result with a validated URL.

Row we're verifying:

```
Internal Item #:  20045087                    (kept aside — NEVER sent to AI)
Description:      Pressure sensor, Artnr EDS 3446-2-0040-000
Manufacturer:     (empty)
Item Number:      (empty)
Type Designation: (empty)
Supplementary:    Pressure switch 40 bar
```

---

## Stage 0 — Entry

Client submits rows via `POST /api/verify` (SSE) or `POST /api/jobs/submit`
(background). Both land in the same function:
**`verificationService.processRows(rows, options)`** at
`backend/src/services/verificationService.js:14`.

Concurrency is set up:

```
maxC            = 15                       (per Gemini key)
mainPool        = p-limit(maxC × keyCount) ≈ 15 for a single key
rulePool        = p-limit(15)              (Claude fallback)
urlPool         = p-limit(30)              (HTTP probes)
```

Each row becomes one `mainPool(async () => { … })` task. A 20-row file fans
out 15 rows at once, the rest queue.

---

## Stage 1 — Deduplication

```js
const deduped = applyAllDeduplication(row);
```

(`deduplicationService.js` — D-008 + R-rules)

This:

- Strips `ERS.` prefixes from item numbers
- Collapses `itemNumber === typeDesignation` cases
- Translates Swedish → English in description if needed
- Normalizes whitespace

`internalItemNumber = '20045087'` is kept on `deduped` but never passed into
prompts (R1).

---

## Stage 2 — Cache lookup

```js
const cacheKey = cacheService.makeCacheKey(deduped);
// SHA256(manufacturer|itemNumber|typeDesignation)
const cached = await cacheService.get(cacheKey);
```

- **L1** (in-process `node-cache`): 24 h TTL
- **L2** (Postgres `verification_cache`): TTL by score —
  180 d for ≥ 90, 90 d for ≥ 70, 30 d for ≥ 50, 7 d for < 50

**Cache HIT** → skip ALL the stages below. Push result, emit
`onRowComplete`, done. Cost: $0.

**Our example: MISS** (first time for this key) → continue.

---

## Stage 3 — Gemini web verify (the core call)

`geminiService.verifyRow(deduped, useSupplementary=false, correlationId)`:

### 3a. Prompt (internalItemNumber NOT included)

```
You are an industrial spare parts data specialist...
PART DATA:
  - Description: Pressure sensor, Artnr EDS 3446-2-0040-000
  - Manufacturer: empty
  - Type Designation: empty

STEP 1 — EXTRACT ITEM NUMBER from description text
STEP 2 — INFER MANUFACTURER (prefix table → "EDS" → Hydac)
STEP 3 — SEARCH THE WEB (manufacturer domain first, then distributors)
STEP 3b — CROSS-VERIFY part number AND product type appear on page
...
Respond with ONLY a valid JSON object: {...}
```

### 3b. API call

```js
const model = getClient(apiKey).getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: [{ googleSearch: {} }],    // <-- grounded search enabled
});
const genResult = await model.generateContent(prompt);
```

### 3c. Gemini responds (example, simplified)

```json
{
  "extracted_item_number": "EDS 3446-2-0040-000",
  "description":           "Pressure sensor...",
  "manufacturer":          "Hydac",
  "type_designation":      "EDS 3446-2-0040-000",
  "verified_source":       "Exact part number found on Hydac website",
  "verification_score":    95,
  "website_id":            "https://www.hydac.com/en/products/.../eds-3446-2-0040-000",
  "source_type":           "official",
  "manufacturer_inferred": true
}
```

Plus on `genResult.response.candidates[0].groundingMetadata`:

```json
{
  "groundingChunks": [
    { "web": { "uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZI...", "title": "hydac.com" } }
  ],
  "webSearchQueries": ["Hydac EDS 3446-2-0040-000"]
}
```

---

## Stage 4 — Citation filter (anti-hallucination)

**This is where URLs that look right but don't exist get caught.**
`geminiCitationFilter.applyCitationFilter(response, modelUrl)`.

### Level A — domain gate (free, no HTTP)

Extract all `groundingChunks[i].web.title` domains →
`titleDomains = { 'hydac.com' }`.

Model URL apex = `hydac.com`. Is it in `titleDomains`? **Yes** → pass to
Level B.

(If Gemini hadn't cited anything → `no_citations_fallback`, keep URL with
score cap 60. If Gemini cited only mouser.com → `domain_not_cited`, **hard
reject**, URL cleared, score = 0.)

### Level B — resolve redirects, path-match (~200–500 ms)

Parallel HEAD-follow each `grounding-api-redirect/...` URL to get the real
source URL:

```js
resolvedUrls = await resolveCitations(redirectUris);
// → ['https://www.hydac.com/en/products/sensors/pressure-switches/eds-3400']
```

Compare model URL path to resolved paths:

- **Exact match?** `/en/products/.../eds-3446-2-0040-000` vs
  `/en/products/sensors/pressure-switches/eds-3400`. No.
- **Prefix either way?** Model path doesn't start with citation path,
  citation doesn't start with model. No.
- **Same apex, paths diverge** → Level C.

### Level C — replace URL

```js
parsed.website_id         = 'https://www.hydac.com/en/products/sensors/pressure-switches/eds-3400';
parsed.verification_score = Math.min(95, 75); // cap at 75
parsed._url_validation_status = 'citation_replaced';
```

**Now the row has a URL that actually exists** (because Google's search
result literally pointed there), at the cost of a reduced score to mark
that we replaced what the model wrote.

---

## Stage 5 — Rule enforcement fallback (conditional)

Runs **in parallel** with URL validation (Stage 6) via
`Promise.all([rulePromise, urlPromise])`.

Triggers when:

```js
if (result.verificationScore < 70 && supplementary.trim()) {
  // classify supplementary
  const suppType = classifySupplementary(deduped.supplementary);
  if (suppType === 'part_specification') {
    // 2nd Gemini call WITH supplementary added to prompt (D-010)
    result = await verifyRow(deduped, useSupplementary=true, correlationId);
  }
}
if (result.verificationScore < 70 || !result.manufacturer) {
  // Claude-style rule enforcement (actually gemini-2.0-flash now)
  result = await claudeService.enforceRules(deduped, result, correlationId);
}
```

**Our example: score = 75, manufacturer = 'Hydac' → skip.** No fallback
needed.

---

## Stage 6 — URL validation (network probe)

`urlValidatorService.validateUrl(result.websiteId)`:

```js
// GET with real Chrome User-Agent, 15 s timeout, redirect: follow
const res = await fetch(url, { method: 'GET', redirect: 'follow', headers: BROWSER_HEADERS });
```

Outcome table (applied to **our replaced Hydac URL**):

| Response | `validation_status` | Action on result |
|---|---|---|
| 200 | `confirmed` | keep URL + score |
| 301/302 to real page | `confirmed`, adopt `finalUrl` | keep |
| **403 Forbidden** (what Hydac actually returns to servers) | `bot_blocked` | see Stage 7 |
| 404 / 410 | `broken_404` | clear URL, score ≤ 55, sourceType = unknown |
| 5xx / timeout / DNS fail | `unverified` | score ≤ 70 |
| Landed on `/error`, `/404`, `/login` path | `broken_error` | clear URL |

Hydac returns **403** to server-side requests →
`validation_status: 'bot_blocked'`.

---

## Stage 7 — Final score cap + status reconciliation

Back in `verificationService.processRows`:

```js
const isCitationStatus =
  priorStatus === 'citation_confirmed'  ||
  priorStatus === 'citation_partial'    ||
  priorStatus === 'citation_replaced'   ||
  priorStatus === 'no_citations_fallback';
```

Our row's `priorStatus = 'citation_replaced'` → `isCitationStatus = true`.

Branch for `bot_blocked`:

```js
const trusted = isTrustedDomain(url);   // hydac.com IS in TRUSTED_DOMAINS
const cap     = trusted ? 85 : 60;      // → 85
const capped  = Math.min(75, 85);       // already lower, stays 75
r.verificationScore = 75;
// citation status PRESERVED (not overwritten to bot_blocked_trusted)
// because citation layer already judged this URL
```

**Final state of this row:**

```
verificationScore:       75
websiteId:               https://www.hydac.com/.../eds-3400   (from citation)
sourceType:              official
urlValidationStatus:     citation_replaced
verifiedSource:          "Exact part number found on Hydac website (URL updated from citation)"
internalItemNumber:      20045087              (reattached at the end)
```

---

## Stage 8 — Post-processing

```js
result = deduplicateVerified(result);           // R-rule cleanup on output
result = mirrorOriginalLayout(result, deduped); // restore column shape
result.rowIndex           = row.rowIndex;
result.internalItemNumber = internalItemNumber; // R1 reattach

// Supplementary protection
if (!result.supplementaryChanged) {
  result.supplementary = row.supplementary;     // restore original
}
```

---

## Stage 9 — Cache write

```js
await cacheService.set(cacheKey, result, {
  manufacturer:     'Hydac',
  item_number:      'EDS 3446-2-0040-000',
  type_designation: 'EDS 3446-2-0040-000',
});
```

Written to both L1 (in-process) and L2 (`verification_cache` table) with
`re_verify_after = now + 90 days` (score ≥ 70 bracket).

---

## Stage 10 — Emit to client

```js
results.push(result);
onRowComplete(result);
onProgress({ completed, total, elapsedSeconds, batch });
```

- SSE mode → writes `event: row_complete` / `data: {...}` down the stream
- Background job mode → updates `verification_jobs.processed_rows` in
  Postgres; client polls `/api/jobs/:jobId/status`

Frontend `DataTable.tsx` receives the row via `useSSE` / `useVerification`,
renders it:

- Score badge: 75 → **yellow**
- Website column: ♻ orange link (because `citation_replaced`)
- Tooltip: *"URL updated from search citation (AI's original URL did not match)"*

---

## The whole pipeline in one picture

```
POST /api/verify
   ↓
verificationService.processRows(rows)
   ↓ p-limit 15 (per Gemini key) — rows run in parallel
   │
   ├── 1. applyAllDeduplication(row)            [dedup/R-rules]
   ├── 2. cacheService.get(sha256)              [HIT → return, DONE]
   ├── 3. geminiService.verifyRow(deduped)      [gemini-2.5-flash + googleSearch]
   │       └── applyCitationFilter              [Level A → B → C]
   │             ├── Level A: domain in cited titles?
   │             ├── Level B: resolve redirects → path match
   │             └── Level C: replace URL with citation
   ├── 4. IN PARALLEL:
   │     ├── rulePromise:
   │     │     - if score<70 + part_spec → retry w/ supp
   │     │     - if score<70 OR no mfr   → claudeService.enforceRules
   │     └── urlPromise:
   │           - urlValidatorService.validateUrl (GET, HEAD fallback)
   │           - classify: confirmed/bot_blocked/unverified/broken_*
   ├── 5. reconcile score caps (preserve citation_* / no_citations_fallback)
   ├── 6. deduplicateVerified + mirrorOriginalLayout
   ├── 7. reattach internalItemNumber (R1)
   ├── 8. restore supplementary unless explicitly changed
   ├── 9. cacheService.set (L1 + L2, TTL by score)
   └── 10. onRowComplete(result) → SSE / job_results
```

**Cost per row:** 1 Gemini 2.5-flash call (cached hit = $0); extra
1 gemini-2.0-flash call only if score < 70; extra 2–5 HEAD requests to
Google redirects + 1 GET to the target URL.

**Latency per row:** typically 2–8 s depending on Gemini's grounding
search, +200–500 ms for citation resolution.

---

## Other scenarios worth knowing

**Row that gets rejected by `domain_not_cited`:** Gemini cites only
rs-online.com but writes a URL on skf.com. Level A fails because
`skf.com` isn't in `titleDomains = { 'rs-online.com' }`. URL cleared,
score = 0, `urlValidationStatus = 'domain_not_cited'`. Frontend shows —
(dash). Strong hallucination signal caught without any HTTP call.

**Row with no Gemini citations at all:** Gemini answers from pre-trained
knowledge without invoking search. `titleDomains` is empty. Level A
returns `no_citations_fallback` — URL kept, score capped at 60, HTTP
validator still runs. Frontend shows ❓ grey link.

**Row that ends up in Claude rule enforcement:** Gemini returns
`score = 55, manufacturer = ''`. Both fallback conditions fire — Claude
receives the deduped row plus Gemini's draft, re-infers manufacturer
from prefix tables, applies R-rules, returns a cleaned-up result. URL
validator still runs on whatever `websiteId` survives.
