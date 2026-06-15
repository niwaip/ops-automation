# [OPEN] draft-sessions-401

## 背景
- 现象：访问 `http://192.168.100.143:5173/api/temporal/draft-sessions` 仍然报错，用户要求按给定 payload 做端到端验证。
- 目标：确认失败发生在鉴权、代理、后端业务、AI 生成链路还是数据库持久化阶段。

## 当前输入
```json
{
  "description": "\"生成一个天气查询的工作流\\n输入 城市\\n输出 温度，降水量，风速等天气情报\\n处理，一个合适的没有验证的第三方的天气情报api",
  "referenceUrl": ""
}
```

## 假设
- H1: 前端或直连请求未携带 `Authorization`，被平台服务全局 JWT Guard 直接拦截。
- H2: 浏览器本地登录态存在，但 access token 过期且 refresh 流程失败，最终落成 401。
- H3: 请求已通过鉴权，但 `createAiDraftSession` 内部调用 AI 生成链路时报错，前端只看到了泛化错误。
- H4: 请求已生成初稿，但写入 `chat_sessions` / `chat_messages` 时因数据或用户上下文异常失败。
- H5: Vite 代理到平台服务正常，但从 5173 发起的请求方式与直接打 3001 的行为不一致。

## 计划
- 先补最小化运行时插桩，记录请求进入、鉴权结果、会话创建路径和失败点。
- 用给定 payload 分别对 5173 和 3001 复现。
- 根据日志证据排除假设，再做最小修复。

## 已采集证据
- 直连 `POST http://192.168.100.143:5173/api/temporal/draft-sessions` 且不带鉴权头时，返回 `401 Authorization header is required`。
- 调试日志显示未鉴权请求在 `JwtAuthGuard` 即被拦截，未进入业务层。
- 带内部调试头并使用真实用户 ID 调用 `POST /temporal/draft-sessions` 时，请求进入 `createAiDraftSession`。
- 调试日志显示 AI 草稿已生成，名称为 `WeatherQueryWorkflow`，共 `2` 个步骤，并成功持久化到 `chat_sessions`。
- 从进入会话创建到草稿生成完成约耗时 `130s`，超过前端 `apiClient` 默认 `120000ms` 超时。

## 结论
- H1 成立：无鉴权直连该地址会稳定 401，这属于接口设计结果，不是业务回归。
- H2 暂未证实：当前问题不需要依赖 token 刷新失败来解释。
- H3 不成立：给定 payload 的 AI 草稿生成成功。
- H4 不成立：会话已成功写入数据库。
- H5 不成立：通过 `5173` 代理转发的带鉴权请求可以成功完成。

## 最小修复
- 将前端 AI 草稿相关请求超时从默认 `120s` 提高到 `5min`，覆盖：
  - `generateAiDraft`
  - `createAiDraftSession`
  - `refineAiWorkflowDraft`
  - `refineAiDraftSession`

## 待用户确认
- 用户需要确认在正常登录态下，通过前端发起草稿生成时是否已不再因为超时而失败。
