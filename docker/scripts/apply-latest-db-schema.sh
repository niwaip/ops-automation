#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"
SMART_SCRIPT="$SCRIPT_DIR/start-smart.sh"
DOCKER_ENV_FILE="$DOCKER_DIR/.env"

INFRA_COMPOSE="docker-compose.yml"
BASE_COMPOSE="docker-compose.base.yml"
PLATFORM_SCHEMA="./prisma/schema.prisma"

CONTROL_PLANE_INCREMENTAL_SQL_FILES=(
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260515143000_add_execution_phases/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260516140000_add_execution_phase_steps/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260625000000_add_scheduler/migration.sql"
)
PLATFORM_UUID_DEFAULT_REPAIR_SQL="$REPO_ROOT/apps/backend/core/platform/prisma/manual-sql/20260704_repair_uuid_id_defaults.sql"

log() {
  printf '[apply-latest-db-schema] %s\n' "$1"
}

run_compose() {
  bash "$SMART_SCRIPT" "$@"
}

load_db_params() {
  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ops-postgres}"
  POSTGRES_USER="${POSTGRES_USER:-ops}"
  POSTGRES_DB="${POSTGRES_DB:-ops}"

  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local pg_user pg_db
    pg_user="$(grep -E '^POSTGRES_USER=' "$DOCKER_ENV_FILE" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
    pg_db="$(grep -E '^POSTGRES_DB=' "$DOCKER_ENV_FILE" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
    pg_user="${pg_user%$'\r'}"
    pg_db="${pg_db%$'\r'}"
    pg_user="${pg_user%\"}"
    pg_user="${pg_user#\"}"
    pg_db="${pg_db%\"}"
    pg_db="${pg_db#\"}"
    [[ -n "$pg_user" ]] && POSTGRES_USER="$pg_user"
    [[ -n "$pg_db" ]] && POSTGRES_DB="$pg_db"
  fi
}

wait_for_postgres() {
  load_db_params

  log "Waiting for postgres container '${POSTGRES_CONTAINER}'..."
  local retries=0
  until docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [[ $retries -ge 30 ]]; then
      log "Postgres did not become ready in time."
      return 1
    fi
    sleep 2
  done
}

run_platform_job() {
  local command="$1"
  run_compose "$BASE_COMPOSE" run --rm platform sh -c \
    "bash /workspace/docker/scripts/bootstrap-workspace-deps.sh && cd apps/backend/core/platform && ${command}"
}

run_psql() {
  local sql="$1"
  load_db_params
  run_compose "$INFRA_COMPOSE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$sql"
}

apply_sql_file() {
  local file_path="$1"
  load_db_params

  if [[ ! -f "$file_path" ]]; then
    log "Skip missing SQL file: $file_path"
    return 0
  fi

  log "Applying SQL file: $file_path"
  run_compose "$INFRA_COMPOSE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < "$file_path"
}

ensure_required_extensions() {
  log "Ensuring required postgres extensions..."
  run_psql 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";'
  run_psql 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
}

apply_latest_schema() {
  wait_for_postgres
  ensure_required_extensions

  log "Applying platform baseline and incremental Prisma migrations..."
  run_platform_job "npx prisma migrate deploy --schema ${PLATFORM_SCHEMA}"

  log "Applying shared control-plane incremental SQL..."
  local sql_file
  for sql_file in "${CONTROL_PLANE_INCREMENTAL_SQL_FILES[@]}"; do
    apply_sql_file "$sql_file"
  done

  log "Applying platform UUID default repair SQL..."
  apply_sql_file "$PLATFORM_UUID_DEFAULT_REPAIR_SQL"

  log "Latest database schema is now applied."
}

apply_latest_schema
