# 专项 Agent 共享执行协议字段归属说明 (v4.1)

日期：2026-06-24

> 本文件用于承接 `M6` 的第一步：明确 `control-plane` / `master-planner` / 专项 Agent 之间，哪些字段应进入共享执行协议，哪些字段应保留在 Agent 本地领域契约。

## 1. 目标

- 让 `codegen-agent`、`browser-nl-agent` 后续接入 `control-plane` 时有统一协议外壳。
- 避免把控制面私有 DTO 直接复制到专项 Agent。
- 避免把专项 Agent 的领域对象误抽成“所有 Agent 都必须理解”的共享协议字段。

## 2. 当前现状

当前仓库已经存在共享合同包：

- `@ops/backend-agent-execution-protocol`

其中定义了三类通用对象：

1. `AgentExecutionStartRequest`
2. `AgentExecutionProgressEvent`
3. `AgentExecutionResult`

它们当前只承载最小执行协议外壳：

- `executionId`
- `stepId`
- `agentKind`
- `input`
- `context`
- `status`
- `timestamp`
- `payload`
- `output`
- `error`

这说明当前最合理的方向不是继续新增控制面专用 DTO，而是让专项 Agent 在这层共享协议外壳之内承载自身领域输入输出。

## 3. 共享协议应承载的字段

以下字段应保留在共享执行协议中，因为它们属于“任何专项 Agent 都需要”的跨服务协作信息：

### 3.1 路由与关联字段

- `executionId`
- `stepId`
- `agentKind`

作用：

- 让 `control-plane`、`master-planner`、专项 Agent、事件流观察方能对同一次执行达成一致标识。

### 3.2 通用输入容器

- `input`
- `context`

作用：

- `input` 承载本次专项 Agent 的业务输入。
- `context` 承载上游已经准备好的附加上下文，例如用户、会话、运行时资源句柄、前序结果摘要。

约束：

- 共享协议只规定“容器”，不规定每个 Agent 的内部字段细节。

### 3.3 通用进度状态

- `status`
- `timestamp`
- `payload`

作用：

- 表达运行中、等待、需要接管、成功、失败等跨 Agent 可理解的执行状态。
- 允许各 Agent 通过 `payload` 回传结构化阶段信息，但不强迫控制面理解领域内部细节。

### 3.4 通用结果容器

- `output`
- `error`

作用：

- 统一承载终态结果和错误对象。
- 让控制面与观察方只依赖终态外壳，而不是依赖具体 Agent 的本地结果类型。

## 4. 应保留在 `codegen-agent` 本地契约的字段

以下对象属于 `codegen-agent` 领域本身，不应直接上升为共享协议一等字段：

- `GeneratedWorkUnit`
- `GeneratedWorkUnitArtifact`
- `SandboxRuntimeBinding`
- `SecurityLintResult`
- `SecurityLintIssue`

原因：

- 这些对象只和代码生成、预验证、导出语义有关。
- `browser-nl-agent`、未来其它专项 Agent 不需要原生理解这些结构。

建议映射：

- 放入 `AgentExecutionStartRequest.input`
  - 生成目标
  - 允许输出类型
  - 语言偏好
  - 约束条件
- 放入 `AgentExecutionStartRequest.context`
  - 上游计划摘要
  - release/work unit 关联信息
  - sandbox 预绑定信息
- 放入 `AgentExecutionProgressEvent.payload`
  - 当前生成阶段
  - lint 进度
  - dry-run 进度
- 放入 `AgentExecutionResult.output`
  - `GeneratedWorkUnit`
  - `SecurityLintResult`
  - `SandboxRuntimeBinding`

## 5. 应保留在 `browser-nl-agent` 本地契约的字段

以下对象属于 `browser-nl-agent` 领域本身，不应直接上升为共享协议一等字段：

- `BrowserNlAgentSession`
- `BrowserObservationSnapshot`
- `BrowserAtomicAction`
- `BrowserNlAgentTurnResult`

原因：

- 这些对象只和浏览器会话、多轮观察、原子动作编排有关。
- 它们依赖 `browser-domain` 与 `browser-worker` 的能力语义，不应要求其它专项 Agent 理解。

建议映射：

- 放入 `AgentExecutionStartRequest.input`
  - 用户目标
  - 当前页面或任务入口
  - 初始约束
- 放入 `AgentExecutionStartRequest.context`
  - `BrowserNlAgentSession`
  - 初始观察快照
  - runtime session 句柄
- 放入 `AgentExecutionProgressEvent.payload`
  - 当前 observation 摘要
  - 待执行动作
  - 是否阻塞
  - 是否需要人工接管
- 放入 `AgentExecutionResult.output`
  - `BrowserNlAgentTurnResult`
  - 最终 observation
  - 最终动作执行摘要

## 6. 控制面与委派层应理解到什么程度

`control-plane`、`master-planner`、`planner/delegation` 当前只需要稳定理解以下几类信息：

- 这是哪个 Agent：`agentKind`
- 这是哪次执行、哪个步骤：`executionId`、`stepId`
- 当前执行处于什么状态：`status`
- 是否需要等待或接管：`waiting`、`takeover_required`
- 是否已有终态输出或错误：`output`、`error`

它们不应被迫理解：

- `GeneratedWorkUnit` 的内部文件组织
- 浏览器观察快照的完整结构
- 原子动作参数细节
- 安全 lint 的全部规则细节

## 7. 结论

本轮收口后的边界是：

- 共享执行协议负责“执行外壳”
- 专项 Agent 本地契约负责“领域内部对象”
- `control-plane` 与 `master-planner` 只依赖共享协议，不直接依赖专项 Agent 本地 DTO
- 后续若新增新的专项 Agent，应优先复用同一执行外壳，再在 `input/context/output/payload` 中承载自身领域模型
