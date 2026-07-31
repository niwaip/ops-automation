#!/bin/bash
set -euo pipefail

WORKSPACE_ROOT="${WORKSPACE_ROOT:-/workspace}"
LOCK_FILE="${WORKSPACE_BOOTSTRAP_LOCK_FILE:-$WORKSPACE_ROOT/.docker-workspace-bootstrap.lock}"
STAMP_DIR="${WORKSPACE_BOOTSTRAP_STAMP_DIR:-$WORKSPACE_ROOT/.docker-state}"
STAMP_FILE="$STAMP_DIR/workspace-deps.sha256"
PNPM_VERSION="${WORKSPACE_PNPM_VERSION:-8.12.0}"
REGISTRY_URL="${WORKSPACE_NPM_REGISTRY:-https://registry.npmmirror.com}"

log() {
  printf '[bootstrap-workspace-deps] %s\n' "$1"
}

ensure_workspace_root() {
  if [[ ! -d "$WORKSPACE_ROOT" ]]; then
    log "Workspace root not found: $WORKSPACE_ROOT"
    exit 1
  fi

  if [[ ! -f "$WORKSPACE_ROOT/pnpm-lock.yaml" ]]; then
    log "Missing pnpm-lock.yaml under $WORKSPACE_ROOT"
    exit 1
  fi
}

compute_fingerprint() {
  (
    cd "$WORKSPACE_ROOT"
    {
      sha256sum pnpm-lock.yaml
      find . \
        -name 'node_modules' -prune -o \
        -name '.pnpm-store' -prune -o \
        -name '.git' -prune -o \
        -name 'dist' -prune -o \
        -name 'package.json' -print0 \
        | sort -z \
        | xargs -0 sha256sum 2>/dev/null || true
    } | sha256sum | awk '{print $1}'
  )
}

ensure_pnpm() {
  log "Ensuring pnpm@$PNPM_VERSION is available"
  corepack enable
  COREPACK_NPM_REGISTRY="$REGISTRY_URL" corepack prepare "pnpm@$PNPM_VERSION" --activate
  pnpm config set registry "$REGISTRY_URL" 2>/dev/null || true
}

install_workspace_deps() {
  log "Installing workspace dependencies"
  local max_retries=3
  local attempt=0

  pushd "$WORKSPACE_ROOT" > /dev/null
  until pnpm install --no-frozen-lockfile --shamefully-hoist; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$max_retries" ]; then
      log "ERROR: pnpm install failed after $max_retries attempts"
      # Sleep a bit in case another container is still writing node_modules
      sleep 5
      log "Final attempt with --force flag..."
      if pnpm install --no-frozen-lockfile --shamefully-hoist --force; then
        popd > /dev/null
        return 0
      else
        local rc=$?
        popd > /dev/null
        return $rc
      fi
    fi
    log "pnpm install failed (attempt $attempt/$max_retries), retrying in 5s..."
    sleep 5
  done
  popd > /dev/null
}

main() {
  ensure_workspace_root
  mkdir -p "$STAMP_DIR"

  # Acquire exclusive lock FIRST, before any shared-state mutation.
  # ensure_pnpm (corepack activate) and pnpm install both write to shared
  # node_modules/.pnpm and must never race with another container.
  exec 9>"$LOCK_FILE"
  flock 9

  ensure_pnpm

  local current_fingerprint
  current_fingerprint="$(compute_fingerprint)"

  local previous_fingerprint=""
  if [[ -f "$STAMP_FILE" ]]; then
    previous_fingerprint="$(tr -d '\n\r' < "$STAMP_FILE")"
  fi

  if [[ -d "$WORKSPACE_ROOT/node_modules/.pnpm" ]] && [[ "$previous_fingerprint" == "$current_fingerprint" ]]; then
    log "Workspace dependencies are up to date"
    exit 0
  fi

  if ! install_workspace_deps; then
    log "FATAL: pnpm install failed. Skipping stamp file to force retry on next start."
    exit 1
  fi

  # Verify critical tooling was actually installed.
  # The pnpm install can exit 0 yet leave packages missing (e.g. typescript)
  # if node_modules/.pnpm existed but was incomplete.
  if [[ ! -x "$WORKSPACE_ROOT/node_modules/.bin/tsc" ]]; then
    if [[ -n "${BOOTSTRAP_RETRY:-}" ]]; then
      log "FATAL: tsc still missing after retry — giving up"
      exit 1
    fi
    log "FATAL: tsc binary missing after pnpm install — stale node_modules detected"
    log "Removing node_modules and retrying..."
    rm -rf "$WORKSPACE_ROOT/node_modules"
    BOOTSTRAP_RETRY=1 exec "$0" "$@"
  fi

  # Only write stamp file if node_modules actually exists after install
  if [[ -d "$WORKSPACE_ROOT/node_modules/.pnpm" ]]; then
    printf '%s\n' "$current_fingerprint" > "$STAMP_FILE"
    log "Workspace dependencies bootstrapped"
  else
    log "FATAL: node_modules/.pnpm not found after install, stamp file not updated"
    exit 1
  fi
}

main "$@"