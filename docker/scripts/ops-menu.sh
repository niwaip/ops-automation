#!/bin/bash
set -euo pipefail

# ==============================================================================
# Ops Automation CLI & Management Menu
# ==============================================================================
# Supports both:
#   1. Non-interactive CLI commands:
#      ops dev | ops full | ops stop | ops status | ops smoke | ops db check ...
#   2. Interactive menu:
#      ops (or bash ./docker/scripts/ops-menu.sh)
# ==============================================================================

# Resolve symlinks so the script works correctly even when invoked via symlink
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
DOCKER_DIR="$(cd -P "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -P "$DOCKER_DIR/.." >/dev/null 2>&1 && pwd)"

# Ensure all operations run from the repository root
cd "$REPO_ROOT"

SMART_SCRIPT="$REPO_ROOT/docker/start-smart.sh"
APPLY_LATEST_DB_SCHEMA_SCRIPT="$SCRIPT_DIR/apply-latest-db-schema.sh"
EXPORT_INITIAL_DATA_SCRIPT="$SCRIPT_DIR/export-initial-data.sh"
SMOKE_TEST_SCRIPT="$SCRIPT_DIR/smoke/core-smoke.sh"

DOCKER_ENV_FILE="$DOCKER_DIR/.env"
DOCKER_ENV_TEMPLATE="$DOCKER_DIR/env/.env.example"
PLATFORM_SCHEMA="$REPO_ROOT/apps/backend/platform/prisma/schema.prisma"
BROWSER_TEMPLATE_REPAIR_SQL="$REPO_ROOT/apps/backend/capabilities/browser-domain/templates/prisma/manual-sql/20260608_rebuild_templates_current_schema.sql"
INITIAL_DATA_EXPORT_PATH_DEFAULT="$REPO_ROOT/docker/sql/exports/platform-initial-data-latest.sql"

DEFAULT_ADMIN_PASSWORD="${DEFAULT_ADMIN_PASSWORD:-admin123}"
DEFAULT_ADMIN_USERNAME="${DEFAULT_ADMIN_USERNAME:-admin}"
DEFAULT_ADMIN_EMAIL="${DEFAULT_ADMIN_EMAIL:-admin@example.com}"

# Logging helpers
log() {
  printf '[ops] %s\n' "$1"
}

log_ok() {
  printf '  \033[32m[OK]\033[0m %s\n' "$1"
}

log_warn() {
  printf '  \033[33m[WARN]\033[0m %s\n' "$1"
}

log_err() {
  printf '  \033[31m[ERR]\033[0m %s\n' "$1"
}

log_info() {
  printf '  \033[36m[INFO]\033[0m %s\n' "$1"
}

prompt_enter() {
  read -r -p "Press Enter to continue..." _
}

confirm() {
  local message="$1"
  local answer
  read -r -p "$message [y/N]: " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

sql_escape_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

run_smart() {
  bash "$SMART_SCRIPT" "$@"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

get_db_params() {
  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ops-postgres}"
  POSTGRES_USER="${POSTGRES_USER:-ops}"
  POSTGRES_DB="${POSTGRES_DB:-ops}"

  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local pg_user pg_db
    pg_user="$(grep -E '^POSTGRES_USER=' "$DOCKER_ENV_FILE" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
    pg_db="$(grep -E '^POSTGRES_DB=' "$DOCKER_ENV_FILE" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
    pg_user="${pg_user%$'\r'}"
    pg_db="${pg_db%$'\r'}"
    pg_user="${pg_user%\"}"
    pg_user="${pg_user#\"}"
    pg_db="${pg_db%\"}"
    pg_db="${pg_db#\"}"
    [[ -n "$pg_user" ]] && POSTGRES_USER="$pg_user"
    [[ -n "$pg_db" ]] && POSTGRES_DB="$pg_db"
  fi
}

psql_query() {
  local query="$1"
  get_db_params
  docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -tAc "$query" 2>/dev/null || echo ""
}

table_exists() {
  local table="$1"
  local count
  count="$(psql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'")"
  [[ "${count:-0}" -gt 0 ]]
}

column_exists() {
  local table="$1"
  local column="$2"
  local count
  count="$(psql_query "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'")"
  [[ "${count:-0}" -gt 0 ]]
}

run_psql_stdin() {
  get_db_params
  docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"
}

apply_sql_file() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    log_warn "Skip missing SQL file: $file_path"
    return 0
  fi
  log "Applying SQL file: $file_path"
  run_psql_stdin < "$file_path"
}

wait_for_postgres() {
  get_db_params
  log "Waiting for postgres to be ready..."
  local retries=0
  until docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [[ $retries -ge 30 ]]; then
      log_err "Postgres did not become ready in time."
      return 1
    fi
    sleep 2
  done
}

# ==============================================================================
# Service Lifecycle Operations
# ==============================================================================

start_stack() {
  local profile="${1:-dev}"
  log "Starting stack with preset: $profile ..."
  run_smart "$profile" up -d
  log_ok "Stack '$profile' started."
}

stop_services() {
  log "Gracefully stopping all services and profiles..."
  run_smart full down
  log_ok "All services stopped."
}

restart_core_services() {
  log "Restarting core services..."
  run_smart dev restart platform session-broker control-plane ai-orchestrator
  log_ok "Core services restarted."
}

run_core_smoke() {
  log "Running fast core smoke test..."
  if [[ -f "$SMOKE_TEST_SCRIPT" ]]; then
    bash "$SMOKE_TEST_SCRIPT"
  else
    log_err "Smoke test script not found: $SMOKE_TEST_SCRIPT"
    return 1
  fi
}

# ==============================================================================
# Status & Diagnostics
# ==============================================================================

probe_http_service() {
  local service_name="$1"
  local url="$2"
  local expected_sub="${3:-}"

  local response
  response="$(no_proxy="*" curl -s -m 2 "$url" 2>/dev/null || echo "")"
  if [[ -n "$response" ]]; then
    if [[ -n "$expected_sub" ]]; then
      if [[ "$response" == *"$expected_sub"* ]]; then
        printf '  %-20s \033[32m[HEALTHY]\033[0m %s\n' "$service_name" "$url"
      else
        printf '  %-20s \033[33m[UP - UNEXPECTED]\033[0m %s\n' "$service_name" "$url"
      fi
    else
      printf '  %-20s \033[32m[RESPONSIVE]\033[0m %s\n' "$service_name" "$url"
    fi
  else
    printf '  %-20s \033[31m[UNREACHABLE]\033[0m %s\n' "$service_name" "$url"
  fi
}

show_service_status() {
  local host_ip="localhost"
  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    host_ip="$(grep -E '^HOST_IP=' "$DOCKER_ENV_FILE" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
    host_ip="${host_ip:-localhost}"
  fi

  printf '\n\033[1m=== Running Containers ===\033[0m\n'
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E '^ops-|^NAMES' || true

  printf '\n\033[1m=== HTTP Health Probes ===\033[0m\n'
  probe_http_service "Control Plane" "http://127.0.0.1:3003/api/health" "healthy"
  probe_http_service "Platform" "http://127.0.0.1:3001/auth/login" ""
  probe_http_service "Session Broker" "http://127.0.0.1:3002/api" ""
  probe_http_service "AI Orchestrator" "http://127.0.0.1:3007/api" ""

  printf '\n\033[1m=== Common Endpoints ===\033[0m\n'
  printf '  - Platform API:      http://%s:3001\n' "$host_ip"
  printf '  - Session Broker:    http://%s:3002\n' "$host_ip"
  printf '  - Control Plane:     http://%s:3003\n' "$host_ip"
  printf '  - AI Orchestrator:   http://%s:3007\n' "$host_ip"
  printf '  - Carbone Engine:    http://%s:3030\n' "$host_ip"
  printf '  - Browser noVNC:     http://%s:6080/vnc.html\n' "$host_ip"
  printf '  - Temporal UI:       http://%s:8088\n' "$host_ip"
  printf '  - Portal Web:        http://%s:5173\n' "$host_ip"
  printf '  - User Web:          http://%s:5174\n' "$host_ip"
  printf '\n'
}

# ==============================================================================
# Database Operations
# ==============================================================================

database_status_check() {
  printf '\n\033[1m=== Database Status Check ===\033[0m\n'
  get_db_params

  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}$"; then
    log_err "Postgres container '${POSTGRES_CONTAINER}' is not running. Start infra first."
    return 1
  fi

  printf '\n[1. Migration Status]\n'
  if table_exists "_prisma_migrations"; then
    local applied_count
    applied_count="$(psql_query "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
    log_ok "_prisma_migrations table exists (applied migrations: ${applied_count:-0})"
    printf '  Latest applied migrations:\n'
    psql_query "SELECT migration_name, finished_at FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 5" \
      | while IFS='|' read -r name ts; do
          [[ -n "$name" ]] && printf '    - %s (%s)\n' "$name" "$ts"
        done
  else
    log_err "_prisma_migrations table NOT found!"
  fi

  printf '\n[2. Core Schema Tables Check]\n'
  local core_tables=(
    "users" "roles" "user_roles" "chat_sessions" "chat_messages"
    "executions" "execution_phases" "execution_steps" "im_channel_connections"
    "task_policy_sets" "execution_flow_templates" "temporal_workflows"
    "llm_operations" "skill_configs"
  )
  for tbl in "${core_tables[@]}"; do
    if table_exists "$tbl"; then
      log_ok "$tbl"
    else
      log_err "$tbl <- MISSING"
    fi
  done

  printf '\n[3. 88-Table Schema Ownership Verification]\n'
  if [[ -f "$REPO_ROOT/database/scripts/validate-schema-ownership.mjs" ]]; then
    if node "$REPO_ROOT/database/scripts/validate-schema-ownership.mjs" >/dev/null 2>&1; then
      log_ok "All 88 tables match authoritative schema ownership definitions."
    else
      log_warn "Schema ownership drift detected. Run 'pnpm run validate:schema-ownership' for details."
    fi
  fi

  printf '\n[4. Migration Authority Check]\n'
  if [[ -f "$REPO_ROOT/database/scripts/validate-migration-authority.mjs" ]]; then
    if node "$REPO_ROOT/database/scripts/validate-migration-authority.mjs" >/dev/null 2>&1; then
      log_ok "Migration sequence authority is fully validated."
    else
      log_warn "Migration sequence authority check reported warnings."
    fi
  fi
  printf '\n'
}

apply_shared_domain_schema_repairs() {
  log "Applying shared domain schema repair SQL..."
  apply_sql_file "$BROWSER_TEMPLATE_REPAIR_SQL"
}

apply_latest_database_schema() {
  printf '\n=== Apply Latest Database Schema ===\n'
  start_stack "infra"
  wait_for_postgres
  bash "$APPLY_LATEST_DB_SCHEMA_SCRIPT"
  apply_shared_domain_schema_repairs
  database_status_check
}

reset_public_schema() {
  printf '\n\033[31m=== CAUTION: Reset Public Schema ===\033[0m\n'
  printf 'This will DROP and recreate the entire public schema.\n'
  printf 'ALL TABLES, DATA, VIEWS, AND MIGRATION HISTORIES WILL BE PURGED.\n\n'

  if ! confirm "Are you ABSOLUTELY sure you want to drop public schema?"; then
    log "Cancelled."
    return 0
  fi

  start_stack "infra"
  wait_for_postgres

  log "Dropping and recreating schema public..."
  get_db_params
  run_psql_stdin <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO ${POSTGRES_USER};
GRANT ALL ON SCHEMA public TO public;
SQL

  log_ok "Public schema has been completely reset."
}

seed_platform_accounts_sql() {
  local admin_username admin_email admin_password
  local admin_username_sql admin_email_sql admin_password_sql

  admin_username="${ADMIN_USERNAME:-$DEFAULT_ADMIN_USERNAME}"
  admin_email="${ADMIN_EMAIL:-$DEFAULT_ADMIN_EMAIL}"
  admin_password="${ADMIN_PASSWORD:-$DEFAULT_ADMIN_PASSWORD}"

  admin_username_sql="$(sql_escape_literal "$admin_username")"
  admin_email_sql="$(sql_escape_literal "$admin_email")"
  admin_password_sql="$(sql_escape_literal "$admin_password")"

  log "Creating default platform roles and administrator account..."
  get_db_params
  run_psql_stdin <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO roles (id, name, description, permissions, is_system)
VALUES
  (gen_random_uuid(), 'admin', '系统管理员', '{"all_skills": true}'::json, true),
  (gen_random_uuid(), 'employee', '普通员工', '{}'::json, true),
  (gen_random_uuid(), 'agent', '自动化代理', '{"replay_start": true, "replay_stop": true, "agent_create": true}'::json, true)
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

INSERT INTO users (id, username, password_hash, email, role, is_active)
VALUES (
  gen_random_uuid(),
  '${admin_username_sql}',
  crypt('${admin_password_sql}', gen_salt('bf')),
  '${admin_email_sql}',
  'admin'::"UserRoleType",
  true
)
ON CONFLICT (username) DO UPDATE
SET
  password_hash = crypt('${admin_password_sql}', gen_salt('bf')),
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  is_active = true,
  updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'admin'
WHERE u.username = '${admin_username_sql}'
ON CONFLICT (user_id, role_id) DO NOTHING;
SQL

  log_ok "Default accounts seeded. Username: ${admin_username} Password: ${admin_password}"
}

reset_admin_password() {
  local password confirm_password
  read -r -s -p "Enter new admin password: " password
  printf '\n'
  read -r -s -p "Confirm new admin password: " confirm_password
  printf '\n'

  if [[ "$password" != "$confirm_password" ]]; then
    log_err "Passwords do not match."
    return 1
  fi

  start_stack "infra"
  wait_for_postgres
  ADMIN_PASSWORD="$password" seed_platform_accounts_sql
  log_ok "Admin password updated successfully."
}

export_initial_data() {
  printf '\n=== Export Initial Data ===\n'
  start_stack "infra"
  wait_for_postgres

  local export_path
  read -r -p "Export path [${INITIAL_DATA_EXPORT_PATH_DEFAULT}]: " export_path
  export_path="${export_path:-$INITIAL_DATA_EXPORT_PATH_DEFAULT}"

  bash "$EXPORT_INITIAL_DATA_SCRIPT" "$export_path"
  log_ok "Initial data export complete: $export_path"
}

# ==============================================================================
# Environment Configuration
# ==============================================================================

generate_default_env() {
  local ip_input
  read -r -p "Enter host IP address (e.g. 192.168.1.100 or 127.0.0.1): " ip_input

  if [[ -z "$ip_input" ]]; then
    log_err "Host IP is required."
    return 1
  fi

  local source_file
  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    if ! confirm "docker/.env already exists. Refresh host values?"; then
      log "Cancelled."
      return 0
    fi
    source_file="$DOCKER_ENV_FILE"
  elif [[ -f "$DOCKER_ENV_TEMPLATE" ]]; then
    source_file="$DOCKER_ENV_TEMPLATE"
  else
    log_err "No template found at $DOCKER_ENV_TEMPLATE"
    return 1
  fi

  local temp_file
  temp_file="$(mktemp)"
  cp "$source_file" "$temp_file"

  set_env_value "$temp_file" "HOST_IP" "$ip_input"
  set_env_value "$temp_file" "SESSION_BROWSER_IMAGE" "ops-browser-chrome:local"
  set_env_value "$temp_file" "OFFICE_ADDIN_PUBLIC_HOST" "$ip_input"
  set_env_value "$temp_file" "CARBONE_API_PUBLIC_HOST" "$ip_input"
  set_env_value "$temp_file" "OFFICE_ADDIN_TLS_HOSTS" "localhost,127.0.0.1,${ip_input}"

  mv "$temp_file" "$DOCKER_ENV_FILE"
  rm -f "${DOCKER_ENV_FILE}.bak"
  log_ok "Configured docker/.env with HOST_IP=${ip_input}"
}

# ==============================================================================
# Global CLI Installation
# ==============================================================================

install_global_cli() {
  local target_dir="$HOME/.local/bin"
  local target_bin="$target_dir/ops"
  local target_script="$SCRIPT_DIR/ops-menu.sh"

  log "Installing global 'ops' CLI..."
  mkdir -p "$target_dir"

  cat <<EOF > "$target_bin"
#!/usr/bin/env bash
# Auto-generated wrapper for Ops Automation CLI
exec "$target_script" "\$@"
EOF

  chmod +x "$target_bin"
  log_ok "Global command installed at: $target_bin"

  # Ensure repo root symlink exists
  ln -sf "docker/scripts/ops-menu.sh" "$REPO_ROOT/ops"
  log_ok "Project root symlink ensured at: $REPO_ROOT/ops"

  if [[ ":$PATH:" != *":$target_dir:"* ]]; then
    log_warn "$target_dir is not in your current PATH."
    log_info "Add it to your shell configuration (e.g. ~/.zshrc):"
    printf '  export PATH="\$HOME/.local/bin:\$PATH"\n'
  else
    log_info "You can now run 'ops' from any terminal directory!"
  fi
}

uninstall_global_cli() {
  local target_bin="$HOME/.local/bin/ops"
  if [[ -f "$target_bin" ]]; then
    rm -f "$target_bin"
    log_ok "Removed global command: $target_bin"
  else
    log_info "Global command not found at $target_bin"
  fi

  if [[ -L "$REPO_ROOT/ops" ]]; then
    rm -f "$REPO_ROOT/ops"
    log_ok "Removed root symlink: $REPO_ROOT/ops"
  fi
}

# ==============================================================================
# Menus
# ==============================================================================

database_menu() {
  local choice
  while true; do
    printf '\n============================================================\n'
    printf '                  Database Operations Menu\n'
    printf '============================================================\n'
    printf ' 1) Database Status & 88-Table Authority Check\n'
    printf ' 2) Apply Latest Database Schema & Migrations\n'
    printf ' 3) Seed Platform Default Accounts (Admin/Employee/Agent)\n'
    printf ' 4) Reset Admin Password\n'
    printf ' 5) Export Initial Data Snapshot\n'
    printf ' 6) Reset Public Schema (CAUTION: Drop All Tables)\n'
    printf ' 0) Back to Main Menu\n'
    printf '============================================================\n'
    read -r -p "Select option [0-6]: " choice

    case "$choice" in
      1) database_status_check; prompt_enter ;;
      2) apply_latest_database_schema; prompt_enter ;;
      3) start_stack "infra"; wait_for_postgres; seed_platform_accounts_sql; prompt_enter ;;
      4) reset_admin_password; prompt_enter ;;
      5) export_initial_data; prompt_enter ;;
      6) reset_public_schema; prompt_enter ;;
      0) return 0 ;;
      *) log_warn "Invalid selection: $choice" ;;
    esac
  done
}

print_header() {
  printf '\n============================================================\n'
  printf '              Ops Automation Management Menu\n'
  printf '  Repo: %s\n' "$REPO_ROOT"
  printf '  Stack: Lightweight Core (6 containers) + On-Demand Profiles\n'
  printf '============================================================\n'
}

interactive_main_menu() {
  local choice
  while true; do
    print_header
    printf ' [Service Management]\n'
    printf '  1) Start Core Stack (dev - 6 containers, recommended)\n'
    printf '  2) Start with Browser Extension (dev:browser)\n'
    printf '  3) Start with Temporal Workflow (dev:workflow)\n'
    printf '  4) Start with Document Engine (dev:doc)\n'
    printf '  5) Start with Frontend Web (dev:fe)\n'
    printf '  6) Start Full Stack (full - 19 containers)\n'
    printf '  7) Start Infra Only (postgres + redis)\n'
    printf '  8) Restart Core Services\n'
    printf '  9) Stop All Services (full down)\n\n'
    printf ' [Status & Diagnostics]\n'
    printf ' 10) Check Service Status & Health Probes\n'
    printf ' 11) Run Core Smoke Test (4s fast check)\n\n'
    printf ' [Database Operations]\n'
    printf ' 12) Database Menu (Status, Migrations, Seed, Reset)\n\n'
    printf ' [Configuration & Tooling]\n'
    printf ' 13) Generate / Refresh docker/.env\n'
    printf ' 14) Install Global "ops" Command to ~/.local/bin\n'
    printf ' 15) Uninstall Global "ops" Command\n\n'
    printf '  0) Exit\n'
    printf '============================================================\n'
    read -r -p "Select option [0-15]: " choice

    case "$choice" in
      1)  start_stack "dev"; prompt_enter ;;
      2)  start_stack "dev:browser"; prompt_enter ;;
      3)  start_stack "dev:workflow"; prompt_enter ;;
      4)  start_stack "dev:doc"; prompt_enter ;;
      5)  start_stack "dev:fe"; prompt_enter ;;
      6)  start_stack "full"; prompt_enter ;;
      7)  start_stack "infra"; prompt_enter ;;
      8)  restart_core_services; prompt_enter ;;
      9)  stop_services; prompt_enter ;;
      10) show_service_status; prompt_enter ;;
      11) run_core_smoke; prompt_enter ;;
      12) database_menu ;;
      13) generate_default_env; prompt_enter ;;
      14) install_global_cli; prompt_enter ;;
      15) uninstall_global_cli; prompt_enter ;;
      0)  log "Bye!"; exit 0 ;;
      *)  log_warn "Invalid selection: $choice" ;;
    esac
  done
}

# ==============================================================================
# CLI Entrypoint & Argument Dispatcher
# ==============================================================================

print_help() {
  cat <<EOF
Usage: ops [command]

Service Lifecycle:
  ops dev | up          Start lightweight core stack (6 containers, recommended)
  ops full              Start full stack (all 19 containers)
  ops browser           Start core + browser automation
  ops workflow          Start core + temporal workflow
  ops doc               Start core + carbone document engine
  ops fe                Start core + frontend apps
  ops infra             Start postgres + redis only
  ops restart           Restart core backend services
  ops stop | down       Gracefully stop all running containers

Diagnostics & Testing:
  ops ps | status       Check container and HTTP health probe status
  ops smoke             Run live core smoke test (platform + control-plane)

Database:
  ops db check          Verify database migrations and 88-table schema ownership
  ops db apply          Apply latest migrations and shared domain repairs
  ops db seed           Seed default roles and admin account
  ops db reset          Reset public schema (drops all tables)
  ops db export [path]  Export snapshot of initial platform data

Setup & Installation:
  ops env               Configure docker/.env with host IP
  ops install           Install 'ops' command into ~/.local/bin/ops
  ops uninstall         Remove 'ops' command from ~/.local/bin/ops

Run without arguments to launch the interactive TUI menu.
EOF
}

dispatch_cli() {
  local cmd="$1"
  shift

  case "$cmd" in
    dev|up)
      start_stack "dev"
      ;;
    full)
      start_stack "full"
      ;;
    browser)
      start_stack "dev:browser"
      ;;
    workflow)
      start_stack "dev:workflow"
      ;;
    doc)
      start_stack "dev:doc"
      ;;
    fe)
      start_stack "dev:fe"
      ;;
    infra)
      start_stack "infra"
      ;;
    restart)
      restart_core_services
      ;;
    stop|down)
      stop_services
      ;;
    ps|status)
      show_service_status
      ;;
    smoke)
      run_core_smoke
      ;;
    db)
      local sub="${1:-check}"
      case "$sub" in
        check)  database_status_check ;;
        apply)  apply_latest_database_schema ;;
        seed)   start_stack "infra"; wait_for_postgres; seed_platform_accounts_sql ;;
        reset)  reset_public_schema ;;
        export) export_initial_data ;;
        *)      database_menu ;;
      esac
      ;;
    env)
      generate_default_env
      ;;
    install)
      install_global_cli
      ;;
    uninstall)
      uninstall_global_cli
      ;;
    help|--help|-h)
      print_help
      ;;
    *)
      log_err "Unknown command: $cmd"
      print_help
      exit 1
      ;;
  esac
}

main() {
  if [[ $# -gt 0 ]]; then
    dispatch_cli "$@"
  elif [ -t 0 ]; then
    interactive_main_menu
  else
    print_help
  fi
}

main "$@"
