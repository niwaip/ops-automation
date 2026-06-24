# Report Service

This service remains physically under `apps/backend/domain/report`, but its
logical ownership has shifted to the future
`apps/backend/capabilities/document-domain/report`.

## Current Logical Mapping

- `report`: report task API and result orchestration
- `template`: report template management
- `render`: generator pipeline for word, excel, and pdf outputs
- `report`: analyzer and notification support for report-specific workflows

## Document-Domain Alignment

- `report` should be read as the `report` side of the future
  `apps/backend/capabilities/document-domain`.
- Template and render modules here remain report-oriented companions to the
  broader document-domain template and render layers.
- New cross-cutting document-domain features should align to the shared
  `document-domain` view instead of expanding `report` as an isolated silo.

## In Scope

- Report-oriented template management
- Report generation orchestration and output assembly
- Report-specific notification and analysis flows

## Out Of Scope

- General document template editing and studio authoring flows
- Unified runtime execution control
- Platform-wide release governance

## Migration Note

During the transition, `document-engine` and `report` should be treated as one
logical `document-domain`, not as unrelated standalone systems.
