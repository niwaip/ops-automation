#!/bin/bash

# Full-stack smoke test for the V4 full development composition.
# Verifies demo/e2e baseline on top of docker-compose.full.yml.
# Optional profiles such as `report` remain disabled in this smoke test.

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
  # shellcheck disable=SC1090
  . <(sed 's/\r$//' "$REPO_ROOT/docker/.env")
  set +a
fi

NETWORK_NAME="${NETWORK_NAME:-ops-network}"
PLATFORM_PORT="${PLATFORM_PORT:-${AUTH_PORT:-3001}}"
CONTROL_PLANE_PORT="${CONTROL_PLANE_PORT:-3003}"
AI_ORCHESTRATOR_PORT="${AI_ORCHESTRATOR_PORT:-3007}"
CARBONE_ENGINE_PORT="${CARBONE_ENGINE_PORT:-3009}"
PORTAL_PORT="${PORTAL_PORT:-5173}"
FULL_SMOKE_TASK_ATTEMPTS="${FULL_SMOKE_TASK_ATTEMPTS:-6}"
FULL_SMOKE_TASK_ATTEMPT_DELAY="${FULL_SMOKE_TASK_ATTEMPT_DELAY:-8}"
FULL_SMOKE_EXECUTION_POLL_ATTEMPTS="${FULL_SMOKE_EXECUTION_POLL_ATTEMPTS:-36}"
FULL_SMOKE_EXECUTION_POLL_DELAY="${FULL_SMOKE_EXECUTION_POLL_DELAY:-5}"

PLATFORM_BASE_URL="http://127.0.0.1:${PLATFORM_PORT}"
CONTROL_PLANE_BASE_URL="http://127.0.0.1:${CONTROL_PLANE_PORT}/api"
AI_ORCHESTRATOR_BASE_URL="http://127.0.0.1:${AI_ORCHESTRATOR_PORT}"
CARBONE_BASE_URL="http://127.0.0.1:${CARBONE_ENGINE_PORT}"
PORTAL_BASE_URL="http://127.0.0.1:${PORTAL_PORT}"

LOGIN_RESPONSE_FILE=""
CHAT_RESPONSE_FILE=""
CHAT_RESPONSE_REPEAT_FILE=""
PORTAL_RESPONSE_FILE=""
CARBONE_RESPONSE_FILE=""
EXECUTION_BEFORE_FILE=""
EXECUTION_AFTER_FILE=""
EXECUTION_REPEAT_FILE=""
EXECUTION_DETAIL_FILE=""

cleanup_temp_files() {
  for file in "$LOGIN_RESPONSE_FILE" "$CHAT_RESPONSE_FILE" "$CHAT_RESPONSE_REPEAT_FILE" "$PORTAL_RESPONSE_FILE" "$CARBONE_RESPONSE_FILE" "$EXECUTION_BEFORE_FILE" "$EXECUTION_AFTER_FILE" "$EXECUTION_REPEAT_FILE" "$EXECUTION_DETAIL_FILE"; do
    if [ -n "${file:-}" ] && [ -f "$file" ]; then
      rm -f "$file"
    fi
  done
}

trap cleanup_temp_files EXIT

log() {
  echo "[full-smoke] $*"
}

fail() {
  echo "[full-smoke][FAIL] $*" >&2
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

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!data.accessToken) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  LOGIN_RESPONSE_FILE="$response_file"
  return 0
}

extract_token() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(data.accessToken);" "$LOGIN_RESPONSE_FILE"
}

portal_home() {
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(curl -sS -L -o "$response_file" -w '%{http_code}' "${PORTAL_BASE_URL}" || true)"

  if [ "$http_code" != "200" ]; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const body=fs.readFileSync(process.argv[1],'utf8'); if (!body.includes('<!doctype html') && !body.includes('<html')) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  PORTAL_RESPONSE_FILE="$response_file"
  return 0
}

carbone_api() {
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' "${CARBONE_BASE_URL}/api" || true)"

  if [ "$http_code" != "200" ]; then
    rm -f "$response_file"
    return 1
  fi

  CARBONE_RESPONSE_FILE="$response_file"
  return 0
}

control_plane_list() {
  local token="$1"
  local output_file="${2:-}"
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

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(data.data)) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  if [ -n "$output_file" ]; then
    cp "$response_file" "$output_file"
  fi

  rm -f "$response_file"
  return 0
}

extract_execution_total() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(String(data.total));" "$1"
}

extract_execution_id_from_file() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const events=Array.isArray(data.events)?data.events:[]; for (const event of events) { const id=event && event.data && typeof event.data.executionId==='string' ? event.data.executionId : ''; if (id) { process.stdout.write(id); process.exit(0); } } process.exit(1);" "$1"
}

extract_execution_status() {
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (typeof data.status !== 'string' || !data.status.trim()) process.exit(1); process.stdout.write(data.status);" "$1"
}

control_plane_get_execution() {
  local token="$1"
  local execution_id="$2"
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    "${CONTROL_PLANE_BASE_URL}/executions/${execution_id}" \
    -H "Authorization: Bearer ${token}" || true)"

  if [ "$http_code" != "200" ]; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!data.id || !data.status) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  EXECUTION_DETAIL_FILE="$response_file"
  return 0
}

execution_succeeded() {
  local token="$1"
  local execution_id="$2"

  if ! control_plane_get_execution "$token" "$execution_id"; then
    return 1
  fi

  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (data.status !== 'succeeded') process.exit(1);" "$EXECUTION_DETAIL_FILE"
}

wait_for_execution_success() {
  local token="$1"
  local execution_id="$2"
  local attempts="$3"
  local delay_seconds="$4"
  local attempt
  local status

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if control_plane_get_execution "$token" "$execution_id"; then
      status="$(extract_execution_status "$EXECUTION_DETAIL_FILE" 2>/dev/null || true)"
      case "$status" in
        succeeded)
          return 0
          ;;
        failed|cancelled)
          log "Execution ${execution_id} reached terminal status ${status}"
          return 2
          ;;
      esac
    fi

    if [ "$attempt" -lt "$attempts" ]; then
      log "Waiting for execution ${execution_id} to finish (${attempt}/${attempts})"
      sleep "$delay_seconds"
    fi
  done

  return 1
}

ai_chat_task() {
  local token="$1"
  local idempotency_key="$2"
  local output_file="$3"
  local response_file
  local http_code

  response_file="$(mktemp)"
  local payload
  payload="$(node -e "process.stdout.write(JSON.stringify({message:'查询上海的天气',idempotencyKey:process.argv[1],config:{mode:'task'}}));" "$idempotency_key")"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -X POST "${AI_ORCHESTRATOR_BASE_URL}/ai/chat" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d "$payload" || true)"

  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(data.events) || data.events.length === 0) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  if ! node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const events=Array.isArray(data.events)?data.events:[]; const hasTerminalError=events.some((item)=>item && item.type==='error'); const hasUsefulResult=events.some((item)=>item && item.type==='result' && typeof item.content==='string' && item.content.trim().length>0); if (hasTerminalError || !hasUsefulResult) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi

  cp "$response_file" "$output_file"
  rm -f "$response_file"
  return 0
}

main() {
  local token
  local execution_id
  local repeated_execution_id
  local before_total
  local after_total
  local repeat_total
  local idempotency_key
  local task_attempt
  local task_succeeded=0
  local wait_status

  log "Starting full V4-compatible development stack (without optional report profile)"
  ensure_network
  ./docker/start-smart.sh docker-compose.full.yml up -d

  retry "platform container running" 36 5 container_running "ops-platform" || fail "platform container not ready"
  retry "control-plane container running" 36 5 container_running "ops-control-plane" || fail "control-plane container not ready"
  retry "ai-orchestrator container running" 36 5 container_running "ops-ai-orchestrator" || fail "ai-orchestrator container not ready"
  retry "session-broker container running" 36 5 container_running "ops-session-broker" || fail "session-broker container not ready"
  retry "browser-worker container running" 36 5 container_running "ops-browser-worker" || fail "browser-worker container not ready"
  retry "browser-chrome container running" 36 5 container_running "ops-browser-chrome" || fail "browser-chrome container not ready"
  retry "carbone-engine container running" 36 5 container_running "carbone-engine" || fail "carbone-engine container not ready"
  retry "portal container running" 36 5 container_running "ops-portal" || fail "portal container not ready"
  retry "temporal container running" 36 5 container_running "ops-temporal" || fail "temporal container not ready"
  retry "temporal-ui container running" 36 5 container_running "ops-temporal-ui" || fail "temporal-ui container not ready"
  retry "sandbox-worker container running" 36 5 container_running "ops-sandbox-worker" || fail "sandbox-worker container not ready"

  retry "admin login" 24 5 platform_login || fail "admin login unavailable"
  token="$(extract_token)"
  idempotency_key="full-smoke-$(date +%s)-$$"
  EXECUTION_BEFORE_FILE="$(mktemp)"
  retry "control-plane execution baseline" 24 5 control_plane_list "$token" "$EXECUTION_BEFORE_FILE" || fail "control-plane execution baseline unavailable"
  before_total="$(extract_execution_total "$EXECUTION_BEFORE_FILE")"
  retry "portal homepage" 24 5 portal_home || fail "portal homepage unavailable"
  retry "carbone /api" 24 5 carbone_api || fail "carbone /api unavailable"

  for ((task_attempt = 1; task_attempt <= FULL_SMOKE_TASK_ATTEMPTS; task_attempt += 1)); do
    idempotency_key="full-smoke-$(date +%s)-$$-${task_attempt}"
    CHAT_RESPONSE_FILE="$(mktemp)"

    if ! ai_chat_task "$token" "$idempotency_key" "$CHAT_RESPONSE_FILE"; then
      log "Planner task attempt ${task_attempt}/${FULL_SMOKE_TASK_ATTEMPTS} failed before strong validation, trying a fresh idempotency key"
      sleep "$FULL_SMOKE_TASK_ATTEMPT_DELAY"
      continue
    fi

    execution_id="$(extract_execution_id_from_file "$CHAT_RESPONSE_FILE")" || fail "planner task chat did not expose executionId"
    if wait_for_execution_success "$token" "$execution_id" "$FULL_SMOKE_EXECUTION_POLL_ATTEMPTS" "$FULL_SMOKE_EXECUTION_POLL_DELAY"; then
      task_succeeded=1
      break
    fi

    wait_status=$?
    if [ "$wait_status" = "2" ]; then
      log "Execution ${execution_id} failed terminally on attempt ${task_attempt}/${FULL_SMOKE_TASK_ATTEMPTS}; ignoring transient run and retrying with a fresh idempotency key"
    else
      log "Execution ${execution_id} did not reach succeeded within the polling window on attempt ${task_attempt}/${FULL_SMOKE_TASK_ATTEMPTS}"
    fi

    sleep "$FULL_SMOKE_TASK_ATTEMPT_DELAY"
  done

  if [ "$task_succeeded" != "1" ]; then
    fail "planner task could not produce a succeeded execution after ${FULL_SMOKE_TASK_ATTEMPTS} fresh idempotency-key attempts"
  fi

  EXECUTION_AFTER_FILE="$(mktemp)"
  retry "control-plane /api/executions" 24 5 control_plane_list "$token" "$EXECUTION_AFTER_FILE" || fail "control-plane execution list unavailable"
  after_total="$(extract_execution_total "$EXECUTION_AFTER_FILE")"

  if [ "$after_total" -le "$before_total" ]; then
    fail "execution total did not increase after planner task run (before=${before_total}, after=${after_total})"
  fi

  CHAT_RESPONSE_REPEAT_FILE="$(mktemp)"
  retry "planner idempotent replay" 24 5 ai_chat_task "$token" "$idempotency_key" "$CHAT_RESPONSE_REPEAT_FILE" || fail "planner idempotent replay unavailable"
  repeated_execution_id="$(extract_execution_id_from_file "$CHAT_RESPONSE_REPEAT_FILE")" || fail "planner idempotent replay did not expose executionId"
  if [ "$repeated_execution_id" != "$execution_id" ]; then
    fail "idempotent replay returned a different execution (first=${execution_id}, second=${repeated_execution_id})"
  fi

  EXECUTION_REPEAT_FILE="$(mktemp)"
  retry "control-plane execution count after idempotent replay" 24 5 control_plane_list "$token" "$EXECUTION_REPEAT_FILE" || fail "execution count after idempotent replay unavailable"
  repeat_total="$(extract_execution_total "$EXECUTION_REPEAT_FILE")"
  if [ "$repeat_total" != "$after_total" ]; then
    fail "idempotent replay changed execution total unexpectedly (after-first=${after_total}, after-replay=${repeat_total})"
  fi

  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const types=(data.events||[]).map(item=>item.type); console.log('[full-smoke] planner chat events types:', types);" "$CHAT_RESPONSE_FILE"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const types=(data.events||[]).map(item=>item.type); console.log('[full-smoke] replay chat events types:', types);" "$CHAT_RESPONSE_REPEAT_FILE"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); console.log('[full-smoke] execution status:', data.status); console.log('[full-smoke] execution id:', data.id);" "$EXECUTION_DETAIL_FILE"
  log "Execution total increased from ${before_total} to ${after_total}"
  log "Idempotent replay kept execution total at ${repeat_total}"
  log "Full smoke passed"
  log "Stop full stack with:"
  log "  ./docker/start-smart.sh docker-compose.full.yml down"
}

main "$@"
