# Sparepartner Verification System — Architecture Audit Report

**Generated:** 2026-05-22  
**Auditor:** Claude Sonnet 4.6 (automated deep-read audit)  
**Branch:** production  
**Status:** All 3 containers healthy at audit time

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [System Purpose](#2-system-purpose)
3. [Backend Analysis (Express)](#3-backend-analysis-express)
4. [Frontend Analysis (Next.js)](#4-frontend-analysis-nextjs)
5. [Database Analysis (PostgreSQL)](#5-database-analysis-postgresql)
6. [Docker Setup](#6-docker-setup)
7. [Issues & Risks](#7-issues--risks)
8. [Executive Summary](#8-executive-summary)

---

## 1. Repository Structure

```
spare-parts-verifier/
├── backend/
│   ├── src/
│   │   ├── config/           database.js (pg pool)
│   │   ├── config.js         Zod-validated env schema
│   │   ├── controllers/      6 controllers (thin req/res layer)
│   │   ├── middleware/       auth, error, rateLimiter, requestLogger, validation
│   │   ├── migrations/       13 SQL migrations + run.js (auto on boot)
│   │   ├── routes/           17 route files
│   │   ├── scripts/          clear-cache.js
│   │   ├── services/         24 services (AI, DB, email, cache, audit)
│   │   │   └── mocks/        claude, gemini, openai mocks
│   │   ├── utils/            logger, retry, hash, aiErrorLogger, etc.
│   │   └── server.js         Express bootstrap
│   ├── e2e/                  5 Playwright specs (edit, export, mobile, upload, verify)
│   ├── views/                3 legacy EJS templates
│   ├── .env / .env.example
│   └── Dockerfile
├── frontend/
│   ├── app/                  Next.js App Router
│   │   ├── page.tsx          Home → SparePartsApp
│   │   ├── login/            Company auth
│   │   ├── jobs/             Job list + detail ([jobId])
│   │   ├── results/[jobId]/  Job results viewer
│   │   ├── profile/          Password change
│   │   ├── super-admin/      Dashboard, companies CRUD, login
│   │   ├── forgot-password/
│   │   ├── reset-password/[token]/
│   │   ├── confirm-email/[token]/
│   │   └── api/verify/route.ts  Next.js Route Handler (SSE proxy)
│   ├── components/           13 components (DataTable, FileUpload, etc.)
│   ├── hooks/                5 hooks (useVerification, useSSE, useEditState, etc.)
│   ├── lib/                  api.ts, auth.ts, superAdminApi.ts, utils.ts
│   ├── middleware.ts          Auth guard (server-side)
│   └── Dockerfile            Multi-stage (builder + runtime)
├── shared/
│   └── types/index.ts        8 interfaces, 4 SSE types, 7 type aliases
├── e2e/frontend/             7 Playwright auth/flow specs
├── docker-compose.yml        Dev compose
├── docker-compose.prod.yml   Production compose (Lightsail)
├── DECISIONS.md              D-001..D-010 ADRs
└── CLAUDE.md                 AI-agent instructions
```

**Notable files outside normal scope:**
- `cookies.txt`, `cookies_frontend.txt` — session cookie dumps in repo root (**security risk**)
- `frontend/fcm-service.json` — Firebase Cloud Messaging service account (tracked in git, **security risk**)
- `frontend/vfs_backup.zip` — unknown backup archive committed to frontend dir
- `project_develop.txt`, `project_devlop.txt` — duplicate dev notes in root
- Multiple `.xlsx` test files committed directly to root

---

## 2. System Purpose

**Sparepartner Verification** is a multi-tenant SaaS tool for industrial spare-parts data quality assurance. The workflow is:

```
Company uploads Excel (.xlsx)
        ↓
Format detection (A/B/C) via Gemini 2.0-flash
        ↓
Normalization (extract manufacturer, itemNumber, typeDesignation)
        ↓
Web verification via Gemini 2.5-flash + Google Search grounding
        ↓
Each part row receives: verificationScore (0–100), websiteId (validated URL),
                        sourceType (official/external/inferred/not_found)
        ↓
Score < 70 → rule-enforcement fallback (Gemini 2.0-flash / claudeService)
        ↓
All URLs HEAD-validated before storage
        ↓
Export verified results as annotated Excel
```

**What is being verified:** Industrial OEM spare-part records — manufacturer identity, part numbers, type designations — against live manufacturer/distributor websites. The goal is data enrichment and trustworthiness scoring, not compliance in a legal sense.

**User roles:**
- **Company** — uploads files, runs verification jobs, exports results
- **Super Admin** — manages company accounts, can view/deactivate, has separate login portal

---

## 3. Backend Analysis (Express)

### 3.1 API Endpoints (17 route files)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Liveness check (before rate limiter) |
| POST | `/api/auth/login` | None | Company login → sets HttpOnly cookie |
| POST | `/api/auth/logout` | None | Clears cookie |
| GET | `/api/auth/me` | Company | Session info |
| GET | `/api/auth/confirm/:token` | None | Email confirmation |
| POST | `/api/auth/forgot-password` | None | Request password reset |
| POST | `/api/auth/reset-password` | None | Apply reset token |
| POST | `/api/auth/change-password` | Company | Change own password |
| POST | `/api/super-admin/login` | None | Super admin login |
| GET/POST | `/api/super-admin/*` | SuperAdmin | Company management |
| GET | `/api/ai-status` | None | Gemini key/pool diagnostics |
| GET | `/api/cache-stats` | None | Cache hit/miss counters |
| POST | `/api/get-sheets` | Company | Parse Excel sheets list |
| POST | `/api/detect-format` | Company | Detect Excel format A/B/C |
| POST | `/api/normalize` | Company | Normalize rows via AI |
| POST | `/api/manual-map` | Company | Apply manual column mapping |
| POST | `/api/verify` | Company | SSE stream — verify all rows |
| POST | `/api/export` | Company | Generate verified Excel |
| GET/DELETE | `/api/cache/*` | Company | Cache admin |
| GET/POST | `/api/jobs/*` | Company | Background job management |
| GET/PUT | `/api/preferences` | Company | Column visibility preferences |
| GET | `/api/dev/*` | None (dev only) | Email preview endpoint |

**Registration order matters:** Health + auth + super-admin + ai-status + cache-stats are mounted **before** `rateLimiter`, which is intentional to prevent lockout under load.

### 3.2 PostgreSQL Connection

```js
// backend/src/config/database.js
const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 20,                      // max simultaneous PG connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
```

- **No ORM** — raw `pg` queries via a thin `pgService.js` wrapper (`query`, `getOne`, `getMany`, `execute`, `withTransaction`)
- Slow query logging: queries > 1000ms are logged as `[PG SLOW QUERY]`
- Pool error events are caught and logged
- SSL disabled by default (Docker internal), opt-in via `DATABASE_SSL=true` for cloud managed DBs

### 3.3 Authentication & Authorization

- **JWT** stored in `HttpOnly` cookie (`spare_parts_token`), `sameSite: lax`
- Cookie `secure` flag driven by `COOKIE_SECURE` env var (must be `true` in production)
- Two separate middleware guards: `requireCompany`, `requireSuperAdmin`
- Both re-query the DB on every request to pick up `confirmed`/`is_active` changes without token re-issue
- Password hashing: `bcryptjs`, 12 rounds
- Token expiry: 7 days (configurable via `JWT_EXPIRES_IN`)
- No refresh token mechanism — users must re-login after expiry

### 3.4 Environment Variables Required

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | **YES** | — | Fails startup without it |
| `GEMINI_API_KEY` | **YES** | `''` | Soft fail — mock mode still works |
| `JWT_SECRET` | Recommended | `'changeme-secret-key'` | **CRITICAL — change in prod** |
| `SUPER_ADMIN_EMAIL` | Recommended | hardcoded dev email | Seed on first boot |
| `SUPER_ADMIN_PASSWORD` | Recommended | `'SuperAdmin@2026'` | **CRITICAL — change in prod** |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | For email | `''` | Silent if missing; email features disabled |
| `APP_URL` | For email links | `http://localhost:3000` | Must be public URL in prod |
| `COOKIE_SECURE` | Prod | `false` | Must be `true` behind HTTPS |
| `NODE_ENV` | Recommended | `development` | Controls dev-email route |

### 3.5 Middleware Stack

```
helmet (CSP)
→ cors (origin from config.corsOrigin)
→ express.json (50mb limit)
→ cookieParser
→ static files
→ 600s request/response timeout
→ correlationId (uuid)
→ requestLogger
→ views (legacy EJS at /)
→ [health, auth, super-admin, ai-status, cache-stats] — NO rate limit
→ rateLimiter (500 req / 15min window)
→ [all /api routes]
→ 404 handler
→ errorHandler
```

**Rate limiter:** 500 requests per 15-minute window (global, IP-based). No per-company or per-endpoint granularity.

### 3.6 Logging

- **Winston** with structured JSON output
- Log levels: error, warn, info (configurable via `LOG_LEVEL`)
- File write optional via `LOG_WRITE=true` (writes to `backend/logs/`)
- AI errors logged to `ai_errors` PG table via `aiErrorLogger.js`
- Correlation ID included in all error responses

### 3.7 Error Handling

Centralized `errorHandler` middleware classifies errors into 10 categories (`QUOTA`, `RATE_LIMIT`, `VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `FILE_TOO_LARGE`, `INVALID_FILE`, `DB_ERROR`, `TIMEOUT`, `INTERNAL`) and returns user-safe messages. Sensitive body fields (`password`, `token`, `fileData`) are stripped before logging.

### 3.8 AI Pipeline Architecture

```
L1 Cache (node-cache, RAM, 24h TTL)
    ↓ miss
L2 Cache (PG verification_cache, score-based TTL: 7–180 days)
    ↓ miss
Gemini 2.5-flash + Google Search (PRIMARY verify)
    ↓ score < 70
Retry with supplementary column (if TYPE_A)
    ↓ still < 70
Gemini 2.0-flash rule enforcement (claudeService.js — legacy filename)
    ↓
URL HEAD-validation for every websiteId
    ↓
Store in L2 PG cache + L1 RAM cache
```

**Key services (all call Gemini API):**
- `openaiService.js` → gemini-2.0-flash (format detection + normalization — legacy filename)
- `geminiService.js` → gemini-2.5-flash + googleSearch grounding (primary verification)
- `claudeService.js` → gemini-2.0-flash (rule enforcement fallback — legacy filename)
- `geminiPool.js` → round-robin across up to 3 API keys, 15 concurrent per key

---

## 4. Frontend Analysis (Next.js)

### 4.1 Pages & Routing

```
/ (page.tsx)                  → SparePartsApp — main verification UI
/login                        → Company login form
/forgot-password              → Request reset email
/reset-password/[token]       → Apply reset
/confirm-email/[token]        → Email confirmation landing
/profile                      → Change password
/jobs                         → Job history list
/jobs/[jobId]                 → Job detail / live progress
/results/[jobId]              → Completed job results (DataTable)
/super-admin/login            → Super admin login
/super-admin/dashboard        → Company list
/super-admin/companies/new    → Create company
/super-admin/companies/[id]   → Edit / deactivate company
/docs                         → API documentation viewer
```

### 4.2 State Management

**No Redux, no Zustand, no Context API.** State is managed entirely via custom hooks:

- `useVerification.ts` — single source of truth for the entire verification workflow (file, phase, rows, stats, job state)
- `useSSE.ts` — EventSource management (connect, abort, event routing)
- `useEditState.ts` — inline cell editing (Enter save, Escape cancel, blur autosave)
- `useColumnPreferences.ts` — column visibility toggle, persisted to backend
- `useAlert.ts` — toast notification state

### 4.3 Backend Communication

- **API proxy:** `next.config.mjs` rewrites `/api/*` → `http://backend:3001/api/*` (Docker internal)
- **Client-side:** `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` for browser-origin SSE calls
- All typed API calls centralized in `frontend/lib/api.ts`
- **SSE (Server-Sent Events):** `/api/verify` is the real-time stream — `useSSE.ts` wraps `EventSource` with abort controller for cancel/unmount
- A Next.js Route Handler at `frontend/app/api/verify/route.ts` proxies SSE from backend to browser (needed because Next.js rewrites don't stream SSE correctly in all environments)

### 4.4 Rendering Strategy

- `'use client'` only where interactivity is needed (SparePartsApp, DataTable, hooks)
- Server Components used for static/layout pages
- `Suspense` boundary on the home page for lazy loading
- **Next.js `output: 'standalone'`** — production Dockerfile copies `.next/standalone` (optimized, no full `node_modules` needed)

### 4.5 Table Display

```
react-window FixedSizeList
  itemSize: 36px
  height: Math.min(600, rows.length * 36)
  No pagination — virtual scroll for up to 10,000 rows
```

### 4.6 Auth Guard (Middleware)

`frontend/middleware.ts` runs in the Edge Runtime on every non-static request:
- Fetches `/api/auth/me` or `/api/super-admin/me` from the backend
- Redirects to `/login` or `/super-admin/login` on 401
- Public paths: `/login`, `/forgot-password`, `/reset-password`, `/confirm-email`, `/api/`, `/super-admin/login`

**Risk:** The middleware calls the backend on every SSR request. If the backend is slow or down, all page loads hang until the fetch times out (no explicit timeout in the middleware `fetch` call).

### 4.7 Forms & File Uploads

- File uploads: `FileToBase64` converts the xlsx to base64 string before POSTing JSON (`50mb` limit on backend)
- No native `multipart/form-data` — entire file lives in memory as base64 (1.33× size amplification)
- Forms have basic client-side validation; password strength checking is minimal (8 char minimum only)

### 4.8 Accessibility & Error Handling

- Loading states present (animate-pulse spinners, button disabled states)
- Error messages surface via `useAlert.ts` (toast-style)
- No aria-labels on DataTable virtual rows (react-window rows lack accessible markup)
- No keyboard-navigable row selection in DataTable

---

## 5. Database Analysis (PostgreSQL)

### 5.1 Tables Overview

| Table | Primary Key | Rows (est.) | Notes |
|-------|------------|-------------|-------|
| `schema_migrations` | name (VARCHAR) | 13 | Migration tracking |
| `super_admins` | UUID | few | Seeded on boot |
| `companies` | UUID | grows | Multi-tenant anchor; FK → super_admins |
| `verification_jobs` | UUID | grows | Per-job state + stats |
| `job_results` | UUID | large | Per-row results (JSONB), FK → jobs |
| `verification_cache` | sha256_key (VARCHAR 64) | large | Cross-tenant, shared |
| `ai_errors` | UUID | grows | AI failure audit trail |
| `audit_logs` | UUID | grows | Company/admin action log |
| `column_preferences` | UUID | small | Per-company UI preferences |

### 5.2 Schema Deep Dive

#### `companies`
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
email VARCHAR(255) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
confirmed BOOLEAN DEFAULT FALSE          -- email confirmation gate
confirmation_token UUID UNIQUE           -- 72h expiry
is_active BOOLEAN DEFAULT TRUE           -- admin deactivation toggle
credits_balance INTEGER DEFAULT 0        -- future billing hook (unused)
deactivated_at TIMESTAMPTZ
deactivation_reason TEXT
created_by UUID REFERENCES super_admins  -- tracks who provisioned the company
```

**Indexes:** email, confirmed, confirmation_token, password_reset_token

#### `verification_jobs`
```sql
job_id UUID PRIMARY KEY
company_id UUID NOT NULL REFERENCES companies ON DELETE CASCADE
status VARCHAR(50)   -- queued|pending|processing|completed|failed
phase VARCHAR(50)
meta JSONB            -- format detection result, sheet info, column mapping
results_json JSONB    -- full results payload (large — added in migration 009)
original_headers JSONB
-- Score buckets (two overlapping sets from P1 and P2 migrations):
score_above90, score_70to89, score_below70     -- migration 004
web_verified, score_50_to_89, score_below_50   -- migration 009 (legacy bridge)
```

**Note:** There are two overlapping score bucket schemas (`score_above90`/`score_70to89`/`score_below70` vs `score_50_to_89`/`score_below_50`) due to a migration bridge (009). These will need reconciliation in a future phase (noted in migration comments as P4 work).

#### `verification_cache`
```sql
sha256_key VARCHAR(64) PRIMARY KEY   -- SHA256(manufacturer|item|type|description[:50])
score INTEGER
website_id TEXT
source_type VARCHAR(50)
result JSONB                          -- full cached verification result
hit_count INTEGER DEFAULT 1          -- tracks reuse frequency
re_verify_after TIMESTAMPTZ          -- score-based TTL (7/30/90/180 days)
url_validation_status VARCHAR(50)    -- promoted from JSONB in migration 013
```

**Cache TTL Policy (smart, score-based):**
| Score | Re-verify After |
|-------|----------------|
| ≥ 90 | 180 days |
| ≥ 70 | 90 days |
| ≥ 50 | 30 days |
| < 50 | 7 days |

**Shared across all companies** (parts data is public; cache key contains no company data).

#### `job_results`
```sql
id UUID PRIMARY KEY
job_id UUID REFERENCES verification_jobs ON DELETE CASCADE
row_index INTEGER NOT NULL
row_data JSONB NOT NULL    -- full row including all AI output
row_type VARCHAR(50)       -- 'verified' | 'awaiting_review'
UNIQUE (job_id, row_index, row_type)
```

#### `audit_logs`
Comprehensive audit trail covering company lifecycle events, login/logout, job lifecycle, password changes. Both `company_id` and `super_admin_id` are nullable FKs set to `ON DELETE SET NULL` (log is retained when entities are deleted).

### 5.3 Indexes Assessment

- All FK columns indexed
- `created_at DESC` indexes on high-write tables (audit_logs, verification_jobs)
- `verification_cache` has partial index on `re_verify_after` (only rows with non-null value)
- **Missing:** No composite index on `(company_id, status)` or `(company_id, created_at)` on `verification_jobs` — queries filtering by both will full-scan the company's jobs

### 5.4 Data Integrity

- UUID primary keys (`gen_random_uuid()` — requires `pgcrypto` extension, enabled in migration 001)
- `ON DELETE CASCADE` for child records (job_results, ai_errors → jobs; jobs → companies)
- `ON DELETE SET NULL` for audit logs (preserve history when company deleted)
- Timestamps: `TIMESTAMPTZ` (timezone-aware) throughout
- No stored procedures or triggers — all business logic in application layer
- Migration runner uses explicit `BEGIN`/`COMMIT`/`ROLLBACK` per migration file

### 5.5 Normalization Level

**3NF with strategic denormalization:**
- `verification_jobs.results_json` (JSONB) denormalizes row results into the job row — this is for fast job-level export without JOIN on `job_results`
- `verification_cache` stores both individual columns AND the full JSONB `result` — redundancy for backwards compatibility
- Score bucket columns appear twice on `verification_jobs` — intentional bridge (documented in migration 009 comments)

---

## 6. Docker Setup

### 6.1 `docker-compose.yml` (Dev)

```yaml
postgres:
  image: postgres:16-alpine
  ports: 5433:5432          # non-standard external port (avoids conflicts)
  healthcheck: pg_isready
  restart: unless-stopped

backend:
  build: ./backend           # custom image from Dockerfile
  volumes:
    - ./backend/src:/app/src  # hot-reload (bind mount replaces image's src)
    - ./backend/logs:/app/logs
    - ./backend/data:/app/data
  depends_on: postgres (service_healthy)
  healthcheck: node fetch to /api/health

frontend:
  image: node:20-alpine       # no build — runs npm install && npm run dev at startup
  volumes:
    - ./frontend:/app         # bind mount entire frontend
    - frontend_node_modules   # named volume isolates node_modules from host
  depends_on: backend (service_healthy)
  restart: unless-stopped
  # NO healthcheck on frontend in dev
```

**Dev frontend bootstrap issue:** The frontend runs `npm install && npm run dev` on every container start. On a cold start with no cached `node_modules` volume, this takes 60–120 seconds before Next.js is ready. During this window, `depends_on` is already satisfied (backend is healthy), so any orchestration that starts the frontend immediately will see it unavailable.

### 6.2 `docker-compose.prod.yml` (Production)

```yaml
frontend:
  build: context: ., dockerfile: frontend/Dockerfile  # multi-stage build
  ports: 80:3000             # direct port 80 exposure — no TLS termination
  environment:
    NEXT_PUBLIC_BACKEND_URL: http://65.0.212.226:3001  # HARDCODED IP ⚠️

backend:
  ports: 3001:3001           # backend also directly exposed externally ⚠️
  resources: limits: memory: 512M

postgres:
  resources: limits: memory: 512M
  # postgres NOT exposed externally in prod (no ports: directive) ✅
```

**No reverse proxy (Nginx/Caddy) in the prod compose.** The app runs over plain HTTP on port 80. No HTTPS.

### 6.3 Backend Dockerfile

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache --virtual .build-deps python3 make g++
COPY package*.json ./
RUN npm ci --only=production    # production deps only ✅
COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/
RUN mkdir -p /app/logs /app/data && chown -R node:node /app/logs /app/data
USER node                       # non-root ✅
EXPOSE 3001
CMD ["node", "src/server.js"]
```

**Good:** Non-root user, production-only deps, build tools cleaned up after native compile.  
**Issue:** No `.dockerignore` optimization for `views/` or `public/` if they are large. Single-stage — no layer for dev vs prod differentiation.

### 6.4 Frontend Dockerfile (Prod)

```dockerfile
FROM node:20-alpine AS builder
COPY shared ./shared           # copies shared types before build ✅
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build              # Next.js standalone output

FROM node:20-alpine
COPY --from=builder .next/standalone ./
COPY --from=builder .next/static ./.next/static
COPY --from=builder public ./public
USER node                      # non-root ✅
CMD ["node", "server.js"]
```

**Good:** Proper multi-stage build, standalone output, non-root user.  
**Missing:** `ENV NEXT_PUBLIC_BACKEND_URL` must be passed at build time for Next.js to bake it into client bundles — the prod compose only sets it as a runtime env, which may be correct if the app reads it from `process.env` at runtime (but not from `NEXT_PUBLIC_` — those are build-time substituted).

---

## 7. Issues & Risks

### 7.1 CRITICAL — Security

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| C1 | **Default JWT secret in production** | `config.js:31`, `backend/.env` defaults | Any attacker with the default `changeme-secret-key` can forge tokens and impersonate any company or super admin |
| C2 | **Hardcoded default ADMIN_PASSWORD** in config.js | `config.js:34` → `'T@Wdev$05'` | Default company seed uses a known password visible in source code |
| C3 | **Hardcoded SUPER_ADMIN_PASSWORD** in docker-compose.yml | `docker-compose.yml:9`, `docker-compose.prod.yml:3` | DB password `SuperAdmin@2026` is committed in plaintext in version control |
| C4 | **`cookies.txt` and `cookies_frontend.txt` committed to repo** | `/cookies.txt`, `/cookies_frontend.txt`, `/frontend/cookies.txt` | Live session cookie values in version control — anyone with repo access can hijack sessions |
| C5 | **`frontend/fcm-service.json` committed to repo** | `/frontend/fcm-service.json` | Firebase service account credentials in version control |
| C6 | **Backend port 3001 exposed externally in production** | `docker-compose.prod.yml:28` | Backend API reachable directly, bypassing any future WAF/CDN layer |
| C7 | **No HTTPS in production** | `docker-compose.prod.yml` | All auth cookies, tokens, and data transmitted in cleartext over HTTP |
| C8 | **`COOKIE_SECURE=false` likely active** | `config.js:35` default | Auth cookies sent over HTTP in prod — susceptible to MITM interception |
| C9 | **Hardcoded IP in prod compose** | `docker-compose.prod.yml:58` `65.0.212.226:3001` | `NEXT_PUBLIC_BACKEND_URL` hardcoded to a specific AWS Lightsail IP; breaks if IP changes; leaks infrastructure IP in client bundle |
| C10 | **`/api/ai-status` and `/api/cache-stats` unauthenticated** | `server.js:62–63` | Internal diagnostics (API key suffix, cache hit rates, pool config) exposed without auth |

### 7.2 HIGH — Correctness / Reliability

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| H1 | **No middleware fetch timeout** | `frontend/middleware.ts:26–30` | If backend is slow/down, all Next.js page loads hang indefinitely until the OS TCP timeout (~2 min) |
| H2 | **L1 in-memory cache lost on restart** | `cacheService.js:7` (node-cache) | Every backend restart cold-starts the cache; first wave of requests after deploy hits Gemini API and costs money |
| H3 | **Overlapping score bucket columns** | `verification_jobs` (migrations 004 + 009) | Two sets of score columns (`score_above90` vs `score_50_to_89`) — unclear which is authoritative; UI may display stale/wrong stats |
| H4 | **Background jobs not resumable across backend restarts** | `routes/jobs.js:initResumption` | Jobs in `processing` status at shutdown are attempted to be resumed on boot, but `rows` are passed in-memory, so resumed jobs re-read from PG. If the original payload was lost, resumption silently fails |
| H5 | **`results_json` JSONB on `verification_jobs`** can become very large | `migrations/009_legacy_job_stats.sql` | A 10,000-row job stores all results JSON in a single PG row. At ~1KB/row, this is ~10MB per job in a single column — will degrade PG performance at scale |
| H6 | **`NEXT_PUBLIC_BACKEND_URL` is build-time baked** | `frontend/Dockerfile` | In the prod Dockerfile, `NEXT_PUBLIC_BACKEND_URL` is set as runtime env, not at `npm run build` time. Next.js inlines `NEXT_PUBLIC_*` vars at build time — the runtime value may be ignored in static client bundles |
| H7 | **`/api/dev/` email route has no auth** | `server.js:79` `routes/devEmail.js` | Dev-only email preview endpoint is gated only by `NODE_ENV !== 'production'`; if someone deploys with `NODE_ENV=development` in prod (common mistake), this route is live |

### 7.3 MEDIUM — Performance / Scalability

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| M1 | **50MB JSON body limit** | `server.js:32` | Entire Excel file travels as base64 JSON (33% overhead); 50MB limit allows ~37MB actual files; no streaming |
| M2 | **Single global rate limiter** | `middleware/rateLimiter.js` | 500 req/15min per IP — a single company on a shared office IP could starve others; no per-company limits |
| M3 | **No composite index on `(company_id, created_at)`** | `verification_jobs` | As job count grows, queries like "get last 20 jobs for company X" do a filtered sort without covering index |
| M4 | **`geminiPool.js` does not track quota failures per key** | `geminiPool.js:38–44` | Round-robin key rotation ignores quota errors; an exhausted key is used again the next round until it errors out |
| M5 | **`CONCURRENCY_PER_KEY = 15` hardcoded** | `geminiPool.js:21` | Not configurable via env var despite `MAX_CONCURRENCY` being in config |
| M6 | **No lazy export** | `exportController.js` | Full `results_json` loaded into memory for Excel generation; at 10K rows this is a significant heap spike |

### 7.4 LOW — Technical Debt / Maintenance

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| L1 | **Service filenames contradict their function** | `openaiService.js`, `claudeService.js` | Both call Gemini, not OpenAI/Claude. New developers will be confused |
| L2 | **DECISIONS.md outdated** | `DECISIONS.md:D-005` | D-005 still documents GPT-4o-mini and Claude Sonnet 4.6 as the AI stack, contradicting the actual all-Gemini implementation |
| L3 | **Legacy EJS views still served** | `server.js:55`, `backend/views/` | EJS templating engine bundled and served alongside the modern Next.js frontend |
| L4 | **`vfs_backup.zip` in frontend directory** | `/frontend/vfs_backup.zip` | Unknown 163KB zip committed to the repo; likely a development artifact |
| L5 | **`RESEND_API_KEY` logged as missing** | Observed in live logs | Email configured via SMTP (Hostinger), but `RESEND_API_KEY` shows as MISSING in the banner — dead config key creates noise |
| L6 | **No password strength enforcement beyond 8 chars** | `routes/auth.js:222,232` | Passwords must be ≥ 8 chars; no complexity, entropy, or breach-list checks |
| L7 | **DataTable has no search, filter, or sort** | `known-issues.md` | Known; no keyboard navigation in virtual list; no ARIA roles on rows |
| L8 | **`.env` files partially committed** | `backend/.env` visible in filesystem | Non-example `.env` is present on disk; `.gitignore` status determines if it was ever committed |

---

## 8. Executive Summary

### What Works Well

1. **Migration system is production-grade.** Auto-runs on boot, uses `schema_migrations` tracking, wraps each migration in a transaction with rollback. Fatal on failure — prevents half-initialized deployments.

2. **AI pipeline design is thoughtful.** Two-layer cache (RAM + PG), score-based TTL, HEAD-validation of all URLs, two-pass retry with supplementary data, round-robin across multiple API keys. The `internalItemNumber` privacy rule (never sent to AI) is enforced at multiple layers.

3. **Authentication is solid.** HttpOnly cookies, bcrypt(12), live DB re-read on every request (so deactivation takes effect immediately), role separation between company and super-admin, comprehensive audit trail.

4. **Error handling is user-safe.** Centralized error classifier returns user-friendly messages, never leaking stack traces or internal error codes to clients. Sensitive fields stripped before logging.

5. **Docker health checks are correct.** Uses `node -e "fetch(...)"` instead of `curl` (not present in Alpine), correct dependency ordering with `condition: service_healthy`.

6. **SSE streaming architecture is well-designed.** Progress events, per-row completion events, and final statistics all stream properly. AbortController on cancel/unmount prevents orphaned connections.

### What Is Incomplete, Ambiguous, or Likely Broken

1. **`NEXT_PUBLIC_BACKEND_URL` in prod Dockerfile** — not passed at build time. Next.js likely falls back to the SSR proxy for all calls, which may cause SSE to route through the Next.js server instead of connecting directly to the backend. This is ambiguous — needs testing with `npm run build` in prod context.

2. **Score column redundancy** — `score_above90`/`score_70to89`/`score_below70` (migration 004) vs `score_50_to_89`/`score_below_50` (migration 009) are never reconciled. The UI may read from the wrong bucket depending on which code path populates the job row.

3. **Background job resumption** is fragile — in-flight jobs at shutdown are re-queued on startup, but the actual `rows` payload is expected to exist in memory. Since it's stored in PG as `results_json`, resumption may work in some cases but is untested under crash scenarios.

4. **Email is silently disabled** when `SMTP_HOST` is not set. Confirmation emails, welcome emails, and password resets fail silently (logged as warnings, not errors). A company can be created but never confirmed if email is not configured.

### Main Assumptions Made by the Original Developer

- **Single-server deployment** — the architecture (in-memory node-cache, p-limit, no Redis) only works correctly on one backend instance. Horizontal scaling would split the L1 cache and cause verification duplication.
- **Internal use / known user base** — the rate limiter (500 req/15min global IP) and lack of per-company limits suggest a controlled user count, not public SaaS.
- **Gemini API is the only dependency** — the three legacy service filenames imply the system was originally multi-provider (OpenAI + Gemini + Claude) and was refactored to single-provider. The transition is complete but the naming remains confusing.
- **Trusted network between containers** — no mTLS or token-based auth between frontend and backend; they share a Docker network and trust each other implicitly.

### Top 3 Things to Fix First in Production

#### Fix 1 — Rotate All Secrets (CRITICAL, 30 minutes)
```bash
# backend/.env (production)
JWT_SECRET=<random 64-char hex>         # was 'changeme-secret-key'
SUPER_ADMIN_PASSWORD=<strong-password>  # was 'SuperAdmin@2026' (in source)
ADMIN_PASSWORD=<strong-password>        # was 'T@Wdev$05' (in source)

# docker-compose.prod.yml
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}  # use env var, not hardcoded literal
DATABASE_URL=...${POSTGRES_PASSWORD}... # same
```
Also: **delete `cookies.txt`, `cookies_frontend.txt`, `frontend/fcm-service.json`** from version control and rotate any credentials they contain.

#### Fix 2 — Add HTTPS Termination (CRITICAL, 2–4 hours)
Add a Caddy or Nginx reverse proxy container to `docker-compose.prod.yml`. Caddy example:
```yaml
caddy:
  image: caddy:2-alpine
  ports: ["80:80", "443:443"]
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy_data:/data
```
```
# Caddyfile
spare-parts.yourdomain.com {
  reverse_proxy frontend:3000
}
```
Remove `ports: 80:3000` from the frontend service and `ports: 3001:3001` from the backend service (backend should not be externally reachable). Set `COOKIE_SECURE=true` after HTTPS is active.

#### Fix 3 — Add Middleware Fetch Timeout + Rate Limit the Auth Routes (HIGH, 1 hour)
```typescript
// frontend/middleware.ts — add AbortSignal timeout
const res = await fetch(`${API_URL}/api/auth/me`, {
  credentials: 'include',
  headers: { Cookie: request.headers.get('cookie') || '' },
  signal: AbortSignal.timeout(3000),  // fail fast if backend is down
});
```
On the backend, add a stricter rate limiter specifically for the login routes to prevent brute-force attacks:
```js
// middleware/rateLimiter.js — add loginLimiter
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, ... });
router.post('/login', loginLimiter, ...);
```

---

*Report generated by automated static analysis of source files and live container logs. No runtime penetration testing was performed.*
