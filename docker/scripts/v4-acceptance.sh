#!/bin/bash

# Unified V4 Docker acceptance entrypoint.
# Runs layering audits first, then smoke tests from core to full.

set -euo pipefail

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

if [ "$(pwd)" != "$REPO_ROOT" ]; then
  echo "Please run this script from the repository root:"
  echo "  $REPO_ROOT"
  exit 1
fi

log() {
  echo "[v4-acceptance] $*"
}

run_step() {
  local label="$1"
  shift

  log "Running ${label}"
  "$@"
  log "Passed ${label}"
}

main() {
  run_step "validate-layering" bash ./docker/validate-layering.sh
  run_step "validate-full-alignment" bash ./docker/validate-full-alignment.sh
  run_step "core-smoke" bash ./docker/core-smoke.sh
  run_step "planner-smoke" bash ./docker/planner-smoke.sh
  run_step "runtime-smoke" bash ./docker/runtime-smoke.sh
  run_step "full-smoke" bash ./docker/full-smoke.sh

  log "All V4 acceptance checks passed"
  log "Stop stacks with:"
  log "  ./docker/start-smart.sh docker-compose.full.yml down"
}

main "$@"
