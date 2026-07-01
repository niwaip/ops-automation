# [OPEN] runtime-allocation-400

## Symptom
- Skill `6a298286-3f45-45e0-b03e-9d8fc271f2cd` failed immediately.
- Reported error: `Failed to allocate runtime session: Request failed with status code 400`
- Failure code: `RUNTIME_ALLOCATION_FAILED`
- Runtime type: `browser`

## Expected
- Browser runtime session allocation should succeed and execution should advance past the runtime bootstrap phase.

## Hypotheses
1. Portal or upstream caller is submitting an invalid runtime allocation payload for browser sessions, and the receiving service rejects it with `400`.
2. Control-plane rewrites or normalizes the skill runtime request incorrectly for this skill, producing missing required fields before session allocation.
3. Session-broker validation rejects the request because a required browser session field is absent, malformed, or inconsistent with the selected runtime type.
4. Browser worker pool or runtime policy state is surfaced as `400` instead of a more specific resource error, causing allocation to fail before a session is created.
5. This specific skill carries stale runtime metadata or incompatible execution config that only fails at allocation time.

## Evidence Plan
- Reproduce the failure with the exact skill ID and capture runtime logs from portal, control-plane, session-broker, and browser-worker.
- Inspect the code path that maps skill execution requests into runtime allocation requests.
- Add minimal instrumentation only if existing logs cannot identify which service emits the `400`.

## Status
- Session initialized; no business logic modified.
