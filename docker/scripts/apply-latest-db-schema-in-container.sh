#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
PLATFORM_SCHEMA="$REPO_ROOT/apps/backend/core/platform/prisma/schema.prisma"
CONTROL_PLANE_SCHEMA="$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/schema.prisma"
EXISTING_PLATFORM_BASELINE_GUARD="$REPO_ROOT/docker/sql/verify-existing-platform-baseline.sql"
SHARED_EXECUTION_SCHEMA_GUARD="$REPO_ROOT/docker/sql/verify-shared-execution-schema.sql"
PLATFORM_BASELINED_MIGRATIONS=(
  "20260608_init_platform_baseline"
  "20260704194500_add_skill_access_requests"
  "20260729000000_fix_granted_by_type"
  "20260729140000_add_builtin_skills"
)
CONTROL_PLANE_INCREMENTAL_SQL_FILES=(
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260515143000_add_execution_phases/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260516140000_add_execution_phase_steps/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260625000000_add_scheduler/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260728120000_add_deterministic_execution_plan/migration.sql"
)
PLATFORM_UUID_DEFAULT_REPAIR_SQL="$REPO_ROOT/apps/backend/core/platform/prisma/manual-sql/20260704_repair_uuid_id_defaults.sql"

log() {
  printf '[apply-latest-db-schema] %s\n' "$1"
}

run_platform_prisma() {
  pnpm --dir "$REPO_ROOT" --filter @ops/platform exec prisma "$@"
}

apply_sql_file() {
  local file_path="$1"

  if [[ ! -f "$file_path" ]]; then
    log "Required SQL file is missing: $file_path"
    return 1
  fi

  log "Applying idempotent SQL: ${file_path#"$REPO_ROOT/"}"
  run_platform_prisma db execute --schema "$PLATFORM_SCHEMA" --file "$file_path"
}

deploy_platform_migrations() {
  local deploy_output

  if deploy_output="$(run_platform_prisma migrate deploy --schema "$PLATFORM_SCHEMA" 2>&1)"; then
    printf '%s\n' "$deploy_output"
    return 0
  fi

  if [[ "$deploy_output" != *"P3005"* ]]; then
    printf '%s\n' "$deploy_output" >&2
    return 1
  fi

  log 'Existing non-empty database has no Prisma history; verifying it before baseline adoption...'
  apply_sql_file "$EXISTING_PLATFORM_BASELINE_GUARD"

  local migration_name
  for migration_name in "${PLATFORM_BASELINED_MIGRATIONS[@]}"; do
    log "Recording verified existing migration: $migration_name"
    run_platform_prisma migrate resolve \
      --schema "$PLATFORM_SCHEMA" \
      --applied "$migration_name"
  done

  log 'Prisma migration history adopted; confirming deploy status...'
  run_platform_prisma migrate deploy --schema "$PLATFORM_SCHEMA"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  log 'DATABASE_URL is required.'
  exit 1
fi

if ! cmp -s "$PLATFORM_SCHEMA" "$CONTROL_PLANE_SCHEMA"; then
  log 'Shared public Prisma schemas differ. Refusing to migrate an ambiguous database contract.'
  log "Canonical schema: $PLATFORM_SCHEMA"
  log "Mirror schema:    $CONTROL_PLANE_SCHEMA"
  exit 1
fi

log 'Validating the canonical shared Prisma schema...'
run_platform_prisma validate --schema "$PLATFORM_SCHEMA"

log 'Ensuring required PostgreSQL extensions...'
printf '%s\n' \
  'CREATE EXTENSION IF NOT EXISTS "pgcrypto";' \
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' |
  run_platform_prisma db execute --schema "$PLATFORM_SCHEMA" --stdin

log 'Applying tracked platform migrations...'
deploy_platform_migrations

for sql_file in "${CONTROL_PLANE_INCREMENTAL_SQL_FILES[@]}"; do
  apply_sql_file "$sql_file"
done

apply_sql_file "$PLATFORM_UUID_DEFAULT_REPAIR_SQL"
log 'Verifying shared execution tables and columns...'
apply_sql_file "$SHARED_EXECUTION_SCHEMA_GUARD"
log 'Latest shared database schema is applied.'
