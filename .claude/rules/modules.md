# Module File Map — Quick Reference

## Excel Processing
- frontend/components/FileUpload.tsx
- frontend/components/SheetSelector.tsx
- frontend/components/ManualMappingDialog.tsx
- backend/src/controllers/sheetsController.js
- backend/src/controllers/detectController.js
- backend/src/controllers/normalizeController.js
- backend/src/services/excelService.js
- backend/src/routes/{sheets,detect,normalize,manualMap}.js

## AI Verification (all use GEMINI_API_KEY)
- backend/src/services/geminiService.js   (gemini-2.5-flash, PRIMARY verify)
- backend/src/services/claudeService.js   (gemini-2.0-flash, FALLBACK — legacy filename)
- backend/src/services/openaiService.js   (gemini-2.0-flash, NORMALIZE — legacy filename)
- backend/src/services/urlValidatorService.js
- backend/src/services/cacheService.js
- backend/src/controllers/verifyController.js
- backend/src/routes/verify.js

## Table Display
- frontend/components/DataTable.tsx
- frontend/components/SparePartsApp.tsx
- frontend/hooks/useVerification.ts
- frontend/hooks/useEditState.ts
- frontend/hooks/useSSE.ts
- shared/types/index.ts

## Export
- backend/src/controllers/exportController.js
- backend/src/services/excelService.js (write path)
- backend/src/routes/export.js
- frontend/lib/api.ts (exportData)

## UI Components
- frontend/components/ActionBar.tsx
- frontend/components/ProgressSection.tsx
- frontend/components/VerificationLog.tsx
- frontend/components/StatsDashboard.tsx
- frontend/components/LargeFileWarning.tsx
- frontend/components/ui/{Button,Badge,Modal,Card,StatCard,ProgressBar}.tsx

## Shared Types — shared/types/index.ts
Interfaces (8): RawRow, NormalizedRow, VerificationResult, ColumnMapping,
FormatDetectionResult, SupplementaryChangeLog, ProcessingStats, VerificationResponse
SSE interfaces (4): SSEProgressEvent, SSERowCompleteEvent, SSECompleteEvent, SSEErrorEvent
Types (7): FormatType, SourceType, VerifiedSourceLabel, SupplementaryType,
UrlValidationStatus, AppPhase, SSEEventType
Always check before creating new types.

## Config & Infrastructure
- backend/src/config.js  (Zod env validation)
- backend/src/server.js  (Express bootstrap)
- backend/src/middleware/{validation,rateLimiter,errorHandler}.js
- backend/src/utils/{logger,retry,hash}.js
- docker-compose.yml          (dev)
- docker-compose.prod.yml     (Lightsail prod)
- next.config.mjs             (API rewrites)
