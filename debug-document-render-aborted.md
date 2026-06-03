# Debug Session: document-render-aborted

- Status: OPEN
- Date: 2026-06-03
- Goal: Reproduce and explain why `documentRender` logs `开始调用 Carbone 渲染` and then ends with `错误: aborted`.

## Hypotheses

1. The `aborted` error is raised by the caller stream/validator layer, not by `documentRender` itself, and the render request is still in flight or later fails elsewhere.
2. The Carbone URL being used at runtime contains unexpected formatting characters or whitespace, causing the downstream request or proxy path to misbehave.
3. The request is reaching `carbone-engine`, but the connection is aborted by the HTTP stack before a response body is produced.
4. The render path is correct, but a surrounding timeout/cancellation in the validation or SSE chain aborts the run before the activity can complete.
5. The log formatting for `renderUrl` is misleading, while the actual failure is inside `carbone-engine` and only surfaces upstream as a generic `aborted`.

## Evidence Log

- User log shows `documentRender` starts successfully and logs `requestTimeoutSeconds: 300.0`.
- The same log shows `renderUrl` rendered as ` \`http://carbone-engine:3009/studio/render-resolved\` `.
- Final surfaced error is `错误: aborted`, without a Python traceback in the provided snippet.

## Next Step

- Instrument the call chain around `documentRender` and the validation/stream boundary to capture the exact exception type, message, and whether the HTTP request actually starts/returns.
