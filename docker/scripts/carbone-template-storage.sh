#!/bin/bash

# Carbone template storage helper
# Supports backup, restore, and Docker volume migration for local template storage.

set -euo pipefail

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

if [ -n "${PROJECT_ROOT:-}" ]; then
  PROJECT_ROOT="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$PROJECT_ROOT")"
elif git -C "$(pwd)" rev-parse --show-toplevel >/dev/null 2>&1; then
  PROJECT_ROOT="$(git -C "$(pwd)" rev-parse --show-toplevel)"
else
  PROJECT_ROOT="$REPO_ROOT"
fi

CARBONE_DATA_DIR="${CARBONE_DATA_DIR:-$PROJECT_ROOT/.data/carbone-engine}"
TEMPLATES_DIR="${TEMPLATES_DIR:-$CARBONE_DATA_DIR/templates}"
OUTPUTS_DIR="${OUTPUTS_DIR:-$CARBONE_DATA_DIR/outputs}"
BACKUP_DIR="${BACKUP_DIR:-$CARBONE_DATA_DIR/backups}"

DEFAULT_TEMPLATE_VOLUME="${DEFAULT_TEMPLATE_VOLUME:-docker_carbone_templates}"
DEFAULT_OUTPUT_VOLUME="${DEFAULT_OUTPUT_VOLUME:-docker_carbone_outputs}"

usage() {
  cat <<EOF
Usage:
  # Run from the repository root or export PROJECT_ROOT to the repository root first
  ./docker/scripts/carbone-template-storage.sh status
  ./docker/scripts/carbone-template-storage.sh backup [archive_path]
  ./docker/scripts/carbone-template-storage.sh restore <archive_path> [--force]
  ./docker/scripts/carbone-template-storage.sh migrate-volume <templates|outputs|all> [template_volume] [output_volume]

Examples:
  ./docker/scripts/carbone-template-storage.sh status
  ./docker/scripts/carbone-template-storage.sh backup
  ./docker/scripts/carbone-template-storage.sh restore .data/carbone-engine/backups/carbone-storage-20250502-120000.tgz --force
  ./docker/scripts/carbone-template-storage.sh migrate-volume templates docker_carbone_templates
  ./docker/scripts/carbone-template-storage.sh migrate-volume all
  ./docker/scripts/carbone-template-storage.sh migrate-volume all docker_carbone_templates docker_carbone_outputs

Defaults:
  templates volume: $DEFAULT_TEMPLATE_VOLUME
  outputs volume:   $DEFAULT_OUTPUT_VOLUME
  local data dir:   $CARBONE_DATA_DIR
EOF
}

ensure_dir() {
  mkdir -p "$1"
}

require_file() {
  if [ ! -f "$1" ]; then
    echo "File not found: $1" >&2
    exit 1
  fi
}

count_files() {
  local dir="$1"
  local pattern="$2"
  find "$dir" -maxdepth 1 -type f -name "$pattern" 2>/dev/null | wc -l | tr -d ' '
}

print_known_volume_status() {
  local volume="$1"
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    local file_count
    file_count="$(docker run --rm -v "${volume}:/data" alpine sh -lc 'find /data -maxdepth 1 -type f | wc -l | tr -d " "' 2>/dev/null)"
    echo "  $volume: exists, files=$file_count"
  else
    echo "  $volume: missing"
  fi
}

show_status() {
  ensure_dir "$TEMPLATES_DIR"
  ensure_dir "$OUTPUTS_DIR"
  ensure_dir "$BACKUP_DIR"

  echo "Carbone Template Storage Status"
  echo "==============================="
  echo "PROJECT_ROOT:  $PROJECT_ROOT"
  echo "DATA_DIR:      $CARBONE_DATA_DIR"
  echo "TEMPLATES_DIR: $TEMPLATES_DIR"
  echo "OUTPUTS_DIR:   $OUTPUTS_DIR"
  echo "BACKUP_DIR:    $BACKUP_DIR"
  echo ""
  echo "Local files:"
  echo "  template json: $(count_files "$TEMPLATES_DIR" '*.json')"
  echo "  template docx: $(count_files "$TEMPLATES_DIR" '*.docx')"
  echo "  template xlsx: $(count_files "$TEMPLATES_DIR" '*.xlsx')"
  echo "  template pptx: $(count_files "$TEMPLATES_DIR" '*.pptx')"
  echo "  output files:  $(find "$OUTPUTS_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
  echo ""
  echo "Known Docker volumes:"
  print_known_volume_status "$DEFAULT_TEMPLATE_VOLUME"
  print_known_volume_status "$DEFAULT_OUTPUT_VOLUME"
  print_known_volume_status "compose_carbone_templates"
  print_known_volume_status "compose_carbone_outputs"
  echo ""

  if docker ps --format '{{.Names}}' | grep -q '^carbone-engine$'; then
    echo "Container:"
    docker inspect carbone-engine --format '  running: {{.State.Status}}{{println}}{{range .Mounts}}  mount: {{if .Name}}{{.Name}}{{else}}{{.Source}}{{end}} -> {{.Destination}}{{println}}{{end}}'
  else
    echo "Container:"
    echo "  carbone-engine is not running"
  fi
}

do_backup() {
  ensure_dir "$TEMPLATES_DIR"
  ensure_dir "$OUTPUTS_DIR"
  ensure_dir "$BACKUP_DIR"

  local archive_path="${1:-$BACKUP_DIR/carbone-storage-$(date +%Y%m%d-%H%M%S).tgz}"
  local archive_dir
  archive_dir="$(dirname "$archive_path")"
  ensure_dir "$archive_dir"

  tar -czf "$archive_path" \
    -C "$CARBONE_DATA_DIR" \
    templates outputs

  echo "Backup created:"
  echo "  $archive_path"
}

restore_dir_from_archive() {
  local archive_path="$1"
  local target_dir="$2"
  local entry_name="$3"
  local force_flag="$4"

  ensure_dir "$target_dir"

  if [ "$force_flag" != "--force" ] && [ -n "$(find "$target_dir" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
    echo "Target directory is not empty: $target_dir" >&2
    echo "Use --force to replace existing contents." >&2
    exit 1
  fi

  if [ "$force_flag" = "--force" ]; then
    find "$target_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi

  tar -xzf "$archive_path" -C "$CARBONE_DATA_DIR" "$entry_name"
}

do_restore() {
  local archive_path="${1:-}"
  local force_flag="${2:-}"

  if [ -z "$archive_path" ]; then
    echo "Missing archive path." >&2
    usage
    exit 1
  fi

  require_file "$archive_path"
  ensure_dir "$CARBONE_DATA_DIR"

  restore_dir_from_archive "$archive_path" "$TEMPLATES_DIR" "templates" "$force_flag"
  restore_dir_from_archive "$archive_path" "$OUTPUTS_DIR" "outputs" "$force_flag"

  echo "Restore completed from:"
  echo "  $archive_path"
}

copy_volume_to_dir() {
  local volume_name="$1"
  local target_dir="$2"

  if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "Docker volume not found: $volume_name" >&2
    exit 1
  fi

  ensure_dir "$target_dir"

  docker run --rm \
    -v "${volume_name}:/src" \
    -v "${target_dir}:/dest" \
    alpine sh -lc 'cp -av /src/. /dest/'
}

do_migrate_volume() {
  local kind="${1:-}"
  local template_volume="${2:-}"
  local output_volume="${3:-}"

  case "$kind" in
    templates)
      copy_volume_to_dir "${template_volume:-$DEFAULT_TEMPLATE_VOLUME}" "$TEMPLATES_DIR"
      ;;
    outputs)
      copy_volume_to_dir "${template_volume:-$DEFAULT_OUTPUT_VOLUME}" "$OUTPUTS_DIR"
      ;;
    all)
      copy_volume_to_dir "${template_volume:-$DEFAULT_TEMPLATE_VOLUME}" "$TEMPLATES_DIR"
      copy_volume_to_dir "${output_volume:-$DEFAULT_OUTPUT_VOLUME}" "$OUTPUTS_DIR"
      ;;
    *)
      echo "Invalid migrate-volume target: ${kind:-<empty>}" >&2
      usage
      exit 1
      ;;
  esac

  echo "Migration completed."
}

COMMAND="${1:-}"
shift || true

case "$COMMAND" in
  status)
    show_status
    ;;
  backup)
    do_backup "${1:-}"
    ;;
  restore)
    do_restore "${1:-}" "${2:-}"
    ;;
  migrate-volume)
    do_migrate_volume "${1:-}" "${2:-}"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    usage
    exit 1
    ;;
esac
