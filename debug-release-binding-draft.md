# [OPEN] release-binding-draft

## Symptom
- Release `8f2166c7-28ce-44b5-90a9-a551a3c349aa` shows: `当前 Release 还没有工件绑定记录，建议先绑定已验证 Workflow artifact。`
- User reports even historical binding also appears broken, and the release seems to have degraded back to draft.

## Expected
- A previously validated release should continue to resolve its effective artifact binding correctly.
- Historical binding records should remain queryable unless intentionally superseded or archived.

## Hypotheses
1. The release truly has no active artifact binding row in the database, either because it was never persisted or because a later publish/update path cleared it.
2. Historical binding rows still exist, but the backend query only reads the current active binding and filters historical rows incorrectly.
3. The release status/approval transition logic regressed this release from published/verified state back to draft, and the UI message is a secondary symptom.
4. The frontend capability/release detail page is reading a “current binding missing” response and over-rendering it as a draft-state regression.

## Evidence Plan
- Inspect release, draft, publish, and artifact-binding tables for release `8f2166c7-28ce-44b5-90a9-a551a3c349aa`.
- Read the backend service/query path that produces the “没有工件绑定记录” message.
- Compare persisted release status with UI-facing API response before deciding whether the issue is data, query logic, or state-transition logic.

## Status
- Session initialized; no business logic modified.
