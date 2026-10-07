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

CARBONE_DATA_DIR="${CARBONE_DATA_DIR:-$PROJECT_ROOT/apps/backend/var}"
TEMPLATES_DIR="${TEMPLATES_DIR:-$CARBONE_DATA_DIR/templates/document-engine}"
OUTPUTS_DIR="${OUTPUTS_DIR:-$CARBONE_DATA_DIR/outputs/document-engine}"
BACKUP_DIR="${BACKUP_DIR:-$CARBONE_DATA_DIR/backups/document-engine}"

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

  local template_count
  template_count="$(find "$TEMPLATES_DIR" -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$template_count" -eq 0 ]; then
    echo "[WARN] TEMPLATES_DIR ($TEMPLATES_DIR) contains 0 files. Backing up an empty template directory." >&2
  fi

  local archive_path="${1:-$BACKUP_DIR/carbone-storage-$(date +%Y%m%d-%H%M%S).tgz}"
  local archive_dir
  archive_dir="$(dirname "$archive_path")"
  ensure_dir "$archive_dir"

  # Stage data into canonical layout to correctly capture custom TEMPLATES_DIR and OUTPUTS_DIR
  local staging_dir
  staging_dir="$(mktemp -d -t carbone-backup.XXXXXX)"
  mkdir -p "$staging_dir/templates/document-engine" "$staging_dir/outputs/document-engine"

  if [ -d "$TEMPLATES_DIR" ]; then
    local t_count
    t_count="$(find "$TEMPLATES_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$t_count" -gt 0 ]; then
      if ! cp -a "$TEMPLATES_DIR/." "$staging_dir/templates/document-engine/"; then
        echo "Error: Failed to copy templates to staging directory: $TEMPLATES_DIR" >&2
        rm -rf "$staging_dir"
        exit 1
      fi
    fi
  fi

  if [ -d "$OUTPUTS_DIR" ]; then
    local o_count
    o_count="$(find "$OUTPUTS_DIR" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l | tr -d ' ')"
    if [ "$o_count" -gt 0 ]; then
      if ! cp -a "$OUTPUTS_DIR/." "$staging_dir/outputs/document-engine/"; then
        echo "Error: Failed to copy outputs to staging directory: $OUTPUTS_DIR" >&2
        rm -rf "$staging_dir"
        exit 1
      fi
    fi
  fi

  # Write backup manifest with file counts and timestamp
  cat <<MANIFEST > "$staging_dir/manifest.txt"
created_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
templates_dir: $TEMPLATES_DIR
outputs_dir: $OUTPUTS_DIR
template_files: $(find "$staging_dir/templates/document-engine" -type f 2>/dev/null | wc -l | tr -d ' ')
output_files: $(find "$staging_dir/outputs/document-engine" -type f 2>/dev/null | wc -l | tr -d ' ')
MANIFEST

  if ! tar -czf "$archive_path" \
    -C "$staging_dir" \
    manifest.txt templates/document-engine outputs/document-engine; then
    echo "Error: Failed to create tar archive: $archive_path" >&2
    rm -rf "$staging_dir"
    exit 1
  fi

  rm -rf "$staging_dir"

  local digest=""
  if command -v sha256sum >/dev/null 2>&1; then
    digest="$(sha256sum "$archive_path" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    digest="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  fi
  if [ -n "$digest" ]; then
    printf '%s  %s\n' "$digest" "$(basename "$archive_path")" > "$archive_path.sha256"
  fi

  echo "Backup created:"
  echo "  $archive_path"
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

  # 1. Verify checksum if present (binds to current archive file, not old path)
  if [ -f "$archive_path.sha256" ]; then
    local expected_hash actual_hash=""
    expected_hash="$(awk '{print $1}' "$archive_path.sha256" | head -n 1 | tr -d ' \r\n')"
    if [ -n "$expected_hash" ]; then
      if command -v sha256sum >/dev/null 2>&1; then
        actual_hash="$(sha256sum "$archive_path" | awk '{print $1}' | tr -d ' \r\n')"
      elif command -v shasum >/dev/null 2>&1; then
        actual_hash="$(shasum -a 256 "$archive_path" | awk '{print $1}' | tr -d ' \r\n')"
      fi
      if [ -n "$actual_hash" ] && [ "$actual_hash" != "$expected_hash" ]; then
        echo "Error: Checksum verification failed for $archive_path (expected $expected_hash, got $actual_hash)" >&2
        exit 1
      fi
    fi
  fi

  # 2. Verify archive integrity before touching any target directories
  if ! tar -tzf "$archive_path" >/dev/null 2>&1; then
    echo "Error: Archive is corrupted or not a valid gzip tarball: $archive_path" >&2
    exit 1
  fi

  # 3. Extract into an isolated staging directory first
  local staging_dir
  staging_dir="$(mktemp -d -t carbone-restore.XXXXXX)"
  if ! tar -xzf "$archive_path" -C "$staging_dir" 2>/dev/null; then
    echo "Error: Failed to extract archive into staging directory: $archive_path" >&2
    rm -rf "$staging_dir"
    exit 1
  fi

  # 4. Detect canonical vs legacy structure and validate structure
  local src_templates=""
  local src_outputs=""

  if [ -d "$staging_dir/templates/document-engine" ]; then
    src_templates="$staging_dir/templates/document-engine"
  elif [ -d "$staging_dir/templates" ]; then
    src_templates="$staging_dir/templates"
  fi

  if [ -d "$staging_dir/outputs/document-engine" ]; then
    src_outputs="$staging_dir/outputs/document-engine"
  elif [ -d "$staging_dir/outputs" ]; then
    src_outputs="$staging_dir/outputs"
  fi

  # Require valid archive structure: at least templates or outputs must exist
  if [ -z "$src_templates" ] && [ -z "$src_outputs" ]; then
    echo "Error: Archive has invalid structure. No templates or outputs directory found in $archive_path" >&2
    rm -rf "$staging_dir"
    exit 1
  fi

  # 4b. Validate manifest file counts if manifest.txt is present
  if [ -f "$staging_dir/manifest.txt" ]; then
    local expected_t_count expected_o_count actual_t_count actual_o_count
    expected_t_count="$(grep -E '^template_files:' "$staging_dir/manifest.txt" | awk '{print $2}' | tr -d ' \r\n')"
    expected_o_count="$(grep -E '^output_files:' "$staging_dir/manifest.txt" | awk '{print $2}' | tr -d ' \r\n')"
    if [ -n "$expected_t_count" ] && [ -n "$src_templates" ]; then
      actual_t_count="$(find "$src_templates" -type f 2>/dev/null | wc -l | tr -d ' ')"
      if [ "$actual_t_count" -ne "$expected_t_count" ]; then
        echo "Error: Manifest template count mismatch (expected $expected_t_count, got $actual_t_count)" >&2
        rm -rf "$staging_dir"
        exit 1
      fi
    fi
    if [ -n "$expected_o_count" ] && [ -n "$src_outputs" ]; then
      actual_o_count="$(find "$src_outputs" -type f 2>/dev/null | wc -l | tr -d ' ')"
      if [ "$actual_o_count" -ne "$expected_o_count" ]; then
        echo "Error: Manifest output count mismatch (expected $expected_o_count, got $actual_o_count)" >&2
        rm -rf "$staging_dir"
        exit 1
      fi
    fi
  fi

  # 5. Check if targets already exist and contain files when --force is not specified
  ensure_dir "$TEMPLATES_DIR"
  ensure_dir "$OUTPUTS_DIR"

  if [ "$force_flag" != "--force" ]; then
    local has_existing_files=false
    if [ -n "$(find "$TEMPLATES_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
      echo "Target directory is not empty: $TEMPLATES_DIR" >&2
      has_existing_files=true
    fi
    if [ -n "$(find "$OUTPUTS_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
      echo "Target directory is not empty: $OUTPUTS_DIR" >&2
      has_existing_files=true
    fi
    if [ "$has_existing_files" = true ]; then
      echo "Use --force to replace existing contents." >&2
      rm -rf "$staging_dir"
      exit 1
    fi
  fi

  # 6. Safe staged restore: copy to new staging destinations first to ensure cp succeeds
  local dest_staging_t=""
  local dest_staging_o=""

  if [ -n "$src_templates" ]; then
    dest_staging_t="$(mktemp -d -t carbone-rest-tmpl.XXXXXX)"
    if ! cp -a "$src_templates/." "$dest_staging_t/"; then
      echo "Error: Failed to copy extracted templates to staging" >&2
      rm -rf "$dest_staging_t" "$staging_dir"
      exit 1
    fi
  fi

  if [ -n "$src_outputs" ]; then
    dest_staging_o="$(mktemp -d -t carbone-rest-out.XXXXXX)"
    if ! cp -a "$src_outputs/." "$dest_staging_o/"; then
      echo "Error: Failed to copy extracted outputs to staging" >&2
      rm -rf "${dest_staging_t:-}" "$dest_staging_o" "$staging_dir"
      exit 1
    fi
  fi

  # 7. Safe replacement of targets (with rollback if switch fails)
  local t_bak=""
  local o_bak=""

  if [ "$force_flag" = "--force" ]; then
    # Phase 7a: Create safety backups of BOTH directories first (non-destructive)
    if [ -n "$dest_staging_t" ] && [ -d "$TEMPLATES_DIR" ]; then
      if [ -n "$(find "$TEMPLATES_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
        t_bak="$(mktemp -d -t carbone-tmpl-bak.XXXXXX)"
        if ! cp -a "$TEMPLATES_DIR/." "$t_bak/"; then
          echo "Error: Failed to create safety backup of existing templates" >&2
          rm -rf "${dest_staging_t:-}" "${dest_staging_o:-}" "$t_bak" "$staging_dir"
          exit 1
        fi
      fi
    fi

    if [ -n "$dest_staging_o" ] && [ -d "$OUTPUTS_DIR" ]; then
      if [ -n "$(find "$OUTPUTS_DIR" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
        o_bak="$(mktemp -d -t carbone-out-bak.XXXXXX)"
        if ! cp -a "$OUTPUTS_DIR/." "$o_bak/"; then
          echo "Error: Failed to create safety backup of existing outputs" >&2
          rm -rf "${dest_staging_t:-}" "${dest_staging_o:-}" "${t_bak:-}" "$o_bak" "$staging_dir"
          exit 1
        fi
      fi
    fi

    # Phase 7b: Only clear targets AFTER all backups have successfully completed
    if [ -n "$dest_staging_t" ] && [ -d "$TEMPLATES_DIR" ]; then
      find "$TEMPLATES_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    fi
    if [ -n "$dest_staging_o" ] && [ -d "$OUTPUTS_DIR" ]; then
      find "$OUTPUTS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    fi
  fi

  local restore_failed=false
  if [ -n "$dest_staging_t" ]; then
    if ! cp -a "$dest_staging_t/." "$TEMPLATES_DIR/"; then
      echo "Error: Failed to copy templates into $TEMPLATES_DIR" >&2
      restore_failed=true
    fi
  fi

  if [ "$restore_failed" = false ] && [ -n "$dest_staging_o" ]; then
    if ! cp -a "$dest_staging_o/." "$OUTPUTS_DIR/"; then
      echo "Error: Failed to copy outputs into $OUTPUTS_DIR" >&2
      restore_failed=true
    fi
  fi

  if [ "$restore_failed" = true ]; then
    # Phase 7c: Rollback from backup if available, checking each copy command
    local rollback_failed=false
    if [ -n "$t_bak" ] && [ -d "$t_bak" ]; then
      find "$TEMPLATES_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      if ! cp -a "$t_bak/." "$TEMPLATES_DIR/"; then
        echo "CRITICAL: Failed to rollback templates into $TEMPLATES_DIR!" >&2
        rollback_failed=true
      fi
    fi
    if [ -n "$o_bak" ] && [ -d "$o_bak" ]; then
      find "$OUTPUTS_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
      if ! cp -a "$o_bak/." "$OUTPUTS_DIR/"; then
        echo "CRITICAL: Failed to rollback outputs into $OUTPUTS_DIR!" >&2
        rollback_failed=true
      fi
    fi

    rm -rf "${dest_staging_t:-}" "${dest_staging_o:-}" "$staging_dir"

    if [ "$rollback_failed" = true ]; then
      echo "CRITICAL: Restore failed and rollback was incomplete! Safety backups preserved for manual recovery at:" >&2
      [ -n "$t_bak" ] && [ -d "$t_bak" ] && echo "  Templates backup: $t_bak" >&2
      [ -n "$o_bak" ] && [ -d "$o_bak" ] && echo "  Outputs backup:   $o_bak" >&2
      exit 1
    else
      rm -rf "${t_bak:-}" "${o_bak:-}"
      echo "Error: Restore failed. Existing data was restored from safety backup." >&2
      exit 1
    fi
  fi

  rm -rf "${dest_staging_t:-}" "${dest_staging_o:-}" "${t_bak:-}" "${o_bak:-}" "$staging_dir"

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
