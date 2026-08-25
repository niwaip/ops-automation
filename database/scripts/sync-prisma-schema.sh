#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE="$REPO_ROOT/apps/backend/core/platform/prisma/schema.prisma"
TARGET="$REPO_ROOT/apps/backend/execution-control/control-plane/prisma/schema.prisma"

cp "$SOURCE" "$TARGET"
echo "Synchronized generated Prisma mirror: $TARGET"
