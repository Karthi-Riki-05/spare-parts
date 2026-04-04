# Spare Parts Web Verifier — CLAUDE.md

## Project Stack
- Frontend: Next.js 14 App Router — port 3000 (frontend/)
- Backend: Express.js + EJS — port 3001 (backend/)
- Shared types: shared/types/index.ts — TypeScript interfaces
- Frontend styling: Tailwind CSS
- Backend language: Plain JavaScript (CommonJS)
- Frontend language: TypeScript

## Session Rules
- Complete every file fully — never truncate or use "// TODO"
- Bug fixes: show only changed lines + 3 lines context
- Proceed without asking unless genuinely blocked

## Architecture
- Frontend: frontend/app/ (Next.js pages), frontend/components/ (React)
- Frontend API calls: /api/* → rewrites to backend:3001 via next.config.mjs
- Backend views: backend/views/ (EJS templates — legacy, still served)
- Backend API: backend/src/routes/ → controllers → services
- Business logic in services, NOT controllers
- SSE streaming for verification progress

## AI Pipeline
- gpt-4o-mini → format detection + normalization
- gemini-2.5-flash → web verification (primary)
- claude-sonnet-4-6 → rule enforcement fallback (score < 70)
- NEVER send internalItemNumber to any AI (R1)
- ALWAYS validate URLs with HEAD request (R26)

## Testing
- Backend unit/integration: cd backend && npm test (Vitest)
- Fixtures: cd backend && node tests/fixtures/create-fixtures.js
- E2E: npx playwright test

## Mock Mode
- MOCK_MODE=true in backend/.env → no real API calls

## Phase Tracking
- [x] Phase 1-5: Backend (JS + EJS architecture)
- [x] Phase 6: Next.js 14 frontend connected via API
