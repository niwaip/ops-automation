#!/bin/bash

# Minimal live smoke test for V4 planner layer on top of core:
# ai-orchestrator + platform + control-plane (core)

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

PLATFORM_BASE_URL="http://127.0.0.1:${PLATFORM_PORT}"
CONTROL_PLANE_BASE_URL="http://127.0.0.1:${CONTROL_PLANE_PORT}/api"
AI_ORCHESTRATOR_BASE_URL="http://127.0.0.1:${AI_ORCHESTRATOR_PORT}"

AI_CONTAINER="${AI_CONTAINER:-ops-ai-orchestrator}"
PLATFORM_CONTAINER="${PLATFORM_CONTAINER:-${AUTH_CONTAINER:-ops-platform}}"
CONTROL_PLANE_CONTAINER="${CONTROL_PLANE_CONTAINER:-ops-control-plane}"

LOGIN_RESPONSE_FILE=""
CHAT_RESPONSE_FILE=""

cleanup_temp_files() {
  if [ -n "$LOGIN_RESPONSE_FILE" ] && [ -f "$LOGIN_RESPONSE_FILE" ]; then
    rm -f "$LOGIN_RESPONSE_FILE"
  fi
  if [ -n "$CHAT_RESPONSE_FILE" ] && [ -f "$CHAT_RESPONSE_FILE" ]; then
    rm -f "$CHAT_RESPONSE_FILE"
  fi
}

trap cleanup_temp_files EXIT

log() {
  echo "[planner-smoke] $*"
}

fail() {
  echo "[planner-smoke][FAIL] $*" >&2
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

run_compose() {
  ./docker/start-smart.sh "$@"
}

container_running() {
  local name="$1"
  local state
  state="$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)"
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
  if ! node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!d.accessToken) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi
  LOGIN_RESPONSE_FILE="$response_file"
  return 0
}

extract_token() {
  node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(d.accessToken);" "$LOGIN_RESPONSE_FILE"
}

ai_chat_task() {
  local token="$1"
  local response_file
  local http_code
  response_file="$(mktemp)"
  http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -X POST "${AI_ORCHESTRATOR_BASE_URL}/ai/chat" \
    -H "Authorization: Bearer ${token}" \
    -H 'Content-Type: application/json' \
    -d '{"message":"查询上海的天气","config":{"mode":"task"}}' || true)"
  if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
    rm -f "$response_file"
    return 1
  fi
  # Ensure response shape contains events array
  if ! node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(d.events) || d.events.length === 0) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi
  CHAT_RESPONSE_FILE="$response_file"
  return 0
}

control_plane_list() {
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
  if ! node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if (!Array.isArray(d.data)) process.exit(1);" "$response_file"; then
    rm -f "$response_file"
    return 1
  fi
  rm -f "$response_file"
  return 0
}

main() {
  log "Ensuring core layer is up"
  ensure_network
  run_compose docker-compose.core.yml up -d
  retry "platform running" 36 5 container_running "$PLATFORM_CONTAINER" || fail "platform container not ready"
  retry "control-plane running" 36 5 container_running "$CONTROL_PLANE_CONTAINER" || fail "control-plane container not ready"

  log "Starting planner layer"
  run_compose docker-compose.planner.yml up -d
  retry "ai-orchestrator running" 36 5 container_running "$AI_CONTAINER" || fail "ai-orchestrator container not ready"

  retry "admin login" 12 5 platform_login || fail "admin login unavailable"
  TOKEN="$(extract_token)"
  retry "planner /ai/chat task" 12 5 ai_chat_task "$TOKEN" || fail "planner task chat failed"
  retry "control-plane /api/executions" 12 5 control_plane_list "$TOKEN" || fail "control-plane list failed"

  # Print a short summary
  node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const e=d.events||[]; const types=e.map(x=>x.type); console.log('[planner-smoke] chat events types:', types);" "$CHAT_RESPONSE_FILE"
  log "Planner smoke passed"
  log "Stop planner with:"
  log "  ./docker/start-smart.sh docker-compose.planner.yml down"
}

main "$@"
