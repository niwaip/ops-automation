#!/bin/bash

# Audit how the legacy full compose entry aligns with the V4 layered service set.
# Fails if any V4-layered service is missing from the canonical development compose.

set -euo pipefail

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [ "$(pwd)" != "$REPO_ROOT" ]; then
  echo "Please run this script from the repository root:"
  echo "  $REPO_ROOT"
  exit 1
fi

run_services() {
  local compose_file="$1"
  shift
  ./docker/start-smart.sh "$compose_file" "$@" config --services | awk '
    /^==========================================$/ { next }
    /^Ops Automation - Docker Compose Launcher$/ { next }
    /^Environment configured:$/ { next }
    /^  PROJECT_ROOT:/ { next }
    /^Using env file:/ { next }
    /^Running: docker compose / { next }
    /^\[WARN\]/ { next }
    NF == 0 { next }
    { print }
  ' | sort -u
}

subtract_lines() {
  local left="$1"
  local right="$2"
  comm -23 <(printf '%s\n' "$left") <(printf '%s\n' "$right")
}

layered_services="$(run_services compose/docker-compose.core.yml -f compose/docker-compose.planner.yml -f compose/docker-compose.runtime.yml -f compose/docker-compose.experience.yml)"
base_services="$(run_services compose/docker-compose.base.yml)"

missing_from_base="$(subtract_lines "$layered_services" "$base_services")"
additional_in_base="$(subtract_lines "$base_services" "$layered_services")"

echo "Auditing docker-compose.base.yml against V4 layered composition"
echo ""

if [ -n "$missing_from_base" ]; then
  echo "[FAIL] docker-compose.base.yml is missing V4 services:"
  printf '%s\n' "$missing_from_base"
  exit 1
fi

echo "[OK] docker-compose.base.yml contains every V4 layered service"

if [ -n "$additional_in_base" ]; then
  echo ""
  echo "[INFO] Additional services present in docker-compose.base.yml:"
  printf '%s\n' "$additional_in_base"
  echo ""
  echo "These services are not part of the current V4 layered set, but remain available in the canonical development stack."
fi

echo ""
echo "V4 full alignment audit passed."
