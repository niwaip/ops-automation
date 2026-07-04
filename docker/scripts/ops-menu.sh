#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"
SMART_SCRIPT="$SCRIPT_DIR/start-smart.sh"
APPLY_LATEST_DB_SCHEMA_SCRIPT="$SCRIPT_DIR/apply-latest-db-schema.sh"
EXPORT_INITIAL_DATA_SCRIPT="$SCRIPT_DIR/export-initial-data.sh"
DEFAULT_ADMIN_PASSWORD="${DEFAULT_ADMIN_PASSWORD:-admin123}"
DEFAULT_ADMIN_USERNAME="${DEFAULT_ADMIN_USERNAME:-admin}"
DEFAULT_ADMIN_EMAIL="${DEFAULT_ADMIN_EMAIL:-admin@example.com}"
DOCKER_ENV_FILE="$DOCKER_DIR/.env"
DOCKER_ENV_TEMPLATE="$DOCKER_DIR/env/.env.example"

BASE_COMPOSE="docker-compose.base.yml"
INFRA_COMPOSE="docker-compose.yml"
LEGACY_COMPAT_COMPOSES=(
  "docker-compose.full.yml"
  "docker-compose.core.yml"
  "docker-compose.planner.yml"
  "docker-compose.runtime.yml"
  "docker-compose.experience.yml"
)

PLATFORM_BASELINE_MIGRATION="20260608_init_platform_baseline"
PLATFORM_SCHEMA="./prisma/schema.prisma"
CONTROL_PLANE_INCREMENTAL_SQL_FILES=(
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260515143000_add_execution_phases/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260516140000_add_execution_phase_steps/migration.sql"
  "$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/migrations/20260625000000_add_scheduler/migration.sql"
)
BROWSER_TEMPLATE_REPAIR_SQL="$REPO_ROOT/apps/backend/capabilities/browser-domain/templates/prisma/manual-sql/20260608_rebuild_templates_current_schema.sql"
LEGACY_SQL_FILES=(
  "$REPO_ROOT/docker/sql/migrations/001_init.sql"
  "$REPO_ROOT/docker/sql/seed.sql"
)
PLACEHOLDER_MIGRATION_FILES=(
  "$REPO_ROOT/apps/backend/capabilities/browser-domain/templates/prisma/migrations/0_baseline/migration.sql"
  "$REPO_ROOT/apps/backend/capabilities/document-domain/report/prisma/migrations/0_baseline/migration.sql"
  "$REPO_ROOT/apps/backend/runtimes/replay-worker/prisma/migrations/0_baseline/migration.sql"
)
PLATFORM_REQUIRED_TABLES=(
  "users"
  "roles"
  "user_roles"
  "organizations"
  "departments"
  "teams"
  "org_memberships"
  "team_memberships"
  "org_role_bindings"
  "identity_provider_configs"
  "execution_flow_templates"
  "skill_configs"
  "skill_permissions"
  "tool_catalogs"
  "skill_tool_bindings"
  "chat_sessions"
  "chat_messages"
  "executions"
  "execution_phases"
  "execution_phase_steps"
  "execution_phase_artifacts"
  "execution_takeovers"
  "runtime_sessions"
  "execution_steps"
  "execution_events"
  "audit_logs"
  "activities"
  "temporal_workflows"
  "skill_schedules"
)
PLATFORM_REQUIRED_COLUMNS=(
  "executions:current_phase_key"
  "executions:current_phase_status"
  "executions:takeover_status"
  "executions:trigger_type"
  "executions:schedule_id"
)
SCHEMA_STATUS_TABLES=(
  "${PLATFORM_REQUIRED_TABLES[@]}"
  "templates"
)
LEGACY_TABLES=(
  "sessions"
  "step_logs"
  "ai_models"
  "ai_agents"
)
INITIAL_DATA_EXPORT_PATH_DEFAULT="$REPO_ROOT/docker/sql/exports/platform-initial-data-latest.sql"

log() {
  printf '[ops-menu] %s\n' "$1"
}

log_ok() {
  printf '  \033[32m[OK] %s\033[0m\n' "$1"
}

log_warn() {
  printf '  \033[33m[WARN] %s\033[0m\n' "$1"
}

log_err() {
  printf '  \033[31m[ERR] %s\033[0m\n' "$1"
}

sql_escape_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

run_compose() {
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

prompt_enter() {
  read -r -p "Press Enter to continue..." _
}

confirm() {
  local message="$1"
  local answer

  read -r -p "$message [y/N]: " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

read_admin_password() {
  local password confirm_password

  read -r -s -p "Enter admin password (default: ${DEFAULT_ADMIN_PASSWORD}): " password
  printf '\n'

  if [[ -z "$password" ]]; then
    ADMIN_PASSWORD_VALUE="$DEFAULT_ADMIN_PASSWORD"
    return
  fi

  read -r -s -p "Confirm admin password: " confirm_password
  printf '\n'

  if [[ "$password" != "$confirm_password" ]]; then
    log "Passwords do not match."
    return 1
  fi

  ADMIN_PASSWORD_VALUE="$password"
}

read_host_ip() {
  local ip_input

  read -r -p "Enter host IP address: " ip_input

  if [[ -z "$ip_input" ]]; then
    log "Host IP is required."
    return 1
  fi

  HOST_IP_VALUE="$ip_input"
}

generate_default_env() {
  local source_file
  local temp_file

  read_host_ip || return 1

  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    if ! confirm "docker/.env already exists. Overwrite it with refreshed defaults?"; then
      log "Cancelled."
      return 0
    fi
    source_file="$DOCKER_ENV_FILE"
  elif [[ -f "$DOCKER_ENV_TEMPLATE" ]]; then
    source_file="$DOCKER_ENV_TEMPLATE"
  else
    log "No docker env template found."
    return 1
  fi

  temp_file="$(mktemp)"
  cp "$source_file" "$temp_file"

  set_env_value "$temp_file" "HOST_IP" "$HOST_IP_VALUE"
  set_env_value "$temp_file" "SESSION_BROWSER_IMAGE" "ops-browser-chrome:local"
  set_env_value "$temp_file" "OFFICE_ADDIN_PUBLIC_HOST" "$HOST_IP_VALUE"
  set_env_value "$temp_file" "CARBONE_API_PUBLIC_HOST" "$HOST_IP_VALUE"
  set_env_value "$temp_file" "OFFICE_ADDIN_TLS_HOSTS" "localhost,127.0.0.1,${HOST_IP_VALUE}"

  if grep -q "^DEV_PUBLIC_HOST=" "$temp_file"; then
    set_env_value "$temp_file" "DEV_PUBLIC_HOST" "$HOST_IP_VALUE"
  fi

  if grep -q "^VITE_HOST_IP=" "$temp_file"; then
    set_env_value "$temp_file" "VITE_HOST_IP" "$HOST_IP_VALUE"
  fi

  mv "$temp_file" "$DOCKER_ENV_FILE"
  rm -f "${DOCKER_ENV_FILE}.bak"
  log "Generated docker/.env with host IP: ${HOST_IP_VALUE}"
}

get_db_params() {
  local env_file="$DOCKER_ENV_FILE"
  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ops-postgres}"
  POSTGRES_USER="${POSTGRES_USER:-ops}"
  POSTGRES_DB="${POSTGRES_DB:-ops}"

  if [[ -f "$env_file" ]]; then
    local pg_user pg_db
    pg_user="$(grep -E '^POSTGRES_USER=' "$env_file" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
    pg_db="$(grep -E '^POSTGRES_DB=' "$env_file" 2>/dev/null | tail -1 | cut -d'=' -f2-)"
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

enum_exists() {
  local enum_name="$1"
  local count
  count="$(psql_query "SELECT COUNT(*) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname='public' AND t.typname='${enum_name}'")"
  [[ "${count:-0}" -gt 0 ]]
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

run_psql_stdin() {
  get_db_params
  run_compose "$INFRA_COMPOSE" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f -
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

stop_all_compose() {
  local compose_file
  for compose_file in "${LEGACY_COMPAT_COMPOSES[@]}"; do
    run_compose "$compose_file" down || true
  done
  run_compose "$BASE_COMPOSE" down || true
  run_compose "$INFRA_COMPOSE" down || true
}

start_infra() {
  run_compose "$INFRA_COMPOSE" up -d
  wait_for_postgres
}

start_core() {
  run_compose "$BASE_COMPOSE" up -d
}

apply_shared_domain_schema_repairs() {
  log "Applying shared domain schema repair SQL..."
  apply_sql_file "$BROWSER_TEMPLATE_REPAIR_SQL"
}

show_service_status() {
  local env_file="$DOCKER_DIR/.env"
  local host_ip="localhost"

  if [[ -f "$env_file" ]]; then
    host_ip="$(grep -E '^HOST_IP=' "$env_file" | tail -1 | cut -d'=' -f2-)"
    host_ip="${host_ip:-localhost}"
  fi

  printf '\n=== Docker Containers ===\n'
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E '^ops-|^NAMES' || true

  printf '\n=== Common URLs ===\n'
  printf 'Platform: http://%s:3001\n' "$host_ip"
  printf 'Control Plane: http://%s:3003\n' "$host_ip"
  printf 'AI Orchestrator: http://%s:3007\n' "$host_ip"
  printf 'Portal: http://%s:5173\n' "$host_ip"
  printf 'User Web: http://%s:5174\n' "$host_ip"
  printf 'noVNC: http://%s:6080/vnc.html\n' "$host_ip"
  printf 'Temporal UI: http://%s:8088\n' "$host_ip"
}

print_migration_inventory() {
  printf '\n=== Database Migration Inventory ===\n'

  printf '\n[Current schema entrypoints]\n'
  printf '  - Platform baseline: %s\n' "$REPO_ROOT/apps/backend/core/platform/prisma/migrations/${PLATFORM_BASELINE_MIGRATION}/migration.sql"
  local sql_file
  for sql_file in "${CONTROL_PLANE_INCREMENTAL_SQL_FILES[@]}"; do
    printf '  - Shared incremental SQL: %s\n' "$sql_file"
  done
  printf '  - Shared domain repair SQL: %s\n' "$BROWSER_TEMPLATE_REPAIR_SQL"

  printf '\n[Placeholder migrations not applied automatically]\n'
  for sql_file in "${PLACEHOLDER_MIGRATION_FILES[@]}"; do
    printf '  - %s\n' "$sql_file"
  done

  printf '\n[Legacy SQL entrypoints]\n'
  for sql_file in "${LEGACY_SQL_FILES[@]}"; do
    if [[ -f "$sql_file" ]]; then
      log_warn "Legacy SQL kept only as deprecated stub: $sql_file"
    else
      log_warn "Legacy SQL file missing: $sql_file"
    fi
  done

  printf '\n'
}

database_status_check() {
  printf '\n=== Database Status Check ===\n'

  get_db_params
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}$"; then
    log_err "Postgres container '${POSTGRES_CONTAINER}' is not running. Start infra first."
    return 1
  fi

  printf '\n[Migration History]\n'
  if table_exists "_prisma_migrations"; then
    log_ok "_prisma_migrations table exists"
    local applied_count
    applied_count="$(psql_query "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL")"
    printf '  Applied migrations: %s\n' "${applied_count:-0}"
    printf '  Latest applied:\n'
    psql_query "SELECT migration_name, finished_at FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 8" \
      | while IFS='|' read -r name ts; do
          [[ -n "$name" ]] && printf '    - %s  (%s)\n' "$name" "$ts"
        done
  else
    log_err "_prisma_migrations table NOT found"
  fi

  printf '\n[Current schema tables]\n'
  local tbl
  for tbl in "${SCHEMA_STATUS_TABLES[@]}"; do
    if table_exists "$tbl"; then
      log_ok "$tbl"
    else
      log_err "$tbl  <- MISSING"
    fi
  done

  printf '\n[Key columns]\n'
  local entry
  local col
  for entry in "${PLATFORM_REQUIRED_COLUMNS[@]}"; do
    tbl="${entry%%:*}"
    col="${entry##*:}"
    if column_exists "$tbl" "$col"; then
      log_ok "${tbl}.${col}"
    else
      log_err "${tbl}.${col}  <- MISSING"
    fi
  done

  printf '\n[Shared domain objects]\n'
  if table_exists "templates"; then
    log_ok "templates"
  else
    log_err "templates  <- MISSING"
  fi

  if enum_exists "templates_status_enum"; then
    log_ok "templates_status_enum"
  else
    log_err "templates_status_enum  <- MISSING"
  fi

  if enum_exists "template_status"; then
    log_warn "Legacy enum still present: template_status"
  else
    log_ok "Legacy enum absent: template_status"
  fi

  printf '\n[Legacy object checks]\n'
  for tbl in "${LEGACY_TABLES[@]}"; do
    if table_exists "$tbl"; then
      log_warn "Legacy table still present: $tbl"
    else
      log_ok "Legacy table absent: $tbl"
    fi
  done

  printf '\n'
}

reset_public_schema() {
  printf '\n=== Reset Public Schema ===\n'
  printf 'This will DROP and recreate the entire public schema.\n'
  printf 'All current tables, data, views, functions, and migration history will be removed.\n\n'

  if ! confirm "Continue with full database cleanup?"; then
    log "Cancelled."
    return 0
  fi

  start_infra

  log "Dropping and recreating schema public..."
  run_psql_stdin <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO ${POSTGRES_USER};
GRANT ALL ON SCHEMA public TO public;
SQL

  log_ok "Database schema reset complete."
}

apply_latest_database_schema() {
  printf '\n=== Apply Latest Database Schema ===\n'
  start_infra
  bash "$APPLY_LATEST_DB_SCHEMA_SCRIPT"
  apply_shared_domain_schema_repairs
  database_status_check
}

seed_platform_data() {
  printf '\n=== Import Seed Data ===\n'
  start_infra
  seed_platform_accounts_sql
}

export_initial_data() {
  printf '\n=== Export Initial Data ===\n'
  start_infra

  local export_path
  read -r -p "Export path [${INITIAL_DATA_EXPORT_PATH_DEFAULT}]: " export_path
  export_path="${export_path:-$INITIAL_DATA_EXPORT_PATH_DEFAULT}"

  bash "$EXPORT_INITIAL_DATA_SCRIPT" "$export_path"
  log_ok "Initial data export complete."
}

reset_admin_password() {
  read_admin_password || return 1
  start_infra
  ADMIN_PASSWORD="$ADMIN_PASSWORD_VALUE" seed_platform_accounts_sql
  log "Admin password reset complete. Username: ${ADMIN_USERNAME:-$DEFAULT_ADMIN_USERNAME}"
}

full_initial_deployment() {
  printf '\n=== Initial Full Deployment ===\n'
  printf 'This workflow is only for initialization and rebuild scenarios.\n'
  printf 'It will:\n'
  printf '  1. Stop running compose stacks\n'
  printf '  2. Reset the public schema\n'
  printf '  3. Apply the latest baseline + incremental migrations\n'
  printf '  4. Create default login account with SQL\n'
  printf '  5. Export initial data snapshot\n'
  printf '  6. Start core and peripheral services\n\n'

  if ! confirm "Continue with initial full deployment?"; then
    log "Cancelled."
    return 0
  fi

  log "Stopping running compose stacks..."
  stop_all_compose

  start_infra

  log "Resetting database schema..."
  run_psql_stdin <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO ${POSTGRES_USER};
GRANT ALL ON SCHEMA public TO public;
SQL

  log "Applying latest schema..."
  bash "$APPLY_LATEST_DB_SCHEMA_SCRIPT"

  apply_shared_domain_schema_repairs

  seed_platform_accounts_sql

  log "Exporting initial data snapshot..."
  bash "$EXPORT_INITIAL_DATA_SCRIPT" "$INITIAL_DATA_EXPORT_PATH_DEFAULT"

  log "Starting application services..."
  start_core

  log "Final database status check..."
  database_status_check

  log_ok "Initial full deployment complete."
  log "Initial data export: ${INITIAL_DATA_EXPORT_PATH_DEFAULT}"
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

  log "Creating minimal platform accounts with SQL..."
  run_psql_stdin <<SQL
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO roles (name, description, permissions, is_system)
VALUES
  ('admin', '系统管理员', '{"all_skills": true}'::json, true),
  ('employee', '普通员工', '{}'::json, true),
  ('agent', '自动化代理', '{"replay_start": true, "replay_stop": true, "agent_create": true}'::json, true)
ON CONFLICT (name) DO UPDATE
SET
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

INSERT INTO users (username, password_hash, email, role, is_active)
VALUES (
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

  log_ok "SQL account initialization complete."
  log "Admin login ensured. Username: ${admin_username} Password: ${admin_password}"
}

database_menu() {
  local choice

  while true; do
    printf '\n========================================\n'
    printf 'Database Init Menu\n'
    printf '========================================\n'
    printf '1. Database status check\n'
    printf '2. Migration inventory check\n'
    printf '3. Reset public schema (drop all tables)\n'
    printf '4. Apply latest database schema\n'
    printf '5. Create default login account (SQL)\n'
    printf '6. Export initial data snapshot\n'
    printf '7. Initial full deployment\n'
    printf '0. Back\n'
    read -r -p "Select: " choice

    case "$choice" in
      1) database_status_check; prompt_enter ;;
      2) print_migration_inventory; prompt_enter ;;
      3) reset_public_schema; prompt_enter ;;
      4) apply_latest_database_schema; prompt_enter ;;
      5) seed_platform_data; prompt_enter ;;
      6) export_initial_data; prompt_enter ;;
      7) full_initial_deployment; prompt_enter ;;
      0) return ;;
      *) log "Invalid selection." ;;
    esac
  done
}

print_header() {
  printf '\n========================================\n'
  printf 'Ops Automation Init Menu\n'
  printf 'Repo: %s\n' "$REPO_ROOT"
  printf 'Purpose: initialization deployment only\n'
  printf '========================================\n'
}

main_menu() {
  local choice

  while true; do
    print_header
    printf '1. Initial full deployment\n'
    printf '2. Database init menu\n'
    printf '3. Generate default docker .env\n'
    printf '4. Service status check\n'
    printf '5. Reset admin password (SQL)\n'
    printf '0. Exit\n'
    read -r -p "Select: " choice

    case "$choice" in
      1) full_initial_deployment; prompt_enter ;;
      2) database_menu ;;
      3) generate_default_env; prompt_enter ;;
      4) show_service_status; prompt_enter ;;
      5) reset_admin_password; prompt_enter ;;
      0) exit 0 ;;
      *) log "Invalid selection." ;;
    esac
  done
}

main_menu
