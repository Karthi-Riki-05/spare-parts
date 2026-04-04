# Spare Parts Web Verifier

A tool for manufacturing companies to upload Excel files with industrial spare parts data, automatically normalize and verify each part against live manufacturer websites using AI, and export a clean verified Excel file.

## Quick Start

```bash
cd backend
npm install
cp .env.example .env   # edit with API keys or set MOCK_MODE=true
npm run dev             # http://localhost:3001
```

Or with Docker:

```bash
docker-compose up --build   # http://localhost:3001
```

## Architecture

Single Express.js server serving:
- **EJS pages**: Home (upload + verify UI), Docs, Error
- **API routes**: 7 endpoints for the AI verification pipeline
- **Static assets**: CSS dark theme, vanilla JS for client interactivity

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `MOCK_MODE` | `false` | Return sample data without real API calls |
| `OPENAI_API_KEY` | — | GPT-4o-mini for format detection + normalization |
| `GEMINI_API_KEY` | — | Gemini 2.5 Flash for web verification |
| `ANTHROPIC_API_KEY` | — | Claude Sonnet for rule enforcement fallback |
| `MAX_CONCURRENCY` | `5` | Parallel AI requests |
| `CACHE_TTL_SECONDS` | `86400` | Cache duration (24h) |
| `RATE_LIMIT_MAX` | `100` | Max requests per 15 min window |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server status |
| POST | `/api/get-sheets` | List Excel sheet names |
| POST | `/api/detect-format` | Detect format (A/B/C) + confidence |
| POST | `/api/normalize` | Normalize rows based on format |
| POST | `/api/manual-map` | Apply manual column mapping |
| POST | `/api/verify` | Verify parts via SSE stream |
| POST | `/api/export` | Download verified Excel |

## AI Pipeline

| Model | Task | Why |
|-------|------|-----|
| GPT-4o-mini | Format detection, normalization, Swedish translation | Fast, cheap, no web search needed |
| Gemini 2.5 Flash + Google Search | Web verification, URL lookup | Google Search grounding finds real product pages |
| Claude Sonnet 4.6 | Rule enforcement fallback (score < 70) | Best at applying complex business rules |

## Testing

```bash
cd backend && npm test           # 68 unit + integration tests (Vitest)
cd .. && npx playwright test     # E2E tests (Playwright CLI)
```

## Business Rules (R1-R26)

- **R1**: Internal Item Number never sent to AI
- **R2a/R2b**: Duplicate item number / type designation deduplicated
- **R3**: Supplementary used as Plan B only when score < 70
- **R7**: Swedish auto-translated to English
- **R8**: "ERS." (replaces) references removed from part numbers
- **R12**: Every cell is click-to-edit (Enter saves, Escape cancels)
- **R14**: Export produces two-sheet Excel (Verified + Original)
- **R15**: 9 statistics cards
- **R18**: Multi-sheet files show sheet selector
- **R21**: Score cells color-coded (green/yellow/orange/red/gray)
- **R24**: Supplementary changes logged with model name and reason
- **R26**: Every AI-returned URL validated with HTTP HEAD

## Deploy to AWS Lightsail

1. Create Lightsail container service: `spare-parts-verifier`
2. Create ECR repository
3. Add GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ECR_REPO`
4. Set env vars in Lightsail (API keys, `NODE_ENV=production`)
5. Push to `prod` branch — GitHub Actions deploys automatically

## Stack

- Express.js + EJS (server-side rendered)
- Vanilla JavaScript (client-side)
- exceljs (Excel read/write)
- node-cache + p-limit (no Redis)
- Vitest (unit/integration) + Playwright (E2E)
- Docker + AWS Lightsail + GitHub Actions
