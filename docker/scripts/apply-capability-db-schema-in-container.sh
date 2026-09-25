#!/usr/bin/env bash

# Applies capability migrations for modular Prisma schemas (browser_templates,
# browser_semantics, reports, document_engine).
# Supports clean database cold-start as well as idempotent baseline adoption
# for databases with existing un-migrated tables (P3005 resolution).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '[apply-capability-db-schema] %s\n' "$1"
}

BASE_DB_URL="${DATABASE_URL:-${CONTROL_PLANE_MIGRATION_DATABASE_URL:-}}"

if [[ -z "$BASE_DB_URL" ]]; then
  log "DATABASE_URL or CONTROL_PLANE_MIGRATION_DATABASE_URL is required."
  exit 1
fi

deploy_or_baseline_capability() {
  local service_filter="$1"
  local schema_rel_path="$2"
  local target_schema="$3"
  local baseline_name="${4:-0_baseline}"

  log "Processing capability migrations for $service_filter (schema=$target_schema)..."

  local target_url
  target_url="$(node -e "
    const u = new URL(process.env.BASE_DB_URL);
    u.searchParams.set('schema', '$target_schema');
    process.stdout.write(u.toString());
  ")"

  # Ensure target schema exists in PostgreSQL
  printf "CREATE SCHEMA IF NOT EXISTS %s;\n" "$target_schema" | \
    DATABASE_URL="$target_url" pnpm --dir "$REPO_ROOT" --filter "$service_filter" exec prisma db execute --stdin >/dev/null 2>&1 || true

  local deploy_output
  set +e
  deploy_output="$(DATABASE_URL="$target_url" pnpm --dir "$REPO_ROOT" --filter "$service_filter" exec prisma migrate deploy --schema "$schema_rel_path" 2>&1)"
  local deploy_exit=$?
  set -e

  if [[ $deploy_exit -eq 0 ]]; then
    printf '%s\n' "$deploy_output"
    return 0
  fi

  if [[ "$deploy_output" == *"P3005"* ]]; then
    log "Existing non-empty schema detected for $target_schema without migration history. Verifying structural consistency against baseline..."
    local diff_output
    set +e
    diff_output="$(DATABASE_URL="$target_url" pnpm --dir "$REPO_ROOT" --filter "$service_filter" exec prisma migrate diff \
      --exit-code \
      --from-url "$target_url" \
      --to-schema-datamodel "$schema_rel_path" 2>&1)"
    local diff_exit=$?
    set -e

    if [[ $diff_exit -ne 0 ]]; then
      log "ERROR: Schema drift detected between live database and baseline for $target_schema! Fail-closed."
      printf '%s\n' "$diff_output" >&2
      return 1
    fi

    log "Schema structure verified in sync with baseline datamodel (no drift). Recording baseline '$baseline_name'..."
    DATABASE_URL="$target_url" pnpm --dir "$REPO_ROOT" --filter "$service_filter" exec prisma migrate resolve --schema "$schema_rel_path" --applied "$baseline_name"
    log "Baseline resolved. Re-running deploy to confirm..."
    DATABASE_URL="$target_url" pnpm --dir "$REPO_ROOT" --filter "$service_filter" exec prisma migrate deploy --schema "$schema_rel_path"
  else
    printf '%s\n' "$deploy_output" >&2
    return 1
  fi
}

export BASE_DB_URL

log "Applying capability migrations across modular schemas..."
deploy_or_baseline_capability "@ops/browser-template" "prisma/schema.prisma" "browser_templates"
deploy_or_baseline_capability "@ops/browser-semantics" "prisma/schema.prisma" "browser_semantics"
deploy_or_baseline_capability "@ops/report" "prisma/schema.prisma" "reports"
deploy_or_baseline_capability "@ops/document-domain" "template/prisma/schema.prisma" "document_engine"

log "All capability schemas are successfully migrated and current."
