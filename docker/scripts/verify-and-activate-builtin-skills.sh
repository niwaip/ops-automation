#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '[verify-and-activate-builtin-skills] %s\n' "$1"
}

PLATFORM_PORT="${PLATFORM_PORT:-3001}"
INTERNAL_SECRET="${INTERNAL_API_SECRET:-${INTERNAL_API_SHARED_SECRET:-}}"
TARGET="${1:-all}"

# First try HTTP endpoint if platform is listening
HTTP_STATUS=0
if command -v curl &>/dev/null; then
  set +e
  HTTP_STATUS=$(curl -s -o /tmp/verify-activate-result.json -w "%{http_code}" \
    -X POST "http://127.0.0.1:${PLATFORM_PORT}/internal/builtin-skills/verify-and-activate" \
    -H "Content-Type: application/json" \
    -H "x-internal-secret: ${INTERNAL_SECRET}" \
    -d "{\"target\": \"${TARGET}\"}" 2>/dev/null)
  set -e
fi

if [[ "$HTTP_STATUS" == "200" ]]; then
  if [[ -f /tmp/verify-activate-result.json ]]; then
    cat /tmp/verify-activate-result.json
    echo ""
    if grep -q '"success":false' /tmp/verify-activate-result.json || grep -q '"failed":\[{' /tmp/verify-activate-result.json; then
      log "Verification completed with failures reported in response."
      exit 1
    fi
  fi
  log "Successfully triggered verification and activation via HTTP API."
  exit 0
fi

if [[ "$HTTP_STATUS" == "207" ]]; then
  log "Verification failed for one or more skills (HTTP 207 Multi-Status):"
  if [[ -f /tmp/verify-activate-result.json ]]; then
    cat /tmp/verify-activate-result.json
    echo ""
  fi
  exit 1
fi

# If HTTP not reachable or returned non-200, run direct provisioning CLI command
log "Platform HTTP not reachable or returned status $HTTP_STATUS, executing direct provisioning command..."

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "DATABASE_URL is not set. Cannot run standalone CLI."
  exit 1
fi

cd "$REPO_ROOT/apps/backend/platform"
BUILTIN_SKILL_PROVISION_SKIP_SMOKE="false" \
pnpm exec ts-node src/commands/builtin-skill-provision.command.ts "${TARGET}" full --activate

log "Direct verification and activation complete."
