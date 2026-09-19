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

log "Ensuring built-in skills are provisioned in database..."

cd "$REPO_ROOT/apps/backend/platform"

BUILTIN_SKILL_PROVISION_SKIP_SMOKE="${BUILTIN_SKILL_PROVISION_SKIP_SMOKE:-true}" \
pnpm exec ts-node src/commands/builtin-skill-provision.command.ts all bootstrap

log "Built-in skills provisioning check complete."
