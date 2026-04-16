#!/bin/bash

# Ops Automation - Smart Docker Compose Launcher
# Automatically detects worktree context and sets PROJECT_ROOT

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR"

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
    project_root="$(dirname "$DOCKER_DIR")"
fi

# Create .env file if not exists
if [ ! -f "$DOCKER_DIR/.env" ]; then
    if [ -f "$DOCKER_DIR/.env.example" ]; then
        cp "$DOCKER_DIR/.env.example" "$DOCKER_DIR/.env"
        echo "Created .env from .env.example"
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

# Run docker compose
cd "$DOCKER_DIR"
echo "Running: docker compose -f $compose_file $*"
echo ""

docker compose -f "$compose_file" "$@"
