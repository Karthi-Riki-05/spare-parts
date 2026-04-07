# Known Issues — Spare Parts Verifier

## Fixed (do not re-fix)
- docker-compose.prod.yml: curl → Node fetch healthcheck ✅
- Rate limiter blocked /api/health → health route mounted before limiter (server.js:41) ✅
- Frontend hot-reload in Docker → volume mounts in dev compose ✅

## Open (medium)
- No search/filter on DataTable
- No column sorting on table headers
- No column visibility toggle
- ManualMappingDialog has no preview before apply

## Open (low)
- 50MB JSON body limit is high (server.js:26-27)
- node-cache in-memory — lost on restart (consider Redis when scaling, D-002)
- No request timeout middleware (only per-AI-call timeout)
- No lazy export for very large result sets
- Legacy EJS views/ still mounted at / — candidate for removal

## Architecture Decisions (see DECISIONS.md)
- D-001 No pagination → react-window
- D-002 No Redis/Bull → node-cache + p-limit
- D-003 exceljs (MIT) not SheetJS (commercial)
- D-004 Web Worker for Excel parsing
- D-005 Three-model AI pipeline
- D-006 HEAD-validate every URL
- D-007 Playwright CLI not MCP
- D-008 Column E TYPE_A vs TYPE_B classification
- D-009 internalItemNumber = column 0 always, never to AI
- D-010 Two-pass score < 70 retry rule
- Check DECISIONS.md before changing architecture

## Security Rules
- internalItemNumber NEVER sent to AI (R1)
- Helmet.js CSP active (server.js:13-24)
- Zod validation on all inputs
- Rate limiting on all /api routes EXCEPT /health
- API keys only via backend/.env
