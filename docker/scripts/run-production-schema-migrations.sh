#!/usr/bin/env bash

# Explicit production Release Job entrypoint.  It is never invoked by an
# application service and must be run with migration-only administrator URLs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PLATFORM_MIGRATOR="$SCRIPT_DIR/apply-latest-db-schema-in-container.sh"
AI_MIGRATOR="$SCRIPT_DIR/apply-ai-orchestrator-db-schema-in-container.sh"
MIGRATION_TARGET_VALIDATOR="$REPO_ROOT/database/scripts/validate-migration-targets.mjs"

log() {
  printf '[production-schema-migrator] %s\n' "$1"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    log "Missing required environment variable: $name"
    exit 1
  fi
}

for variable in CONTROL_PLANE_MIGRATION_DATABASE_URL AI_ORCHESTRATOR_MIGRATION_DATABASE_URL; do
  require_env "$variable"
done

if [[ ! -f "$PLATFORM_MIGRATOR" || ! -f "$AI_MIGRATOR" || ! -f "$MIGRATION_TARGET_VALIDATOR" ]]; then
  log 'Required migration script is missing from the release image.'
  exit 1
fi

node "$REPO_ROOT/database/scripts/validate-migration-authority.mjs"
node "$MIGRATION_TARGET_VALIDATOR"

log 'Applying the single canonical migration history with the release-only credential...'
DATABASE_URL="$CONTROL_PLANE_MIGRATION_DATABASE_URL" bash "$PLATFORM_MIGRATOR"

log 'Validating AI Orchestrator schema against the canonical migration history...'
DATABASE_URL="$AI_ORCHESTRATOR_MIGRATION_DATABASE_URL" bash "$AI_MIGRATOR"

log 'The canonical production migration history is current.'
