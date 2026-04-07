# Frontend Rules — Spare Parts Verifier

## Stack (memorize — do not re-read)
- Next.js 14.2.3 App Router
- TypeScript 5.4.5 strict
- Tailwind CSS 3.4.3 (dark theme, custom tokens)
- react-window FixedSizeList for table
- ExcelJS used only in lib/api export path
- API rewrites /api/* → backend:3001 in next.config.mjs

## Pattern (copy from existing — read ONE file)
- API calls: frontend/lib/api.ts only (typed)
- Types: @spare-parts/types alias → shared/types/index.ts
- State: hooks/useVerification.ts is single source of truth
- Sub-hooks: useSSE (verify stream), useEditState (inline edit)
- No pagination → react-window virtual scrolling (D-001)
- Inline edit: Enter save, Escape cancel, blur autosave
- 'use client' only where interactivity needed

## Table Rules (DataTable.tsx)
- FixedSizeList itemSize=36, height=Math.min(600, rows*36)
- minWidth = sum of all column widths
- Score colors: ≥90 green, 70-89 yellow, 50-69 orange, <50 red
- websiteId = clickable <a target="_blank">
- Source badge: official / external / inferred / not_found

## SSE Wiring
- useSSE.connect(url, body, handlers) → AbortController
- Handlers: onProgress, onRowComplete, onComplete, onError
- abortRef.current?.abort() on cancel / unmount

## File Paths
- Pages: frontend/app/[route]/page.tsx
- Components: frontend/components/[Name].tsx
- UI primitives: frontend/components/ui/{Button,Badge,Modal,Card,StatCard,ProgressBar}.tsx
- Hooks: frontend/hooks/use[Name].ts
- API client: frontend/lib/api.ts
- Utils: frontend/lib/utils.ts
