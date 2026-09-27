#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

cd "$REPO_ROOT"

echo "Validating Docker Compose files..."
for compose_file in "$DOCKER_DIR"/compose/*.yml; do
    file_name="$(basename "$compose_file")"
    if [ "$file_name" = "docker-compose.production.yml" ]; then
        # Production compose requires immutable digests & dedicated release secrets;
        # validated separately by docker/scripts/validate-production-delivery.sh
        continue
    fi
    bash "$DOCKER_DIR/start-smart.sh" "$file_name" config --quiet >/dev/null
done

echo "Validating shell scripts..."
while IFS= read -r -d '' script; do
    bash -n "$script"
done < <(find "$DOCKER_DIR" -type f -name '*.sh' -print0)

echo "Validating Node.js and Python scripts in Docker directory..."
while IFS= read -r -d '' script; do
    node --check "$script" >/dev/null
done < <(find "$DOCKER_DIR" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print0)

while IFS= read -r -d '' script; do
    python3 -m py_compile "$script"
done < <(find "$DOCKER_DIR" -type f -name '*.py' -print0)

# Clean up any pycache created by py_compile during validation
find "$DOCKER_DIR" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

echo "Checking for obsolete artifacts or redundant files..."
for legacy_path in \
    "$DOCKER_DIR/browser-worker" \
    "$DOCKER_DIR/sql" \
    "$DOCKER_DIR/mock-services" \
    "$DOCKER_DIR/scripts/utils" \
    "$DOCKER_DIR/scripts/start.sh" \
    "$DOCKER_DIR/scripts/start-recorder.sh" \
    "$DOCKER_DIR/scripts/entrypoint.sh"; do
    if [ -e "$legacy_path" ]; then
        echo "Obsolete/misplaced path detected: $legacy_path" >&2
        exit 1
    fi
done

if compgen -G "$DOCKER_DIR/scripts/*.ps1" >/dev/null; then
    echo "PowerShell scripts must not reside in docker/scripts (keep them in apps/office-addin/public/)." >&2
    exit 1
fi

if grep -R -n -F --include='*.yml' '${PROJECT_ROOT:-..}' "$DOCKER_DIR/compose"; then
    echo "Relative PROJECT_ROOT fallback is not allowed." >&2
    exit 1
fi

while IFS= read -r tracked_key; do
    if [ -e "$tracked_key" ]; then
        echo "Private Office Add-in key is committed: $tracked_key" >&2
        exit 1
    fi
done < <(git ls-files 'docker/office-addin/certs/*.key' 'docker/office-addin/runtime-certs/*.key')

echo "Docker configuration validation passed."
