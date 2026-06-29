# `error-codes`

跨服务稳定错误码契约包，用于承接执行域、技能域、工具域与运行时域的标准错误码常量。

## Holds

- shared cross-service error code constants
- `ErrorCode` union type derived from stable error code keys
- frozen runtime and execution error code identifiers used in service responses

## Does Not Hold

- service-specific error message text
- NestJS exception mapping logic
- browser-only phase recovery codes or other local module constants
- runtime adapter implementations
