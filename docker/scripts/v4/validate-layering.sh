#!/bin/bash

# Validate V4 docker compose layering against the documented service groups.
# Usage:
#   ./docker/validate-layering.sh

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
  '
}

assert_services_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"

  if [ "$actual" != "$expected" ]; then
    echo "[FAIL] $label"
    echo "Expected:"
    printf '%s\n' "$expected"
    echo ""
    echo "Actual:"
    printf '%s\n' "$actual"
    exit 1
  fi

  echo "[OK] $label"
}

core_expected=$(cat <<'EOF'
control-plane
platform
postgres
redis
session-broker
EOF
)

planner_expected=$(cat <<'EOF'
ai-orchestrator
EOF
)

runtime_expected=$(cat <<'EOF'
browser-chrome
browser-worker
carbone-engine
sandbox-worker
temporal
temporal-ui
EOF
)

experience_expected=$(cat <<'EOF'
portal
user-web
EOF
)

full_expected=$(cat <<'EOF'
ai-orchestrator
browser-chrome
browser-worker
carbone-engine
control-plane
platform
portal
postgres
redis
sandbox-worker
session-broker
temporal
temporal-ui
user-web
EOF
)


echo "Validating V4 compose layers from $REPO_ROOT"
echo ""

core_actual="$(run_services compose/docker-compose.core.yml | sort)"
planner_actual="$(run_services compose/docker-compose.planner.yml | sort)"
runtime_actual="$(run_services compose/docker-compose.runtime.yml | sort)"
experience_actual="$(run_services compose/docker-compose.experience.yml | sort)"
full_actual="$(run_services compose/docker-compose.core.yml -f compose/docker-compose.planner.yml -f compose/docker-compose.runtime.yml -f compose/docker-compose.experience.yml | sort)"

assert_services_equal "core layer" "$core_actual" "$core_expected"
assert_services_equal "planner layer" "$planner_actual" "$planner_expected"
assert_services_equal "runtime layer" "$runtime_actual" "$runtime_expected"
assert_services_equal "experience layer" "$experience_actual" "$experience_expected"
assert_services_equal "combined layers" "$full_actual" "$full_expected"

echo ""
echo "V4 docker compose layering validation passed."
