# Scan Prevention Rules

## NEVER run (scans everything = high tokens)
- find . -name "*.js"
- grep -r "text" .
- Read all files in any folder at once
- Glob "**/*" without narrow scope

## NEVER read these (waste tokens)
- node_modules/
- .next/
- build/ or dist/
- frontend/public/
- Any *.min.js files
- package-lock.json
- backend/views/ (EJS legacy — Next.js frontend is canonical)
- test-results/, playwright-report/, .playwright-cli/
- coverage/
- *.tsbuildinfo

## INSTEAD
- Ask: "Which service/component has this issue?"
- Use modules.md → exact files for each module
- Read ONLY the specific file mentioned
- For bugs: read ONE file at a time
- For unknown locations: Grep with narrow `glob` filter (e.g. `*.ts` in components/)
