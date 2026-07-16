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
  log "Refreshing workspace dependency directories"
  rm -rf \
    "$WORKSPACE_ROOT/node_modules" \
    "$WORKSPACE_ROOT/apps/backend/core/platform/node_modules" \
    "$WORKSPACE_ROOT/apps/backend/execution-control/control-plane/node_modules" \
    2>/dev/null || true

  log "Installing workspace dependencies"
  (
    cd "$WORKSPACE_ROOT"
    pnpm install --no-frozen-lockfile
  )
}

main() {
  ensure_workspace_root
  mkdir -p "$STAMP_DIR"

  # pnpm must be available regardless of dependency cache state
  ensure_pnpm

  local current_fingerprint
  current_fingerprint="$(compute_fingerprint)"

  exec 9>"$LOCK_FILE"
  flock 9

  local previous_fingerprint=""
  if [[ -f "$STAMP_FILE" ]]; then
    previous_fingerprint="$(tr -d '\n\r' < "$STAMP_FILE")"
  fi

  if [[ -d "$WORKSPACE_ROOT/node_modules/.pnpm" ]] && [[ "$previous_fingerprint" == "$current_fingerprint" ]]; then
    log "Workspace dependencies are up to date"
    exit 0
  fi

  install_workspace_deps
  printf '%s\n' "$current_fingerprint" > "$STAMP_FILE"
  log "Workspace dependencies bootstrapped"
}

main "$@"