#!/usr/bin/env bash

# Local-only rollout entrypoint for the task-orchestration durable dispatch path.
# It never targets production Compose and deliberately leaves risk/parallel flags off.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
START_SMART="$REPO_ROOT/docker/start-smart.sh"
MODE="${1:-all}"

if [[ ! -x "$START_SMART" ]]; then
  echo "Expected Docker launcher at $START_SMART" >&2
  exit 1
fi

run_record_stage() {
  (
    cd "$REPO_ROOT"
    PLANNING_DECISION_PERSIST_ENABLED=true \
      MODEL_INVOCATION_LEDGER_ENABLED=true \
      "$START_SMART" docker-compose.base.yml up -d --force-recreate ai-orchestrator
  )
}

run_dispatch_stage() {
  (
    cd "$REPO_ROOT"
    EXECUTION_OUTBOX_ENABLED=true \
      RESULT_REF_ENABLED=true \
      "$START_SMART" docker-compose.base.yml --profile durable-dispatch up -d --force-recreate \
        control-plane execution-dispatcher schedule-trigger
  )
}

run_memory_stage() {
  (
    cd "$REPO_ROOT"
    PLANNING_DECISION_PERSIST_ENABLED=true \
      MODEL_INVOCATION_LEDGER_ENABLED=true \
      SCOPED_MEMORY_PROMPT_ENABLED=true \
      "$START_SMART" docker-compose.base.yml up -d --force-recreate ai-orchestrator
  )
}

verify() {
  (
    cd "$REPO_ROOT"
    "$START_SMART" docker-compose.base.yml --profile durable-dispatch ps \
      ai-orchestrator control-plane execution-dispatcher schedule-trigger

    "$START_SMART" docker-compose.base.yml exec -T ai-orchestrator printenv |
      grep -E '^(PLANNING_DECISION_PERSIST_ENABLED|MODEL_INVOCATION_LEDGER_ENABLED)=(true)$'
    "$START_SMART" docker-compose.base.yml exec -T control-plane printenv |
      grep -E '^(EXECUTION_OUTBOX_ENABLED|RESULT_REF_ENABLED)=(true)$'
    "$START_SMART" docker-compose.base.yml --profile durable-dispatch exec -T execution-dispatcher printenv |
      grep -E '^CONTROL_PLANE_ROLE=dispatcher$|^EXECUTION_DISPATCHER_V2_ENABLED=true$'
    "$START_SMART" docker-compose.base.yml --profile durable-dispatch exec -T schedule-trigger printenv |
      grep -E '^CONTROL_PLANE_ROLE=schedule$|^SCHEDULE_FIRE_V2_ENABLED=true$'
  )
}

verify_memory() {
  (
    cd "$REPO_ROOT"
    "$START_SMART" docker-compose.base.yml exec -T ai-orchestrator printenv |
      grep -E '^SCOPED_MEMORY_PROMPT_ENABLED=true$'
  )
}

case "$MODE" in
  record)
    run_record_stage
    verify
    ;;
  dispatch)
    run_dispatch_stage
    verify
    ;;
  memory)
    run_memory_stage
    verify
    verify_memory
    ;;
  verify)
    verify
    ;;
  all)
    run_record_stage
    run_dispatch_stage
    verify
    ;;
  *)
    echo "Usage: $0 {record|dispatch|memory|verify|all}" >&2
    exit 2
    ;;
esac
