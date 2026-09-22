#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

log() {
  printf '[seed-builtin-skills] %s\n' "$1"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "DATABASE_URL is not set. Skipping built-in skills seeding."
  exit 0
fi

ensure_dependencies() {
  if [[ ! -d "$REPO_ROOT/apps/backend/registry-release/skill-registry/dist" ]]; then
    log "Required package @ops/skill-registry dist missing, building shared backend packages..."
    CI=true pnpm --dir "$REPO_ROOT" --filter @ops/platform exec prisma generate --schema ./prisma/schema.prisma || true
    CI=true pnpm --dir "$REPO_ROOT" \
      --filter @ops/identity-access \
      --filter @ops/organization \
      --filter @ops/workflow-registry \
      --filter @ops/skill-registry \
      --filter @ops/release-manager \
      --filter @ops/workbench \
      --filter @ops/im-gateway \
      --filter @ops/system-backup run build || true
  fi
}

log "Ensuring built-in skills are provisioned in database..."

ensure_dependencies

cd "$REPO_ROOT/apps/backend/platform"

BUILTIN_SKILL_AUTO_ACTIVATE="${BUILTIN_SKILL_AUTO_ACTIVATE:-true}" \
BUILTIN_SKILL_PROVISION_SKIP_SMOKE="${BUILTIN_SKILL_PROVISION_SKIP_SMOKE:-true}" \
pnpm exec ts-node src/commands/builtin-skill-provision.command.ts all bootstrap

log "Built-in skills provisioning check complete."
