[OPEN] login-500-auth

# Debug Session

- Session ID: `login-500-auth`
- Started At: `2026-06-27`
- Symptom: `POST http://192.168.100.143:5173/api/auth/login` returns `500 Internal Server Error`
- Expected: login API should return `200/201` with auth payload

# Hypotheses

- H1: `portal -> control-plane` proxy layer returns 500 because upstream `platform` auth service is unavailable.
- H2: `platform` process starts but crashes during Nest bootstrap because of `CapabilityReleaseModule` circular dependency.
- H3: `control-plane` health/proxy status is inconsistent with real upstream container state, masking the actual root cause.
- H4: compose/service wiring after backend migration is inconsistent with current workspace package layout, so auth path cannot be served correctly.
- H5: the 500 is generated in frontend dev proxy instead of backend, due to target service refusal or reset.

# Evidence Log

- Pending: collect live HTTP response, container status, proxy path behavior, and upstream service logs.

# Status

- Current phase: hypothesis
- Business logic changes: none
- Instrumentation changes: none
