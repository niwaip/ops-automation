# [OPEN] publish-skill-400

## Symptom
- `POST http://192.168.100.143:5173/api/capabilities/ced04b95-5fd2-4adf-aad8-59085d30a755/publish-skill` returns `400 Bad Request`.

## Expected
- Publishing the capability should either succeed or return a domain-specific error with enough evidence to identify the failing validation step.

## Hypotheses
1. The portal request body for `publish-skill` is missing a required field or sends an invalid payload shape, and the backend controller/DTO validation rejects it with `400`.
2. The `platform` capability publish API is reached correctly, but the capability draft or release state for `ced04b95-5fd2-4adf-aad8-59085d30a755` fails a business precondition and returns `400`.
3. The publish flow depends on generated artifacts, release metadata, or tool bindings that are incomplete for this capability, and the service throws a `BadRequestException`.
4. The portal proxy is correct, but a downstream service invoked during publish returns `400`, which is surfaced back through the capability publish endpoint.
5. This capability is in a partially migrated state under `11.2 结构验收`, so stable export / provider wiring is resolved enough to run, but publish-path ownership checks still reject the request.

## Evidence Plan
- Reproduce the exact `publish-skill` request and capture response body.
- Inspect `portal` and `platform` logs around the request time for capability ID `ced04b95-5fd2-4adf-aad8-59085d30a755`.
- Read the publish endpoint controller/service path and only add minimal instrumentation if existing logs are insufficient.

## Status
- Session initialized; no business logic modified.
