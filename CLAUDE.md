# Spare Parts Web Verifier — CLAUDE.md

Excel-driven spare parts verification: upload xlsx → AI normalize → web-verify via Gemini → score & export.

## Stack
| Layer    | Tech                                                |
|----------|-----------------------------------------------------|
| Frontend | Next.js 14 App Router, TS 5.4, Tailwind 3.4         |
| Backend  | Express 4.18 (CommonJS JS), Zod, Helmet, Winston    |
| Excel    | exceljs 4.3 (read+write)                            |
| Table    | react-window FixedSizeList (no pagination)          |
| AI       | Gemini only — 2.0-flash (normalize/fallback) + 2.5-flash (verify) |
| Cache    | node-cache (in-mem, 24h TTL, SHA256 key)            |
| Queue    | p-limit 5 concurrent (no Redis/Bull)                |
| Ports    | frontend 3000, backend 3001                         |
| Tests    | Vitest (backend), Playwright (e2e)                  |

## Critical Rules
- internalItemNumber NEVER sent to AI (R1) — column 0, reattached after
- ALL AI URLs validated via HEAD before storage (R26)
- MOCK_MODE=true → no real API calls (also OPENAI/GEMINI/CLAUDE_MOCK_MODE)
- Single API key: GEMINI_API_KEY in backend/.env via config.js (Zod-validated)
- Health route registered BEFORE rate limiter
- Max rows: 10,000 hard / 5,000 warning
- Complete every file fully — no TODO/truncation
- Bug fixes: changed lines + 3 lines context only

## Backend
- routes/ → controllers/ → services/ (logic in services only)
- Zod validation in middleware/validation.js
- Correlation ID (uuid) on every request
- retry() util: 3 attempts, exponential backoff (1s/2s/4s)
- Errors via errorHandler middleware, log with logger
- SSE for /api/verify (progress, row_complete, complete, error)
- Legacy EJS views/ still served at /

## Frontend
- app/ pages, components/ React, hooks/ state, lib/ api+utils
- All API calls in lib/api.ts (typed)
- Types from @spare-parts/types (shared/types/index.ts)
- Main state: hooks/useVerification.ts (single source)
- DataTable: FixedSizeList itemSize=36, height=min(600, rows*36)
- Inline edit: Enter save / Escape cancel / blur autosave
- Score colors: ≥90 green, 70-89 yellow, 50-69 orange, <50 red
- Dark theme (Tailwind tokens: bg-bg-surface, brand-cyan, brand-red)

## AI Pipeline (single provider — GEMINI_API_KEY)
- gemini-2.0-flash (openaiService.js) → format detect (A/B/C) + normalize (Format B/C only)
- gemini-2.5-flash + googleSearch tool (geminiService.js) → web verify (PRIMARY)
- gemini-2.0-flash (claudeService.js) → rule enforcement fallback (score < 70 only)
- Note: service filenames keep legacy names (openai/claude) but all call the Gemini API
- Two-pass: if <70 AND supplementary=part_specification → retry Gemini w/ supp
- Cache check before any AI call (24h TTL)
- Concurrency: p-limit=5, batch=5, timeout=30s

## Docker
- Dev:  `docker compose up -d`
- Prod: `docker compose -f docker-compose.prod.yml up -d --build`
- Healthcheck uses Node fetch (not curl)
- Frontend hot-reload: volume mounts active in dev compose

## Modules (paths in .claude/rules/modules.md)
- excel-processing | ai-verification | table-display | export | ui-components | shared-types

## Agent Instructions
- Identify module FIRST → read only that module's files
- Max 3 files without asking; 5+ files → confirm
- Max 3 parallel sub-agents, 5 files each, no overlap
- Never scan node_modules, .next, dist, public, *.min.js, package-lock
- /clear between unrelated modules; /compact for long same-task sessions
- Code only — no prose unless asked

## Reference
See `.claude/rules/` for: always, scan-prevention, ai-providers, excel-processing,
backend, frontend, verification-flow, agent-limits, session, known-issues, modules.
See `DECISIONS.md` for D-001..D-010 architectural decisions.
