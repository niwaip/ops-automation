# Debug Session: playwright-cli-timeout
- **Status**: [OPEN]
- **Issue**: Playwright CLI timeout analysis
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-playwright-cli-timeout.ndjson

## Reproduction Steps
1. Re-run the Playwright CLI flow that times out.
2. Capture the command, timeout threshold, and the stage where execution stalls.
3. Compare pre-fix and post-fix runtime evidence before changing business logic.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | The CLI timeout is caused by a wrapper process waiting on Playwright completion without streaming child output, so the real stall point is hidden. | High | Low | Pending |
| B | The invoked Playwright command is waiting on an unavailable browser/page state, network idle, or selector, and the outer CLI timeout is only a secondary symptom. | High | Medium | Pending |
| C | A platform service launches Playwright with an incorrect cwd/env/config path, causing startup or config resolution to hang until the caller times out. | Medium | Medium | Pending |
| D | The timeout comes from an application-level guard (Nest/worker/job timeout) that expires before Playwright's own timeout budget, so Playwright itself is not the root blocker. | Medium | Medium | Pending |
| E | Stdout/stderr backpressure or process management around the Playwright child process prevents completion from being observed, even though the browser task finishes or fails earlier. | Low | Medium | Pending |

## Log Evidence
- Smoke verification confirms instrumentation is loaded and logs from the Dockerized `browser-worker` reach the local Debug Server.
- `initBrowser:start` -> `worker-ready` -> `openSession:start` -> `resolveSessionCdpUrl:worker-ws` proves the runtime path reaches the Playwright CLI adapter normally.
- `execFileAsync:success` for `attach` finished in ~275ms during smoke, so the wrapper process itself is not inherently hanging on every call.
- `execFileAsync:success` for initial `run-code page.goto("https://example.com")` finished in ~1678ms during smoke, so basic attach + navigation works in the current environment.
- The actual timeout case still needs reproduction to determine whether the failing command is `attach`, `run-code`, `wait`, `search submit`, or another CLI action.

## Verification Conclusion
- Instrumentation path is verified.
- Root cause remains pending until the real timeout is reproduced with this instrumentation enabled.
