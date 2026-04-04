# Architectural Decisions Log — Spare Parts Web Verifier

## D-001: No Pagination — Use Virtual Scrolling
React-window FixedSizeList replaces pagination. Reason: pagination + inline editing
creates conflicting state. Virtual scrolling handles 10,000 rows without page splits.

## D-002: No Redis / No Bull
node-cache (in-memory TTL cache) replaces Redis.
p-limit replaces Bull queue.
Reason: removes infrastructure dependency for MVP. Single server deployment on
AWS Lightsail containers is simpler without Redis sidecar.

## D-003: exceljs Not SheetJS
exceljs is MIT licensed. SheetJS (xlsx) changed to commercial license.
exceljs handles .xlsx read/write, cell styling, multiple sheets.

## D-004: Web Worker for Excel Parsing
Vite Web Worker using `new Worker(new URL('./workers/excelWorker.ts', import.meta.url), { type: 'module' })`
Prevents main thread blocking on large files.

## D-005: Three-Model AI Pipeline
- GPT-4o-mini: format detection, normalization, Swedish translation (no web needed)
- Gemini 2.5 Flash + Google Search grounding: web verification, URL retrieval
- Claude Sonnet 4.6: rule enforcement fallback for rows with confidence < 70
Reason: each model used only for what it does best. Cost for 1,000 rows: ~$14-22.

## D-006: HTTP HEAD Validation on Every URL
Every URL returned by AI must pass validateUrl() before storage.
Returns: valid | redirected (with finalUrl) | broken | timeout.
Reason: AI hallucinates ~10-25% of URLs. Client sees only validated URLs.

## D-007: Playwright CLI Not MCP
CLI saves snapshots to disk (.playwright-cli/). MCP streams into context window.
4.6x token reduction. 100% task success rate vs MCP partial failures.
Works with Claude Code (has filesystem access). MCP only for sandboxed chat UIs.

## D-008: Column E (Supplementary) Classification
Before modifying column E, classify as:
- TYPE_A: part identification data (usable for verification)
- TYPE_B: internal instructions (names, "contact", "do not", "check with" — read-only)
Only TYPE_A content is used when confidence < 70. TYPE_B is never modified.

## D-009: Internal Item Number = Always Column Index 0
Regardless of Format A/B/C, the leftmost column (index 0) is the internal item number.
Stored separately. Never sent to AI. Reattached to output after verification.

## D-010: Confidence Score Two-Pass Rule
Single AI call returns primary confidence (A-D only).
If confidence >= 70: column E not touched.
If confidence < 70: re-call with column E included as Plan B.
Avoids two separate API calls per row.