# Excel Processing Rules

## Data Flow (read-only reference)
1. FileUpload.tsx → validate .xlsx/.xls → base64 (lib/utils.fileToBase64)
2. POST /api/get-sheets → ExcelJS → SheetInfo[]
3. POST /api/detect-format → OpenAI → FormatDetectionResult (A/B/C)
4. POST /api/normalize → NormalizedRow[] (or manualMap if confidence < 80)
5. DataTable.tsx → react-window display

## Format Types
- Format A: Direct column mapping (no AI normalize)
- Format B: OpenAI parses single-column free text
- Format C: Hybrid (direct + AI for missing fields)
- confidence < 80 → trigger ManualMappingDialog

## Column Rules
- internalItemNumber → ALWAYS column index 0 (D-009), NEVER sent to AI (R1)
- description, manufacturer, itemNumber → sent to AI
- typeDesignation → sent to AI
- supplementary (column E) → sent only on retry when score < 70 AND TYPE_A (D-008)
- TYPE_B (instructions like "contact", "do not") → never modified

## Parser Config
- ExcelJS: prefer cell.text over cell.value (preserves display format)
- Columns keyed col_0, col_1, ... (0-indexed)
- includeEmpty: false on row iteration

## File Limits (config.js)
- Max upload: 50MB (express.json limit)
- Max rows: 10,000 hard (MAX_ROWS_LIMIT)
- Warning: > 5,000 rows shows LargeFileWarning modal (MAX_ROWS_WARNING)
