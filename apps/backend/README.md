# Backend Architecture Layout

`apps/backend` is organized by responsibility boundaries rather than by historical service buckets.

The repository is currently in a migration phase from the legacy layout to the
target architecture described in `docs/project_architecture_redesign.md`.

## Top-level Layers

- `core/`: legacy aggregate kept only during migration; `core/platform` is not a target boundary and should be split by ownership.
- `governance/`: target governance plane shell for identity, access, organization, and policy boundaries.
- `domain/`: core business services and engines.
- `orchestration/`: legacy orchestration shell retained during migration.
- `intelligence/`: planner and specialized AI services.
- `execution-control/`: control-plane and session broker responsibilities.
- `runtimes/`: executors and workers.
- `shared/`: controlled shared backend contracts and infrastructure.
- `var/`: runtime data and generated artifacts.

## Current Governance Status

- Existing services have been migrated into `domain/`, `intelligence/`, `execution-control/`, and `runtimes/` where practical.
- `core/platform` is intentionally kept only as a transition shell and will be retired after governance and registry-release modules move out.
- `governance/identity-access` now owns auth metadata, decorators, `RolesGuard`, `JwtAuthGuard`, `RbacGuard`, `jwt.strategy`, `ldap.strategy`, the main `auth.service` logic, auth request/response contracts, and the user identity-management slice for query, role assignment, and activation state; `modules/auth` and `modules/user` remain in `core/platform` only as controller/module compatibility shells.
- `governance/organization` now owns the main organization service logic, the organization controller, organization request DTOs, and explicit organization response contracts; `modules/organization` in `core/platform` is reduced to the module assembly shell plus legacy controller compatibility entrypoint.
- Legacy `sessions/` and `runtime/` directories are kept only as migration shells where needed.
- Runtime data should be written under `apps/backend/var/` rather than service source trees.

## Execution-Control Boundaries

- `execution-control/control-plane` owns only execution lifecycle orchestration, approval and takeover, input submission/resolution, and southbound runtime dispatch.
- `execution-control/session-broker` owns only session state, worker and browser resource allocation, leases and locks, freeze control, and runtime-session lifecycle.
- New execution write logic should enter `control-plane`; new session or resource coordination logic should enter `session-broker`.
- Capability-specific authoring, template editing, and release compilation should not be added to either of these services.

## Target Architecture

The target structure being introduced incrementally is:

- `governance/`: auth, organization, audit, and global policy boundaries.
- `intelligence/`: planner and specialized AI agents.
- `registry-release/`: design-time registries and the release manager.
- `execution-control/`: control-plane and session broker responsibilities.
- `capabilities/`: browser and document capability domains.
- `runtimes/`: stateless workers and executors.

## Shared Contracts

- Legacy shared contracts remain under `packages/contracts`.
- New architecture contracts are being introduced under `packages/backend-contracts/*`.
- New cross-service DTOs and manifests should prefer the new `backend-contracts`
  layout instead of being added to service-local source trees.

## Prisma Rule

- Any backend service that owns an independent `prisma/schema.prisma` must generate
  its Prisma client into a service-local path such as `src/generated/prisma`.
- Service code and maintenance scripts must import Prisma types and `PrismaClient`
  through the local generated client or a local wrapper like `src/prisma/client.ts`.
- New backend services must not rely on the shared default output under
  `node_modules/@prisma/client`, because multiple schemas in the monorepo will
  overwrite each other during `prisma generate`.
