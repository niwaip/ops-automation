#!/usr/bin/env bash

# Validates the inputs that make a production deployment reproducible before
# Compose is allowed to render.  It deliberately does not run migrations or
# change database grants; those actions require explicit release authority.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
START_SMART="$REPO_ROOT/docker/start-smart.sh"
COMPOSE_POLICY_VALIDATOR="$SCRIPT_DIR/validate-production-compose-policy.mjs"
NODE_SERVICE_DOCKERFILE="$REPO_ROOT/docker/node-service/Dockerfile"
APPLICATION_TARGET_VALIDATOR="$REPO_ROOT/database/scripts/validate-application-database-targets.mjs"

usage() {
  cat <<'EOF'
Usage: docker/scripts/validate-production-delivery.sh [--verify-db-roles]

Required environment variables:
  CONTROL_PLANE_IMAGE        Immutable image reference ending in @sha256:<64 hex>
  AI_ORCHESTRATOR_IMAGE      Immutable image reference ending in @sha256:<64 hex>
  RUNTIME_WORKER_IMAGE       Immutable image reference ending in @sha256:<64 hex>
  CONTROL_PLANE_DATABASE_URL Dedicated Control Plane login URL
  AI_ORCHESTRATOR_DATABASE_URL Dedicated AI Orchestrator login URL
  REDIS_HOST, REDIS_PASSWORD, SESSION_BROKER_URL

--verify-db-roles additionally requires DATABASE_ADMIN_URL and the three
*_DB_LOGIN variables documented by database/scripts/verify-application-roles.mjs.
EOF
}

verify_db_roles=false
case "${1:-}" in
  '') ;;
  --verify-db-roles) verify_db_roles=true ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

require_digest() {
  local name="$1"
  local value="${!name}"
  if [[ ! "$value" =~ @sha256:[[:xdigit:]]{64}$ ]]; then
    echo "$name must be an immutable image reference ending in @sha256:<64 hex>" >&2
    exit 1
  fi
}

for variable in \
  CONTROL_PLANE_IMAGE AI_ORCHESTRATOR_IMAGE RUNTIME_WORKER_IMAGE \
  CONTROL_PLANE_DATABASE_URL AI_ORCHESTRATOR_DATABASE_URL \
  REDIS_HOST REDIS_PASSWORD SESSION_BROKER_URL; do
  require_env "$variable"
done

for variable in CONTROL_PLANE_IMAGE AI_ORCHESTRATOR_IMAGE RUNTIME_WORKER_IMAGE; do
  require_digest "$variable"
done

if [[ "$CONTROL_PLANE_DATABASE_URL" == "$AI_ORCHESTRATOR_DATABASE_URL" ]]; then
  echo "CONTROL_PLANE_DATABASE_URL and AI_ORCHESTRATOR_DATABASE_URL must use different credentials" >&2
  exit 1
fi

if [[ ! -x "$START_SMART" ]]; then
  echo "Expected Docker launcher at $START_SMART" >&2
  exit 1
fi
if [[ ! -f "$COMPOSE_POLICY_VALIDATOR" || ! -f "$NODE_SERVICE_DOCKERFILE" || ! -f "$APPLICATION_TARGET_VALIDATOR" ]]; then
  echo "Production validation dependency is missing" >&2
  exit 1
fi

node "$APPLICATION_TARGET_VALIDATOR"

rendered_compose_file="$(mktemp -t ops-production-compose.XXXXXX)"
trap 'rm -f "$rendered_compose_file"' EXIT
(
  cd "$REPO_ROOT"
  "$START_SMART" docker-compose.production.yml --profile release config --format json > "$rendered_compose_file"
)
node "$COMPOSE_POLICY_VALIDATOR" "$rendered_compose_file" "$NODE_SERVICE_DOCKERFILE"

if [[ "$verify_db_roles" == true ]]; then
  (
    cd "$REPO_ROOT"
    node database/scripts/verify-application-roles.mjs
  )
fi

echo "Production delivery inputs are valid. No migration, role grant, or deployment was performed."
