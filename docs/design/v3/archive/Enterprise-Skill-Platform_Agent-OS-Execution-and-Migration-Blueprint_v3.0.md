# 企业级 Skill 平台 Agent OS 执行与迁移蓝图

**Agent OS Execution and Migration Blueprint v3.0**  
日期：2026-04-26

> 本文给出从当前仓库演进到 `Planner-only Agent OS` 的落地路线，重点回答 `Execution` 应如何建模、哪些模块应该导入、如何分阶段迁移而不打断现有能力。

---

## 1. 文档目标

本文回答以下问题：

- 新架构下 `Execution` 的主模型应该是什么
- `Execution`、`ExecutionStep`、`RuntimeSession` 的职责如何划分
- 当前仓库哪些模块可直接复用，哪些需要改造
- 从现在到 `v3` 目标架构的迁移顺序是什么

---

## 2. 执行主模型

### 2.1 `Execution` 是业务真相源

`Execution` 表示一次正式任务执行实例。

它回答：

- 谁发起了任务
- 使用了哪个 `SkillVersion`
- 当前任务处于什么业务状态
- 是否等待输入
- 是否等待审批
- 是否进入人工接管
- 最终是否成功

它不回答：

- 当前 browser worker 的 lease 是什么
- 当前 runtime 的底层连接句柄是什么
- 实际执行容器的系统级健康信息是什么

### 2.2 `ExecutionStep` 是最小业务可观测动作

`ExecutionStep` 表示执行内部的最小步骤，必须支持：

- step 级输入输出
- step 级重试
- step 级断言
- step 级失败原因
- step 级审批点
- step 级接管恢复点

### 2.3 `RuntimeSession` 是资源真相源

`RuntimeSession` 是 `Execution` 使用的承载资源。

它回答：

- 分配到哪个 worker / browser profile / code sandbox
- 当前资源状态是 `ready / busy / frozen / closed / error`
- 当前接入地址和健康状态是什么

它不回答：

- 当前任务在业务上是否成功
- 当前任务是否通过审批

---

## 3. 推荐状态机

### 3.1 `Execution.status`

建议统一为：

- `draft`
- `queued`
- `running`
- `waiting_input`
- `pending_approval`
- `human_control`
- `paused`
- `succeeded`
- `failed`
- `cancelled`
- `rolled_back`

### 3.2 `ExecutionStep.status`

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `blocked`

### 3.3 `RuntimeSession.state`

- `allocating`
- `ready`
- `busy`
- `frozen`
- `recovering`
- `closed`
- `error`

### 3.4 基本状态原则

- 已结束的 `Execution` 不能直接复活
- 重跑任务时新建 `Execution`
- `waiting_input`、`pending_approval`、`human_control` 不能混为同一状态
- `RuntimeSession` 可以关闭，但 `Execution` 仍可保留历史结果

---

## 4. Planner 与 Execution 的接口

### 4.1 Planner 输出对象

Planner 应输出：

- `Goal`
- `PlanDraft`
- `PlanStep[]`
- `VerificationRule[]`
- `RiskSummary`
- `RequiredInput[]`

不再依赖：

- 自由文本 `Thought`
- 文本正则解析 `Action`
- 模型临场拼接的半结构化控制协议

### 4.2 Execution 接收对象

`Execution Control Plane` 接收 `PlanDraft` 后应：

- 创建 `Execution`
- 固化 `skill_id / skill_version_id`
- 拆分生成 `ExecutionStep`
- 触发 Policy 预检查
- 决定是否直接进入 `queued` 或 `pending_approval`

### 4.3 Step 执行协议

每个 `ExecutionStep` 应包含：

- `step_index`
- `capability_name`
- `runtime_type`
- `input_payload`
- `verification_rule`
- `risk_level`
- `retry_policy`
- `fallback_strategy`

---

## 5. 需要导入的对象与表

建议优先建设以下对象：

- `skills`
- `skill_versions`
- `capabilities`
- `skill_capability_bindings`
- `executions`
- `execution_steps`
- `execution_events`
- `runtime_sessions`
- `approval_requests`
- `artifacts`
- `memory_items`
- `evaluations`
- `candidate_patches`
- `promotions`

### 5.1 `executions`

关键字段建议：

- `id`
- `user_id`
- `skill_id`
- `skill_version_id`
- `status`
- `goal`
- `normalized_input_json`
- `result_summary_json`
- `failure_summary_json`
- `risk_level`
- `current_step_index`
- `runtime_session_id`
- `started_at`
- `ended_at`

### 5.2 `execution_steps`

关键字段建议：

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
- `started_at`
- `ended_at`

### 5.3 `runtime_sessions`

关键字段建议：

- `id`
- `execution_id`
- `runtime_type`
- `worker_id`
- `resource_ref`
- `state`
- `control_mode`
- `connect_url`
- `health_status`
- `last_heartbeat_at`
- `closed_at`

### 5.4 `memory_items`

关键字段建议：

- `id`
- `scope_type`
- `scope_id`
- `memory_type`
- `content`
- `structured_payload_json`
- `confidence`
- `source_execution_id`
- `status`
- `ttl_at`

### 5.5 `candidate_patches`

关键字段建议：

- `id`
- `skill_id`
- `skill_version_id`
- `patch_type`
- `source_execution_id`
- `source_evaluation_id`
- `proposed_change_json`
- `validation_status`
- `review_status`
- `promotion_status`

---

## 6. 需要导入的现有模块

### 6.1 可直接复用

#### `control-plane`

用途：

- 作为 `Execution Control Plane` 起点

直接价值：

- 已有 `Execution` 生命周期管理雏形
- 已有接管和状态切换能力

#### `session-broker`

用途：

- 作为 `RuntimeSession Manager`

直接价值：

- 已有 runtime 分配和状态管理雏形
- 已有 freeze / resume 相关概念

#### `browser-worker`

用途：

- 作为 Browser Runtime

直接价值：

- 已有浏览器步骤执行入口

#### `auth/capability-release`

用途：

- 作为 `Validate / Review / Publish / Rollback` 主链

直接价值：

- 已有从构建到发布的流程基础
- 最适合承接 `Candidate Patch -> SkillVersion Draft`

### 6.2 可保留但要重构

#### `ai-orchestrator`

保留：

- Skill 路由
- Planner
- 参数提取
- Verifier
- Failure Classifier

重构点：

- 不再直接驱动高风险 runtime
- 不再直接持有业务执行状态
- 输出改为结构化 `PlanDraft`

### 6.3 只保留思路，不建议继续沿用

- 本地 `subprocess` 风格代码执行
- 强依赖 Prompt 文本协议的 ReAct 控制流
- 进程内临时失败记忆

---

## 7. 迁移路线

### Phase 0：梳理边界，不改主链路

目标：

- 明确谁是 `Execution` 真相源
- 明确谁是 `RuntimeSession` 真相源

动作：

- 为现有执行链补 `Execution` 和 `ExecutionStep` 归档
- 将 UI 查询入口先统一收敛到 `Execution`

交付：

- Execution 查询接口
- 基础 step log
- 基础 artifact 索引

### Phase 1：把 `ai-orchestrator` 降级为 Planner

目标：

- 让 `ai-orchestrator` 只负责理解、规划、验证

动作：

- 将工具自由调用改为产出 `PlanDraft`
- 将实际 step 执行下沉到 `Execution Control Plane`
- 将 `skill_match`、`flow_execute` 语义重写为 planner 产物

交付：

- `PlanDraft DTO`
- `ExecutionStep DTO`
- planner 到 control-plane 的接口

### Phase 2：统一 Runtime 承载

目标：

- 让 Browser / API / Code / Document 统一走 Runtime Plane

动作：

- 用 `RuntimeSession` 托管实际资源
- 补 heartbeat、freeze、recover、close
- 把浏览器和代码执行的资源状态从业务状态中剥离

交付：

- runtime 资源台账
- step 执行协议
- runtime 健康检查

### Phase 3：接入 Policy Plane

目标：

- 所有高风险步骤进入策略判定

动作：

- 引入风险等级
- 引入 capability 级授权
- 为写操作、出网、审批、接管设置 step gate

交付：

- `PolicyDecision`
- `ApprovalRequest`
- `DecisionRecord`

### Phase 4：接入 Memory Plane

目标：

- 让 Planner 不再只依赖聊天历史和 Prompt

动作：

- 先落 `Session Memory`
- 再落 `Skill Memory`
- 再扩展到 `User Memory`

交付：

- `memory_items`
- memory 检索与注入接口
- 记忆写入策略

### Phase 5：接入 Evolution Plane

目标：

- 让系统能从失败和接管中学习

动作：

- 落 `Evaluation`
- 落 `Candidate Patch`
- 将 patch 接到 `capability-release`

交付：

- 执行复盘器
- 人机差异分析器
- patch 校验与发布链

---

## 8. Execution 的运行协议

### 8.1 创建期

`Request -> Planner -> PlanDraft -> Policy Precheck -> Execution.created`

### 8.2 执行期

`ExecutionStep.pending -> Runtime invoke -> Verification -> next step / approval / takeover / fail`

### 8.3 中断期

可能中断为：

- `waiting_input`
- `pending_approval`
- `human_control`
- `paused`

恢复入口：

- 用户补参
- 审批通过
- 接管结束
- 系统恢复

### 8.4 结束期

最终收敛为：

- `succeeded`
- `failed`
- `cancelled`
- `rolled_back`

结束后统一触发：

- `Artifact finalize`
- `Evaluation enqueue`
- `Memory write decision`

---

## 9. Execution 的最小 API 建议

### 9.1 创建

- `POST /executions`

### 9.2 查询

- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `GET /executions/{id}/artifacts`

### 9.3 中断恢复

- `POST /executions/{id}/resume`
- `POST /executions/{id}/cancel`
- `POST /executions/{id}/submit-input`

### 9.4 治理动作

- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/release-human-control`

---

## 10. 风险点与约束

### 10.1 不要同时改三类真相源

迁移期必须避免：

- 业务状态在 `ai-orchestrator` 一份
- 业务状态在 `session-broker` 一份
- 业务状态在 `control-plane` 又一份

原则：

- `Execution` 是唯一业务真相源

### 10.2 不要把 Memory 当聊天历史存档

原则：

- Memory 必须结构化
- 必须可检索
- 必须有来源和可信度

### 10.3 不要让进化直接改线上版本

原则：

- 演进必须输出 `Candidate Patch`
- 上线必须经过 validate、review、publish

---

## 11. MVP 建议

第一阶段只要做到以下 6 件事，就能形成 `Planner-only Agent OS` 的最小闭环：

- `Execution` 成为主对象
- `RuntimeSession` 成为资源对象
- `ai-orchestrator` 只输出结构化计划
- Browser Runtime 接入统一 step 协议
- `Session Memory + Skill Memory` 可读可写
- 失败执行可生成 `Evaluation` 和初版 `Candidate Patch`

---

## 12. 一句话总结

`v3` 迁移的关键不是继续堆 Prompt，而是把现有仓库中的执行、资源、发布、学习能力真正拆到正确位置：

> `Planner` 负责理解与建议，`Execution` 负责状态与审计，`Runtime` 负责隔离执行，`Policy` 负责准入与接管，`Evolution` 负责让系统越跑越稳。
