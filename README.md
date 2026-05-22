# Sparepartner Verification

Excel-driven spare parts data verification. Upload an `.xlsx` file → AI normalises and web-verifies each part via Gemini + Google Search → export a scored, URL-annotated Excel.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 App Router, TypeScript 5.4, Tailwind 3.4 |
| Backend | Express 4.18 (CommonJS), Zod, Helmet, Winston |
| Database | PostgreSQL 16 (raw `pg`, no ORM) |
| AI | Gemini 2.5-flash (verify) + Gemini 2.0-flash (normalize/fallback) |
| Cache | node-cache L1 (RAM) + PostgreSQL L2 (score-based TTL) |
| Queue | p-limit (5–15 concurrent, no Redis/Bull) |
| Ports | frontend 3000, backend 3001 |
| Tests | Vitest (backend unit), Playwright (e2e) |

---

## First-time Setup

### 1. Generate secrets

```bash
# JWT secret (required — never use the placeholder)
openssl rand -hex 32

# Passwords (avoid @ # % to simplify URL encoding in DATABASE_URL)
openssl rand -base64 24 | tr -d '+/='
```

### 2. Create environment files

**Root `.env`** — Docker Compose variable substitution:
```bash
cp .env.example .env
# Edit .env and fill in:
#   POSTGRES_PASSWORD=<generated above>
#   NEXT_PUBLIC_BACKEND_URL=https://spare-parts.yourdomain.com  (prod only)
```

**`backend/.env`** — Backend runtime config:
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and fill in AT MINIMUM:
#   JWT_SECRET=<generated above, ≥32 chars>
#   DATABASE_URL=postgresql://spare_partner_user:<password>@postgres:5432/spareparts
#   GEMINI_API_KEY=<from https://aistudio.google.com>
#   SUPER_ADMIN_EMAIL=you@example.com
#   SUPER_ADMIN_PASSWORD=<generated above>
```

> **DATABASE_URL note:** If your `POSTGRES_PASSWORD` contains special characters, URL-encode them in `DATABASE_URL` (`@` → `%40`, `#` → `%23`). To avoid this, use a password that is alphanumeric-only.

### 3. Start development

```bash
docker compose up -d
# Frontend: http://localhost:3000
# Backend:  http://localhost:3001
```

The backend runs migrations and seeds the super-admin account automatically on first boot.

### 4. Access the app

- **Company login:** `http://localhost:3000/login`
- **Super admin portal:** `http://localhost:3000/super-admin/login`

---

## Production Deployment

### Prerequisites

- A reverse proxy (Nginx, Caddy, Traefik) must terminate HTTPS and forward to the frontend on port 3000.
- The backend **must not** be exposed externally — all traffic routes through the frontend proxy.
- Set `COOKIE_SECURE=true` in `backend/.env` once HTTPS is active.
- Set `NODE_ENV=production` in `backend/.env`.

### Checklist before going live

- [ ] `JWT_SECRET` is a random ≥32-char string (not a placeholder)
- [ ] `POSTGRES_PASSWORD` is set in root `.env` (not committed to git)
- [ ] `DATABASE_URL` in `backend/.env` uses the docker hostname `postgres`, not `localhost`
- [ ] `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` are set (not defaults)
- [ ] `COOKIE_SECURE=true` in `backend/.env`
- [ ] `NODE_ENV=production` in `backend/.env`
- [ ] `NEXT_PUBLIC_BACKEND_URL` in root `.env` points to your public HTTPS domain
- [ ] HTTPS reverse proxy is in front of port 3000
- [ ] Backend port 3001 is **not** exposed externally (production compose does not expose it)
- [ ] `SMTP_HOST` / credentials set so confirmation emails work

### Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Secret Rotation

If you suspect a secret has been leaked:

```bash
# 1. Generate a new JWT secret
openssl rand -hex 32

# 2. Update backend/.env  →  JWT_SECRET=<new value>

# 3. Restart the backend (all existing sessions are invalidated immediately)
docker compose restart backend
```

To rotate the database password:
```bash
# 1. Update POSTGRES_PASSWORD in root .env
# 2. Update DATABASE_URL in backend/.env (URL-encode if needed)
# 3. Restart containers — Postgres will reject the old password on reconnect
docker compose down && docker compose up -d
```

---

## Architecture

### AI Pipeline

```
L1 Cache (RAM, node-cache, 24h TTL)
    ↓ miss
L2 Cache (PostgreSQL, score-based TTL: 7–180 days)
    ↓ miss
Gemini 2.5-flash + Google Search  →  score ≥ 70 → done
                                   →  score < 70 → retry with supplementary data
                                   →  still < 70 → Gemini 2.0-flash rule enforcement
    ↓
HTTP HEAD validation of every URL before storage
```

**Service filenames carry legacy names** (`openaiService.js`, `claudeService.js`) but all three call the Gemini API. Single billing line: `GEMINI_API_KEY`.

### Business Rules

| Rule | Description |
|------|-------------|
| R1 | `internalItemNumber` (col 0) NEVER sent to AI |
| R3 | Column E (supplementary) used as Plan B only when score < 70 AND classified TYPE_A |
| R7 | Swedish content auto-translated to English |
| R8 | `ERS.` prefix stripped from part numbers |
| R26 | Every AI-returned URL validated via HTTP HEAD before storage |

### Format Detection

| Format | Description |
|--------|-------------|
| A | Direct column mapping — no AI normalisation needed |
| B | AI parses single-column free text |
| C | Hybrid — direct columns + AI for missing fields |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Liveness probe |
| POST | `/api/auth/login` | — | Company login |
| GET | `/api/auth/me` | Company | Session check |
| POST | `/api/get-sheets` | Company | List Excel sheets |
| POST | `/api/detect-format` | Company | Format A/B/C detection |
| POST | `/api/normalize` | Company | AI normalisation |
| POST | `/api/manual-map` | Company | Manual column mapping |
| POST | `/api/verify` | Company | SSE verification stream |
| POST | `/api/export` | Company | Download verified Excel |
| GET | `/api/jobs` | Company | Job history |
| GET | `/api/ai-status` | **Super Admin** | Gemini key diagnostics |
| GET | `/api/cache-stats` | **Super Admin** | Cache hit/miss stats |
| * | `/api/super-admin/*` | **Super Admin** | Company management |

---

## Git History Rewrite (if secrets were previously committed)

If `cookies.txt`, `*.backup`, or other credential files were committed in the past and you need to purge them from git history entirely:

```bash
# Option A — BFG Repo-Cleaner (recommended, faster)
# Download from: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files "cookies.txt" .
java -jar bfg.jar --delete-files "cookies_frontend.txt" .
java -jar bfg.jar --delete-files "*.backup" .
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force-with-lease origin production main

# Option B — git filter-repo (modern replacement for filter-branch)
pip install git-filter-repo
git filter-repo --invert-paths \
  --path cookies.txt \
  --path cookies_frontend.txt \
  --path frontend/cookies.txt \
  --path backend/.env.backup \
  --path frontend/.env.backup \
  --path frontend/.env.local.backup
git push --force-with-lease origin production main
```

> **After force-pushing:** all collaborators must re-clone the repo. Any forks may still contain the files. If the repo is public, assume the leaked secrets are compromised and rotate them.

---

## Testing

```bash
cd backend && npm test           # Vitest unit + integration tests
npx playwright test              # E2E tests (Playwright CLI)
```

---

## Known Issues & Roadmap

See `project_analysis_report.md` for the full audit.  
See `DECISIONS.md` for architectural decisions (D-001..D-010).
