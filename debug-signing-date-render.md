[OPEN] signing-date-render

# Debug Session: signing-date-render

## Context
- User request: continue debugging the template `1febbc18-1f17-4c49-a4b2-9bfb38fffeaf` e2e render issue without hardcoding, and restart Docker after backend changes.
- Observed symptoms:
  - Real workflow validation reaches `documentRender` and then times out on `/studio/render-resolved`.
  - Existing rendered output shows `締結日：` empty.
  - Re-rendered output from the control-plane script shows `締結日：[object Object]`.

## Scope
- Backend runtime path only.
- No business-logic modification before instrumentation evidence is collected.

## Initial Hypotheses
1. `contract.signingDate` is converted into a localized object before final render, but `render-resolved` still passes it into a scalar placeholder path.
2. `render-resolved` calls `templateWorkflowService.renderData()` and receives a malformed localized date structure for `contract.signingDate`.
3. The control-plane reproduction script builds render data differently from the formal workflow runtime, so `[object Object]` and timeout are two distinct failures with the same root field.
4. The timeout occurs inside the Carbone render path after normalized data expansion, possibly because the generated payload becomes unexpectedly large or structurally invalid.
5. Runtime compat mapping for `workflowInputParams` / `workflowInputPolicy` resolves `contract.signingDate_cn` and `contract.signingDate_jp` through an object selector instead of a scalar date string.

## Evidence Log
- Pending instrumentation.

## Next Step
- Start debug server.
- Add minimal instrumentation only.
- Reproduce through the real backend flow and compare pre-fix vs post-fix evidence.
