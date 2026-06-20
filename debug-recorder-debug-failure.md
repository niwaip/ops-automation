# Debug Session: recorder-debug-failure [OPEN]

## Target
- Investigate why `recorder-debug-1781786619277` failed.

## Scope
- Read-only investigation first.
- No business logic changes before evidence is collected.

## Initial Hypotheses
- Hypothesis 1: The recorder debug session data was not found or expired, causing downstream export/debug calls to fail.
- Hypothesis 2: The browser runtime chain (`ai-orchestrator` -> `browser-worker` -> browser service) returned a transport or timeout error.
- Hypothesis 3: The session contains malformed commands or observations, causing recorder debug processing to throw during parse/export.
- Hypothesis 4: A specific backend endpoint handling `recorder-debug-1781786619277` threw an uncaught exception due to missing fields in the session payload.
- Hypothesis 5: The failure is environment-related (container restart, stale in-memory session, idle timeout), not a code regression in recorder logic.

## Evidence Log
- Existing runtime session is still accessible through `GET /ai/recorder-debug/recorder-debug-1781786619277`; repeated `GET` calls completed in 4-39ms, so the session was not missing.
- Worker logs around `06/18/2026 12:44-12:45` show successful fill actions for username and password, followed by a click failure:
- `Text click failed to find element: 登录`
- Session observation payload for the same session shows the visible login button text is `ログイン`, not `登录`.
- Parser order in `browser-command.service.ts` is:
- `parseLoginCommand()` first
- then `parseCandidateScopedAction()`
- `parseLoginCommand()` hardcodes submit text to `登录` when input contains `登录/登入`.
- Because `parseCandidateScopedAction()` never runs for this request, the parser does not use the observed candidate/button text `ログイン`.

## Current Assessment
- Hypothesis 1: Rejected. Session did exist and was repeatedly fetched successfully.
- Hypothesis 2: Rejected for this failure. No timeout/disconnect evidence on the failing action itself.
- Hypothesis 3: Rejected. Session structure appears valid enough to execute fill steps.
- Hypothesis 4: Rejected. No uncaught controller/session retrieval error observed.
- Hypothesis 5: Rejected as primary cause. This failure is reproducible logic behavior in command parsing, not just environment flakiness.

## Confirmed Root Cause
- The request `输入用户名 124 密码 345 然后点击登录` is parsed by `parseLoginCommand()` before candidate-aware parsing.
- `extractLoginSubmitTarget()` maps Chinese login intent to literal text `登录`.
- Browser worker then executes text click against `登录`, but the page only exposes button text `ログイン`.
- Result: fills succeed, submit click fails, and the session remains on the login page.

## Broader Static Findings
- Candidate-aware action parsing already supports `preferredLocator` and falls back to `ref` when available.
- However, multiple upstream parser paths still emit direct text-based clicks and bypass candidate-aware resolution:
- `parseLoginCommand()` -> emits `params.text = submitTarget`
- `parseWithCommandContext(commandType=click)` -> emits `params.target = text="..."`
- `parseWithPatterns()` generic click rule -> emits `params.target = text="..."`
- AI prompt examples in both `parseWithAI()` and `parseWithAIPlan()` explicitly teach models to emit `click text=登录`
- Therefore the observed failure is part of a broader design inconsistency:
- one branch says "prefer ref/structured candidates when available"
- several earlier branches still hardcode text-first click outputs

## Ref Usage Clarification
- `ref` is normalized into candidates and promoted to `preferredLocator` when possible.
- Candidate-aware clicks would use `preferredLocator` first, otherwise `ref`.
- In this failing session, `ref=e16` existed in observation data, but was never used because the login-special parser returned earlier with a text click command.

## Next Steps
- Locate references/logs for `recorder-debug-1781786619277`.
- Identify the exact failing endpoint and stack trace.
- Map runtime evidence back to one of the hypotheses above.
