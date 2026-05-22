#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
#  deploy-server.sh — Spare Parts Verifier
#
#  SERVER-SIDE extraction script.
#  Run this on the production server after uploading the archive
#  created by deploy-pack.sh.
#
#  Usage:
#    bash deploy-server.sh <archive.tar.gz> [target-dir]
#
#  Example:
#    bash deploy-server.sh sparepartner_deploy_20260522_143000.tar.gz /opt/sparepartner
#
#  Default target: /opt/sparepartner
#  The script will NOT overwrite existing .env files.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Args ──────────────────────────────────────────────────────────────
ARCHIVE="${1:-}"
TARGET_DIR="${2:-/opt/sparepartner}"

if [[ -z "$ARCHIVE" ]]; then
  echo -e "${RED}Usage: bash deploy-server.sh <archive.tar.gz> [target-dir]${RESET}"
  exit 1
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo -e "${RED}ERROR: Archive not found: $ARCHIVE${RESET}"
  exit 1
fi

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   Spare Parts Verifier — Server-side Extraction Script   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo -e "  ${BOLD}Archive :${RESET} $ARCHIVE"
echo -e "  ${BOLD}Target  :${RESET} $TARGET_DIR"
echo ""

# ════════════════════════════════════════════════════════════════════
#  STEP 1 — Create target directory structure
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[1/6]${RESET} Preparing target directory …"

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

echo -e "${GREEN}    ✓ Target directory ready: $TARGET_DIR${RESET}"

# ════════════════════════════════════════════════════════════════════
#  STEP 2 — Snapshot existing .env files so we can restore them
#            The archive never contains .env files, but this is a
#            safety net in case someone manually placed one here.
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[2/6]${RESET} Backing up existing .env files (if any) …"

ENV_BACKUP_DIR=$(mktemp -d /tmp/sparepartner_env_backup_XXXXXX)
ENV_FILES_FOUND=0

for env_path in ".env" "backend/.env" "frontend/.env" "frontend/.env.local"; do
  if [[ -f "$TARGET_DIR/$env_path" ]]; then
    mkdir -p "$ENV_BACKUP_DIR/$(dirname "$env_path")"
    cp "$TARGET_DIR/$env_path" "$ENV_BACKUP_DIR/$env_path"
    echo -e "  ${CYAN}Backed up: $env_path${RESET}"
    ENV_FILES_FOUND=$((ENV_FILES_FOUND + 1))
  fi
done

if [[ $ENV_FILES_FOUND -eq 0 ]]; then
  echo -e "  ${YELLOW}No existing .env files found (first deploy or already absent).${RESET}"
fi

# ════════════════════════════════════════════════════════════════════
#  STEP 3 — Extract the archive (overwrites code, not secrets)
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[3/6]${RESET} Extracting archive …"

tar -xzf "$ARCHIVE" -C "$TARGET_DIR"

EXTRACTED_COUNT=$(tar -tzf "$ARCHIVE" | wc -l | tr -d ' ')
echo -e "${GREEN}    ✓ Extracted ~$EXTRACTED_COUNT entries into $TARGET_DIR${RESET}"

# ════════════════════════════════════════════════════════════════════
#  STEP 4 — Restore .env files (ensure secrets are never overwritten)
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[4/6]${RESET} Restoring .env files …"

if [[ $ENV_FILES_FOUND -gt 0 ]]; then
  for env_path in ".env" "backend/.env" "frontend/.env" "frontend/.env.local"; do
    if [[ -f "$ENV_BACKUP_DIR/$env_path" ]]; then
      mkdir -p "$TARGET_DIR/$(dirname "$env_path")"
      cp "$ENV_BACKUP_DIR/$env_path" "$TARGET_DIR/$env_path"
      echo -e "  ${CYAN}Restored: $env_path${RESET}"
    fi
  done
  rm -rf "$ENV_BACKUP_DIR"
  echo -e "${GREEN}    ✓ All .env files restored from backup${RESET}"
else
  echo -e "  ${YELLOW}No .env files to restore.${RESET}"
  echo -e "  ${YELLOW}You must create them before running docker compose (see Step 6).${RESET}"
fi

# Paranoia check: confirm no .env exists in the archive itself
# (deploy-pack.sh prevents this, but double-check)
LEAKED=$(tar -tzf "$ARCHIVE" | grep -E '(^|/)\.env$' | grep -v ".env.example" || true)
if [[ -n "$LEAKED" ]]; then
  echo -e "\n${RED}WARNING: Archive contained .env file(s): $LEAKED${RESET}"
  echo -e "${RED}These may have been overwritten. Check immediately!${RESET}"
fi

# ════════════════════════════════════════════════════════════════════
#  STEP 5 — Set correct permissions and create runtime directories
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[5/6]${RESET} Setting permissions and creating runtime directories …"

# Runtime directories that the backend Docker container writes to
# They are bind-mounted in docker-compose.prod.yml:
#   - ./backend/logs  → /app/logs
#   - ./backend/data  → /app/data
mkdir -p "$TARGET_DIR/backend/logs"
mkdir -p "$TARGET_DIR/backend/data"

# The backend Dockerfile creates /app/logs/{ai,error,api,access} as the
# 'node' user (uid 1000). Pre-create them here with open perms so the
# container can write on first start without needing to chown on the host.
mkdir -p "$TARGET_DIR/backend/logs/ai"
mkdir -p "$TARGET_DIR/backend/logs/error"
mkdir -p "$TARGET_DIR/backend/logs/api"
mkdir -p "$TARGET_DIR/backend/logs/access"

chmod 755 "$TARGET_DIR/backend/logs" "$TARGET_DIR/backend/data"
chmod 755 "$TARGET_DIR/backend/logs/ai" \
          "$TARGET_DIR/backend/logs/error" \
          "$TARGET_DIR/backend/logs/api" \
          "$TARGET_DIR/backend/logs/access"

# Make scripts executable
chmod +x "$TARGET_DIR/deploy-pack.sh"   2>/dev/null || true
chmod +x "$TARGET_DIR/deploy-server.sh" 2>/dev/null || true

echo -e "${GREEN}    ✓ Permissions set${RESET}"

# ════════════════════════════════════════════════════════════════════
#  STEP 6 — Final checklist
# ════════════════════════════════════════════════════════════════════
echo -e "${YELLOW}[6/6]${RESET} Post-extraction checklist …"

ISSUES=0

check_file() {
  local f="$1"
  local label="$2"
  if [[ -f "$TARGET_DIR/$f" ]]; then
    echo -e "  ${GREEN}✓${RESET} $label"
  else
    echo -e "  ${RED}✗ MISSING: $label ($f)${RESET}"
    ISSUES=$((ISSUES + 1))
  fi
}

check_env() {
  local f="$1"
  local label="$2"
  if [[ -f "$TARGET_DIR/$f" ]]; then
    echo -e "  ${GREEN}✓${RESET} $label (exists)"
  else
    echo -e "  ${YELLOW}⚠  NEEDS CREATION: $label${RESET}"
    echo -e "     Template: $TARGET_DIR/${f}.example"
  fi
}

check_file "Caddyfile"                        "Caddyfile"
check_file "docker-compose.prod.yml"          "docker-compose.prod.yml"
check_file "backend/Dockerfile"               "backend/Dockerfile"
check_file "backend/src/server.js"            "backend/src/server.js"
check_file "backend/src/migrations/run.js"    "backend/src/migrations/run.js"
check_file "backend/src/migrations/018_add_row_data_sv.sql" "migration 018 (latest)"
check_file "backend/src/routes/emailStatus.js"              "backend/src/routes/emailStatus.js"
check_file "backend/src/services/cleanupService.js"         "backend/src/services/cleanupService.js"
check_file "frontend/Dockerfile"              "frontend/Dockerfile"
check_file "frontend/next.config.mjs"         "frontend/next.config.mjs"
check_file "shared/types/index.ts"            "shared/types/index.ts"
check_env  ".env"                             "Root .env (POSTGRES_PASSWORD)"
check_env  "backend/.env"                     "backend/.env (JWT_SECRET, DATABASE_URL, GEMINI_API_KEY, SMTP_*)"

echo ""

if [[ $ISSUES -gt 0 ]]; then
  echo -e "${RED}  $ISSUES critical file(s) missing. Do not proceed until resolved.${RESET}"
  echo ""
fi

# ════════════════════════════════════════════════════════════════════
#  Summary
# ════════════════════════════════════════════════════════════════════
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Extraction complete!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Working directory:${RESET} $TARGET_DIR"
echo ""
echo -e "${BOLD}${YELLOW}Mandatory next steps before docker compose:${RESET}"
echo ""
echo -e "  1. ${BOLD}Create/update root .env${RESET}"
echo -e "     ${CYAN}nano $TARGET_DIR/.env${RESET}"
echo -e "     Required: POSTGRES_PASSWORD"
echo ""
echo -e "  2. ${BOLD}Create/update backend/.env${RESET}"
echo -e "     ${CYAN}nano $TARGET_DIR/backend/.env${RESET}"
echo -e "     Required: JWT_SECRET, DATABASE_URL, GEMINI_API_KEY"
echo -e "     Required in prod: SMTP_HOST, SMTP_USER, SMTP_PASS, NOTIFY_FROM_EMAIL, APP_URL"
echo -e "     New keys to add: LOGIN_RATE_LIMIT_*, FORGOT_RATE_LIMIT_*, BACKGROUND_THRESHOLD, APP_TIMEZONE"
echo -e "     Use template: ${CYAN}cat $TARGET_DIR/backend/.env.example${RESET}"
echo ""
echo -e "  3. ${BOLD}Build and start containers${RESET}"
echo -e "     ${CYAN}cd $TARGET_DIR${RESET}"
echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml build --no-cache${RESET}"
echo -e "     ${CYAN}docker compose -f docker-compose.prod.yml up -d${RESET}"
echo ""
echo -e "  4. ${BOLD}Watch migration logs${RESET} (should see 001–018 applied)"
echo -e "     ${CYAN}docker logs -f spare-parts-verifier-backend-1 2>&1 | grep MIGRATE${RESET}"
echo ""
echo -e "  5. ${BOLD}Validate${RESET}"
echo -e "     ${CYAN}curl -s https://spare-parts.tawdev.com/api/health${RESET}"
echo ""
