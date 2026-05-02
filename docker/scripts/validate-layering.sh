#!/bin/bash

# Validate V4 docker compose layering against the documented service groups.
# Usage:
#   ./docker/validate-layering.sh

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

run_services() {
  local compose_file="$1"
  shift
  ./docker/start-smart.sh "$compose_file" "$@" config --services | awk '
    /^==========================================$/ { next }
    /^Ops Automation - Docker Compose Launcher$/ { next }
    /^Environment configured:$/ { next }
    /^  PROJECT_ROOT:/ { next }
    /^Running: docker compose -f / { next }
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
auth
control-plane
postgres
redis
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
session-broker
temporal
temporal-sandbox-agent
temporal-ui
EOF
)

experience_expected=$(cat <<'EOF'
portal
EOF
)

full_expected=$(cat <<'EOF'
ai-orchestrator
auth
browser-chrome
browser-worker
carbone-engine
control-plane
portal
postgres
redis
session-broker
temporal
temporal-sandbox-agent
temporal-ui
EOF
)

echo "Validating V4 compose layers from $REPO_ROOT"
echo ""

core_actual="$(run_services docker-compose.core.yml | sort)"
planner_actual="$(run_services docker-compose.planner.yml | sort)"
runtime_actual="$(run_services docker-compose.runtime.yml | sort)"
experience_actual="$(run_services docker-compose.experience.yml | sort)"
full_actual="$(run_services docker-compose.core.yml -f docker-compose.planner.yml -f docker-compose.runtime.yml -f docker-compose.experience.yml | sort)"

assert_services_equal "core layer" "$core_actual" "$core_expected"
assert_services_equal "planner layer" "$planner_actual" "$planner_expected"
assert_services_equal "runtime layer" "$runtime_actual" "$runtime_expected"
assert_services_equal "experience layer" "$experience_actual" "$experience_expected"
assert_services_equal "combined layers" "$full_actual" "$full_expected"

echo ""
echo "V4 docker compose layering validation passed."
