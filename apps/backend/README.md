# Backend Architecture Layout

`apps/backend` is organized by responsibility boundaries rather than by historical service buckets.

## Top-level Layers

- `platform/`: global governance and access capabilities.
- `sessions/`: session lifecycle and worker allocation.
- `domain/`: core business services and engines.
- `orchestration/`: cross-domain control planes and AI orchestration.
- `runtime/`: executors and workers.
- `shared/`: controlled shared backend contracts and infrastructure.
- `var/`: runtime data and generated artifacts.

## Current Governance Status

- Existing services have been migrated into `sessions/`, `domain/`, `orchestration/`, and `runtime/` where practical.
- `core/platform` is intentionally kept in place for now and will be split by module ownership in a later step.
- Runtime data should be written under `apps/backend/var/` rather than service source trees.
