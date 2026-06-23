# 企业级 Skill 平台 Execution 写入口矩阵

**Execution Write Path Matrix v3.0**  
日期：2026-05-01

> 本文对应 Phase 1 Task A，用于回答三个问题：
>
> 1. 当前谁在写 `Execution`
> 2. 当前谁在写 `ExecutionStep`
> 3. 当前谁在写 `ExecutionEvent`
>
> 文档目标不是重新设计，而是先给出一份真实、可核对的写入口基线，供后续“执行边界收口”改造使用。

---

## 1. 结论摘要

当前执行链路的事实状态源主要在 `control-plane`，这是正确方向。

但仍存在一个关键边界风险：

- `ai-orchestrator` 内还保留 `ExecutionStep` 的本地数据库写能力

因此当前状态应判断为：

- `Execution` 主写入口：**基本收口到 `control-plane`**
- `ExecutionEvent` 主写入口：**已收口到 `control-plane`**
- `ExecutionStep` 主写入口：**以 `control-plane` 为主，但存在 `ai-orchestrator` 残留直写能力**

---

## 2. 盘点范围

本次盘点覆盖以下三类入口：

- Prisma 直接写入
- 通过事务组合的写入
- 通过 HTTP API 间接触发 `control-plane` 写入

本次不计入以下内容：

- 测试 mock
- 纯查询接口
- `RuntimeSession` 等非执行主表写入

---

## 3. 总体判断

### 3.1 正式事实写入口

当前正式事实写入口应认定为：

- `services/control-plane/src/modules/execution/execution.service.ts`

理由：

- `Execution` 创建、状态迁移、步骤创建、步骤完成、失败回写、事件记录、删除都集中在这里
- `ExecutionController` 对外暴露的写接口全部落到该 service

### 3.2 临时间接写入口

以下位置本身不直接写库，但会通过 API 调 `control-plane`，因此属于“间接触发正式写入口”：

- `services/ai-orchestrator/src/controllers/chat.controller.ts`
- `services/ai-orchestrator/src/modules/react-engine/tools/browser-step.tool.ts`

### 3.3 待移除或降级入口

以下位置仍然拥有不应继续保留的本地写库能力：

- `services/ai-orchestrator/src/modules/execution-step/execution-step.service.ts`

判断：

- 属于 Phase 1 必须收口的残留能力

---

## 4. 写入口矩阵

| 目标对象             | 写入口位置                                  | 写入方式                                  | 当前角色判断      | 处理建议                         |
| -------------------- | ------------------------------------------- | ----------------------------------------- | ----------------- | -------------------------------- |
| `Execution`          | `control-plane/execution.service.ts`        | Prisma 直写                               | 正式入口          | 保留并拆层                       |
| `ExecutionStep`      | `control-plane/execution.service.ts`        | Prisma 直写 / `createMany` / `updateMany` | 正式入口          | 保留并拆层                       |
| `ExecutionEvent`     | `control-plane/execution.service.ts`        | Prisma 直写                               | 正式入口          | 保留并拆层                       |
| `ExecutionStep`      | `ai-orchestrator/execution-step.service.ts` | Prisma 直写                               | 残留兼容 / 待移除 | 改为只读或改为调 `control-plane` |
| `Execution` 相关状态 | `ai-orchestrator/chat.controller.ts`        | HTTP 调 `control-plane`                   | 间接入口          | 保留，但抽 client                |
| `Execution` takeover | `ai-orchestrator/browser-step.tool.ts`      | HTTP 调 `control-plane`                   | 间接入口          | 保留，但标准化内部契约           |

---

## 5. `Execution` 写入口明细

## 5.1 正式入口：`control-plane`

文件：

- `services/control-plane/src/modules/execution/execution.service.ts`

已识别出的主要写操作包括：

- 创建执行单
- 更新执行状态
- 更新审批状态
- 更新失败原因与失败码
- 设置当前步骤
- 更新结果
- 删除执行单

核心写场景：

### A. 创建执行单

- `create()` 中写入 `prisma.execution.create`
- 创建后立即记录 `execution.created`
- 根据计划生成步骤，并按情况进入 `queued / pending_approval / waiting_input`

### B. 主状态迁移

- `updateStatus()` 中统一做状态校验与状态更新
- 会同步记录 `execution.status_changed`

### C. 接管与恢复

- `takeover()` 直接将状态写为 `human_control`
- `resume()` 通过 `updateStatus()` 回到 `running`
- 同时联动 `runtime-session` 冻结和恢复

### D. 审批链路

- `approve()` 更新 `approvalStatus = approved`
- 然后迁移到 `queued`
- `reject()` 更新 `approvalStatus = rejected`
- 同时写失败原因并迁移到 `cancelled`

### E. 缺参恢复

- `submitInputAndResume()` 在事务中同时更新：
  - `executionStep`
  - `execution.normalizedInputJson`
  - `execution.status`
- 若条件满足，再恢复执行

### F. 运行结果回写

- 浏览器步骤失败时回写 `failureReason / failureCode`
- 系统技能执行成功时回写 `resultJson`
- 系统技能执行失败时回写失败原因

### G. 删除

- `delete()` 中删除：
  - `execution_steps`
  - `execution_events`
  - `execution`

判断：

- `Execution` 当前已基本收口到 `control-plane`

---

## 6. `ExecutionStep` 写入口明细

## 6.1 正式入口：`control-plane`

文件：

- `services/control-plane/src/modules/execution/execution.service.ts`

已识别出的主要写操作包括：

- `createPlannedSteps()` 中 `createMany`
- `bootstrapBrowserExecution()` 中按需创建浏览器启动步骤
- `handleBrowserStepResult()` 中更新步骤成功/失败
- `handleSystemSkillStepResult()` 中更新步骤成功/失败
- `enterWaitingInput()` 中将输入收集步骤置为运行态
- `submitInputAndResume()` 中更新输入收集步骤
- `skipPendingSteps()` 中批量将剩余步骤置为 `skipped`
- `skipSingleStep()` 中单步置为 `skipped`

判断：

- `control-plane` 已经承担了执行步骤的主生命周期落库

## 6.2 残留直写入口：`ai-orchestrator`

文件：

- `services/ai-orchestrator/src/modules/execution-step/execution-step.service.ts`

当前能力：

- `createStep()`
- `createSteps()`
- `updateStep()`
- `updateStepStatus()`

问题：

- 它仍然直接写 `prisma.executionStep`
- 虽然 `react-engine.service.ts` 已明确把步骤状态写入委托给 `control-plane`，但这个模块仍然存在，会制造“还有第二个事实写入口”的认知和后续误用风险

判断：

- 当前应标记为：`待移除 / 待降级`

建议：

- Phase 1 先改成：
  - 只读查询适配器，或
  - 改为调 `control-plane` 的内部接口
- Phase 2 再考虑彻底删除本地持久化实现

---

## 7. `ExecutionEvent` 写入口明细

## 7.1 正式入口：`control-plane`

文件：

- `services/control-plane/src/modules/execution/execution.service.ts`

事件写入方式分两类：

### A. 统一入口 `createEvent()`

该方法会：

- 写入 `prisma.executionEvent.create`
- 同时向 SSE 订阅者推送事件

### B. 局部直接写事件

除统一入口外，当前还有若干位置直接写 `prisma.executionEvent.create`，例如：

- `submitInputAndResume()`
- `executeBrowserGotoStep()`
- `skipPendingSteps()`
- `skipSingleStep()`
- `enterWaitingInput()`

问题：

- 虽然这些仍在 `control-plane` 内部，事实源没有漂移
- 但事件写入口分散，不利于后续治理

判断：

- 仍属于“正式入口内部实现分散”

建议：

- Phase 1.5 或 Phase 2 将局部直接写事件收敛回统一 `ExecutionEventService`

---

## 8. 间接写入口明细

## 8.1 `ai-orchestrator` Chat 层

文件：

- `services/ai-orchestrator/src/controllers/chat.controller.ts`

当前通过 HTTP 调 `control-plane` 触发以下写操作：

- `POST /executions`
- `POST /executions/:id/submit-input`

同时会观察：

- `GET /executions/:id`
- `GET /executions/:id/steps`
- `GET /executions/:id/events/stream`

判断：

- 这是合理的“编排入口 -> 控制面”关系
- 但应该从 controller 内抽成独立 `control-plane client`

## 8.2 `ai-orchestrator` Browser Tool

文件：

- `services/ai-orchestrator/src/modules/react-engine/tools/browser-step.tool.ts`

当前在浏览器步骤需要人工接管时，会调用：

- `POST /api/executions/:id/takeover`

判断：

- 这是合理的间接触发控制面写入
- 但内部契约、认证头和错误处理应标准化

---

## 9. 未发现的额外写入口

本次扫描未发现以下情况：

- `auth` 直接写 `execution / execution_steps / execution_events`
- `session-broker` 直接写 `execution / execution_steps / execution_events`
- 通过原始 SQL 对执行主表做额外写入

说明：

- `auth`、`session-broker` 会参与执行链路，但当前未被识别为执行主表事实写入口
- `session-broker` 写的是 `RuntimeSession`，不属于本次主写入口盘点范围

---

## 10. 现状分类

建议按以下方式标记当前入口：

### 正式入口

- `control-plane/src/modules/execution/execution.service.ts`

### 临时兼容入口

- `ai-orchestrator/src/controllers/chat.controller.ts`
- `ai-orchestrator/src/modules/react-engine/tools/browser-step.tool.ts`

### 待移除入口

- `ai-orchestrator/src/modules/execution-step/execution-step.service.ts`

---

## 11. 直接后续动作

基于本矩阵，Phase 1 下一步应立即进入：

1. 在 `control-plane` 内拆分 `execution.service.ts`
2. 明确 `ExecutionStep` 正式写入口服务
3. 将 `ai-orchestrator/execution-step.service.ts` 改成只读或 API client
4. 收敛 `ExecutionEvent` 的分散写入点
5. 为 `create / approve / reject / takeover / submit-input / cancel` 建立回归测试

---

## 12. 一句话判断

当前仓库离“执行边界收口完成”只差最后一层：

- 正式事实源已经基本在 `control-plane`
- 但还必须移除 `ai-orchestrator` 中残留的 `ExecutionStep` 本地写能力

这就是 Phase 1 的最高优先级切口。
