# Debug Session: approvals-export-500

- **Status**: [OPEN]
- **Issue**: Exporting recorder session `recorder-debug-1781699322482` via `/ai/recorder-debug/export` returns HTTP 500 after approvals loop recording succeeded.
- **Debug Server**: `http://127.0.0.1:7777`
- **Log File**: `.dbg/trae-debug-log-approvals-export-500.ndjson`

## Reproduction Steps

1. Replay approvals recorder flow and persist session `recorder-debug-1781699322482`
2. POST `/ai/recorder-debug/export`
3. Observe HTTP 500 from ai-orchestrator

## Hypotheses & Verification

| ID  | Hypothesis                                                                                                                     | Likelihood | Effort | Evidence |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ | -------- |
| A   | `buildExportArtifacts()` fails when serializing `loopDraft` or `loopPlanPreview` for recorder sessions with iteration capture. | High       | Med    | Pending  |
| B   | Export metadata generation expects additional fields from executed commands and throws on this approvals session shape.        | Med        | Med    | Pending  |
| C   | `buildSkillPublishPayload()` or `runtimeMetadata` assembly contains a non-serializable or invalid field.                       | High       | Med    | Pending  |
| D   | The export endpoint fails downstream in parameter/output inference rather than in loop-specific logic.                         | Med        | Med    | Pending  |

## Log Evidence

- Pending

## Verification Conclusion

- Pending
