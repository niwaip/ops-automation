#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"
SMART_SCRIPT="$SCRIPT_DIR/start-smart.sh"
DOCKER_ENV_FILE="$DOCKER_DIR/.env"

BASE_COMPOSE="docker-compose.base.yml"
CONTAINER_SCHEMA_SCRIPT="/workspace/docker/scripts/apply-latest-db-schema-in-container.sh"

log() {
  printf '[apply-latest-db-schema] %s\n' "$1"
}

run_compose() {
  bash "$SMART_SCRIPT" "$@"
}

load_db_params() {
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

  log "Waiting for the postgres service..."
  local retries=0
  until run_compose "$BASE_COMPOSE" exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
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
  run_compose "$BASE_COMPOSE" run --rm --no-deps platform sh -c \
    "bash /workspace/docker/scripts/bootstrap-workspace-deps.sh && cd apps/backend/core/platform && ${command}"
}

apply_latest_schema() {
  wait_for_postgres
  log "Applying the canonical shared database migration flow..."
  run_platform_job "bash ${CONTAINER_SCHEMA_SCRIPT}"
}

apply_latest_schema
