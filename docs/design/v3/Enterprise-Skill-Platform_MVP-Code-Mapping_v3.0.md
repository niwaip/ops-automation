# 企业级 Skill 平台 Agent OS MVP Code Mapping

**MVP Code Mapping v3.0**  
日期：2026-04-26

> 本文将 `MVP Story Breakdown` 直接映射到当前仓库代码结构。目标不是重新设计服务，而是回答“每个 story 现在应该落到哪个服务、哪个模块、哪些文件，哪些可以直接复用，哪些需要在现有服务内新增模块”。

---

## 1. Mapping 原则

本次 code mapping 只遵循 4 条原则：

- 只映射 `MVP Story Breakdown` 中已有的 story
- 优先复用当前仓库已有模块和页面
- 物理服务不新增，优先在现有服务内补模块
- 明确区分“直接复用 / 重点改造 / 现有服务内新增”

一句话：

> 先把 story 对到真实代码位置，再决定具体改哪些文件。

---

## 2. 服务映射总览

### `control-plane`

- 当前最接近 MVP 主控制面的落点
- 现有入口：
  - `src/modules/execution/execution.controller.ts`
  - `src/modules/execution/execution.service.ts`
  - `prisma/schema.prisma`
- 判断：
  - 适合承接 `Execution` API、主状态写入口、step 驱动协调

### `session-broker`

- 当前最接近 RuntimeManager 的落点
- 现有入口：
  - `src/modules/runtime-session/runtime-session.controller.ts`
  - `src/modules/runtime-session/runtime-session.service.ts`
  - `src/modules/freeze/freeze.service.ts`
- 判断：
  - 适合承接 `RuntimeSession` 分配、freeze/resume/close、资源状态维护

### `browser-worker`

- 当前最接近 BrowserRuntime 的落点
- 现有入口：
  - `src/modules/browser/browser.controller.ts`
  - `src/modules/browser/browser.service.ts`
  - `src/dto/worker.dto.ts`
  - `src/modules/worker/worker.controller.ts`
- 判断：
  - 适合承接统一 `execute-step` 协议和 takeover 提示返回

### `ai-orchestrator`

- 当前最接近 Planner 的落点
- 现有入口：
  - `src/controllers/chat.controller.ts`
  - `src/modules/react-engine/react-engine.service.ts`
  - `src/modules/execution-step/execution-step.service.ts`
- 判断：
  - 适合承接 `PlanDraft / PlanStep / RequiredInput`
  - 但当前仍残留执行语义，需要继续去执行化

### `portal`

- 当前最接近 MVP 体验层的落点
- 现有入口：
  - `src/api/execution.ts`
  - `src/pages/ExecutionListPage.tsx`
  - `src/pages/ExecutionDetailPage.tsx`
  - `src/components/execution/InlineRecoveryPanel.tsx`
  - `src/components/runtime/LiveSessionPreviewCard.tsx`
- 判断：
  - Execution 列表、详情与内联接管/恢复区已有基础雏形，可直接增强

### `auth`

- 当前最接近身份与 Skill 查询支撑层的落点
- 现有入口：
  - `src/modules/auth/auth.controller.ts`
  - `src/modules/skill/skill.controller.ts`
- 判断：
  - 适合继续承接 `auth/me`、`skills`、Skill 查询和 RBAC 支撑

---

## 3. Story 到代码位置映射

## 3.1 数据模型与存储

### `DATA-P0-01` Execution 主表落地

- 服务：`control-plane`
- 主要文件：
  - `prisma/schema.prisma`
  - `src/modules/prisma/prisma.service.ts`
  - `src/modules/execution/execution.service.ts`
- 当前状态：
  - `Execution` 模型已存在
  - `ExecutionService.create()` 已写入 `execution`
- 落地方式：
  - 重点改造现有 schema 和 service
- 备注：
  - 这是“直接复用 + 字段对齐”类型，不是从零开始

### `DATA-P0-02` ExecutionStep 主表落地

- 服务：`control-plane`
- 主要文件：
  - `prisma/schema.prisma`
  - `src/modules/execution/execution.service.ts`
- 当前状态：
  - `ExecutionStep` 模型已存在
  - 查询路径已存在 `GET /executions/:id/steps`
- 落地方式：
  - 重点改造现有 schema
  - 建议在 `control-plane/src/modules/execution/` 内补 step 写入逻辑或拆出 `execution-step` 子模块
- 备注：
  - 当前 `ai-orchestrator` 里也有 `execution-step.service.ts`，后续要避免双写

### `DATA-P0-03` RuntimeSession 主表落地

- 服务：`session-broker`
- 主要文件：
  - `prisma/schema.prisma`
  - `src/modules/runtime-session/runtime-session.service.ts`
- 当前状态：
  - `RuntimeSession` 模型和 `create/get/freeze/resume/close` 主链已存在
- 落地方式：
  - 直接复用现有模块并补字段对齐

### `DATA-P0-04` ExecutionEvent 与 Redis 状态位落地

- 服务：
  - PostgreSQL 事件在 `control-plane`
  - Redis 高频状态在 `session-broker`
- 主要文件：
  - `services/control-plane/prisma/schema.prisma`
  - `services/control-plane/src/modules/execution/execution.service.ts`
  - `services/session-broker/src/modules/freeze/freeze.service.ts`
  - `services/session-broker/src/modules/lock/redis.service.ts`
- 当前状态：
  - `ExecutionEvent` 模型已存在
  - `FreezeService` 已有 Redis Lua 状态位逻辑
- 落地方式：
  - 直接复用事件表
  - 重点改造 Redis key 规范，使其从旧 `session:*` 语义逐步靠近 `runtime-session`

## 3.2 `control-plane`

### `CP-P0-01` Execution 创建接口

- 服务：`control-plane`
- 主要文件：
  - `src/modules/execution/execution.controller.ts`
  - `src/modules/execution/execution.service.ts`
  - `src/modules/execution/execution.dto.ts`
- 当前状态：
  - `POST /executions` 已存在
- 落地方式：
  - 直接复用现有 controller/service
  - 重点改造 create 流程，使其先走结构化 Planner，再决定 `queued / waiting_input`

### `CP-P0-02` Execution 查询接口

- 服务：`control-plane`
- 主要文件：
  - `src/modules/execution/execution.controller.ts`
  - `src/modules/execution/execution.service.ts`
- 当前状态：
  - `GET /executions`
  - `GET /executions/:id`
  - `GET /executions/:id/steps`
  - 已存在
- 落地方式：
  - 直接复用

### `CP-P0-03` 主状态单写入口

- 服务：`control-plane`
- 主要文件：
  - `src/modules/execution/execution.service.ts`
- 关联风险位置：
  - `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
- 当前状态：
  - `ExecutionService.updateStatus()` 已承担主状态迁移
  - 但 `ai-orchestrator.finalizeExecution()` 仍直接写 `execution`
- 落地方式：
  - 重点改造
- 备注：
  - 这是 MVP 主边界收口的关键点

### `CP-P0-04` Step 驱动与回写

- 服务：`control-plane`
- 主要文件：
  - `src/modules/execution/execution.service.ts`
- 关联位置：
  - `services/browser-worker/src/modules/browser/browser.controller.ts`
  - `services/browser-worker/src/dto/worker.dto.ts`
- 当前状态：
  - Browser step 协议已存在 `POST /browser/execute-step`
  - `control-plane` 还没有完整 step 驱动编排壳
- 落地方式：
  - 在现有 `execution` 模块内新增协调逻辑

### `CP-P0-05` 人工接管与恢复接口

- 服务：`control-plane`
- 主要文件：
  - `src/modules/execution/execution.controller.ts`
  - `src/modules/execution/execution.service.ts`
- 当前状态：
  - `takeover / resume / cancel` 已存在
- 关联位置：
  - `services/session-broker/src/modules/runtime-session/runtime-session.controller.ts`
- 落地方式：
  - 直接复用现有 API
  - 重点在联调与状态一致性

### `CP-P0-06` 输入补全接口

- 服务：`control-plane`
- 当前状态：
  - 还没有 `POST /executions/:id/submit-input`
- 建议位置：
  - `src/modules/execution/execution.controller.ts`
  - `src/modules/execution/execution.service.ts`
  - `src/modules/execution/execution.dto.ts`
- 落地方式：
  - 在现有 `execution` 模块内新增接口和 DTO

## 3.3 `ai-orchestrator`

### `PLN-P0-01` 结构化计划生成接口

- 服务：`ai-orchestrator`
- 主要文件：
  - `src/controllers/chat.controller.ts`
  - `src/modules/react-engine/react-engine.service.ts`
  - `src/modules/react-engine/interfaces.ts`
- 当前状态：
  - 现有入口仍偏 `chat/task SSE`
- 建议位置：
  - 在 `controllers/` 下新增专门的 planner internal endpoint
  - 或在 `react-engine` 外加一个 planner facade module
- 落地方式：
  - 现有服务内新增模块

### `PLN-P0-02` PlanStep DTO 收敛

- 服务：`ai-orchestrator`
- 主要文件：
  - `src/modules/react-engine/interfaces.ts`
  - `src/modules/react-engine/react-engine.service.ts`
  - `src/modules/react-engine/prompt-builder.ts`
- 当前状态：
  - 当前主协议仍是 ReAct text + tool loop
- 落地方式：
  - 重点改造接口与 DTO
- 备注：
  - 这里的目标是让 `control-plane` 消费结构化计划，而不是消费 Thought/Action 文本

### `PLN-P0-03` RequiredInput 输出

- 服务：`ai-orchestrator`
- 主要文件：
  - `src/modules/react-engine/interfaces.ts`
  - `src/modules/react-engine/react-engine.service.ts`
  - `src/modules/react-engine/tools/generate-parameters.tool.ts`
  - `src/modules/react-engine/tools/param-collect.tool.ts`
- 当前状态：
  - 已有参数补全相关工具，但产物更偏运行态而非正式 DTO
- 落地方式：
  - 重点改造已有参数工具输出

## 3.4 `session-broker`

### `RTM-P0-01` RuntimeSession 分配能力

- 服务：`session-broker`
- 主要文件：
  - `src/modules/runtime-session/runtime-session.controller.ts`
  - `src/modules/runtime-session/runtime-session.service.ts`
  - `src/modules/allocation/allocation.service.ts`
- 当前状态：
  - `POST /runtime-sessions` 已存在
- 落地方式：
  - 直接复用现有模块

### `RTM-P0-02` Runtime 状态流转

- 服务：`session-broker`
- 主要文件：
  - `src/modules/runtime-session/runtime-session.service.ts`
- 当前状态：
  - `allocating / ready / busy / frozen / closed / error` 状态流已存在
- 落地方式：
  - 直接复用并细化联调

### `RTM-P0-03` Freeze/Resume 协议

- 服务：`session-broker`
- 主要文件：
  - `src/modules/runtime-session/runtime-session.service.ts`
  - `src/modules/freeze/freeze.service.ts`
- 当前状态：
  - RuntimeSession API 和 Redis freeze 逻辑同时存在
- 落地方式：
  - 重点改造
- 备注：
  - 需要把数据库状态与 Redis 高频状态统一起来

## 3.5 `browser-worker`

### `BWR-P0-01` Step 请求 DTO

- 服务：`browser-worker`
- 主要文件：
  - `src/dto/worker.dto.ts`
  - `src/modules/browser/browser.controller.ts`
- 当前状态：
  - `ExecuteStepDto` 已存在
- 落地方式：
  - 直接复用并按 `PlanStep` 契约做字段对齐

### `BWR-P0-02` Step 执行返回 DTO

- 服务：`browser-worker`
- 主要文件：
  - `src/dto/worker.dto.ts`
  - `src/modules/browser/browser.controller.ts`
  - `src/modules/browser/browser.service.ts`
- 当前状态：
  - `ExecuteStepResultDto` 已存在，含 `snapshotId / output / error / shouldTakeover`
- 落地方式：
  - 直接复用

### `BWR-P0-03` Freeze/Resume 执行配合

- 服务：`browser-worker`
- 当前状态：
  - `freeze` 侧在 `session-broker` 有 TODO 信号位
- 建议位置：
  - `src/modules/browser/browser.service.ts`
  - 必要时在 `src/modules/worker/worker.service.ts` 增加控制入口
- 落地方式：
  - 现有服务内新增或补全控制逻辑

## 3.6 `portal`

### `UI-P0-01` Execution 列表页

- 服务：`portal`
- 主要文件：
  - `src/pages/ExecutionListPage.tsx`
  - `src/api/execution.ts`
- 当前状态：
  - 页面和 API client 已存在
- 落地方式：
  - 直接复用并补真实过滤与跳转体验

### `UI-P0-02` Execution 详情与步骤时间线

- 服务：`portal`
- 主要文件：
  - `src/pages/ExecutionDetailPage.tsx`
  - `src/api/execution.ts`
- 当前状态：
  - 页面已存在，包含 steps progress 和 steps table
- 落地方式：
  - 直接复用

### `UI-P0-03` Execution 内联接管与恢复区

- 服务：`portal`
- 主要文件：
  - `src/pages/ExecutionDetailPage.tsx`
  - `src/pages/ExecutionListPage.tsx`
  - `src/components/execution/InlineRecoveryPanel.tsx`
  - `src/components/runtime/LiveSessionPreviewCard.tsx`
  - `src/api/execution.ts`
- 当前状态：
  - 详情页和列表页已内联接入恢复面板
  - `resume/cancel/reconcile` 已接 execution API
- 落地方式：
  - 直接复用并对接真实 runtime 连接信息

## 3.7 `auth`

### `AUTH-P0-01` Skill / SkillVersion 查询支撑

- 服务：`auth`
- 主要文件：
  - `src/modules/skill/skill.controller.ts`
  - `src/modules/skill/skill.service.ts`
- 当前状态：
  - `GET /skills`
  - `GET /skills/:id`
  - `POST /skills/match`
  - 已存在
- 落地方式：
  - 直接复用

### `AUTH-P0-02` 身份与 RBAC 校验支撑

- 服务：`auth`
- 主要文件：
  - `src/modules/auth/auth.controller.ts`
  - `src/modules/auth/auth.service.ts`
  - `src/guards/jwt-auth.guard.ts`
  - `src/guards/rbac.guard.ts`
- 当前状态：
  - `GET /auth/me` 已存在
- 落地方式：
  - 直接复用

---

## 4. 需要重点收口的代码边界

### 边界 1：`Execution.status`

- 应收口到：
  - `services/control-plane/src/modules/execution/execution.service.ts`
- 当前越界点：
  - `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
- 处理建议：
  - 将 finalize 和业务状态更新迁回 `control-plane`

### 边界 2：`RuntimeSession.state`

- 应收口到：
  - `services/session-broker/src/modules/runtime-session/runtime-session.service.ts`
- 当前分散点：
  - `freeze.service.ts` 的 Redis 状态位
- 处理建议：
  - 数据库状态为正式源，Redis 只保留高频控制态缓存

### 边界 3：Planner 输出协议

- 应收口到：
  - `ai-orchestrator` 内部的结构化 planner DTO
- 当前问题点：
  - `react-engine.service.ts`
  - `prompt-builder.ts`
  - `parseActionResponse()`
- 处理建议：
  - 主链不再依赖 ReAct 文本协议驱动 `Execution`

### 边界 4：Portal 主对象

- 应收口到：
  - `ExecutionListPage.tsx`
  - `ExecutionDetailPage.tsx`
  - `InlineRecoveryPanel.tsx`
- 当前旧语义来源：
  - 旧 `session` 页面和旧 `session` API
- 处理建议：
  - MVP 主入口全部围绕 `Execution`

---

## 5. 建议改动方式

### 直接复用

- `control-plane` 的 `Execution` 基础 API
- `session-broker` 的 `runtime-sessions` API
- `browser-worker` 的 `execute-step` DTO 和 controller
- `portal` 的 Execution 列表、详情和内联接管/恢复区
- `auth` 的 `auth/me` 和 `skills` 查询

### 重点改造

- `control-plane` 的 step 驱动协调
- `ai-orchestrator` 的 Planner 结构化输出
- `ai-orchestrator` 对 Execution 主状态的越界写入
- `session-broker` 的数据库状态与 Redis freeze 状态统一

### 现有服务内新增

- `control-plane` 的 `submit-input` 接口
- `control-plane` 的执行编排壳
- `ai-orchestrator` 的内部 planner endpoint 或 facade module
- `browser-worker` 的 freeze/resume 执行配合逻辑

---

## 6. 建议先看的代码路径

按 MVP 开发顺序，建议先看：

1. `services/control-plane/prisma/schema.prisma`
2. `services/control-plane/src/modules/execution/execution.service.ts`
3. `services/session-broker/src/modules/runtime-session/runtime-session.service.ts`
4. `services/browser-worker/src/dto/worker.dto.ts`
5. `services/browser-worker/src/modules/browser/browser.controller.ts`
6. `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
7. `services/portal/src/api/execution.ts`
8. `services/portal/src/pages/ExecutionListPage.tsx`
9. `services/portal/src/pages/ExecutionDetailPage.tsx`
10. `apps/frontend/portal/src/components/execution/InlineRecoveryPanel.tsx`

---

## 7. 一句话总结

这份 code mapping 的核心结论是：

> MVP 主链的大部分物理落点其实已经在仓库里，真正要做的是收口边界、替换主协议、补少量缺口，而不是重建一套新服务。
