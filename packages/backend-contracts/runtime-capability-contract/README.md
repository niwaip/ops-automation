# `runtime-capability-contract`

Shared contracts for southbound runtime invocation and result exchange.

## Holds

- runtime invocation requests and results
- artifact, snapshot, and metrics references
- policy and trace context for runtime calls

## Does Not Hold

- worker-side execution logic
- control-plane orchestration logic
- service-local artifact storage models
