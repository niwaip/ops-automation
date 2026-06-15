# Feature Structure

`features/` follows the business-step-first layout defined in
`docs/design/archive/Office-Addin-Structure-Refactor-Complete-Solution_v1.0.md`.

Canonical feature paths:
- `document-load/`
- `parameter-query/`
- `parameter-identify/`
- `draft/`
- `publish/`
- `workflow/`

Rules:
- Add new implementation under the canonical feature-step directories above.
- Inside each feature, prefer `shared/`, `word/`, and `excel/` splits.
- Do not introduce new business logic under historical host-first directories.

Legacy compatibility directories:
- `word/`
- `excel/`

These host-first directories remain only to avoid breaking the migration. New
imports should target the canonical feature-step paths directly.
