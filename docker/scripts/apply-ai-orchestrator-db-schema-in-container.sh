#!/usr/bin/env bash

# Applies only the AI Orchestrator-owned Prisma migration history.  This is
# intentionally a separate history from the shared Platform schema: the LLM
# Operation Registry is owned and evolved by AI Orchestrator.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AI_SCHEMA="$REPO_ROOT/apps/backend/intelligence/ai-orchestrator/prisma/schema.prisma"

log() {
  printf '[apply-ai-orchestrator-db-schema] %s\n' "$1"
}

run_ai_prisma() {
  pnpm --dir "$REPO_ROOT" --filter @ops/ai-orchestrator exec prisma "$@"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  log 'DATABASE_URL is required.'
  exit 1
fi

if [[ ! -f "$AI_SCHEMA" ]]; then
  log "AI Orchestrator Prisma schema is missing: $AI_SCHEMA"
  exit 1
fi

log 'Validating the AI Orchestrator Prisma schema...'
run_ai_prisma validate --schema "$AI_SCHEMA"

log 'Applying the AI Orchestrator-owned migration sequence...'
run_ai_prisma migrate deploy --schema "$AI_SCHEMA"

log 'Latest AI Orchestrator database schema is applied.'
