#!/bin/bash

# Minimal live smoke test for V4 runtime layer:
# browser-worker / carbone-engine / temporal / temporal-ui / temporal-sandbox-agent

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

# Container names from docker-compose.runtime.yml
BW_CONTAINER="${BW_CONTAINER:-ops-browser-worker}"
CHROME_CONTAINER="${CHROME_CONTAINER:-ops-browser-chrome}"
CARBONE_CONTAINER="${CARBONE_CONTAINER:-carbone-engine}"
TEMPORAL_CONTAINER="${TEMPORAL_CONTAINER:-ops-temporal}"
TEMPORAL_UI_CONTAINER="${TEMPORAL_UI_CONTAINER:-ops-temporal-ui}"
SANDBOX_CONTAINER="${SANDBOX_CONTAINER:-ops-temporal-sandbox-agent}"

log() {
  echo "[runtime-smoke] $*"
}

fail() {
  echo "[runtime-smoke][FAIL] $*" >&2
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
  ./docker/start-smart.sh docker-compose.runtime.yml up -d
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

main() {
  log "Starting runtime layer services"
  ensure_network
  run_compose

  # These checks cover the essential runtime components
  retry "browser-worker running" 36 5 container_running "$BW_CONTAINER" || fail "browser-worker not ready"
  retry "browser-chrome running" 36 5 container_running "$CHROME_CONTAINER" || fail "browser-chrome not ready"
  retry "carbone-engine running" 36 5 container_running "$CARBONE_CONTAINER" || fail "carbone-engine not ready"
  retry "temporal running" 36 5 container_running "$TEMPORAL_CONTAINER" || fail "temporal not ready"
  retry "temporal-ui running" 36 5 container_running "$TEMPORAL_UI_CONTAINER" || fail "temporal-ui not ready"
  retry "temporal-sandbox-agent running" 36 5 container_running "$SANDBOX_CONTAINER" || fail "temporal-sandbox-agent not ready"

  log "Runtime smoke passed"
  log "Stop runtime with:"
  log "  ./docker/start-smart.sh docker-compose.runtime.yml down"
}

main "$@"
