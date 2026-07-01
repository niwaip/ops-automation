# [OPEN] execution-failed

## Symptom
- Execution `93779a73-482b-4b1f-b1ad-d29282dba64b` failed.
- User reports the related template test could replay normally, but the real execution result did not pass.

## Expected
- The real execution should behave consistently with the successful template test, or at least expose a clear runtime divergence with enough evidence.

## Hypotheses
1. The real execution used different input parameters from the template test, so the browser path diverged before the key action.
2. The published skill payload or release snapshot used by the real execution differs from the template-test payload that replayed successfully.
3. Control-plane planning/runtime rewriting changed the effective execution flow, loop draft, or session config between template test and production execution.
4. Runtime session state, login state, or target page data differed at execution time, causing a real downstream browser failure not present during template test.
5. The execution actually failed in result aggregation or status persistence, while the browser steps themselves completed more successfully than the final UI suggests.

## Evidence Plan
- Pull execution record, persisted request/result snapshot, and related logs for execution `93779a73-482b-4b1f-b1ad-d29282dba64b`.
- Compare execution payload and runtime traces against the corresponding template test path if available.
- Add instrumentation only if current persisted evidence cannot isolate the failing stage.

## Status
- Session initialized; no business logic modified.
