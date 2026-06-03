# Debug Session: control-plane-reset
- **Status**: [OPEN]
- **Issue**: `ops-control-plane` container is running after Docker restart, but host access to `http://127.0.0.1:3003/api/*` is reset and in-container access to `127.0.0.1:3003` is refused.
- **Debug Server**: Pending
- **Log File**: `.dbg/trae-debug-log-control-plane-reset.ndjson`

## Reproduction Steps
1. Run `./docker/start-smart.sh docker-compose.full.yml down`
2. Run `./docker/start-smart.sh docker-compose.full.yml up -d`
3. Run `./docker/scripts/smoke/full-smoke.sh`
4. Observe `control-plane execution baseline unavailable`
5. Run `curl http://127.0.0.1:3003/api/health`
6. Observe `Recv failure: Connection reset by peer`

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `nest start --watch` keeps the parent process alive, but the compiled app process crashes before binding port `3003` | High | Low | Pending |
| B | `control-plane` startup blocks during module initialization or dependency wiring, so Nest never reaches `app.listen()` | High | Low | Pending |
| C | An environment/configuration mismatch after full-stack restart causes an exception before the HTTP server is bound | Medium | Low | Pending |
| D | Runtime requests into a startup path trigger an unhandled exception that closes the socket immediately | Medium | Medium | Pending |
| E | The container command or watch mode behaves differently inside Docker after reinstall/generate, leaving the process alive without an active listener | Medium | Medium | Pending |

## Log Evidence
- Pending

## Verification Conclusion
- Pending
