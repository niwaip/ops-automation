#!/bin/bash
set -euo pipefail

REPO_ROOT="${PROJECT_ROOT:-/workspace}"
APP_ROOT="$REPO_ROOT/apps/backend/execution-control/control-plane"
STATE_DIR="$REPO_ROOT/.docker-state"
LOCK_DIR="$STATE_DIR/control-plane-runtime-build.lock.d"
STAMP_FILE="$STATE_DIR/control-plane-runtime-build.sha256"

mkdir -p "$STATE_DIR"
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  sleep 0.2
done
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

fingerprint="$({
  find "$APP_ROOT/src" -path "$APP_ROOT/src/generated" -prune -o -type f \( -name '*.ts' -o -name '*.json' \) -print0 | sort -z | xargs -0 sha256sum
  sha256sum "$APP_ROOT/package.json" "$APP_ROOT/tsconfig.json" "$APP_ROOT/nest-cli.json" "$APP_ROOT/prisma/schema.prisma"
} | sha256sum | awk '{print $1}')"

worker_entry="$APP_ROOT/dist/apps/backend/execution-control/control-plane/src/worker-main.js"
if [[ -f "$STAMP_FILE" ]] && [[ "$(tr -d '\n\r' < "$STAMP_FILE")" == "$fingerprint" ]] && [[ -f "$worker_entry" ]]; then
  echo "[control-plane-build] Runtime build is current"
  exit 0
fi

echo "[control-plane-build] Building one shared runtime snapshot"
cd "$APP_ROOT"
./node_modules/.bin/prisma generate
./node_modules/.bin/nest build

generated_source="$APP_ROOT/src/generated/prisma"
for generated_target in \
  "$APP_ROOT/dist/generated/prisma" \
  "$APP_ROOT/dist/app/src/generated/prisma" \
  "$APP_ROOT/dist/apps/backend/execution-control/control-plane/src/generated/prisma"
do
  rm -rf "$generated_target"
  mkdir -p "$(dirname "$generated_target")"
  cp -R "$generated_source" "$generated_target"
done

printf '%s\n' "$fingerprint" > "$STAMP_FILE"
echo "[control-plane-build] Runtime snapshot ready"
