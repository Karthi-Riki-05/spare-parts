# AI Provider Rules — Critical

## Provider Assignment (single provider — GEMINI_API_KEY)
All three services call the Google Gemini API. Filenames are legacy.
- gemini-2.0-flash → Format detection + normalization (Format B/C)
  File: backend/src/services/openaiService.js
- gemini-2.5-flash → Web verification (PRIMARY)
  File: backend/src/services/geminiService.js
  Tools: [{ googleSearch: {} }]
- gemini-2.0-flash → Rule enforcement fallback only
  File: backend/src/services/claudeService.js
  Triggered: verificationScore < 70
- Auth: config.geminiApiKey (from GEMINI_API_KEY in backend/.env)

## Fallback Chain (NEVER skip steps) — D-010
1. Cache check (SHA256 key) → hit = done, zero cost
2. Gemini → score >= 70 → done
3. score < 70 + supplementaryType == part_specification → retry Gemini w/ supplementary
4. score still < 70 → Claude rule enforcement
5. URL validate every result → broken/timeout clears websiteId
6. Cache result (24h TTL)

## Claude Rule Enforcement (R-rules)
1. Dedupe when itemNumber == typeDesignation
2. Infer manufacturer if empty (50% confidence threshold)
3. Strip ERS. prefixes
4. Translate Swedish → English
5. NEVER modify supplementary unless TYPE_A and incorrect (D-008)
6. NEVER invent URLs

## Cost Awareness
- All calls hit Gemini API (single billing line)
- gemini-2.5-flash verify: ~$0.10-0.30 per 1000 rows
- gemini-2.0-flash normalize + fallback: cheaper, only fires when needed
- Cache hit = zero API cost — ALWAYS check cache first

## Concurrency Limits (NEVER exceed)
- p-limit: 5 simultaneous verifications (config.maxConcurrency)
- Batch size: 5 rows per progress update (config.batchSize)
- Max rows: 10,000 hard limit (config.maxRowsLimit)
- Timeout: 30s per AI call (config.requestTimeoutMs)
- Retry: 3 attempts, 1s/2s/4s backoff (config.maxRetries)

## Mock Modes
- OPENAI_MOCK_MODE / GEMINI_MOCK_MODE / CLAUDE_MOCK_MODE
- All inherit from MOCK_MODE if individual flag unset
