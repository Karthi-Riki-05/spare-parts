# Always Active Rules

## Token Conservation
- NEVER scan entire project
- NEVER read more than 3 files without asking
- ALWAYS identify module first (excel/ai/verify/export/table/ui)
- Read ONLY that module's listed files (see modules.md)
- If task needs 5+ files — ask user first

## Response Format
- Code only — no prose unless asked
- Show only changed code — never full file
- No repeating what user said
- Shortest possible answer always
- Bug fix: changed lines + 3 lines context

## Mock Mode Reminder
- Check MOCK_MODE in backend/.env before AI changes
- OPENAI_MOCK_MODE, GEMINI_MOCK_MODE, CLAUDE_MOCK_MODE exist independently
- Use mock mode for testing without real API calls
- All three default to MOCK_MODE if not set individually

## Spare Parts Specifics
- internalItemNumber NEVER touches AI (R1, D-009)
- All AI-returned URLs HEAD-validated (R26, D-006)
- Score < 70 → Claude fallback (D-010)
