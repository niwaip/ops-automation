#!/bin/bash

# Ops Automation - Smart Docker Compose Launcher
# Resolves the repository root and sets PROJECT_ROOT

set -euo pipefail

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"
ENV_FILE="$DOCKER_DIR/.env"

print_header() {
    echo "=========================================="
    echo "Ops Automation - Docker Compose Launcher"
    echo "=========================================="
    echo ""
}

print_usage() {
    cat <<EOF
Usage:
  ./docker/start-smart.sh [mode|compose-file] [docker-compose args]
  ./docker/start-smart.sh [mode|compose-file] -f <compose-file>... [docker-compose args]

Recommended modes:
  dev      Start the standard day-to-day development stack (docker-compose.base.yml)
  infra    Start postgres + redis only
  addin    Start Office Add-in related services
  test     Start the test stack

Compatibility modes:
  base | full | core | planner | runtime | experience | carbone

Examples:
  ./docker/start-smart.sh dev up -d
  ./docker/start-smart.sh infra up -d
  ./docker/start-smart.sh addin up -d
  ./docker/start-smart.sh test up --abort-on-container-exit carbone-engine-test
  ./docker/start-smart.sh docker-compose.base.yml up -d
EOF
}

canonical_path() {
    python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"
}

resolve_compose_file() {
    local requested="$1"

    if [[ "$requested" = /* ]] && [ -e "$requested" ]; then
        canonical_path "$requested"
        return 0
    fi

    if [ -e "$DOCKER_DIR/$requested" ]; then
        canonical_path "$DOCKER_DIR/$requested"
        return 0
    fi

    if [ -e "$DOCKER_DIR/compose/$requested" ]; then
        canonical_path "$DOCKER_DIR/compose/$requested"
        return 0
    fi

    if [ -e "$REPO_ROOT/$requested" ]; then
        canonical_path "$REPO_ROOT/$requested"
        return 0
    fi

    echo "Compose file not found: $requested" >&2
    exit 1
}

maybe_warn_legacy_entry() {
    local entry="$1"
    local compose_command="$2"

    case "$entry" in
        full|docker-compose.full.yml|compose/docker-compose.full.yml)
            echo "[WARN] 'full' is a legacy compatibility entry. Prefer './docker/start-smart.sh dev ...'."
            ;;
        core|planner|runtime|experience|carbone|docker-compose.core.yml|docker-compose.planner.yml|docker-compose.runtime.yml|docker-compose.experience.yml|docker-compose.carbone.yml|compose/docker-compose.core.yml|compose/docker-compose.planner.yml|compose/docker-compose.runtime.yml|compose/docker-compose.experience.yml|compose/docker-compose.carbone.yml)
            echo "[WARN] '$entry' is an internal layered/compatibility entry."
            echo "[WARN] Prefer './docker/start-smart.sh dev ...' unless you are debugging that specific layer."
            if [ "$compose_command" = "up" ]; then
                echo "[WARN] Partial layer startup can create a mixed stack and stale containers."
            fi
            ;;
    esac
}

warn_if_running_stack_mismatch() {
    local target_signature="$1"
    local running_signatures

    running_signatures="$(docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project.config_files"}}' 2>/dev/null \
        | awk -F'\t' '/^ops-/{print $2}' \
        | sed '/^$/d' \
        | sort -u || true)"

    if [ -z "$running_signatures" ]; then
        return 0
    fi

    if printf '%s\n' "$running_signatures" | grep -Fxq "$target_signature"; then
        if [ "$(printf '%s\n' "$running_signatures" | wc -l | tr -d ' ')" -eq 1 ]; then
            return 0
        fi
    fi

    echo "[WARN] Existing ops containers were created from a different compose set."
    echo "[WARN] To avoid mixed environments, consider running:"
    echo "       ./docker/start-smart.sh dev down"
    echo "       ./docker/start-smart.sh dev up -d"
}

read_network_name() {
    local network_name="ops-network"

    if [ -f "$ENV_FILE" ]; then
        local env_network_name
        env_network_name=$(grep -E '^NETWORK_NAME=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d'=' -f2-)
        env_network_name="${env_network_name%$'\r'}"
        env_network_name="${env_network_name%\"}"
        env_network_name="${env_network_name#\"}"
        if [ -n "$env_network_name" ]; then
            network_name="$env_network_name"
        fi
    fi

    printf '%s\n' "$network_name"
}

ensure_env_file() {
    if [ ! -f "$ENV_FILE" ] && [ -f "$DOCKER_DIR/env/.env.example" ]; then
        cp "$DOCKER_DIR/env/.env.example" "$ENV_FILE"
        echo "Created .env from .env.example"
    fi
}

ensure_addin_certs() {
    local compose_path
    local has_addin_compose=false

    for compose_path in "${compose_files[@]}"; do
        if [ "$(basename "$compose_path")" = "docker-compose.addin.yml" ]; then
            has_addin_compose=true
            break
        fi
    done

    if [ "$has_addin_compose" != true ]; then
        return 0
    fi

    case "$compose_command" in
        up|run|create)
            if [ ! -s "$DOCKER_DIR/office-addin/runtime-certs/server.crt" ] || [ ! -s "$DOCKER_DIR/office-addin/runtime-certs/server.key" ]; then
                echo "Office Add-in TLS certificate is missing." >&2
                echo "Generate it first: ./docker/office-addin/generate-certs.sh" >&2
                exit 1
            fi
            ;;
    esac
}

resolve_target() {
    local requested="${1:-dev}"

    target_entry="$requested"
    compose_files=()

    case "$requested" in
        ""|dev)
            target_entry="dev"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            ;;
        infra)
            compose_files=("$(resolve_compose_file "compose/docker-compose.yml")")
            ;;
        addin)
            compose_files=("$(resolve_compose_file "compose/docker-compose.addin.yml")")
            ;;
        test)
            compose_files=("$(resolve_compose_file "compose/docker-compose.test.yml")")
            ;;
        base)
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            ;;
        full|docker-compose.full.yml|compose/docker-compose.full.yml)
            target_entry="full"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            ;;
        core)
            compose_files=("$(resolve_compose_file "compose/docker-compose.core.yml")")
            ;;
        planner)
            compose_files=("$(resolve_compose_file "compose/docker-compose.planner.yml")")
            ;;
        runtime)
            compose_files=("$(resolve_compose_file "compose/docker-compose.runtime.yml")")
            ;;
        experience)
            compose_files=("$(resolve_compose_file "compose/docker-compose.experience.yml")")
            ;;
        carbone)
            compose_files=("$(resolve_compose_file "compose/docker-compose.carbone.yml")")
            ;;
        *)
            compose_files=("$(resolve_compose_file "$requested")")
            ;;
    esac
}

print_header

# The resolved script path already points at the active repository checkout.
# Using the caller's current directory here would make mounts depend on where
# the command happened to be invoked from.
project_root="$REPO_ROOT"

ensure_env_file

export PROJECT_ROOT="$project_root"

echo "Environment configured:"
echo "  PROJECT_ROOT: $PROJECT_ROOT"
echo ""

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "help" ]; then
    print_usage
    exit 0
fi

resolve_target "${1:-dev}"
if [ $# -gt 0 ]; then
    shift
fi

while [ $# -gt 0 ] && [ "${1:-}" = "-f" ]; do
    if [ $# -lt 2 ]; then
        echo "Missing compose file after -f" >&2
        exit 1
    fi
    compose_files+=("$(resolve_compose_file "$2")")
    shift 2
done

compose_command="${1:-}"
compose_args=("$@")
network_name="$(read_network_name)"

maybe_warn_legacy_entry "$target_entry" "$compose_command"
ensure_addin_certs

case "$compose_command" in
    up|run|create)
        if ! docker network inspect "$network_name" >/dev/null 2>&1; then
            echo "Creating docker network: $network_name"
            docker network create "$network_name" >/dev/null
        fi
        ;;
esac

if [ "$compose_command" = "up" ]; then
    target_signature="$(IFS=,; printf '%s' "${compose_files[*]}")"
    warn_if_running_stack_mismatch "$target_signature"
fi

if [ "$compose_command" = "up" ]; then
    needs_build_flag=true
    for arg in "${compose_args[@]}"; do
        if [ "$arg" = "--build" ] || [ "$arg" = "--no-build" ]; then
            needs_build_flag=false
            break
        fi
    done

    if $needs_build_flag; then
        for compose_path in "${compose_files[@]}"; do
            if grep -q '^[[:space:]]\+build:' "$compose_path"; then
                compose_args=("$compose_command" "--build" "${compose_args[@]:1}")
                break
            fi
        done
    fi
fi

cd "$DOCKER_DIR"
echo "Using env file: $ENV_FILE"
printf 'Running: docker compose --env-file %q' "$ENV_FILE"
for compose_path in "${compose_files[@]}"; do
    printf ' -f %q' "$compose_path"
done
for arg in "${compose_args[@]}"; do
    printf ' %q' "$arg"
done
printf '\n'
echo ""

compose_flags=()
for compose_path in "${compose_files[@]}"; do
    compose_flags+=("-f" "$compose_path")
done

docker compose --env-file "$ENV_FILE" "${compose_flags[@]}" "${compose_args[@]}"
