#!/bin/bash

# Minimal live smoke test for the add-in stack:
# carbone-api + office-addin

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

ADDIN_PORT="${ADDIN_PORT:-3000}"
CARBONE_API_PORT="${CARBONE_API_PORT:-3100}"
CARBONE_API_HTTPS_PORT="${CARBONE_API_HTTPS_PORT:-3443}"
CARBONE_CONTAINER="${CARBONE_CONTAINER:-carbone-api}"
OFFICE_ADDIN_CONTAINER="${OFFICE_ADDIN_CONTAINER:-office-addin}"

CARBONE_HTTP_BASE_URL="http://127.0.0.1:${CARBONE_API_PORT}"
CARBONE_HTTPS_BASE_URL="https://127.0.0.1:${CARBONE_API_HTTPS_PORT}"
ADDIN_BASE_URL="https://127.0.0.1:${ADDIN_PORT}"

TMP_FILES=()

cleanup_temp_files() {
  local file
  for file in "${TMP_FILES[@]:-}"; do
    if [ -n "$file" ] && [ -f "$file" ]; then
      rm -f "$file"
    fi
  done
}

trap cleanup_temp_files EXIT

log() {
  echo "[addin-smoke] $*"
}

fail() {
  echo "[addin-smoke][FAIL] $*" >&2
  exit 1
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

http_ok() {
  local url="$1"
  local insecure="${2:-0}"
  local response_file
  local http_code
  local curl_args=(-sS -o)

  response_file="$(mktemp)"
  TMP_FILES+=("$response_file")

  if [ "$insecure" = "1" ]; then
    http_code="$(curl -k "${curl_args[@]}" "$response_file" -w '%{http_code}' "$url" || true)"
  else
    http_code="$(curl "${curl_args[@]}" "$response_file" -w '%{http_code}' "$url" || true)"
  fi

  case "$http_code" in
    200|301|302|304)
      return 0
      ;;
  esac

  return 1
}

main() {
  log "Starting add-in stack"
  ./docker/start-smart.sh docker-compose.addin.yml up -d

  retry "carbone-api container running" 24 5 container_running "$CARBONE_CONTAINER" || fail "carbone-api did not become ready"
  retry "office-addin container running" 24 5 container_running "$OFFICE_ADDIN_CONTAINER" || fail "office-addin did not become ready"

  retry "carbone-api http health" 24 5 http_ok "${CARBONE_HTTP_BASE_URL}/health" || fail "carbone-api health endpoint unavailable"
  retry "carbone-api https health" 24 5 http_ok "${CARBONE_HTTPS_BASE_URL}/health" 1 || fail "carbone-api https health endpoint unavailable"
  retry "office-addin https health" 24 5 http_ok "${ADDIN_BASE_URL}/health" 1 || fail "office-addin health endpoint unavailable"
  retry "office-addin manifest" 24 5 http_ok "${ADDIN_BASE_URL}/manifest-word.xml" 1 || fail "office-addin manifest endpoint unavailable"

  log "Add-in smoke passed"
  log "Stop add-in stack with:"
  log "  ./docker/start-smart.sh docker-compose.addin.yml down"
}

main "$@"
