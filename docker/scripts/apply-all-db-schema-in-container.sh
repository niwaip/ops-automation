#!/usr/bin/env bash

# Development/bootstrap entrypoint for every Prisma migration history that
# shares the Ops database. Production uses the explicit release Job instead.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/apply-latest-db-schema-in-container.sh"
bash "$SCRIPT_DIR/apply-ai-orchestrator-db-schema-in-container.sh"
