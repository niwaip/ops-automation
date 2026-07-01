# Backend Contracts

Shared backend contracts for the backend architecture migration.

This directory is a container for focused contract packages. It is not a
runtime implementation layer and should only hold stable cross-service
protocols, DTOs, manifests, and related type definitions.

## Migration Rules

- `packages/backend-contracts/*` is the target home for new backend shared contracts.
- New cross-service DTOs, manifests, and protocol types must not be added back
  into `@ops/contracts`.
- Each contract package should grow as a source-owned package with `src/`,
  package-local TypeScript config, and a reproducible build entry.
- Business logic, framework adapters, and service-specific persistence types do
  not belong in this directory.

## Package Layout

Current focused contract packages include:

- `common-dto`: shared primitive DTOs and audit stamps.
- `error-codes`: stable cross-service error code constants and unions.
- `execution-core`: execution statuses, approval statuses, event types, and execution semantic contracts.
- `execution-events`: execution event envelopes shared across services.
- `release-manifest`: release manifest and binding definitions.
- `runtime-capability-contract`: runtime invocation request/result contracts.
- `agent-profile`: agent profile metadata contracts.
- `agent-execution-protocol`: agent start/progress/result protocol contracts.
