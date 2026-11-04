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
FULL_SMOKE_TEST_SCRIPT="$SCRIPT_DIR/smoke/full-smoke.sh"

DOCKER_ENV_FILE="$DOCKER_DIR/.env"
DOCKER_ENV_TEMPLATE="$DOCKER_DIR/env/.env.example"
PLATFORM_SCHEMA="$REPO_ROOT/apps/backend/platform/prisma/schema.prisma"
BROWSER_TEMPLATE_REPAIR_SQL="$REPO_ROOT/apps/backend/capabilities/browser-domain/templates/prisma/manual-sql/20260608_rebuild_templates_current_schema.sql"
INITIAL_DATA_EXPORT_PATH_DEFAULT="$REPO_ROOT/database/exports/platform-initial-data-latest.sql"
SYSTEM_BACKUP_EXPORT_PATH_DEFAULT="$REPO_ROOT/database/exports/system-backup-latest.json"

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

read_env_key() {
  local key="$1"
  local file="${2:-$DOCKER_ENV_FILE}"
  if [[ -f "$file" ]]; then
    (grep -E "^${key}=" "$file" 2>/dev/null || true) | tail -1 | cut -d'=' -f2- | tr -d '\r"' || true
  fi
}

get_db_params() {
  POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ops-postgres}"
  POSTGRES_USER="${POSTGRES_USER:-ops}"
  POSTGRES_DB="${POSTGRES_DB:-ops}"

  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local pg_user pg_db
    pg_user="$(read_env_key 'POSTGRES_USER')"
    pg_db="$(read_env_key 'POSTGRES_DB')"
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

run_smoke() {
  local mode="${1:-core}"
  case "$mode" in
    full)
      log "Running end-to-end full smoke test..."
      if [[ -f "$FULL_SMOKE_TEST_SCRIPT" ]]; then
        bash "$FULL_SMOKE_TEST_SCRIPT"
      else
        log_err "Full smoke test script not found: $FULL_SMOKE_TEST_SCRIPT"
        return 1
      fi
      ;;
    core|*)
      log "Running fast core smoke test..."
      if [[ -f "$SMOKE_TEST_SCRIPT" ]]; then
        bash "$SMOKE_TEST_SCRIPT"
      else
        log_err "Core smoke test script not found: $SMOKE_TEST_SCRIPT"
        return 1
      fi
      ;;
  esac
}

run_core_smoke() {
  run_smoke "core"
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
  local cp_port="3003"
  local platform_port="3001"
  local session_port="3002"
  local ai_port="3007"
  local carbone_port="3009"
  local report_port="3008"
  local sandbox_worker_port="8090"
  local novnc_port="6080"
  local temporal_ui_port="8088"
  local portal_port="5173"
  local user_web_port="5174"

  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local read_val
    read_val="$(read_env_key 'HOST_IP')"
    [ -n "$read_val" ] && host_ip="$read_val"
    read_val="$(read_env_key 'CONTROL_PLANE_PORT')"
    [ -n "$read_val" ] && cp_port="$read_val"
    read_val="$(read_env_key 'PLATFORM_PORT')"
    [[ -z "$read_val" ]] && read_val="$(read_env_key 'AUTH_PORT')"
    [ -n "$read_val" ] && platform_port="$read_val"
    read_val="$(read_env_key 'SESSION_BROKER_PORT')"
    [ -n "$read_val" ] && session_port="$read_val"
    read_val="$(read_env_key 'AI_ORCHESTRATOR_PORT')"
    [ -n "$read_val" ] && ai_port="$read_val"
    read_val="$(read_env_key 'CARBONE_ENGINE_PORT')"
    [ -n "$read_val" ] && carbone_port="$read_val"
    read_val="$(read_env_key 'REPORT_PORT')"
    [ -n "$read_val" ] && report_port="$read_val"
    read_val="$(read_env_key 'SANDBOX_WORKER_PORT')"
    [ -n "$read_val" ] && sandbox_worker_port="$read_val"
    read_val="$(read_env_key 'NOVNC_PORT')"
    [ -n "$read_val" ] && novnc_port="$read_val"
    read_val="$(read_env_key 'TEMPORAL_UI_PORT')"
    [ -n "$read_val" ] && temporal_ui_port="$read_val"
    read_val="$(read_env_key 'PORTAL_PORT')"
    [ -n "$read_val" ] && portal_port="$read_val"
    read_val="$(read_env_key 'USER_WEB_PORT')"
    [ -n "$read_val" ] && user_web_port="$read_val"
  fi

  # Environment overrides take priority
  cp_port="${CONTROL_PLANE_PORT:-$cp_port}"
  platform_port="${PLATFORM_PORT:-$platform_port}"
  session_port="${SESSION_BROKER_PORT:-$session_port}"
  ai_port="${AI_ORCHESTRATOR_PORT:-$ai_port}"
  carbone_port="${CARBONE_ENGINE_PORT:-$carbone_port}"
  report_port="${REPORT_PORT:-$report_port}"
  sandbox_worker_port="${SANDBOX_WORKER_PORT:-$sandbox_worker_port}"
  novnc_port="${NOVNC_PORT:-$novnc_port}"
  temporal_ui_port="${TEMPORAL_UI_PORT:-$temporal_ui_port}"
  portal_port="${PORTAL_PORT:-$portal_port}"
  user_web_port="${USER_WEB_PORT:-$user_web_port}"

  printf '\n\033[1m=== Running Containers ===\033[0m\n'
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E '^ops-|^carbone-|^office-addin|^NAMES' || true

  printf '\n\033[1m=== HTTP Health Probes ===\033[0m\n'
  probe_http_service "Control Plane" "http://127.0.0.1:${cp_port}/api/health" "healthy"
  probe_http_service "Platform" "http://127.0.0.1:${platform_port}/auth/login" ""
  probe_http_service "Session Broker" "http://127.0.0.1:${session_port}/api" ""
  probe_http_service "AI Orchestrator" "http://127.0.0.1:${ai_port}/api" ""
  probe_http_service "Carbone Engine" "http://127.0.0.1:${carbone_port}/health" ""
  probe_http_service "Report Service" "http://127.0.0.1:${report_port}/reports" ""
  probe_http_service "Sandbox Worker" "http://127.0.0.1:${sandbox_worker_port}/health" "healthy"
  probe_http_service "Portal Web" "http://127.0.0.1:${portal_port}" ""
  probe_http_service "User Web" "http://127.0.0.1:${user_web_port}" ""
  probe_http_service "Temporal UI" "http://127.0.0.1:${temporal_ui_port}" ""

  printf '\n\033[1m=== Common Endpoints ===\033[0m\n'
  printf '  - Platform API:      http://%s:%s\n' "$host_ip" "$platform_port"
  printf '  - Session Broker:    http://%s:%s\n' "$host_ip" "$session_port"
  printf '  - Control Plane:     http://%s:%s\n' "$host_ip" "$cp_port"
  printf '  - AI Orchestrator:   http://%s:%s\n' "$host_ip" "$ai_port"
  printf '  - Carbone Engine:    http://%s:%s\n' "$host_ip" "$carbone_port"
  printf '  - Report Service:    http://%s:%s\n' "$host_ip" "$report_port"
  printf '  - Sandbox Worker:    http://%s:%s\n' "$host_ip" "$sandbox_worker_port"
  printf '  - Browser noVNC:     http://%s:%s/vnc.html\n' "$host_ip" "$novnc_port"
  printf '  - Temporal UI:       http://%s:%s\n' "$host_ip" "$temporal_ui_port"
  printf '  - Portal Web:        http://%s:%s\n' "$host_ip" "$portal_port"
  printf '  - User Web:          http://%s:%s\n' "$host_ip" "$user_web_port"
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
    "users" "roles" "user_roles" "organizations" "departments" "teams" "org_memberships"
    "chat_sessions" "chat_messages" "executions" "execution_phases" "execution_steps" "execution_outbox"
    "workspaces" "workspace_nodes" "user_credentials" "user_skill_credential_bindings"
    "task_policy_sets" "task_recipes" "execution_flow_templates" "temporal_workflows"
    "schedule_fires" "skill_schedules" "outbound_effect_ledgers" "reminder_rules"
    "llm_operations" "builtin_skills" "skill_configs"
  )
  local missing_tables=0
  for tbl in "${core_tables[@]}"; do
    if table_exists "$tbl"; then
      log_ok "$tbl"
    else
      log_err "$tbl <- MISSING"
      missing_tables=$((missing_tables + 1))
    fi
  done
  if [[ $missing_tables -eq 0 ]]; then
    log_info "All ${#core_tables[@]} core operational tables verified."
  fi

  printf '\n[3. 95-Table Schema Ownership Verification]\n'
  if [[ -f "$REPO_ROOT/database/scripts/validate-schema-ownership.mjs" ]]; then
    if node "$REPO_ROOT/database/scripts/validate-schema-ownership.mjs" >/dev/null 2>&1; then
      log_ok "All 95 tables match authoritative schema ownership definitions."
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

  printf '\n[5. Built-in Skills & LLM Operations Inventory]\n'
  if table_exists "builtin_skills"; then
    local skill_count active_count
    skill_count="$(psql_query "SELECT COUNT(*) FROM builtin_skills" 2>/dev/null || echo "0")"
    active_count="$(psql_query "SELECT COUNT(*) FROM builtin_skills WHERE is_enabled = true" 2>/dev/null || echo "0")"
    if [[ "${skill_count:-0}" -gt 0 ]]; then
      log_ok "builtin_skills: ${skill_count} total, ${active_count} active"
    else
      log_warn "builtin_skills: table is EMPTY! Run 'ops db seed-skills' to populate."
    fi
  fi
  if table_exists "llm_operations"; then
    local op_count
    op_count="$(psql_query "SELECT COUNT(*) FROM llm_operations" 2>/dev/null || echo "0")"
    if [[ "${op_count:-0}" -gt 0 ]]; then
      log_ok "llm_operations: ${op_count} operations registered"
    else
      log_warn "llm_operations: table is EMPTY (auto-seeds once ai-orchestrator starts successfully)."
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

  log "Creating default platform roles, default organization, and administrator account..."
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

-- Ensure default top-level organization exists
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='organizations') THEN
    INSERT INTO organizations (id, name, code, type, description, is_active, updated_at)
    VALUES (
      'e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c',
      '总公司 / 集团总经办',
      'HEADQUARTERS',
      'enterprise',
      '系统默认初始化顶级组织',
      true,
      NOW()
    )
    ON CONFLICT (code) DO UPDATE
    SET
      name = EXCLUDED.name,
      is_active = true,
      updated_at = NOW();
  END IF;
END \$\$;

INSERT INTO users (id, username, password_hash, email, role, is_active, active_org_id)
VALUES (
  gen_random_uuid(),
  '${admin_username_sql}',
  crypt('${admin_password_sql}', gen_salt('bf')),
  '${admin_email_sql}',
  'admin'::"UserRoleType",
  true,
  'e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c'
)
ON CONFLICT (username) DO UPDATE
SET
  password_hash = crypt('${admin_password_sql}', gen_salt('bf')),
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  is_active = true,
  active_org_id = COALESCE(users.active_org_id, 'e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c'),
  updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = 'admin'
WHERE u.username = '${admin_username_sql}'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Link admin to default organization membership
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='org_memberships') THEN
    INSERT INTO org_memberships (id, user_id, org_id, status)
    SELECT gen_random_uuid(), u.id, 'e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c', 'active'
    FROM users u
    WHERE u.username = '${admin_username_sql}'
    ON CONFLICT (user_id, org_id) DO UPDATE
    SET status = 'active', updated_at = NOW();
  END IF;
END \$\$;
SQL

  log_ok "Default accounts and organization seeded. Username: ${admin_username} Password: ${admin_password}"
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

seed_builtin_skills() {
  printf '\n=== Seed All Built-in Skills ===\n'
  get_db_params
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${POSTGRES_CONTAINER}$"; then
    log_info "Postgres is not running. Starting infra..."
    start_stack "infra"
  fi
  wait_for_postgres

  local platform_container="ops-platform"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${platform_container}$"; then
    log "Provisioning built-in skills via running ${platform_container} container..."
    docker exec -e BUILTIN_SKILL_PROVISION_SKIP_SMOKE=true "$platform_container" sh -c \
      "cd /workspace/apps/backend/platform && pnpm exec ts-node src/commands/builtin-skill-provision.command.ts all full --activate"
  else
    log "Running platform container to provision built-in skills..."
    run_smart dev run --rm --no-deps -e BUILTIN_SKILL_PROVISION_SKIP_SMOKE=true platform sh -c \
      "cd /workspace/apps/backend/platform && pnpm exec ts-node src/commands/builtin-skill-provision.command.ts all full --activate"
  fi
  log_ok "Built-in skills provisioning & activation completed."
}

get_admin_token() {
  local platform_port="3001"
  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local p
    p="$(read_env_key 'PLATFORM_PORT')"
    [[ -z "$p" ]] && p="$(read_env_key 'AUTH_PORT')"
    [[ -n "$p" ]] && platform_port="$p"
  fi
  platform_port="${PLATFORM_PORT:-$platform_port}"

  local admin_user="${ADMIN_USERNAME:-$DEFAULT_ADMIN_USERNAME}"
  local admin_pass="${ADMIN_PASSWORD:-$DEFAULT_ADMIN_PASSWORD}"

  local token
  token="$(curl -s -m 5 -X POST "http://127.0.0.1:${platform_port}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${admin_user}\",\"password\":\"${admin_pass}\"}" 2>/dev/null \
    | python3 -c 'import sys, json; data=json.load(sys.stdin); print(data.get("accessToken", ""))' 2>/dev/null || echo "")"
  printf '%s' "$token"
}

backup_summary() {
  printf '\n\033[1m=== System Backup & Asset Summary ===\033[0m\n'
  local platform_port="3001"
  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local p
    p="$(read_env_key 'PLATFORM_PORT')"
    [[ -z "$p" ]] && p="$(read_env_key 'AUTH_PORT')"
    [[ -n "$p" ]] && platform_port="$p"
  fi
  platform_port="${PLATFORM_PORT:-$platform_port}"

  local token
  token="$(get_admin_token)"
  if [[ -z "$token" ]]; then
    log_err "Failed to authenticate with Platform API at http://127.0.0.1:${platform_port}."
    log_info "Make sure 'ops dev' or platform is running, and admin credentials match."
    return 1
  fi

  local resp
  resp="$(curl -s -m 10 "http://127.0.0.1:${platform_port}/system/backup/summary" \
    -H "Authorization: Bearer ${token}" 2>/dev/null || echo "")"

  if [[ -z "$resp" || "$resp" == *"Unauthorized"* || "$resp" == *"error"* ]]; then
    log_err "Failed to fetch backup summary: $resp"
    return 1
  fi

  python3 -c '
import sys, json
try:
    data = json.loads(sys.argv[1])
    counts = data.get("counts", {})
    total = data.get("totalAssets", 0)
    print("Total Governed Assets: \033[32m{}\033[0m\n".format(total))
    print("  - AI Models & Providers:      {}".format(counts.get("aiModels", 0)))
    print("  - Built-in & Custom Skills:   {}".format(counts.get("skills", 0)))
    print("  - Temporal Workflows:         {}".format(counts.get("temporalWorkflows", 0)))
    print("  - Capability Releases:        {}".format(counts.get("capabilityReleases", 0)))
    print("  - Browser Flow Templates:     {}".format(counts.get("browserTemplates", 0)))
    print("  - Execution Flow Templates:   {}".format(counts.get("executionFlowTemplates", 0)))
    print("  - Organizations & Teams:      {}".format(counts.get("userOrganizations", 0)))
    print("  - Task Policies & Recipes:    {}".format(counts.get("taskPolicies", 0)))
    print("  - Workspaces & Nodes:         {}".format(counts.get("workspaces", 0)))
    print("  - Document Engine Templates:  {}".format(counts.get("documentTemplates", 0)))
except Exception as e:
    print("Error parsing summary: {}".format(e))
' "$resp"
}

backup_export() {
  local target_path="${1:-}"
  printf '\n\033[1m=== Export System Backup Archive ===\033[0m\n'
  if [[ -z "$target_path" ]]; then
    local ts
    ts="$(date +%Y%m%d_%H%M%S)"
    target_path="$REPO_ROOT/database/exports/system-backup-${ts}.json"
    read -r -p "Target export file [${target_path}]: " input_path
    [[ -n "$input_path" ]] && target_path="$input_path"
  fi

  local platform_port="3001"
  if [[ -f "$DOCKER_ENV_FILE" ]]; then
    local p
    p="$(read_env_key 'PLATFORM_PORT')"
    [[ -z "$p" ]] && p="$(read_env_key 'AUTH_PORT')"
    [[ -n "$p" ]] && platform_port="$p"
  fi
  platform_port="${PLATFORM_PORT:-$platform_port}"

  local token
  token="$(get_admin_token)"
  if [[ -z "$token" ]]; then
    log_err "Failed to authenticate with Platform API at http://127.0.0.1:${platform_port}."
    return 1
  fi

  mkdir -p "$(dirname "$target_path")"
  log "Exporting full system backup bundle..."
  local http_code
  http_code="$(curl -s -m 60 -o "$target_path" -w '%{http_code}' -X POST "http://127.0.0.1:${platform_port}/system/backup/export" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d '{"modules":["aiModels","skills","workflows","userOrganizations","promptsMemories","taskPolicies"]}' || echo "000")"

  if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
    local file_size
    file_size="$(wc -c < "$target_path" | tr -d ' ')"
    log_ok "Backup exported successfully to: $target_path (${file_size} bytes)"
  else
    log_err "Export failed with HTTP code $http_code"
    cat "$target_path" 2>/dev/null || true
    rm -f "$target_path"
    return 1
  fi
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
    printf '             Database & Governance Operations Menu\n'
    printf '============================================================\n'
    printf ' 1) Database Status & 95-Table Authority Check\n'
    printf ' 2) Apply Latest Database Schema & Migrations\n'
    printf ' 3) Seed Platform Default Accounts (Admin/Employee + Default Org)\n'
    printf ' 4) Seed & Activate All Built-in Skills (14 declarative bundles)\n'
    printf ' 5) System Backup Asset Summary (CLI)\n'
    printf ' 6) Export System Backup Archive (JSON)\n'
    printf ' 7) Export Initial Data Snapshot (SQL)\n'
    printf ' 8) Reset Admin Password\n'
    printf ' 9) Reset Public Schema (CAUTION: Drop All Tables)\n'
    printf ' 0) Back to Main Menu\n'
    printf '============================================================\n'
    read -r -p "Select option [0-9]: " choice

    case "$choice" in
      1) database_status_check; prompt_enter ;;
      2) apply_latest_database_schema; prompt_enter ;;
      3) start_stack "infra"; wait_for_postgres; seed_platform_accounts_sql; prompt_enter ;;
      4) seed_builtin_skills; prompt_enter ;;
      5) backup_summary; prompt_enter ;;
      6) backup_export; prompt_enter ;;
      7) export_initial_data; prompt_enter ;;
      8) reset_admin_password; prompt_enter ;;
      9) reset_public_schema; prompt_enter ;;
      0) return 0 ;;
      *) log_warn "Invalid selection: $choice" ;;
    esac
  done
}

print_header() {
  printf '\n============================================================\n'
  printf '              Ops Automation Management Menu\n'
  printf '  Repo: %s\n' "$REPO_ROOT"
  printf '  Stack: Lightweight Core (10 containers) + On-Demand Profiles\n'
  printf '============================================================\n'
}

interactive_main_menu() {
  local choice
  while true; do
    print_header
    printf ' [Service Management]\n'
    printf '  1) Start Core Stack (dev - 10 containers, recommended)\n'
    printf '  2) Start with Browser Extension (dev:browser)\n'
    printf '  3) Start with Temporal Workflow (dev:workflow)\n'
    printf '  4) Start with Report Service (dev:doc)\n'
    printf '  5) Start with Durable Dispatch Workers (dev:dispatch)\n'
    printf '  6) Start with Xiaozhi Connector (dev:xiaozhi)\n'
    printf '  7) Start with Office Add-in (addin)\n'
    printf '  8) Start Full Stack (full - 20 containers)\n'
    printf '  9) Start Infra Only (postgres + redis)\n'
    printf ' 10) Restart Core Services\n'
    printf ' 11) Stop All Services (full down)\n\n'
    printf ' [Status & Diagnostics]\n'
    printf ' 12) Check Service Status & HTTP Health Probes\n'
    printf ' 13) Run Core Smoke Test (fast check)\n'
    printf ' 14) Run Full Smoke Test (e2e check)\n\n'
    printf ' [Database & Governance]\n'
    printf ' 15) Database & System Backup Menu\n\n'
    printf ' [Configuration & Tooling]\n'
    printf ' 16) Generate / Refresh docker/.env\n'
    printf ' 17) Install Global "ops" Command to ~/.local/bin\n'
    printf ' 18) Uninstall Global "ops" Command\n\n'
    printf '  0) Exit\n'
    printf '============================================================\n'
    read -r -p "Select option [0-18]: " choice

    case "$choice" in
      1)  start_stack "dev"; prompt_enter ;;
      2)  start_stack "dev:browser"; prompt_enter ;;
      3)  start_stack "dev:workflow"; prompt_enter ;;
      4)  start_stack "dev:doc"; prompt_enter ;;
      5)  start_stack "dev:dispatch"; prompt_enter ;;
      6)  start_stack "dev:xiaozhi"; prompt_enter ;;
      7)  start_stack "addin"; prompt_enter ;;
      8)  start_stack "full"; prompt_enter ;;
      9)  start_stack "infra"; prompt_enter ;;
      10) restart_core_services; prompt_enter ;;
      11) stop_services; prompt_enter ;;
      12) show_service_status; prompt_enter ;;
      13) run_smoke "core"; prompt_enter ;;
      14) run_smoke "full"; prompt_enter ;;
      15) database_menu ;;
      16) generate_default_env; prompt_enter ;;
      17) install_global_cli; prompt_enter ;;
      18) uninstall_global_cli; prompt_enter ;;
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
  ops dev | up          Start lightweight core stack (10 containers, recommended)
  ops full              Start full stack (all 20 containers)
  ops browser           Start core + browser automation
  ops workflow          Start core + temporal workflow
  ops doc               Start core + report service
  ops dispatch          Start core + durable dispatch workers
  ops fe                Start core + frontend apps
  ops xiaozhi           Start core + xiaozhi voice connector
  ops addin             Start office add-in services
  ops infra             Start postgres + redis only
  ops restart           Restart core backend services
  ops stop | down       Gracefully stop all running containers

Diagnostics & Testing:
  ops ps | status       Check container and HTTP health probe status
  ops smoke [core|full] Run live smoke test (core fast check or full e2e)

Database & Governance:
  ops db check          Verify database migrations and 95-table schema ownership
  ops db apply          Apply latest migrations and shared domain repairs
  ops db seed           Seed default roles, admin account, and default organization
  ops db seed-skills    Seed & activate all 14 built-in skill bundles
  ops db reset          Reset public schema (drops all tables)
  ops db export [path]  Export snapshot of initial platform data (SQL)

System Backup & Disaster Recovery:
  ops backup summary    View count of all exportable system assets
  ops backup export [p] Export full system backup archive (JSON)

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
    dispatch)
      start_stack "dev:dispatch"
      ;;
    fe)
      start_stack "dev:fe"
      ;;
    xiaozhi)
      start_stack "dev:xiaozhi"
      ;;
    addin)
      start_stack "addin"
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
      local smoke_type="${1:-core}"
      run_smoke "$smoke_type"
      ;;
    backup)
      local sub="${1:-summary}"
      shift || true
      case "$sub" in
        summary) backup_summary ;;
        export)  backup_export "${1:-}" ;;
        *)       backup_summary ;;
      esac
      ;;
    db)
      local sub="${1:-check}"
      case "$sub" in
        check)        database_status_check ;;
        apply)        apply_latest_database_schema ;;
        seed)         start_stack "infra"; wait_for_postgres; seed_platform_accounts_sql ;;
        seed-skills)  seed_builtin_skills ;;
        reset)        reset_public_schema ;;
        export)       export_initial_data ;;
        *)            database_menu ;;
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
