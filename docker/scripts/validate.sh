#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

cd "$REPO_ROOT"

echo "Validating Docker Compose files..."
for compose_file in "$DOCKER_DIR"/compose/*.yml; do
    bash "$DOCKER_DIR/start-smart.sh" "$(basename "$compose_file")" config --quiet >/dev/null
done

echo "Validating shell scripts..."
while IFS= read -r -d '' script; do
    bash -n "$script"
done < <(find "$DOCKER_DIR" -type f -name '*.sh' -print0)

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
