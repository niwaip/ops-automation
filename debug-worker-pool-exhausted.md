# Debug Session: worker-pool-exhausted [OPEN]

## Symptom
- UI reports: "Worker Pool 已耗尽，所有 Worker 都被占用，无法创建新的会话。"
- Request: `POST /api/sessions`
- Observed status: `400 Bad Request`

## Scope
- Reproduce the session creation failure.
- Inspect browser-worker/session-broker/control-plane runtime state.
- Collect runtime evidence before any business fix.

## Hypotheses
- H1: Worker pool accounting is stale, so workers are marked occupied even though no real active sessions exist.
- H2: Browser worker service is unhealthy or cannot allocate a browser instance, and the API maps that failure to "pool exhausted".
- H3: Session broker or control-plane cannot talk to browser-worker, causing session creation to fail before allocation completes.
- H4: Orphaned browser sessions or worker containers from previous runs were not cleaned up, so capacity is genuinely exhausted.
- H5: A recent Docker/runtime startup regression left the worker-related services partially started, returning a misleading 400 instead of a clearer infrastructure error.

## Plan
- Reproduce `POST /api/sessions` with the current stack.
- Check `browser-worker`, `session-broker`, and `control-plane` logs plus container health.
- Determine whether the failure is real capacity exhaustion or stale/failed allocation state.

## Evidence
- Pre-fix 1: `ops-browser-worker` was not running. Its logs failed during build with `TS2307: Cannot find module '@ops/backend-runtime-capability-contract'`.
- Pre-fix 2: `session-broker` had no explicit `BROWSER_WORKER_URL`; code fallback pointed to `http://ops-browser-worker:3004`, which does not match the current compose service naming strategy.
- Pre-fix 3: after fixing browser-worker reachability, `session-broker` still crashed on startup with `Cannot find module '../../generated/prisma'` from `/app/dist/modules/prisma/client.js`.
- Fix 1: added `packages/backend-contracts` volume to `browser-worker`, and added `DOCKER_ENV` plus explicit `BROWSER_WORKER_URL=http://browser-worker:3004` to `session-broker`.
- Fix 2: changed `session-broker` startup to `npm run build`, then copy `src/generated/prisma` into `dist/generated/prisma` before starting `node dist/main.js`.
- Post-fix 1: `ops-browser-worker` logs now show `Nest application successfully started` and `Browser Worker Service running on port 3004`.
- Post-fix 2: `ops-session-broker` logs now show `Nest application successfully started` and `[Session Broker Service] Running on port 3002 (IPv4)`.
- Post-fix 3: from inside `ops-session-broker`, `GET http://browser-worker:3004/health` returns `200 {"status":"ok","workers":0,...}`.
- Post-fix 4: using the same request shape as the frontend (`user_id`, `template_id`, `params`), `POST http://localhost:5173/api/sessions` now returns `201` with a created session, `worker_ref`, and browser endpoints instead of the previous pool exhaustion symptom.

## Next Action
- Ask the user to retry session creation in the UI. Keep the debug session open until user confirms the symptom is gone or changed.
