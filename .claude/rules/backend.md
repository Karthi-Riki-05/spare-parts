# Backend Rules — Spare Parts Verifier

## Stack (memorize — do not re-read)
- Express 4.18.2 (CommonJS, plain JS — no TS)
- ExcelJS 4.3.0 (parse + generate)
- Zod input validation on ALL routes (middleware/validation.js)
- Winston logger (utils/logger.js)
- Helmet.js with custom CSP
- express-rate-limit 7.1.5 (middleware/rateLimiter.js)
- Health route registered BEFORE rate limiter (server.js:41)
- 50mb body limit (server.js:26-27)

## Pattern (copy from existing — read ONE file)
- Controllers handle req/res only
- Services contain ALL business logic
- Zod validates input, returns 400 on fail
- correlationId (uuid v4) on every request → included in error responses
- retry() util for AI calls (3 attempts, exponential 1s/2s/4s)
- Mock services swapped via config.*MockMode flags

## File Paths
- Entry: backend/src/server.js
- Config: backend/src/config.js (Zod-validated env)
- Routes: backend/src/routes/[name].js
- Controllers: backend/src/controllers/[name]Controller.js
- Services: backend/src/services/[name]Service.js
- Middleware: backend/src/middleware/{validation,rateLimiter,errorHandler}.js
- Utils: backend/src/utils/{logger,retry,hash}.js
- Tests: backend/tests/ (Vitest)

## API Endpoints (9 routes)
- GET  /api/health           → health.js
- POST /api/get-sheets       → sheets.js
- POST /api/detect-format    → detect.js
- POST /api/normalize        → normalize.js
- POST /api/manual-map       → manualMap.js
- POST /api/verify           → verify.js (SSE stream)
- POST /api/export           → export.js
- *    /api/cache/*          → cache.js (admin)
- GET  /                     → views.js (legacy EJS)
