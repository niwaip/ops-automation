# [OPEN] Debug Session: portal-login-500

## Symptom
- Portal page at `http://192.168.100.143:5173/` triggers `POST /api/auth/login`
- Browser reports `500 Internal Server Error`
- Request URL: `http://192.168.100.143:5173/api/auth/login`

## Scope
- Full stack started via `docker-compose.full.yml`
- Focus on end-to-end login path from `portal` -> proxy -> backend auth chain

## Hypotheses
1. Portal dev server proxy forwards `/api/auth/login` to the wrong upstream or wrong path.
2. Control-plane receives the request but fails internally and returns `500`.
3. Platform/auth service is reachable but throws during login handling.
4. Full compose environment variables or service host mapping are inconsistent for the auth path only.

## Evidence Plan
- Inspect portal proxy configuration and running container env.
- Reproduce the failing request from CLI and collect `portal`, `control-plane`, and `platform` logs.
- Compare direct backend responses versus proxied response.
- Add minimal instrumentation only if existing runtime evidence is insufficient.

## Status
- Session opened
- No business logic changed yet

## Evidence
- Pre-fix `portal` log:
  - `http proxy error: /auth/login`
  - `Error: getaddrinfo ENOTFOUND ops-platform`
- Pre-fix `platform` log:
  - `npm error Unsupported URL Type "workspace:": workspace:*`
- Mid-fix `portal` log after proxy host correction:
  - `Error: connect ECONNREFUSED 172.18.0.6:3001`
- Post-fix `platform` log:
  - `Nest application successfully started`
  - `[Platform Service] Running on port 3001 (IPv4)`
- Post-fix HTTP result:
  - `POST /api/auth/login` via `http://192.168.100.143:5173/api/auth/login`
  - response changed from `500` to `401 Unauthorized`

## Findings
- Hypothesis 1 confirmed:
  - `portal` proxy defaulted to `ops-platform`, which was not resolvable in the full-compose portal runtime.
- Hypothesis 2 rejected:
  - `control-plane` is not part of the `/api/auth/login` proxy path.
- Hypothesis 3 confirmed:
  - `platform` was not serving because full compose used isolated app mount plus `npm install`, which breaks workspace dependencies.
- Hypothesis 4 confirmed:
  - Full compose runtime wiring for `portal` and `platform` was inconsistent with the workspace-based backend layout.

## Fix
- Updated `docker-compose.full.yml`:
  - `platform` now uses workspace-root mount plus `pnpm` startup flow
  - `portal` now gets explicit service-name host envs such as `AUTH_SERVICE_HOST=platform`

## Current Result
- End-to-end login path now reaches backend auth service successfully.
- The remaining `401` is expected for invalid debug credentials and proves the `500` transport/runtime failure is fixed.
