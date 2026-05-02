# 企业级 Skill 平台 Agent OS 实施蓝图

**Implementation Blueprint v3.0**  
日期：2026-04-26

> 本文是 `v3` 的第一份实施蓝图，目标不是再重复原则，而是给出“第一阶段到底做什么、改什么、不改什么、谁负责什么”的直接落地方案。

---

## 1. 文档目标

本文聚焦以下问题：

- 第一阶段要落哪些对象、接口和状态
- 哪些服务先改，哪些服务后改
- 数据库、Redis、Object Storage 怎么分工
- `control-plane / ai-orchestrator / session-broker / browser-worker / auth / portal` 如何串成正式闭环

---

## 2. 第一阶段目标

第一阶段只追求一个最小闭环：

`用户发起任务 -> Planner 生成计划 -> Execution 创建 -> Browser Runtime 执行 -> 人工接管/恢复 -> 结果归档 -> 触发复盘入口`

### 2.0 MVP 实施原则

第一阶段必须明确按 `MVP` 心智落地：

- 先做 Browser 单 Runtime 闭环
- 先做 `Execution / RuntimeSession / ExecutionStep` 主对象
- 先做最小 Portal 工作台和最小接管链路
- 对后续阶段需要的接口先预留，不在本阶段展开完整能力

这里的“接口预留”指的是：

- 可以预留 `PolicyDecision` 挂点
- 可以预留 `Evaluation enqueue` 入口
- 可以预留 API Runtime / Document Runtime 的统一 step 契约
- 但不在 `Phase 1` 内实现完整治理、记忆、进化和多 Runtime 编排

### 2.1 `Phase 1` 在完整路线中的位置

`Phase 1` 的定位不是“先做一个简化版平台”，而是为后续阶段建立正式骨架。

它必须产出的不是功能堆叠，而是以下基础能力：

- 统一 `Execution` 主对象
- 统一 `RuntimeSession` 主对象
- 统一 step 执行协议
- 统一接管与恢复语义
- 统一执行结束后的复盘触发入口

这些能力将直接作为：

- `Phase 2` 的 Policy 与多 Runtime 接入底座
- `Phase 3` 的 Memory / Evaluation 数据来源
- `Phase 4` 的 Candidate Patch 与发布闭环输入

### 2.2 In-Scope

- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `ExecutionEvent`
- 最小 `Artifact`
- `PlanDraft`
- Browser Runtime 主链路
- `waiting_input / pending_approval / human_control`
- 最小 `Evaluation enqueue`

### 2.3 Out-of-Scope

- 完整 `memory-service`
- 完整 `policy-service`
- 多 Runtime 联合作业
- 正式 `artifact-service`
- 自动 patch 生成
- 全量文档 runtime 改造
- 完整审批中心和复杂运营视图
- 正式 API Runtime / Document Runtime 执行链
- 完整 `Evaluation` 生成与分析服务

当前允许保留但不正式实现的内容：

- `PolicyDecision` 的字段、DTO、内部接口占位
- `evaluations` / `candidate_patches` 的表或事件入口占位
- 统一 runtime step 契约中的 `api` / `document` 类型枚举

明确后置到后续阶段：

- `Phase 2`
  - `PolicyDecision`
  - API Runtime / Document Runtime 规范化接入
- `Phase 3`
  - `Session Memory / Skill Memory / User Memory`
  - 正式 `evaluation-service`
- `Phase 4`
  - `CandidatePatch`
  - SkillVersion Draft 自动生成
- `Phase 5`
  - Code Runtime
  - Replay / Benchmark / Promotion 深化

---

## 3. 第一阶段核心策略

### 3.1 先改写入边界，再改物理架构

第一阶段的关键不是“拆服务”，而是：

- 把 `Execution.status` 收敛到 `control-plane`
- 把 `RuntimeSession.state` 收敛到 `session-broker`
- 把 Planner 收敛为 `PlanDraft` 生产者

### 3.2 优先跑通 Browser 主链路

原因：

- 当前仓库 Browser 能力最成熟
- takeover / freeze / resume 已有雏形
- 更容易验证 `Execution + RuntimeSession` 边界

### 3.3 只做足够支撑下一阶段的数据模型

第一阶段表不追求一步到位，但必须为后续 `Memory / Evaluation / CandidatePatch` 留钩子。

具体要求：

- `Execution` 必须能为后续 Memory 提供来源
- `ExecutionStep` 必须能为后续 Evaluation 提供足够粒度的输入
- `Artifact` 必须能为后续 Patch 评估提供证据链

### 3.4 预留接口，但不提前做实

第一阶段允许为了后续演进保留少量接口，但必须遵守：

- 接口存在不代表能力在本阶段 fully on
- 占位接口优先作为内部接口，不优先暴露复杂外部 API
- 占位表结构优先保留主键、关联键和必要枚举，不提前扩展大字段集
- 任何新增接口如果不能支撑 Browser MVP 闭环，应默认后置

---

## 4. 第一阶段要落的对象

### 4.1 `Execution`

职责：

- 业务真相源

必需字段：

- `id`
- `user_id`
- `skill_id`
- `skill_version_id`
- `status`
- `goal`
- `normalized_input_json`
- `plan_snapshot_json`
- `risk_level`
- `runtime_session_id`
- `current_step_index`
- `result_summary_json`
- `failure_summary_json`
- `started_at`
- `ended_at`

### 4.2 `ExecutionStep`

职责：

- step 级可观测动作

必需字段：

- `id`
- `execution_id`
- `step_index`
- `title`
- `capability_name`
- `runtime_type`
- `status`
- `input_json`
- `output_json`
- `verification_result_json`
- `failure_reason_json`
- `retry_count`

### 4.3 `RuntimeSession`

职责：

- 资源真相源

必需字段：

- `id`
- `execution_id`
- `runtime_type`
- `worker_id`
- `resource_ref`
- `state`
- `control_mode`
- `connect_url`
- `health_status`

### 4.4 `ExecutionEvent`

职责：

- 状态变更归档

### 4.5 `Artifact`

职责：

- 最小 screenshot / snapshot / trace / output 索引

### 4.6 `Evaluation enqueue`

第一阶段不实现完整 Evaluation 服务，但要在执行结束后留统一触发入口。

---

## 5. 第一阶段状态模型

### 5.1 `Execution.status`

第一阶段强制支持：

- `draft`
- `queued`
- `running`
- `waiting_input`
- `pending_approval`
- `human_control`
- `succeeded`
- `failed`
- `cancelled`

### 5.2 `RuntimeSession.state`

第一阶段强制支持：

- `allocating`
- `ready`
- `busy`
- `frozen`
- `closed`
- `error`

### 5.3 `ExecutionStep.status`

第一阶段强制支持：

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `blocked`

---

## 6. 存储分工

### 6.1 PostgreSQL

保存：

- `executions`
- `execution_steps`
- `execution_events`
- `runtime_sessions`
- `artifacts`

### 6.2 Redis

保存：

- 当前 step 指针缓存
- runtime 高频状态
- lock / lease
- freeze 原子状态

建议 key：

- `execution:{id}:current_step`
- `runtime:{id}:state`
- `runtime:{id}:control_mode`
- `lock:profile:{profile_id}`
- `lease:runtime:{id}`

### 6.3 Object Storage

保存：

- `screenshot`
- `browser_snapshot`
- `trace`
- `document_output`

---

## 7. 服务职责切分

### 7.1 `control-plane`

第一阶段必须承接：

- 外部 `Execution` API
- 创建 `Execution`
- 更新 `Execution.status`
- 维护 `ExecutionStep`
- 协调审批、接管、恢复
- 写 `ExecutionEvent`

### 7.2 `ai-orchestrator`

第一阶段必须收敛为：

- Goal 理解
- Skill 路由
- `PlanDraft` 生成
- 参数缺失识别
- 结果验证
- 失败分类

第一阶段不再负责：

- 写 `Execution.status`
- 直接执行高风险动作
- 决定最终业务成功

### 7.3 `session-broker`

第一阶段必须承接：

- `RuntimeSession` 分配
- worker / profile 绑定
- `RuntimeSession.state`
- freeze / resume / close

### 7.4 `browser-worker`

第一阶段必须承接：

- Browser step 执行
- step 结果返回
- snapshot / trace 引用返回
- takeover 建议返回

### 7.5 `auth`

第一阶段必须承接：

- 用户身份与 RBAC
- Skill / SkillVersion 查询
- capability-release 保持不动

### 7.6 `portal`

第一阶段必须承接：

- Execution 列表
- Execution 详情
- 人工接管入口
- 审批入口

---

## 8. 第一阶段主链路

### 8.1 创建执行

1. `portal` 调用 `POST /executions`
2. `control-plane` 调 `ai-orchestrator` 生成 `PlanDraft`
3. `control-plane` 做预检查并创建 `Execution`
4. 根据状态进入：
   - `waiting_input`
   - `pending_approval`
   - `queued`

### 8.2 启动执行

1. `control-plane` 请求 `session-broker` 分配 `RuntimeSession`
2. `RuntimeSession` 进入 `allocating -> ready`
3. `control-plane` 将 `Execution` 切到 `running`
4. `control-plane` 驱动当前 step 执行

### 8.3 Step 执行

1. `control-plane` 选取当前 `ExecutionStep`
2. 调用 `browser-worker`
3. `browser-worker` 返回：
   - step output
   - snapshot refs
   - assertion result
   - takeover hint
4. `control-plane` 更新 `ExecutionStep`
5. 如需验证，调用 `ai-orchestrator`

### 8.4 人工接管

1. `browser-worker` 或 `control-plane` 判断需接管
2. `control-plane` 将 `Execution.status = human_control`
3. `session-broker` 将 `RuntimeSession.control_mode = HUMAN_CONTROL`
4. `portal` 打开接管工作台

### 8.5 恢复执行

1. 用户在接管工作台完成操作
2. `portal` 调用 `POST /executions/{id}/release-human-control`
3. `session-broker` 恢复 runtime
4. `control-plane` 恢复 `Execution.running`

### 8.6 完成执行

1. 所有 step 完成
2. `control-plane` 更新 `Execution.succeeded` 或 `Execution.failed`
3. 写入 `ExecutionEvent`
4. 写入 `Artifact`
5. 触发 `Evaluation enqueue`

---

## 9. 第一阶段 API 落地优先级

### P0

- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `POST /executions/{id}/submit-input`
- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/release-human-control`
- `POST /executions/{id}/cancel`

### P1

- `GET /executions/{id}/artifacts`
- 内部 `plans:verify`
- 内部 `failures:classify`

### Reserved Only

以下内容可保留接口方向，但不要求在 `Phase 1` 正式实现：

- 内部 `policy:precheck`
- 内部 `policy:step-check`
- 内部 `policy:postcheck`
- 内部 runtime `api/document steps:execute`
- `evaluations:generate`

---

## 10. 第一阶段数据库落地优先级

### P0 表

- `executions`
- `execution_steps`
- `runtime_sessions`
- `execution_events`

### P1 表

- `artifacts`
- `evaluations` 占位表
- `candidate_patches` 占位表

说明：

- `evaluations` 和 `candidate_patches` 在 `Phase 1` 只允许做轻量占位
- 如果实现成本过高，可先只保留事件入口和 schema 设计，不强制落表

---

## 11. 第一阶段不该做的事

- 不要继续在 `ai-orchestrator` 中扩展自由工具能力
- 不要让 `session-broker` 继续持有业务成功失败语义
- 不要让 `portal` 自己拼业务状态机
- 不要急着先拆出太多新服务
- 不要为了“以后可能会用到”先把 API Runtime / Document Runtime 做进主链
- 不要为了“接口完整”提前做复杂审批中心、Memory 面板、运营后台

---

## 12. 第一阶段完成标准

以下条件全部满足时，可认为第一阶段达标：

- `Execution` 成为业务真相源
- `RuntimeSession` 成为资源真相源
- Browser 链路已走统一 step 协议
- `waiting_input / pending_approval / human_control` 已打通
- Portal 能查看 Execution、步骤、产物和接管状态
- 执行结束能触发统一复盘入口

并且应满足以下交接条件，才能进入下一阶段：

- `Phase 2` 交接条件
  - 高风险动作已经有明确 step 边界，可挂 Policy gate
  - Runtime 类型扩展点已明确，不再是 Browser 特例硬编码
- `Phase 3` 交接条件
  - Execution / Step / Artifact 已能提供结构化复盘输入
  - Planner 输入输出已具备稳定结构，适合引入 Memory 注入

---

## 13. 一句话总结

第一阶段的实施核心是：

> 不追求把 Agent OS 一次性做完，而是先把 Browser MVP 闭环做实，同时为后续治理、记忆和多 Runtime 预留接口。
