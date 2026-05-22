#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  deploy-pack.sh — Spare Parts Verifier
#
#  Creates a clean production-ready .tar.gz, excluding secrets,
#  test data, build artefacts, screenshots, and dev-only noise.
#
#  Usage:
#    ./deploy-pack.sh                          # auto-named archive
#    ./deploy-pack.sh sparepartner_v2.tar.gz  # custom name
#
#  Run from the project root. Requires: rsync, tar.
#  Works on macOS (BSD rsync 2.6+) and Linux (rsync 3.x).
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_ARG="${1:-sparepartner_deploy_${TIMESTAMP}.tar.gz}"
# Support absolute or relative output path
if [[ "$OUTPUT_ARG" = /* ]]; then
  OUTPUT_PATH="$OUTPUT_ARG"
else
  OUTPUT_PATH="$PROJECT_ROOT/$OUTPUT_ARG"
fi
OUTPUT_NAME="$(basename "$OUTPUT_PATH")"
STAGING_DIR=$(mktemp -d /tmp/sparepartner_staging_XXXXXX)

trap 'echo -e "\n${RED}ERROR: script aborted.${RESET}"; rm -rf "$STAGING_DIR"; exit 1' ERR
trap 'rm -rf "$STAGING_DIR"' EXIT

cd "$PROJECT_ROOT"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║      Spare Parts Verifier — Production Deploy Packer     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  ${BOLD}Source :${RESET} $PROJECT_ROOT"
echo -e "  ${BOLD}Staging:${RESET} $STAGING_DIR"
echo -e "  ${BOLD}Output :${RESET} $OUTPUT_PATH"
echo ""

# ════════════════════════════════════════════════════════════════════
#  STEP 1 — Copy essential files to a clean staging directory
#           via rsync (handles all exclusions atomically).
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[1/4]${RESET} Staging files via rsync …"

rsync -a --quiet \
  \
  "$PROJECT_ROOT/" "$STAGING_DIR/" \
  \
  \
  --exclude='.git/' \
  --exclude='.DS_Store' \
  --exclude='.claude/' \
  --exclude='.github/' \
  \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='.env.production.local' \
  --exclude='.env.compose' \
  \
  --exclude='node_modules/' \
  --exclude='test-results/' \
  --exclude='playwright-report/' \
  --exclude='e2e/' \
  --exclude='playwright.config.js' \
  \
  --exclude='/package.json' \
  --exclude='/package-lock.json' \
  \
  --exclude='cookies.txt' \
  --exclude='cookies_frontend.txt' \
  --exclude='project_develop.txt' \
  --exclude='project_devlop.txt' \
  --exclude='project_analysis_report.md' \
  --exclude='workflow.txt' \
  --exclude='test.js' \
  --exclude='test-verify.js' \
  --exclude='TEST_REPORT_*.md' \
  --exclude='Screenshot*' \
  --exclude='image.png' \
  \
  --exclude='*.xlsx' \
  --exclude='*.xls' \
  --exclude='*.png' \
  --exclude='*.jpg' \
  --exclude='*.jpeg' \
  --exclude='*.gif' \
  --exclude='*.zip' \
  --exclude='*.backup' \
  --exclude='*.log' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.pyc' \
  --exclude='__pycache__/' \
  \
  \
  --exclude='backend/.env' \
  --exclude='backend/.env.local' \
  --exclude='backend/.env.backup' \
  --exclude='backend/node_modules/' \
  --exclude='backend/logs/' \
  --exclude='backend/data/' \
  --exclude='backend/coverage/' \
  --exclude='backend/test-results/' \
  --exclude='backend/tests/' \
  --exclude='backend/e2e/' \
  --exclude='backend/backend/' \
  \
  \
  --exclude='frontend/.env' \
  --exclude='frontend/.env.local' \
  --exclude='frontend/.env.backup' \
  --exclude='frontend/.env.local.backup' \
  --exclude='frontend/.env.production' \
  --exclude='frontend/node_modules/' \
  --exclude='frontend/.next/' \
  --exclude='frontend/__tests__/' \
  --exclude='frontend/shared/' \
  --exclude='frontend/vfs_backup.zip' \
  --exclude='frontend/docker-compose.yaml' \
  --exclude='frontend/fcm-service.json' \
  --exclude='frontend/vitest.config.ts' \
  --exclude='frontend/tsconfig.tsbuildinfo' \
  --exclude='frontend/cookies.txt' \
  --exclude='frontend/2026-*.log'

echo -e "${GREEN}    ✓ Staging complete${RESET}"

# ════════════════════════════════════════════════════════════════════
#  STEP 2 — Verify critical files are present in the staging dir
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[2/4]${RESET} Verifying critical files …"

CRITICAL_FILES=(
  "Caddyfile"
  "docker-compose.prod.yml"
  "docker-compose.yml"
  ".env.example"
  "backend/Dockerfile"
  "backend/package.json"
  "backend/src/server.js"
  "backend/src/config.js"
  "backend/src/migrations/run.js"
  "backend/src/migrations/018_add_row_data_sv.sql"
  "backend/src/routes/emailStatus.js"
  "backend/src/services/cleanupService.js"
  "frontend/Dockerfile"
  "frontend/package.json"
  "frontend/next.config.mjs"
  "shared/types/index.ts"
)

MISSING=0
for f in "${CRITICAL_FILES[@]}"; do
  if [[ ! -e "$STAGING_DIR/$f" ]]; then
    echo -e "  ${RED}MISSING: $f${RESET}"
    MISSING=$((MISSING + 1))
  fi
done

if [[ $MISSING -gt 0 ]]; then
  echo -e "\n${RED}ERROR: $MISSING critical file(s) missing from staging.${RESET}"
  echo -e "${YELLOW}Likely cause: uncommitted files. Run the git commit step from the"
  echo -e "deployment guide first, then re-run this script.${RESET}"
  exit 1
fi
echo -e "${GREEN}    ✓ All critical files present${RESET}"

# ════════════════════════════════════════════════════════════════════
#  STEP 3 — Verify no secrets leaked into staging
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[3/4]${RESET} Checking for secret leaks …"

LEAKED=0
SECRET_PATTERNS=(
  "backend/.env"
  "frontend/.env"
  "frontend/.env.local"
  "*.backup"
  "cookies.txt"
  "fcm-service.json"
  "*.zip"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  # Use find to check each pattern
  found=$(find "$STAGING_DIR" -name "$(basename "$pattern")" 2>/dev/null | grep -v ".env.example" || true)
  if [[ -n "$found" ]]; then
    echo -e "  ${RED}SECRET LEAK DETECTED: $found${RESET}"
    LEAKED=$((LEAKED + 1))
  fi
done

if [[ $LEAKED -gt 0 ]]; then
  echo -e "\n${RED}ERROR: $LEAKED secret/unwanted file(s) found in staging. Aborting.${RESET}"
  exit 1
fi
echo -e "${GREEN}    ✓ No secrets detected${RESET}"

# ════════════════════════════════════════════════════════════════════
#  STEP 4 — Create the archive and print summary
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[4/4]${RESET} Creating archive …"

tar -czf "$OUTPUT_PATH" -C "$STAGING_DIR" .

# Print summary
FILE_COUNT=$(find "$STAGING_DIR" -type f | wc -l | tr -d ' ')
ARCHIVE_SIZE=$(du -sh "$OUTPUT_PATH" | cut -f1)
STAGING_SIZE=$(du -sh "$STAGING_DIR" | cut -f1)

echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Archive created successfully!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Archive  :${RESET} $OUTPUT_PATH"
echo -e "  ${BOLD}Size     :${RESET} $ARCHIVE_SIZE (compressed) | $STAGING_SIZE (uncompressed)"
echo -e "  ${BOLD}Files    :${RESET} $FILE_COUNT files included"
echo ""

# Show top-level contents of the staging dir for a sanity check
echo -e "  ${BOLD}Contents (top level):${RESET}"
ls "$STAGING_DIR" | sed 's/^/    /'
echo ""

# ════════════════════════════════════════════════════════════════════
#  NEXT STEPS printed for the user
# ════════════════════════════════════════════════════════════════════
echo -e "${BOLD}${CYAN}Next steps:${RESET}"
echo ""
echo -e "  1. Copy archive to server:"
echo -e "     ${CYAN}scp $OUTPUT_NAME user@spare-parts.tawdev.com:/opt/sparepartner/${RESET}"
echo ""
echo -e "  2. On the server, run the extraction script:"
echo -e "     ${CYAN}bash deploy-server.sh $OUTPUT_NAME /opt/sparepartner${RESET}"
echo -e "     (copy deploy-server.sh to the server first, or paste it inline)"
echo ""
echo -e "  3. Create/update ${BOLD}backend/.env${RESET} and root ${BOLD}.env${RESET} on the server."
echo -e "     Templates: backend/.env.example and .env.example"
echo ""
echo -e "  4. Build and start:"
echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml build --no-cache${RESET}"
echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml up -d${RESET}"
echo ""
