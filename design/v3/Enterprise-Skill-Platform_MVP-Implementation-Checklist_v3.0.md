# 企业级 Skill 平台 Agent OS MVP 实施清单

**MVP Implementation Checklist v3.0**  
日期：2026-04-26

> 本文不是新的架构蓝图，而是把当前 `Phase 1` 收敛成一份可以直接开工的 `MVP 实施清单 v1`。目标是确保团队优先做出最小 Browser 闭环，同时把 `Phase 2/3/4/5` 的内容控制在接口预留层。

---

## 1. MVP 目标

本次 MVP 只交付一个最小但正式可用的 Browser 闭环：

`用户发起任务 -> Planner 生成结构化计划 -> Execution 创建 -> RuntimeSession 分配 -> Browser step 执行 -> 人工接管/恢复 -> 结果归档 -> 复盘入口触发`

MVP 的判断标准只有 3 条：

- 主对象成立
  - `Execution` 是业务真相源
  - `RuntimeSession` 是资源真相源
- 主链跑通
  - Browser step 能被统一下发、执行、记录、恢复
- 边界守住
  - `ai-orchestrator` 不再充当高权限执行器
  - `policy / memory / evaluation` 不提前做成完整主链

---

## 2. 实施范围

### 2.1 In-Scope

- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `ExecutionEvent`
- 最小 `Artifact`
- `PlanDraft`
- Browser Runtime 主链
- `human_control`
- 最小 `waiting_input`
- 最小 `Evaluation enqueue`

### 2.2 Out-of-Scope

- 完整 `policy-service`
- 完整审批中心
- API Runtime / Document Runtime 正式执行链
- 完整 `memory-service`
- 完整 `evaluation-service`
- `CandidatePatch`
- `Code Runtime`
- Replay / Benchmark / Canary / Shadow

### 2.3 Reserved Only

以下内容只允许预留接口或数据占位，不在 MVP 中做实：

- `PolicyDecision` 挂点
- `policy:precheck / step-check / postcheck`
- `evaluations:generate`
- API / Document runtime step 接口
- `evaluations` / `candidate_patches` 占位结构

---

## 3. MVP 必交付

### 3.1 数据模型

P0：

- `executions`
- `execution_steps`
- `runtime_sessions`
- `execution_events`

P1：

- `artifacts`

Reserved：

- `evaluations`
- `candidate_patches`

最小要求：

- 能创建 `Execution`
- 能记录 step 和状态迁移
- 能记录 runtime 分配与冻结恢复
- 能保存最小 screenshot / trace 引用

### 3.2 `control-plane`

P0：

- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `POST /executions/{id}/submit-input`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/release-human-control`
- `Execution.status` 单写入口
- `ExecutionStep` 创建与更新
- `ExecutionEvent` 写入

P1：

- `GET /executions/{id}/artifacts`
- `POST /executions/{id}/cancel`
- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`

最小验收：

- `control-plane` 成为唯一业务状态写入口
- 可以串起 Planner、RuntimeManager、BrowserRuntime

### 3.3 `ai-orchestrator`

P0：

- 内部 `plans:generate`
- 输出 `PlanDraft`
- 输出 `PlanStep[]`
- 输出 `RequiredInput[]`

P1：

- 内部 `plans:verify`
- 内部 `failures:classify`
- 输出 `RiskSummary`

最小验收：

- Planner 返回结构化计划
- 不再直接写 `Execution.status`
- 不再作为高风险动作主执行器

### 3.4 `session-broker`

P0：

- `RuntimeSession` 分配
- `RuntimeSession.state` 维护
- worker / profile 绑定
- freeze / resume / close

P1：

- lease / lock 优化
- health heartbeat 完整化

最小验收：

- `RuntimeSession.state` 只由 `session-broker` 维护
- 接管时可冻结，恢复时可继续执行

### 3.5 `browser-worker`

P0：

- 统一 Browser step 请求协议
- 统一 Browser step 返回协议
- snapshot / trace 引用返回
- takeover hint 返回

P1：

- 健康检查增强
- 错误分类增强

最小验收：

- step 能被统一执行和记录
- takeover / resume 不依赖临时人工脚本

### 3.6 `portal`

P0：

- Execution 列表
- Execution 详情
- Step 时间线
- Takeover Workbench

P1：

- Artifact 列表
- Approval 页面

最小验收：

- 用户围绕 `Execution` 查看任务，而不是围绕旧 `session`
- 用户可以进入接管并恢复执行

### 3.7 `auth`

P0：

- 身份认证
- RBAC
- Skill / SkillVersion 查询

P1：

- 为后续 release / evaluation 预留接入位

最小验收：

- 不大改当前边界，只补 MVP 所需依赖

---

## 4. 实施顺序

推荐按以下顺序推进：

1. 数据模型
2. `control-plane` 基础 API
3. `session-broker` 的 `RuntimeSession`
4. `browser-worker` step 协议
5. `ai-orchestrator` 的 `PlanDraft`
6. `portal` 最小工作台
7. `Artifact` 与 `Evaluation enqueue` 占位

排序原则：

- 先收敛状态和写入口
- 再打通 runtime 主链
- 最后切 Planner 输出和前端体验

---

## 5. MVP 三阶段排期

### Stage A

- 数据模型
- `control-plane` 基础 API
- `session-broker` `RuntimeSession`

退出条件：

- 可以创建 `Execution`
- 可以分配并释放 `RuntimeSession`

### Stage B

- `browser-worker` 统一 step 协议
- `control-plane` 协调执行
- `human_control` 闭环

退出条件：

- Browser step 可以统一执行
- 接管与恢复可跑通

### Stage C

- `ai-orchestrator` `PlanDraft`
- `portal` 最小工作台
- `waiting_input`
- `Evaluation enqueue` 占位

退出条件：

- 用户可以从 Portal 发起、查看、接管、恢复一个 Execution
- 执行结束后可进入统一复盘入口

---

## 6. 验收清单

全部满足时，MVP 可视为完成：

- 用户可以创建一个 `Execution`
- Planner 可以返回结构化 `PlanDraft`
- `RuntimeSession` 可以被分配、冻结、恢复、关闭
- Browser step 可以被统一执行和记录
- 任务可以进入 `waiting_input`
- 任务可以进入 `human_control`
- Portal 可以查看 Execution 和步骤时间线
- 用户可以通过工作台完成接管和恢复
- 执行结束后可以写入事件、最小产物和复盘入口

---

## 7. 明确不做

- 不把 `pending_approval` 做成复杂审批中心
- 不把 API Runtime / Document Runtime 拉入主链
- 不把 Memory 做成聊天历史增强版产品
- 不把 Evaluation 做成完整分析服务
- 不新拆一批物理服务
- 不在 `ai-orchestrator` 里继续扩自由工具执行

---

## 8. 进入下一阶段前必须保留的接口

为避免后续返工，MVP 完成时应保留以下接口或挂点：

- `PolicyDecision` 的 precheck / step-check 挂点
- `ExecutionStep.runtime_type` 的扩展位
- `Evaluation enqueue` 的统一触发入口
- `Artifact` 的统一引用模型
- `failure_reason_json` 和接管记录字段

这些内容的目标是：

- 让 `Phase 2` 可以接入治理
- 让 `Phase 3` 可以接入记忆与复盘
- 让 `Phase 4` 可以接入候选改进链

---

## 9. 一句话总结

当前 `MVP 实施清单 v1` 的核心判断是：

> 只做最小 Browser 闭环，把主对象、主状态和主边界做实；后续能力先留接口，不提前做大。
