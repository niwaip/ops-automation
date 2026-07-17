#!/bin/bash

# Minimal live smoke test for the V4 core layer:
# postgres + redis + platform + control-plane + session-broker

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ "$(pwd)" != "$REPO_ROOT" ]; then
  echo "Please run this script from the repository root:"
  echo "  $REPO_ROOT"
  exit 1
fi

if [ -f "$REPO_ROOT/docker/.env" ]; then
  set -a
  # Load .env defensively because the workspace file may contain CRLF line endings.
  # shellcheck disable=SC1090
  . <(sed 's/\r$//' "$REPO_ROOT/docker/.env")
  set +a
fi

NETWORK_NAME="${NETWORK_NAME:-ops-network}"
PLATFORM_PORT="${PLATFORM_PORT:-${AUTH_PORT:-3001}}"
CONTROL_PLANE_PORT="${CONTROL_PLANE_PORT:-3003}"
PLATFORM_BASE_URL="http://127.0.0.1:${PLATFORM_PORT}"
CONTROL_PLANE_BASE_URL="http://127.0.0.1:${CONTROL_PLANE_PORT}/api"
PLATFORM_CONTAINER="${PLATFORM_CONTAINER:-${AUTH_CONTAINER:-ops-platform}}"
CONTROL_PLANE_CONTAINER="${CONTROL_PLANE_CONTAINER:-ops-control-plane}"
SESSION_BROKER_CONTAINER="${SESSION_BROKER_CONTAINER:-ops-session-broker}"
ALLOW_DB_PUSH="${CORE_SMOKE_ALLOW_DB_PUSH:-0}"

LOGIN_RESPONSE_FILE=""
EXECUTIONS_RESPONSE_FILE=""

cleanup_temp_files() {
  if [ -n "$LOGIN_RESPONSE_FILE" ] && [ -f "$LOGIN_RESPONSE_FILE" ]; then
    rm -f "$LOGIN_RESPONSE_FILE"
  fi

  if [ -n "$EXECUTIONS_RESPONSE_FILE" ] && [ -f "$EXECUTIONS_RESPONSE_FILE" ]; then
    rm -f "$EXECUTIONS_RESPONSE_FILE"
  fi
}

trap cleanup_temp_files EXIT

log() {
  echo "[core-smoke] $*"
}

fail() {
  echo "[core-smoke][FAIL] $*" >&2
  exit 1
}

ensure_network() {
  if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    log "Using docker network: $NETWORK_NAME"
    return
  fi

  log "Creating missing docker network: $NETWORK_NAME"
  docker network create "$NETWORK_NAME" >/dev/null
}

run_core_compose() {
  ./docker/start-smart.sh docker-compose.core.yml "$@"
}

container_running() {
  local container_name="$1"
  local state

  state="$(docker inspect -f '{{.State.Running}}' "$container_name" 2>/dev/null || true)"
  [ "$state" = "true" ]
}

retry() {
  local label="$1"
  local attempts="$2"
  local delay_seconds="$3"
  shift 3

  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if "$@"; then
      return 0
    fi

    if [ "$attempt" -lt "$attempts" ]; then
      log "Waiting for ${label} (${attempt}/${attempts})"
      sleep "$delay_seconds"
    fi
  done

  return 1
}

exec_in_container() {
  local container_name="$1"
  local command="$2"
  docker exec "$container_name" sh -lc "$command"
}

platform_prisma_generate() {
  exec_in_container "$PLATFORM_CONTAINER" "cd /app && npx prisma generate"
}

platform_db_push() {
  exec_in_container "$PLATFORM_CONTAINER" "cd /app && npx prisma db push --accept-data-loss"
}

platform_seed() {
  exec_in_container "$PLATFORM_CONTAINER" "cd /app && npm run seed"
}

platform_login() {
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -X POST "${PLATFORM_BASE_URL}/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"admin123"}' || true)"

  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (typeof data.accessToken !== 'string' || !data.accessToken) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  LOGIN_RESPONSE_FILE="$response_file"
  return 0
}

extract_access_token() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(data.accessToken);" "$LOGIN_RESPONSE_FILE"
}

platform_me() {
  local token="$1"
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    "${PLATFORM_BASE_URL}/auth/me" \
    -H "Authorization: Bearer ${token}" || true)"

  if [ "$http_code" != "200" ]; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!data || !data.user || data.user.username !== 'admin') process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  rm -f "$response_file"
  return 0
}

control_plane_list_executions() {
  local token="$1"
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    "${CONTROL_PLANE_BASE_URL}/executions?page=1&pageSize=1" \
    -H "Authorization: Bearer ${token}" || true)"

  if [ "$http_code" != "200" ]; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(data.data) || typeof data.total !== 'number' || typeof data.page !== 'number' || typeof data.pageSize !== 'number') process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  EXECUTIONS_RESPONSE_FILE="$response_file"
  return 0
}

main() {
  local access_token

  log "Starting V4 core layer"
  ensure_network
  run_core_compose up -d

  retry "platform container running" 36 5 container_running "$PLATFORM_CONTAINER" || fail "platform container did not become ready"
  retry "control-plane container running" 36 5 container_running "$CONTROL_PLANE_CONTAINER" || fail "control-plane container did not become ready"
  retry "session-broker container running" 36 5 container_running "$SESSION_BROKER_CONTAINER" || fail "session-broker container did not become ready"

  if ! retry "admin login" 6 5 platform_login; then
    log "Existing admin login is not ready; attempting non-destructive platform seed"
    retry "platform prisma generate" 24 5 platform_prisma_generate || fail "platform prisma generate did not become ready"
    retry "platform seed" 24 5 platform_seed || fail "platform seed did not become ready"

    log "Restarting platform and control-plane after platform seed"
    docker restart "$PLATFORM_CONTAINER" "$CONTROL_PLANE_CONTAINER" >/dev/null
    retry "platform container running after restart" 24 5 container_running "$PLATFORM_CONTAINER" || fail "platform container did not become ready after restart"
    retry "control-plane container running after restart" 24 5 container_running "$CONTROL_PLANE_CONTAINER" || fail "control-plane container did not become ready after restart"

    if ! retry "admin login after platform seed" 12 5 platform_login; then
      if [ "$ALLOW_DB_PUSH" != "1" ]; then
        fail "admin login is still unavailable after seed; set CORE_SMOKE_ALLOW_DB_PUSH=1 only for an isolated database if you want the script to run prisma db push"
      fi

      log "CORE_SMOKE_ALLOW_DB_PUSH=1 detected; running destructive-capable prisma db push for isolated database bootstrap"
      retry "platform prisma db push" 12 5 platform_db_push || fail "platform prisma db push did not become ready"
      retry "platform seed after db push" 12 5 platform_seed || fail "platform seed after db push did not become ready"
      docker restart "$PLATFORM_CONTAINER" "$CONTROL_PLANE_CONTAINER" >/dev/null
      retry "platform container running after db push restart" 24 5 container_running "$PLATFORM_CONTAINER" || fail "platform container did not become ready after db push restart"
      retry "control-plane container running after db push restart" 24 5 container_running "$CONTROL_PLANE_CONTAINER" || fail "control-plane container did not become ready after db push restart"
      retry "admin login after db push" 20 5 platform_login || fail "admin login is unavailable after db push bootstrap"
    fi
  fi

  access_token="$(extract_access_token)"
  retry "platform /auth/me" 10 3 platform_me "$access_token" || fail "platform /auth/me did not become ready"
  retry "control-plane /api/executions" 20 5 control_plane_list_executions "$access_token" || fail "control-plane /api/executions did not become ready"

  log "Smoke test passed"
  log "Platform login succeeded at ${PLATFORM_BASE_URL}/auth/login"
  log "Control-plane execution list succeeded at ${CONTROL_PLANE_BASE_URL}/executions"

  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log('[core-smoke] executions total:', data.total);" "$EXECUTIONS_RESPONSE_FILE"
  log "Core services remain running. Stop them with:"
  log "  ./docker/start-smart.sh docker-compose.core.yml down"
}

main "$@"
