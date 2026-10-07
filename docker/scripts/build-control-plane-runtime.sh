#!/bin/bash
set -euo pipefail

export CHECKPOINT_DISABLE=1
export PRISMA_TELEMETRY_INFORMATION=false

REPO_ROOT="${PROJECT_ROOT:-/workspace}"
APP_ROOT="$REPO_ROOT/apps/backend/execution-control/control-plane"
STATE_DIR="$REPO_ROOT/.docker-state"
LOCK_DIR="$STATE_DIR/control-plane-runtime-build.lock.d"
STAMP_FILE="$STATE_DIR/control-plane-runtime-build.sha256"

mkdir -p "$STATE_DIR"

cleanup_lock() {
  if [ -d "$LOCK_DIR" ] && [ -f "$LOCK_DIR/owner" ]; then
    local owner_pid owner_host cur_host
    owner_pid="$(awk '{print $1}' "$LOCK_DIR/owner" 2>/dev/null || true)"
    owner_host="$(awk '{print $2}' "$LOCK_DIR/owner" 2>/dev/null || true)"
    cur_host="$(hostname 2>/dev/null || echo 'local')"
    if [ "$owner_pid" = "$$" ] && [ "$owner_host" = "$cur_host" ]; then
      rm -rf "$LOCK_DIR"
    fi
  fi
}

start_heartbeat() {
  local owner_pid="$$"
  (
    while [ -d "$LOCK_DIR" ]; do
      if ! kill -0 "$owner_pid" 2>/dev/null; then
        break
      fi
      touch "$LOCK_DIR/heartbeat" 2>/dev/null || break
      sleep 2
    done
  ) &
  HEARTBEAT_PID=$!
}

stop_heartbeat() {
  if [ -n "${HEARTBEAT_PID:-}" ]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
  fi
}

acquire_lock() {
  local max_wait=600
  local wait_count=0
  local cur_host
  cur_host="$(hostname 2>/dev/null || echo 'local')"

  while [ $wait_count -lt $max_wait ]; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '%s %s %s\n' "$$" "$cur_host" "$(date +%s)" > "$LOCK_DIR/owner"
      touch "$LOCK_DIR/heartbeat"
      start_heartbeat
      trap 'stop_heartbeat; cleanup_lock' EXIT
      return 0
    fi

    # 1. If owner is on the same host and its PID is dead, break lock immediately
    if [ -f "$LOCK_DIR/owner" ]; then
      local owner_pid owner_host
      owner_pid="$(awk '{print $1}' "$LOCK_DIR/owner" 2>/dev/null || true)"
      owner_host="$(awk '{print $2}' "$LOCK_DIR/owner" 2>/dev/null || true)"
      if [ -n "$owner_pid" ] && [ "$owner_host" = "$cur_host" ]; then
        if ! kill -0 "$owner_pid" 2>/dev/null; then
          echo "[control-plane-build] WARN: Lock owner PID $owner_pid on $cur_host is dead. Breaking dead lock." >&2
          rm -rf "$LOCK_DIR"
          continue
        fi
      fi
    fi

    # 2. Check heartbeat age
    if [ -f "$LOCK_DIR/heartbeat" ]; then
      local now last_mod age
      now=$(date +%s)
      last_mod=$(python3 -c "import os, sys; print(int(os.path.getmtime(sys.argv[1])))" "$LOCK_DIR/heartbeat" 2>/dev/null || echo "$now")
      age=$((now - last_mod))
      if [ $age -gt 30 ]; then
        echo "[control-plane-build] WARN: Lock heartbeat is stale (${age}s > 30s). Breaking abandoned lock." >&2
        rm -rf "$LOCK_DIR"
        continue
      fi
    elif [ -d "$LOCK_DIR" ]; then
      local dir_now dir_mod dir_age
      dir_now=$(date +%s)
      dir_mod=$(python3 -c "import os, sys; print(int(os.path.getmtime(sys.argv[1])))" "$LOCK_DIR" 2>/dev/null || echo "$dir_now")
      dir_age=$((dir_now - dir_mod))
      if [ $dir_age -gt 30 ]; then
        echo "[control-plane-build] WARN: Legacy or ownerless lock directory is stale (${dir_age}s > 30s). Breaking abandoned lock." >&2
        rm -rf "$LOCK_DIR"
        continue
      fi
    fi

    sleep 0.2
    wait_count=$((wait_count + 1))
  done

  echo "[control-plane-build] ERROR: Another build is actively running after waiting 120s. Exiting to avoid corruption." >&2
  exit 1
}

acquire_lock

fingerprint="$({
  node -v
  uname -m
  find "$APP_ROOT/src" -path "$APP_ROOT/src/generated" -prune -o -type f \( -name '*.ts' -o -name '*.json' \) -print0 | sort -z | xargs -0 sha256sum
  sha256sum "$APP_ROOT/package.json" "$APP_ROOT/tsconfig.json" "$APP_ROOT/nest-cli.json" "$APP_ROOT/prisma/schema.prisma"
  if [ -f "$REPO_ROOT/pnpm-lock.yaml" ]; then
    sha256sum "$REPO_ROOT/pnpm-lock.yaml"
  fi
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
