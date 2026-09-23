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

apply_capability_migrations() {
  local service_filter="$1"
  local schema_rel_path="$2"
  local target_schema="$3"
  log "Applying capability migrations for $service_filter (schema=$target_schema)..."
  local target_url
  target_url="$(node -e "
    const u = new URL(process.env.CONTROL_PLANE_MIGRATION_DATABASE_URL);
    u.searchParams.set('schema', '$target_schema');
    process.stdout.write(u.toString());
  ")"
  DATABASE_URL="$target_url" pnpm --dir "$REPO_ROOT" --filter "$service_filter" exec prisma migrate deploy --schema "$schema_rel_path"
}

log 'Applying capability migrations with release-only credential...'
apply_capability_migrations "@ops/browser-template" "prisma/schema.prisma" "browser_templates"
apply_capability_migrations "@ops/browser-semantics" "prisma/schema.prisma" "browser_semantics"
apply_capability_migrations "@ops/report" "prisma/schema.prisma" "reports"
apply_capability_migrations "@ops/document-domain" "template/prisma/schema.prisma" "document_engine"

log 'The canonical production migration history and capability schemas are current.'
