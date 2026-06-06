# Debug Session: validate-code-stream-error

- Status: OPEN
- Date: 2026-06-03
- Goal: Reproduce `POST /api/temporal/validate-code/stream` failure and identify the runtime cause.

## Hypotheses

1. The `code` payload is truncated or malformed before the server validates it.
2. The stream endpoint requires additional fields beyond `code`.
3. The backend proxy or downstream validator is unavailable.
4. JSON parsing fails because of escaping, special characters, or payload size.
5. The submitted Python code is rejected by the validator due to syntax or semantic issues.

## Evidence Log

- Direct POST to `http://192.168.100.143:5173/api/temporal/validate-code/stream` without auth returned `401 Unauthorized` with body `{"message":"Authorization header is required","error":"Unauthorized","statusCode":401}`.
- Frontend caller `validateWorkflowRealStream()` sends payload `{ code, fn, input, taskQueue, timeout }` and attaches an auth token before calling `/api/temporal/validate-code/stream`.
- Backend auth middleware rejects requests without `Authorization` unless valid internal headers are provided.
- Backend validation service forwards `fn` as `fn_name` to the validation worker stream endpoint.
- Validation worker explicitly returns stream error `code and fn_name are required` when either `code` or `fn_name` is missing.
- Login via `POST /api/auth/login` with `admin/admin123` succeeded and returned an access token.
- Replaying `POST /api/temporal/validate-code/stream` with bearer token and `fn=Template1febbc18Workflow` returned a successful SSE stream.
- Observed stream logs: connected to `http://temporal-sandbox-agent:8090`, validation started, workflow class recognized, and final `done` event was `{ "success": true, "score": 100, "result": null }`.
- Replaying the same request with the provided sample input map also returned success with the same final `done` event.
- Sandbox executor passes the entire `input_data` object as the single argument to `instance.run(input_data)` when the target is a class, but if the class has no `run` method it returns `None` and still marks validation successful.
- `POST /temporal/:id/validate-saved-artifact` uses the persisted `generatedCode` plus `workflowDsl.workflowClassName`, not the ad-hoc snippet previously tested.
- The saved-artifact validation path first failed with `Activity task timed out` because the sandbox worker defaults activity `start_to_close_timeout` to `60s` when no timeout is provided.
- Re-running the same saved-artifact validation with `timeout: "300s"` no longer timed out; it failed with `Carbone 渲染失败: HTTP Error 500: Internal Server Error`.
- Runtime logs show the persisted workflow actually executes `documentRender`, then calls `http://carbone-engine:3009/studio/render-resolved`, which is where the failure occurs.
- This proves the previous successful `validate-code/stream` run was not exercising the same full persisted artifact path.

## Next Step

- If the user still sees a failure, capture the exact full request body being sent at that time and compare it to the successful authenticated request.
- Next: inspect the saved artifact payload/code path into `/studio/render-resolved` and determine why Carbone returns HTTP 500 for this template/input pair.
