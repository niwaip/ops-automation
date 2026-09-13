# Dashboard memory investigation (2026-09-13)

## Finding

The dashboard requested 100 complete executions. The detail mapper exposed inputs
and results under multiple compatibility aliases, and normalized results retained
raw payloads. Contract attachments and HTML reports were therefore downloaded and
cached even though the dashboard only displayed titles and short descriptions.

Read-only measurements on the latest 100 local database rows:

| Measurement | Bytes |
| --- | ---: |
| Input JSON text | 33,381,771 |
| Normalized input JSON text | 33,874,147 |
| Result JSON text | 49,782,042 |
| Original serialized DTOs | 363,844,514 |
| Summary serialized DTOs | 181,159 |

DTO serialization shrank by 99.9502%. These numbers measure JSON bytes, not
compressed transfer size or browser process memory. The reported 1+ GB Edge
increase was not independently measured with a heap snapshot.

## Changes

- `GET /api/executions?view=summary` opts into bounded titles (160 characters),
  descriptions (600 characters), and execution status/timestamps. It omits full
  inputs, result bodies, and artifact payloads. Existing default list and detail
  responses remain compatible. Full results are available from execution detail.
- Dashboard uses the summary view and a separate React Query cache key.
- Collapsed inbox cards render at most 180 characters as text. Full Markdown is
  rendered on expansion, with a memoized content component.
- List request validation lives in its own DTO file.

The server currently still reads full database rows before projecting summaries.
A future database-level projection or persisted summary would reduce backend
allocation as well. Other consumers of the default full list API are unchanged.

## Validation

- Backend mapper and query tests: 9 passed, including requester scoping in both views.
- Frontend TypeScript check: passed.
- Edge dashboard reloaded; server logs confirmed `view=summary`; summary cards and
  inbox expand/collapse were verified.
- Frontend Vitest startup is blocked by the existing Vitest 4.1.10 / Vite 5
  `vite/module-runner` export incompatibility. Direct component SSR checks passed
  for bounded collapsed content and complete expanded text/links.
- Control Plane restarted through `./docker/start-smart.sh` and compiled runtime
  startup confirmed. Frontend changes loaded through Vite.
