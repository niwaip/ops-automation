[OPEN] Debug Session: shared-http-fallback

# Debug Session Record

- Session ID: shared-http-fallback
- Started At: 2026-06-07
- Scope: 多个依赖 HTTP/Carbone 的技能在运行时通过 Python fallback 执行时出现统一异常或空结果

## Symptoms

- 天气技能执行成功，但业务结果文本中的天气字段全部为空。
- 文档技能执行失败，错误为 `Carbone 返回结果缺少 downloadUrl`。
- 相同问题不局限于单个技能，多个技能都出现异常。
- 运行日志显示执行链路进入 `Sandbox agent 不可用，回退到直接执行...`。

## Latest Evidence

- 执行单 `0f852513-2f11-4c18-825a-d101d4d68859` 的 `result_json` 已持久化为空字段天气报告，说明不是前端渲染问题。
- 直接请求 `wttr.in` 仍可返回完整 JSON，说明第三方天气接口结构未整体失效。
- 已发布工作流 artifact 中存在正确的 `responseFieldMappings` 与 `textTemplate`。
- 运行时直接调用 `POST /capabilities/runtime/execute` 可稳定复现“天气字段全空”。
- 新增执行单 `ecda9417-a7df-42c8-bdc7-6543d4beb864` 报错 `Carbone 返回结果缺少 downloadUrl`。

## Hypotheses

1. Python fallback runner 全局注入了假的 `requests` 模块，导致所有 Activity 的外部 HTTP 调用都没有真正发出。
2. fallback runner 只提供了通用 mock 响应结构，`httpRequest` 与 `documentRender` 从 mock 响应里取不到真实业务字段。
3. 真实 Temporal Sandbox Agent 不可用，系统长期走 fallback 路径，所以多个技能同时出现问题。
4. workflow artifact 本身是好的，但 fallback 执行环境与验证环境的 `requests`/网络能力不一致。
5. 某些技能的报错只是共享根因的不同表现，天气技能表现为空值，Carbone 技能表现为缺少 `downloadUrl`。

## Evidence Plan

- 先验证 fallback runner 是否全局 monkey-patch 了 `requests`。
- 对比 fallback runner 与真实 sandbox/验证路径的执行差异。
- 收集一个最小复现场景，证明 mock `requests` 会同时影响天气与 Carbone。
- 在不改业务逻辑的前提下先补足运行时仪表点，再决定最小修复方案。

## Status

- Step 1-4 bootstrap completed.
- Awaiting instrumentation-only change.
