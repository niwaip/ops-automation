#!/usr/bin/env bash

# Operator-only wrapper for the production database release gate. Application
# `up` commands intentionally never call either of these explicit jobs.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
START_SMART="$REPO_ROOT/docker/start-smart.sh"

usage() {
  cat <<'EOF'
Usage: docker/scripts/run-production-release-job.sh <migrate|verify-db-roles>

Required environment variables:
  CONTROL_PLANE_IMAGE, AI_ORCHESTRATOR_IMAGE, RUNTIME_WORKER_IMAGE
  CONTROL_PLANE_DATABASE_URL, AI_ORCHESTRATOR_DATABASE_URL
  REDIS_HOST, REDIS_PASSWORD, SESSION_BROKER_URL

`migrate` additionally requires CONTROL_PLANE_MIGRATION_DATABASE_URL and
AI_ORCHESTRATOR_MIGRATION_DATABASE_URL. These must be release-only
administrator credentials. Application DATABASE_URL values are used only to
render the production contract and are never passed to schema-migrator.

`verify-db-roles` additionally requires DATABASE_ADMIN_URL and
CONTROL_PLANE_DB_LOGIN, AI_ORCHESTRATOR_DB_LOGIN, RUNTIME_WORKER_DB_LOGIN.
Run it only after the DBA has applied database/security/roles.sql following a
successful migration Job.
EOF
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

action="${1:-}"
case "$action" in
  migrate|verify-db-roles) ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

for variable in \
  CONTROL_PLANE_IMAGE AI_ORCHESTRATOR_IMAGE RUNTIME_WORKER_IMAGE \
  CONTROL_PLANE_DATABASE_URL AI_ORCHESTRATOR_DATABASE_URL \
  REDIS_HOST REDIS_PASSWORD SESSION_BROKER_URL; do
  require_env "$variable"
done

if [[ "$action" == 'migrate' ]]; then
  for variable in CONTROL_PLANE_MIGRATION_DATABASE_URL AI_ORCHESTRATOR_MIGRATION_DATABASE_URL; do
    require_env "$variable"
  done
else
  for variable in DATABASE_ADMIN_URL CONTROL_PLANE_DB_LOGIN AI_ORCHESTRATOR_DB_LOGIN RUNTIME_WORKER_DB_LOGIN; do
    require_env "$variable"
  done
fi

cd "$REPO_ROOT"
bash "$SCRIPT_DIR/validate-production-delivery.sh"

if [[ "$action" == 'migrate' ]]; then
  echo 'Running explicit production schema Release Job...'
  "$START_SMART" docker-compose.production.yml --profile release run --rm schema-migrator
  echo 'Schema Release Job completed. DBA must now apply database/security/roles.sql before role verification.'
else
  echo 'Verifying application database roles after the DBA grant step...'
  "$START_SMART" docker-compose.production.yml --profile release run --rm database-role-verifier
  echo 'Database role verification completed. Application deployment remains a separate action.'
fi
