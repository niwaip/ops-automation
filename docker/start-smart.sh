#!/bin/bash

# ============================================================
# Ops Automation - Smart Docker Compose Launcher
# ============================================================
# Automatically detects worktree context and sets PROJECT_ROOT
# Usage: ./docker/start-smart.sh [compose-file] [options]
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR"

# Detect if we're in a vibe-kanban worktree
detect_worktree() {
    local current_dir="$(pwd)"

    # Check if we're in .vibe-kanban/worktrees directory
    if [[ "$current_dir" =~ \.vibe-kanban/worktrees/ ]]; then
        # Extract worktree ID from path
        local worktree_id=$(echo "$current_dir" | sed -n 's/.*\.vibe-kanban\/worktrees\/([a-z0-9-]+)-.*/\1/p')
        echo "Detected Vibe Kanban worktree: $worktree_id"

        # PROJECT_ROOT should point to the worktree directory
        # For worktree, services are relative to current directory
        local project_root="$current_dir"
        echo "PROJECT_ROOT=$project_root"
        return 0
    fi

    # Normal development - use parent of docker directory
    local project_root="$(dirname "$DOCKER_DIR")"
    echo "PROJECT_ROOT=$project_root"
    return 0
}

# Set environment variables
setup_env() {
    local project_root="$1"

    # Create .env file if not exists
    if [[ ! -f "$DOCKER_DIR/.env" ]]; then
        if [[ -f "$DOCKER_DIR/.env.example" ]]; then
            cp "$DOCKER_DIR/.env.example" "$DOCKER_DIR/.env"
            echo "Created .env from .env.example"
        fi
    fi

    # Export PROJECT_ROOT for docker compose
    export PROJECT_ROOT="$project_root"

    echo "Environment configured:"
    echo "  PROJECT_ROOT: $PROJECT_ROOT"
}

# Main execution
main() {
    local compose_file="${1:-docker-compose.base.yml}"
    local compose_options="${@:2}"

    echo "=========================================="
    echo "Ops Automation - Docker Compose Launcher"
    echo "=========================================="
    echo ""

    # Detect worktree and get project root
    local project_root
    project_root=$(detect_worktree | grep PROJECT_ROOT | cut -d= -f2)

    # Setup environment
    setup_env "$project_root"

    # Run docker compose
    cd "$DOCKER_DIR"
    echo ""
    echo "Running: docker compose -f $compose_file $compose_options"
    echo ""

    docker compose -f "$compose_file" $compose_options
}

main "$@"