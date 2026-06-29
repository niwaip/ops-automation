[OPEN] login-500-final-anchors

## Symptom

- After deleting the final local `Release*` compatibility anchors and converging `CapabilityReleaseModule` providers to package classes, `POST /api/auth/login` regressed from `400` to `500`.
- `ops-platform` container exits with code `1` shortly after startup.

## Scope

- Target area: `apps/backend/core/platform/src/modules/capability-release/capability-release.module.ts`
- Related deletion batch: `apps/backend/core/platform/src/release-manager/release/*.service.ts` except `index.ts`

## Hypotheses

1. A Nest provider required by `CapabilityReleaseService` still resolves by the old local class token, and removing the bridge changed DI identity.
2. One of the package-side `Release*` classes is not exported or injectable correctly at runtime in the container build, even though local typecheck/build pass.
3. The container exits before Nest bootstrap completes because module import evaluation still references a deleted local file in built output.
4. `CapabilityReleaseModule` now registers package providers directly, but another module or test-only import still expects the local compatibility layer side effects.
5. The login `500` is only a proxy symptom; the real failure is `ops-platform` process crash during startup, likely with a missing module or unresolved dependency stack after the last deletion batch.

## Evidence Log

- `docker logs ops-platform` shows Nest startup fails on:
  `Nest can't resolve dependencies of the ReleaseDraftService (?, CapabilityReleaseSkillDraftService, CapabilityReleaseTemporalSchemaService, ReleaseQueryService, ReleaseSupportService).`
- The same log pinpoints the missing constructor token as `PrismaService at index [0]`.
- `apps/backend/registry-release/release-manager/src/release/release-draft.service.ts` imports `PrismaService` from `../../../../core/platform/src/prisma/prisma.service`.
- The built package artifact resolves that import to:
  `apps/backend/registry-release/release-manager/dist/core/platform/src/prisma/prisma.service.js`
  which is a copied class inside package `dist`, not the platform module's registered `PrismaService` provider token.

## Analysis

- Hypothesis 1 is confirmed: package-side runtime services that depend on platform infrastructure use duplicated runtime class tokens after package build.
- Hypothesis 5 is confirmed: login `500` is only the proxy symptom of `ops-platform` bootstrap failure.
- Hypothesis 3 is rejected for this batch: no deleted-file module resolution error appears before bootstrap; the failure is DI token identity mismatch.

## Planned Fix

- Restore only the infrastructure-bound local adapters:
  - `ReleaseQueryService`
  - `ReleaseSupportService`
  - `ReleaseLifecycleService`
  - `ReleaseDraftService`
- Each adapter subclasses the package implementation but uses local platform constructor tokens (`PrismaService`, `TemporalWorkflowService`, `CapabilityReleaseSkillDraftService`, `CapabilityReleaseTemporalSchemaService`).
- Bridge package tokens back to these local adapters inside `CapabilityReleaseModule`.

## Fix Applied

- Added local adapters:
  - `apps/backend/core/platform/src/release-manager/release/release-query.service.ts`
  - `apps/backend/core/platform/src/release-manager/release/release-support.service.ts`
  - `apps/backend/core/platform/src/release-manager/release/release-lifecycle.service.ts`
  - `apps/backend/core/platform/src/release-manager/release/release-draft.service.ts`
- Restored a local `ReleaseAuditAccessorDepsService` adapter:
  - `apps/backend/core/platform/src/release-manager/release/release-audit-accessor-deps.service.ts`
- Updated `CapabilityReleaseModule` so package tokens resolve to these local adapters for infrastructure-bound providers.

## Post-Fix Evidence

- `pnpm --filter @ops/platform run typecheck` passed.
- `pnpm --filter @ops/platform run build` passed.
- After `./docker/start-smart.sh compose/docker-compose.base.yml up -d --force-recreate platform`, `docker ps` shows `ops-platform` stays `Up`.
- The previous startup crash `ReleaseDraftService -> PrismaService` no longer appears.
- The follow-up startup crash `ReleaseAuditAccessorDepsService -> CapabilityReleaseAuditService` no longer appears after restoring the local adapter.
- `POST http://192.168.100.143:5173/api/auth/login` now returns `400 Bad Request` again instead of `500 Internal Server Error`.

## Current Conclusion

- Directly removing the final local compatibility anchors was too aggressive for providers whose package build duplicates platform runtime class tokens.
- The safe boundary is:
  - keep package-facing convergence for pure package/provider chains
  - retain local adapters for providers that inject platform infrastructure or platform runtime services

## Next Step

- Capture container startup stack trace and process exit details before any fix.
