#!/bin/bash

# Ops Automation - Smart Docker Compose Launcher
# Resolves the repository root and sets PROJECT_ROOT

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"
ENV_FILE="$DOCKER_DIR/.env"
env_files=("$ENV_FILE")

print_header() {
    echo "==========================================" >&2
    echo "Ops Automation - Docker Compose Launcher" >&2
    echo "==========================================" >&2
    echo "" >&2
}

print_usage() {
    cat <<EOF
Usage:
  ./docker/start-smart.sh [mode|compose-file] [docker-compose args]
  ./docker/start-smart.sh [mode|compose-file] -f <compose-file>... [docker-compose args]

Recommended modes:
  dev             Start the lightweight core development stack (backend core + portal + user-web + carbone-engine)
  dev:browser     Core stack + Browser automation (worker, chrome, templates, semantics)
  dev:workflow    Core stack + Temporal workflow engine & workers
  dev:doc         Core stack + Report service (report)
  dev:xiaozhi     Core stack + Xiaozhi voice channel connector
  full            Start the full stack (all 20 containers)
  infra           Start postgres + redis only
  addin           Start Office Add-in related services
  test            Start the test stack

Compatibility modes:
  base | core | planner | runtime | experience | carbone

Examples:
  ./docker/start-smart.sh dev up -d
  ./docker/start-smart.sh dev:browser up -d
  ./docker/start-smart.sh full up -d
  ./docker/start-smart.sh infra up -d
  ./docker/start-smart.sh addin up -d
  ./docker/start-smart.sh test up --abort-on-container-exit carbone-engine-test
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
        core|planner|runtime|experience|carbone|docker-compose.core.yml|docker-compose.planner.yml|docker-compose.runtime.yml|docker-compose.experience.yml|docker-compose.carbone.yml|compose/docker-compose.core.yml|compose/docker-compose.planner.yml|compose/docker-compose.runtime.yml|compose/docker-compose.experience.yml|compose/docker-compose.carbone.yml)
            echo "[WARN] '$entry' is an internal layered/compatibility entry." >&2
            echo "[WARN] Prefer './docker/start-smart.sh dev ...' unless you are debugging that specific layer." >&2
            if [ "$compose_command" = "up" ]; then
                echo "[WARN] Partial layer startup can create a mixed stack and stale containers." >&2
            fi
            ;;
    esac
}

warn_if_running_stack_mismatch() {
    local target_signature="$1"
    local running_signatures

    running_signatures="$(docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project.config_files"}}' 2>/dev/null \
        | awk -F'\t' '/^(ops-|carbone-engine)/{print $2}' \
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

    echo "[WARN] Existing ops containers were created from a different compose set." >&2
    echo "[WARN] To avoid mixed environments, consider running:" >&2
    echo "       ./docker/start-smart.sh dev down" >&2
    echo "       ./docker/start-smart.sh dev up -d" >&2
}

read_env_var() {
    local var_name="$1"
    local default_val="${2:-}"
    local val=""
    local found=false

    # 1. Process environment has top priority
    if [ -n "${!var_name+x}" ]; then
        val="${!var_name}"
        found=true
    fi

    # 2. Search env_files in reverse order (later files override earlier ones)
    if [ "$found" = false ]; then
        local idx
        for (( idx=${#env_files[@]}-1; idx>=0; idx-- )); do
            local f="${env_files[$idx]}"
            if [ -f "$f" ]; then
                local raw_line
                raw_line=$(grep -E "^[[:space:]]*${var_name}=" "$f" 2>/dev/null | tail -1)
                if [ -n "$raw_line" ]; then
                    val="${raw_line#*=}"
                    val="${val%$'\r'}"
                    val="${val#"${val%%[![:space:]]*}"}"
                    if [[ "$val" =~ ^\"(.*)\"[[:space:]]*(#.*)?$ ]]; then
                        val="${BASH_REMATCH[1]}"
                    elif [[ "$val" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
                        val="${BASH_REMATCH[1]}"
                    else
                        val="${val%%[[:space:]]#*}"
                        val="${val%"${val##*[![:space:]]}"}"
                    fi
                    found=true
                    break
                fi
            fi
        done
    fi

    # 3. Recursive variable interpolation: ${VAR:-default}, ${VAR}, $VAR
    if [[ "$val" =~ ^\$\{([a-zA-Z_][a-zA-Z0-9_]*):-(.*)\}$ ]]; then
        local inner_var="${BASH_REMATCH[1]}"
        local inner_default="${BASH_REMATCH[2]}"
        local inner_val
        inner_val="$(read_env_var "$inner_var" "")"
        if [ -n "$inner_val" ]; then
            val="$inner_val"
        else
            val="$inner_default"
        fi
    elif [[ "$val" =~ ^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}$ ]]; then
        local inner_var="${BASH_REMATCH[1]}"
        val="$(read_env_var "$inner_var" "")"
    elif [[ "$val" =~ ^\$([a-zA-Z_][a-zA-Z0-9_]*)$ ]]; then
        local inner_var="${BASH_REMATCH[1]}"
        val="$(read_env_var "$inner_var" "")"
    fi

    if [ -z "$val" ]; then
        val="$default_val"
    fi

    printf '%s\n' "$val"
}

is_external_bind() {
    local ip="$1"
    ip="${ip#"${ip%%[![:space:]]*}"}"
    ip="${ip%"${ip##*[![:space:]]}"}"
    if [ -z "$ip" ] || [ "$ip" = "0.0.0.0" ] || [ "$ip" = "::" ] || [ "$ip" = "0" ]; then
        return 0
    fi
    if [[ "$ip" =~ ^127\. ]] || [ "$ip" = "localhost" ] || [ "$ip" = "::1" ]; then
        return 1
    fi
    return 0
}

read_network_name() {
    read_env_var "NETWORK_NAME" "ops-network"
}

ensure_env_file() {
    if [ ! -f "$ENV_FILE" ] && [ -f "$DOCKER_DIR/env/.env.example" ]; then
        cp "$DOCKER_DIR/env/.env.example" "$ENV_FILE"
        echo "Created .env from .env.example" >&2
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
    target_profiles=()

    case "$requested" in
        ""|dev)
            target_entry="dev"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            ;;
        dev:browser|browser)
            target_entry="dev:browser"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            target_profiles+=("browser")
            ;;
        dev:workflow|workflow|dev:temporal|temporal)
            target_entry="dev:workflow"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            target_profiles+=("temporal")
            ;;
        dev:doc|doc|document)
            target_entry="dev:doc"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            target_profiles+=("document")
            ;;
        dev:xiaozhi|xiaozhi|connector)
            target_entry="dev:xiaozhi"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            target_profiles+=("xiaozhi")
            ;;
        dev:fe|fe|frontend)
            target_entry="dev:fe"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            ;;
        full|docker-compose.full.yml|compose/docker-compose.full.yml)
            target_entry="full"
            compose_files=("$(resolve_compose_file "compose/docker-compose.base.yml")")
            target_profiles+=("full")
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

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "help" ]; then
    print_usage
    exit 0
fi

is_target_entry() {
    local candidate="${1:-}"
    case "$candidate" in
        ""|dev|dev:*|browser|workflow|temporal|doc|document|xiaozhi|connector|fe|frontend|full|infra|addin|test|base|core|planner|runtime|experience|carbone|*.yml|*.yaml|compose/*|docker-compose.*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

if [ $# -gt 0 ] && is_target_entry "$1" && [[ "$1" != -* ]]; then
    resolve_target "$1"
    shift
else
    resolve_target "dev"
fi

compose_command=""
compose_args=()
extra_compose_flags=()

while [ $# -gt 0 ]; do
    case "$1" in
        -f|--file)
            if [ $# -lt 2 ]; then
                echo "Missing compose file after $1" >&2
                exit 1
            fi
            compose_files+=("$(resolve_compose_file "$2")")
            shift 2
            ;;
        -f=*|--file=*)
            compose_files+=("$(resolve_compose_file "${1#*=}")")
            shift
            ;;
        --env-file)
            if [ $# -lt 2 ]; then
                echo "Missing env file after --env-file" >&2
                exit 1
            fi
            env_files+=("$(canonical_path "$2")")
            shift 2
            ;;
        --env-file=*)
            env_files+=("$(canonical_path "${1#*=}")")
            shift
            ;;
        --profile)
            if [ $# -lt 2 ]; then
                echo "Missing profile name after --profile" >&2
                exit 1
            fi
            target_profiles+=("$2")
            shift 2
            ;;
        --profile=*)
            target_profiles+=("${1#*=}")
            shift
            ;;
        -p|--project-name)
            if [ $# -lt 2 ]; then
                echo "Missing project name after $1" >&2
                exit 1
            fi
            extra_compose_flags+=("$1" "$2")
            shift 2
            ;;
        --project-name=*)
            extra_compose_flags+=("$1")
            shift
            ;;
        --project-directory)
            if [ $# -lt 2 ]; then
                echo "Missing directory after --project-directory" >&2
                exit 1
            fi
            extra_compose_flags+=("$1" "$2")
            shift 2
            ;;
        --project-directory=*)
            extra_compose_flags+=("$1")
            shift
            ;;
        --ansi|--progress|--parallel)
            if [ $# -lt 2 ]; then
                echo "Missing value after $1" >&2
                exit 1
            fi
            extra_compose_flags+=("$1" "$2")
            shift 2
            ;;
        --ansi=*|--progress=*|--parallel=*)
            extra_compose_flags+=("$1")
            shift
            ;;
        -*)
            extra_compose_flags+=("$1")
            shift
            ;;
        *)
            compose_command="$1"
            compose_args=("$@")
            break
            ;;
    esac
done

network_name="$(read_network_name)"

validate_bind_security() {
    local host_bind session_bind ai_bind db_bind novnc_bind cdp_bind codegen_bind vnc_bind
    local is_external=false

    host_bind="$(read_env_var "HOST_BIND_IP" "127.0.0.1")"
    session_bind="$(read_env_var "SESSION_BROKER_BIND_IP" "127.0.0.1")"
    ai_bind="$(read_env_var "AI_ORCHESTRATOR_BIND_IP" "127.0.0.1")"
    db_bind="$(read_env_var "DB_BIND_IP" "127.0.0.1")"
    novnc_bind="$(read_env_var "NOVNC_BIND_IP" "$host_bind")"
    cdp_bind="$(read_env_var "CDP_BIND_IP" "127.0.0.1")"
    codegen_bind="$(read_env_var "CODEGEN_BIND_IP" "127.0.0.1")"
    vnc_bind="$(read_env_var "VNC_BIND_IP" "127.0.0.1")"

    if is_external_bind "$host_bind" || \
       is_external_bind "$session_bind" || \
       is_external_bind "$ai_bind" || \
       is_external_bind "$db_bind" || \
       is_external_bind "$novnc_bind" || \
       is_external_bind "$cdp_bind" || \
       is_external_bind "$codegen_bind" || \
       is_external_bind "$vnc_bind"; then
        is_external=true
    fi

    # Also scan active compose_files for direct external port publications (e.g. 0.0.0.0:, custom IP, or raw port without 127.0.0.1:)
    if [ "$is_external" = false ]; then
        for c_file in "${compose_files[@]}"; do
            if [ -f "$c_file" ]; then
                while IFS= read -r port_line; do
                    if [[ "$port_line" =~ ^[[:space:]]*-[[:space:]]*[\'\"]?([^#\'\"]+)[\'\"]? ]]; then
                        local port_def="${BASH_REMATCH[1]}"
                        if [[ "$port_def" =~ ^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):[0-9]+ ]] || \
                           [[ "$port_def" =~ ^\[?([a-fA-F0-9:]+)\]?:[0-9]+ ]]; then
                            local bound_ip="${BASH_REMATCH[1]}"
                            if is_external_bind "$bound_ip"; then
                                is_external=true
                                break 2
                            fi
                        elif [[ "$port_def" =~ ^[0-9]+:[0-9]+ ]]; then
                            is_external=true
                            break 2
                        fi
                    fi
                    if [[ "$port_line" =~ ^[[:space:]]*host_ip:[[:space:]]*[\'\"]?([^#\'\"]+)[\'\"]? ]]; then
                        local bound_ip="${BASH_REMATCH[1]}"
                        if is_external_bind "$bound_ip"; then
                            is_external=true
                            break 2
                        fi
                    fi
                done < <(grep -E "^[[:space:]]*(-[[:space:]]|host_ip:)" "$c_file" 2>/dev/null || true)

                if [ "$is_external" = false ]; then
                    if grep -E '^[[:space:]]*-[[:space:]]+(published|target):' "$c_file" >/dev/null 2>&1 || \
                       grep -E '^[[:space:]]+published:[[:space:]]*["'\''"]?[0-9]+' "$c_file" >/dev/null 2>&1; then
                        if ! grep -E '^[[:space:]]*host_ip:[[:space:]]*["'\''"]?(127\.|localhost|::1)' "$c_file" >/dev/null 2>&1; then
                            is_external=true
                            break
                        fi
                    fi
                fi
            fi
        done
    fi

    local jwt_secret internal_secret cred_key vnc_pass
    jwt_secret="$(read_env_var "JWT_SECRET" "ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa")"
    internal_secret="$(read_env_var "INTERNAL_API_SHARED_SECRET" "ops_internal_shared_secret_change_me")"
    cred_key="$(read_env_var "USER_CREDENTIAL_ENCRYPTION_KEY" "7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757")"
    vnc_pass="$(read_env_var "VNC_PASSWORD" "")"

    # Also inspect if compose file explicitly sets default secrets in its environment section
    for c_file in "${compose_files[@]}"; do
        if [ -f "$c_file" ]; then
            while IFS= read -r env_line; do
                if [[ "$env_line" =~ ^[[:space:]]*([A-Z_]+):[[:space:]]*[\'\"]?([^#\'\"]+)[\'\"]? ]]; then
                    local ek="${BASH_REMATCH[1]}"
                    local ev="${BASH_REMATCH[2]}"
                    ev="${ev%"${ev##*[![:space:]]}"}"
                    if [[ "$ev" =~ ^\$\{([a-zA-Z_][a-zA-Z0-9_]*):-(.*)\}$ ]]; then
                        local inner_var="${BASH_REMATCH[1]}"
                        local inner_default="${BASH_REMATCH[2]}"
                        ev="$(read_env_var "$inner_var" "$inner_default")"
                    elif [[ "$ev" =~ ^\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}$ ]]; then
                        local inner_var="${BASH_REMATCH[1]}"
                        ev="$(read_env_var "$inner_var" "")"
                    fi
                    case "$ek" in
                        JWT_SECRET) jwt_secret="$ev" ;;
                        INTERNAL_API_SHARED_SECRET) internal_secret="$ev" ;;
                        USER_CREDENTIAL_ENCRYPTION_KEY) cred_key="$ev" ;;
                        VNC_PASSWORD) vnc_pass="$ev" ;;
                    esac
                fi
            done < <(grep -E '^[[:space:]]*(JWT_SECRET|INTERNAL_API_SHARED_SECRET|USER_CREDENTIAL_ENCRYPTION_KEY|VNC_PASSWORD):' "$c_file" 2>/dev/null || true)
        fi
    done

    if [ "$is_external" = true ]; then
        local has_sec_error=false
        local sec_errors=()

        if [ "$jwt_secret" = "ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa" ] || \
           [[ "$jwt_secret" == *"ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa"* ]] || \
           [ -z "$jwt_secret" ]; then
            has_sec_error=true
            sec_errors+=("JWT_SECRET is empty or using known development fallback key")
        fi

        if [ "$internal_secret" = "ops_internal_shared_secret_change_me" ] || \
           [[ "$internal_secret" == *"ops_internal_shared_secret_change_me"* ]] || \
           [ -z "$internal_secret" ]; then
            has_sec_error=true
            sec_errors+=("INTERNAL_API_SHARED_SECRET is empty or using known development fallback key")
        fi

        if [ "$cred_key" = "7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757" ] || \
           [[ "$cred_key" == *"7fd6414a543574effddb645132638c2357ba2f12a57c09216bc45880f5271757"* ]] || \
           [ "$cred_key" = "ops_dev_credential_vault_secret_2026" ] || \
           [[ "$cred_key" == *"ops_dev_credential_vault_secret_2026"* ]] || \
           [ -z "$cred_key" ]; then
            has_sec_error=true
            sec_errors+=("USER_CREDENTIAL_ENCRYPTION_KEY is empty or using known development fallback key")
        fi

        if is_external_bind "$novnc_bind" && [ -z "$vnc_pass" ]; then
            has_sec_error=true
            sec_errors+=("NOVNC_BIND_IP is external ($novnc_bind) but VNC_PASSWORD is empty")
        elif is_external_bind "$vnc_bind" && [ -z "$vnc_pass" ]; then
            has_sec_error=true
            sec_errors+=("VNC_BIND_IP is external ($vnc_bind) but VNC_PASSWORD is empty")
        fi

        if [ "$has_sec_error" = true ]; then
            echo "==========================================================================" >&2
            echo "[SECURITY ERROR] One or more services are bound to an external network interface" >&2
            echo "(HOST_BIND_IP=$host_bind, SESSION_BROKER_BIND_IP=$session_bind, AI_ORCHESTRATOR_BIND_IP=$ai_bind," >&2
            echo " NOVNC_BIND_IP=$novnc_bind, DB_BIND_IP=$db_bind)," >&2
            echo "but default credentials or insecure settings were detected:" >&2
            for err_item in "${sec_errors[@]}"; do
                echo "  - $err_item" >&2
            done
            echo "" >&2
            echo "Exposing services to external networks with default credentials is strictly forbidden." >&2
            echo "Please either:" >&2
            echo "  1) Bind to localhost: HOST_BIND_IP=127.0.0.1 (default for local isolation)" >&2
            echo "  2) Configure secure, non-default secrets and VNC_PASSWORD in .env" >&2
            echo "==========================================================================" >&2
            exit 1
        fi
    fi

    # 3. Comprehensive verification against final rendered Compose configuration
    if command -v python3 >/dev/null 2>&1; then
        local rendered_json
        if ! rendered_json="$(docker compose "${env_file_flags[@]}" ${extra_compose_flags[@]+"${extra_compose_flags[@]}"} "${compose_flags[@]}" config --format json 2>&1)"; then
            echo "==========================================================================" >&2
            echo "[SECURITY ERROR] Failed to render Docker Compose configuration:" >&2
            echo "$rendered_json" >&2
            echo "==========================================================================" >&2
            exit 1
        fi

        local has_no_deps=false
        for arg in "${compose_args[@]}"; do
            if [ "$arg" = "--no-deps" ]; then
                has_no_deps=true
                break
            fi
        done

        local val_args=(
            "--json-input" "-"
            "--global-jwt" "$jwt_secret"
            "--global-internal" "$internal_secret"
            "--global-cred" "$cred_key"
            "--global-vnc" "$vnc_pass"
        )
        if [ "$has_no_deps" = true ]; then
            val_args+=("--no-deps")
        fi
        if [ ${#specified_services[@]} -gt 0 ]; then
            val_args+=("--specified-services" "${specified_services[@]}")
        fi

        printf '%s\n' "$rendered_json" | python3 "$SCRIPT_DIR/validate-bind-security.py" "${val_args[@]}" || exit 1
    fi
}

cd "$DOCKER_DIR"
env_file_flags=()
for ef in "${env_files[@]}"; do
    env_file_flags+=("--env-file" "$ef")
done

compose_flags=()
for profile in ${target_profiles[@]+"${target_profiles[@]}"}; do
    compose_flags+=("--profile" "$profile")
done
for compose_path in "${compose_files[@]}"; do
    compose_flags+=("-f" "$compose_path")
done

specified_services=()
skip_next=false
for arg in "${compose_args[@]:1}"; do
    if $skip_next; then
        skip_next=false
        continue
    fi
    case "$arg" in
        --wait-timeout|-t|--timeout|--scale|--pull|--exit-code-from)
            skip_next=true
            continue
            ;;
        --wait-timeout=*|--timeout=*|--scale=*|--pull=*|--exit-code-from=*)
            continue
            ;;
        -*)
            continue
            ;;
        *)
            specified_services+=("$arg")
            ;;
    esac
done

echo "Environment configured:" >&2
echo "  PROJECT_ROOT: $PROJECT_ROOT" >&2
echo "  HOST_BIND_IP: $(read_env_var "HOST_BIND_IP" "127.0.0.1")" >&2
echo "" >&2

maybe_warn_legacy_entry "$target_entry" "$compose_command"
ensure_addin_certs

case "$compose_command" in
    up|run|create)
        validate_bind_security
        if ! docker network inspect "$network_name" >/dev/null 2>&1; then
            echo "Creating docker network: $network_name" >&2
            docker network create "$network_name" >/dev/null
        fi
        sandbox_network_name="${SANDBOX_NETWORK_NAME:-ops-sandbox-network}"
        if ! docker network inspect "$sandbox_network_name" >/dev/null 2>&1; then
            echo "Creating docker network: $sandbox_network_name" >&2
            docker network create "$sandbox_network_name" >/dev/null
        fi
        ;;
esac

if [ "$compose_command" = "up" ]; then
    target_signature="$(IFS=,; printf '%s' "${compose_files[*]}")"
    warn_if_running_stack_mismatch "$target_signature"
fi

adjust_build_flag() {
    if [ "$compose_command" != "up" ]; then
        return 0
    fi

    for arg in "${compose_args[@]}"; do
        if [ "$arg" = "--build" ] || [ "$arg" = "--no-build" ]; then
            return 0
        fi
    done

    if [ ${#specified_services[@]} -eq 0 ]; then
        for compose_path in "${compose_files[@]}"; do
            if grep -q '^[[:space:]]\+build:' "$compose_path"; then
                compose_args=("$compose_command" "--build" "${compose_args[@]:1}")
                return 0
            fi
        done
    else
        local should_build=false
        for svc in "${specified_services[@]}"; do
            for compose_path in "${compose_files[@]}"; do
                if awk -v s="$svc:" '$0 ~ "^  " s {found=1; next} found && /^  [a-zA-Z0-9_-]+:/ {found=0} found && /^[[:space:]]+build:/ {found_build=1; exit} END {exit (found_build ? 0 : 1)}' "$compose_path"; then
                    should_build=true
                    break 2
                fi
            done
        done
        if $should_build; then
            compose_args=("$compose_command" "--build" "${compose_args[@]:1}")
        fi
    fi
}
adjust_build_flag

echo "Using env files: ${env_files[*]}" >&2
printf 'Running: docker compose' >&2
for ef_flag in "${env_file_flags[@]}"; do
    printf ' %q' "$ef_flag" >&2
done
for extra_flag in ${extra_compose_flags[@]+"${extra_compose_flags[@]}"}; do
    printf ' %q' "$extra_flag" >&2
done
for profile in ${target_profiles[@]+"${target_profiles[@]}"}; do
    printf ' --profile %q' "$profile" >&2
done
for compose_path in "${compose_files[@]}"; do
    printf ' -f %q' "$compose_path" >&2
done
for arg in "${compose_args[@]}"; do
    printf ' %q' "$arg" >&2
done
printf '\n\n' >&2

docker compose "${env_file_flags[@]}" ${extra_compose_flags[@]+"${extra_compose_flags[@]}"} "${compose_flags[@]}" "${compose_args[@]}"
