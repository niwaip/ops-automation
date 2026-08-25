#!/usr/bin/env bash

# Explicit production Release Job entrypoint.  It is never invoked by an
# application service and must be run with migration-only administrator URLs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_MIGRATOR="$SCRIPT_DIR/apply-latest-db-schema-in-container.sh"
AI_MIGRATOR="$SCRIPT_DIR/apply-ai-orchestrator-db-schema-in-container.sh"

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

if [[ ! -f "$PLATFORM_MIGRATOR" || ! -f "$AI_MIGRATOR" ]]; then
  log 'Required migration script is missing from the release image.'
  exit 1
fi

log 'Applying canonical shared Platform migrations with the release-only credential...'
DATABASE_URL="$CONTROL_PLANE_MIGRATION_DATABASE_URL" bash "$PLATFORM_MIGRATOR"

log 'Applying AI Orchestrator-owned migrations with the release-only credential...'
DATABASE_URL="$AI_ORCHESTRATOR_MIGRATION_DATABASE_URL" bash "$AI_MIGRATOR"

log 'All production migration histories are current.'
