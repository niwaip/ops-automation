# Legacy Contracts Compatibility Package

`packages/contracts` is a migration-era compatibility package for legacy shared
backend contracts.

## Freeze Rules

- Do not add new shared DTOs, manifests, events, or protocol types here.
- New shared backend contracts must go to `packages/backend-contracts/*`.
- Keep this package only for compatibility exports that are still consumed by
  callers not yet migrated.

## Exit Goal

- Migrate active consumers to `packages/backend-contracts/*`.
- Shrink this package to compatibility forwarding only.
- Remove it after the remaining consumers have switched.
