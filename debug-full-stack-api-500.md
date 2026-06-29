# [OPEN] Debug Session: full-stack-api-500

## Symptom
- `http://192.168.100.143:3003/api/executions?page=1&pageSize=10` needs end-to-end verification
- `http://192.168.100.143:5173/api/carbone/templates` returns `500 Internal Server Error`

## Scope
- Full stack started via `docker-compose.full.yml`
- Focus on `portal` proxy, `control-plane`, and `carbone` API path behavior

## Hypotheses
1. Portal proxy for `/api/carbone/templates` points to a wrong target or wrong rewrite path.
2. Carbone backend receives the request but throws internally, producing a real `500`.
3. `control-plane` is not fully healthy, so `/api/executions` may fail or return inconsistent results.
4. Full compose service host wiring is still inconsistent for a subset of API routes.

## Evidence Plan
- Reproduce both requests from CLI and record actual HTTP responses.
- Inspect `portal`, `control-plane`, and `carbone` container logs around reproduction time.
- Compare direct backend access with proxied access where possible.
- Add instrumentation only if existing runtime evidence is insufficient.

## Status
- Session opened
- No business logic changed yet

## Evidence
- Pre-fix `portal` log for carbone:
  - `http proxy error: /studio/templates`
  - `Error: connect ECONNREFUSED 192.168.65.254:3009`
  - later `Error: getaddrinfo ENOTFOUND carbone-engine`
- Pre-fix `carbone-engine` log:
  - `sh: 1: pnpm: not found`
  - later `npm error code ENOWORKSPACES`
- Pre-fix `control-plane` runtime:
  - host request to `/api/executions` reset before the service was fully healthy
  - service logs showed startup chain issues around workspace install / generated prisma artifacts
- Post-fix `control-plane` runtime:
  - container local `GET /api/executions?page=1&pageSize=10` returns `401 Unauthorized`
  - host `GET /api/executions?page=1&pageSize=10` returns `401 Unauthorized`
- Post-fix `carbone-engine` log:
  - `Nest application successfully started`
  - `Carbone Engine is running on: http://localhost:3009`
- Post-fix HTTP result:
  - direct `GET http://127.0.0.1:3009/api` returns `200 OK`
  - proxied `GET http://192.168.100.143:5173/api/carbone/templates` returns `200 OK`

## Findings
- Hypothesis 1 confirmed:
  - `portal` carbone proxy target was effectively unusable until `CARBONE_ENGINE_HOST` was explicitly wired and the backend service actually came up.
- Hypothesis 2 confirmed:
  - `carbone-engine` was not running because its full-compose startup command was incompatible with the current workspace/package layout.
- Hypothesis 3 partially confirmed:
  - `control-plane` was not initially healthy under full compose due startup chain mismatch and missing generated Prisma runtime artifacts.
- Hypothesis 4 confirmed:
  - Full compose had multiple service wiring mismatches for monorepo-backed services.

## Fix
- Updated `docker-compose.full.yml`:
  - `control-plane` now starts from workspace root via `pnpm`, builds, copies generated Prisma artifacts into `dist`, then starts.
  - `portal` now has explicit `CARBONE_ENGINE_HOST=carbone-engine`.
  - `carbone-engine` now starts from its package directory, uses local `npm install --workspaces=false --include=dev`, generates Prisma client, compiles TypeScript, copies generated Prisma artifacts into `dist`, then starts.

## Current Result
- `GET /api/executions` now reaches `control-plane` correctly and returns auth-level `401`, not transport failure.
- `GET /api/carbone/templates` now reaches `carbone-engine` through `portal` proxy and returns `200`.

## Follow-up Symptom
- User reports `GET http://192.168.100.143:5173/api/templates?page=1&pageSize=10&search=` still returns `500 Internal Server Error`

## Follow-up Hypotheses
1. Portal proxy for `/api/templates` still targets `browser-template`, but the hostname is not resolvable in current runtime.
2. `browser-template` is up, but its `/templates` route throws internally and returns a real `500`.
3. Portal rewrites `/api/templates` to an unexpected path and hits the wrong upstream route.
4. `browser-template` startup chain is incomplete under full compose, so the container exists but does not listen on its port.
