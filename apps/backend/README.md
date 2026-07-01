# Backend Architecture Layout

`apps/backend` is organized by target responsibility boundaries rather than by
historical service buckets.

The repository is in an active migration phase from the legacy layout to the
target architecture described in `docs/project_architecture_redesign.md` and
`docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md`.

## Top-level Layers

- `core/`: legacy aggregate kept only during migration; `core/platform` is a compatibility shell, not a long-term target boundary.
- `governance/`: identity, access, organization, audit, and policy boundaries.
- `intelligence/`: planner and specialized AI services.
- `registry-release/`: design-time registries and release-manager responsibilities.
- `execution-control/`: control-plane and session broker responsibilities.
- `capabilities/`: browser and document capability domains.
- `runtimes/`: executors and workers.
- `domain/`: legacy capability services kept during migration; new capability-domain work must not expand this layer.
- `orchestration/`: legacy orchestration shell retained only where compatibility still requires it.
- `shared/`: controlled shared backend contracts and infrastructure.
- `var/`: runtime data and generated artifacts.

## Current Migration Status

- `governance/*` and `execution-control/*` already carry real implementation ownership.
- `registry-release/*` and `capabilities/*` exist as target planes and must be preferred as the logical home for new design-time and capability-domain work.
- `core/platform` is intentionally kept only as a transition shell and will be retired after governance and registry-release modules move out.
- Top-level `apps/backend/index.ts` aggregation shell is gone; the backend plane is now documented by directory boundaries and local package/README ownership instead of a root barrel.
- Plane-level aggregation shells under `governance/`, `intelligence/`, `execution-control/`, and `runtimes/` are also gone; these top-level directories are now documented by directory boundaries and local package/README ownership instead of root barrels.
- `governance/identity-access` now owns auth metadata, decorators, `RolesGuard`, `JwtAuthGuard`, `RbacGuard`, `jwt.strategy`, `ldap.strategy`, auth service/controller/module entrypoints, auth request/response contracts, and the user identity-management slice for query, role assignment, activation state, and module/controller entrypoints; the old `core/platform/src/modules/{auth,user}` and `core/platform/src/dto/*` compatibility wrappers are gone, and `core/platform` now only retains bridge bindings for runtime repositories and reader tokens.
- `governance/organization` now owns the main organization service/controller/module entrypoints, organization request DTOs, explicit organization response contracts, and repository token contracts; the old `core/platform/src/modules/organization` and shared DTO wrappers are gone, and `core/platform` now only retains the bridge binding for organization repository access.
- Legacy `sessions/` and `runtime/` directories are kept only as migration shells where needed.
- Runtime data should be written under `apps/backend/var/` rather than service source trees.

## Freeze Rules

- `core/platform` compatibility shells may forward, assemble, or expose stable facades, but must not absorb new core business implementation.
- `domain/*` is in migration freeze for capability-domain growth; new browser or document capability requirements must go to the `capabilities/*` logical view first.
- `intelligence/ai-orchestrator/src/modules/planner/*` must remain focused on generic planning and delegation; new browser-domain internals must not be added there.
- `execution-control/*` must not receive release compilation, template authoring, or capability-domain design-time logic.
- New cross-service DTOs, manifests, and protocol types must not be added back into legacy paths when a `packages/backend-contracts/*` package is the logical target.

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

## Ownership Guidance

- New auth, user, organization, and policy logic belongs in `governance/*`.
- New skill, workflow, template-registry, agent-catalog, and release compilation logic belongs in `registry-release/*` logical ownership.
- New execution lifecycle, approval, takeover, session allocation, and runtime dispatch logic belongs in `execution-control/*`.
- New browser and document domain semantics, templates, rendering, recording, export, and runtime bridges belong in `capabilities/*` logical ownership.
- New worker-side atomic execution logic belongs in `runtimes/*`.

## Shared Contracts

- Legacy shared contracts remain under `packages/contracts` only as a migration compatibility package.
- New architecture contracts are being introduced under `packages/backend-contracts/*`.
- New cross-service DTOs and manifests should prefer the new `backend-contracts/*`
  layout instead of being added to service-local source trees or backfilled into
  `@ops/contracts`.

## Prisma Rule

- Any backend service that owns an independent `prisma/schema.prisma` must generate
  its Prisma client into a service-local path such as `src/generated/prisma`.
- Service code and maintenance scripts must import Prisma types and `PrismaClient`
  through the local generated client or a local wrapper like `src/prisma/client.ts`.
- New backend services must not rely on the shared default output under
  `node_modules/@prisma/client`, because multiple schemas in the monorepo will
  overwrite each other during `prisma generate`.
