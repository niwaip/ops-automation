[OPEN] Debug Session: weather-empty-fields

# Debug Session Record

- Session ID: weather-empty-fields
- Started At: 2026-06-07
- Scope: city weather skill returns empty weather fields while execution succeeds

## Symptoms

- Execution no longer fails at Python wrapper layer.
- End-to-end execution succeeds, but returned weather report contains empty values for temperature, humidity, wind, and visibility.

## Hypotheses

1. HTTP request returns unexpected payload or error page.
2. Rendered wttr URL contains stray whitespace or backticks and produces malformed response.
3. Structured transform mapping reads wrong paths from the HTTP JSON payload.
4. Workflow activity chaining loses the previous activity output before transform.
5. Success state is produced by a fallback formatter even when business data is missing.

## Evidence Plan

- Add runtime instrumentation only.
- Reproduce with admin/admin123 and city weather skill.
- Compare HTTP activity input/output and transform activity input/output.

## Status

- Step 1-4 bootstrap completed.
- Awaiting instrumentation.
