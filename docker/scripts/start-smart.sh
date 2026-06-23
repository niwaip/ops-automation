#!/bin/bash

# Ops Automation - Smart Docker Compose Launcher
# Automatically detects worktree context and sets PROJECT_ROOT

set -e

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

current_dir="$(pwd)"

echo "=========================================="
echo "Ops Automation - Docker Compose Launcher"
echo "=========================================="
echo ""

# Check if we're in .vibe-kanban/worktrees directory
if echo "$current_dir" | grep -q ".vibe-kanban/worktrees"; then
    worktree_id=$(echo "$current_dir" | sed 's/.*\.vibe-kanban\/worktrees\/\([a-z0-9-]*\)-.*/\1/')
    echo "Detected Vibe Kanban worktree: $worktree_id"
    project_root="$current_dir"
else
    project_root="$REPO_ROOT"
fi

# Create .env file if not exists
if [ ! -f "$DOCKER_DIR/.env" ]; then
    if [ -f "$DOCKER_DIR/env/.env.example" ]; then
        cp "$DOCKER_DIR/env/.env.example" "$DOCKER_DIR/.env"
        echo "Created .env from .env.example"
    fi
fi

network_name="ops-network"
if [ -f "$DOCKER_DIR/.env" ]; then
    env_network_name=$(grep -E '^NETWORK_NAME=' "$DOCKER_DIR/.env" 2>/dev/null | tail -1 | cut -d'=' -f2-)
    env_network_name="${env_network_name%$'\r'}"
    env_network_name="${env_network_name%\"}"
    env_network_name="${env_network_name#\"}"
    if [ -n "$env_network_name" ]; then
        network_name="$env_network_name"
    fi
fi

# Export PROJECT_ROOT for docker compose
export PROJECT_ROOT="$project_root"

echo "Environment configured:"
echo "  PROJECT_ROOT: $PROJECT_ROOT"
echo ""

# Parse arguments
compose_file="${1:-docker-compose.base.yml}"
shift

if [ ! -e "$DOCKER_DIR/$compose_file" ] && [ -e "$DOCKER_DIR/compose/$compose_file" ]; then
    compose_file="compose/$compose_file"
fi

compose_command="${1:-}"
if [ "$compose_command" != "down" ] && [ "$compose_command" != "rm" ]; then
    if ! docker network inspect "$network_name" >/dev/null 2>&1; then
        echo "Creating docker network: $network_name"
        docker network create "$network_name" >/dev/null
    fi
fi

compose_path="$DOCKER_DIR/$compose_file"
compose_args=("$@")
if [ "$compose_command" = "up" ] && [ -f "$compose_path" ]; then
    needs_build_flag=true
    for arg in "${compose_args[@]}"; do
        if [ "$arg" = "--build" ] || [ "$arg" = "--no-build" ]; then
            needs_build_flag=false
            break
        fi
    done

    if $needs_build_flag && grep -q '^[[:space:]]\+build:' "$compose_path"; then
        compose_args=("$compose_command" "--build" "${compose_args[@]:1}")
    fi
fi

# Run docker compose
cd "$DOCKER_DIR"
echo "Using env file: $DOCKER_DIR/.env"
printf 'Running: docker compose --env-file %q -f %q' "$DOCKER_DIR/.env" "$compose_file"
for arg in "${compose_args[@]}"; do
    printf ' %q' "$arg"
done
printf '\n'
echo ""

docker compose --env-file "$DOCKER_DIR/.env" -f "$compose_file" "${compose_args[@]}"
