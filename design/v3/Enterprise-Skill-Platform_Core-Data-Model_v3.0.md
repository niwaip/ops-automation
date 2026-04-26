# 企业级 Skill 平台 Agent OS 核心数据模型

**Core Data Model v3.0**  
日期：2026-04-26

> 本文定义 `Planner-only Agent OS` 的核心对象模型，目标是为 `Execution`、`RuntimeSession`、`Memory` 和 `Evolution` 提供统一的数据骨架。本文不追求一次性给出全部字段，而是给出能够支撑 `v3` 演进的最小稳定模型。

---

## 1. 设计目标

本文回答以下问题：

- `v3` 中哪些对象必须是一等对象
- 这些对象之间的关系是什么
- 哪些字段必须在第一阶段就具备
- 哪些字段可以后置

---

## 2. 设计原则

### 2.1 业务与资源分离

- `Execution` 表示业务执行
- `RuntimeSession` 表示资源承载

### 2.2 计划与执行分离

- `PlanDraft` 来自 Planner
- `ExecutionStep` 来自 Execution Control Plane

### 2.3 运行与进化分离

- 执行过程只读取 `Published SkillVersion`
- 学习过程产出 `MemoryItem` 或 `CandidatePatch`

### 2.4 状态必须可审计

- 核心对象必须有状态
- 核心状态切换必须可追溯

---

## 3. 一等对象清单

`v3` 推荐至少包含以下对象：

- `Skill`
- `SkillVersion`
- `Capability`
- `Execution`
- `ExecutionStep`
- `ExecutionEvent`
- `RuntimeSession`
- `ApprovalRequest`
- `Artifact`
- `Policy`
- `MemoryItem`
- `Evaluation`
- `CandidatePatch`
- `Promotion`

---

## 4. 对象关系总览

### 4.1 主关系

- 一个 `Skill` 有多个 `SkillVersion`
- 一个 `SkillVersion` 可绑定多个 `Capability`
- 一个 `Execution` 只执行一个 `SkillVersion`
- 一个 `Execution` 有多个 `ExecutionStep`
- 一个 `Execution` 可关联零个或一个当前 `RuntimeSession`
- 一个 `Execution` 可产生多个 `Artifact`
- 一个 `Execution` 可触发零个或多个 `ApprovalRequest`
- 一个 `Execution` 结束后可触发零个或多个 `Evaluation`
- 一个 `Evaluation` 可生成零个或多个 `CandidatePatch`
- 一个 `CandidatePatch` 可最终形成一个新的 `SkillVersion`

### 4.2 Memory 关系

- `MemoryItem` 可挂在 `session`
- `MemoryItem` 可挂在 `user`
- `MemoryItem` 可挂在 `skill`
- `MemoryItem` 可挂在 `org`

---

## 5. 核心对象定义

### 5.1 `Skill`

职责：

- 业务能力定义的主对象

最小字段建议：

- `id`
- `name`
- `description`
- `owner_team_id`
- `status`
- `default_risk_level`
- `created_at`
- `updated_at`

### 5.2 `SkillVersion`

职责：

- `Skill` 的版本化交付单元

最小字段建议：

- `id`
- `skill_id`
- `version`
- `status`
- `definition_json`
- `planner_contract_json`
- `verification_contract_json`
- `policy_snapshot_json`
- `published_at`
- `created_at`

说明：

- `definition_json` 用于描述执行流程、能力绑定和版本结构
- `planner_contract_json` 用于约束 Planner 输出与执行入口

### 5.3 `Capability`

职责：

- 平台可被 runtime 调用的 typed 原子能力

最小字段建议：

- `id`
- `name`
- `runtime_type`
- `input_schema_json`
- `output_schema_json`
- `risk_level`
- `audit_tag`
- `status`

### 5.4 `Execution`

职责：

- 正式业务执行实例

最小字段建议：

- `id`
- `user_id`
- `skill_id`
- `skill_version_id`
- `status`
- `goal`
- `normalized_input_json`
- `plan_snapshot_json`
- `result_summary_json`
- `failure_summary_json`
- `risk_level`
- `current_step_index`
- `runtime_session_id`
- `started_at`
- `ended_at`
- `created_at`

### 5.5 `ExecutionStep`

职责：

- `Execution` 内最小业务可观测动作

最小字段建议：

- `id`
- `execution_id`
- `step_index`
- `title`
- `capability_name`
- `runtime_type`
- `status`
- `input_json`
- `output_json`
- `verification_rule_json`
- `verification_result_json`
- `failure_reason_json`
- `retry_count`
- `started_at`
- `ended_at`

### 5.6 `ExecutionEvent`

职责：

- 归档状态变化与关键动作

最小字段建议：

- `id`
- `execution_id`
- `step_id`
- `event_type`
- `event_payload_json`
- `actor_type`
- `actor_id`
- `created_at`

### 5.7 `RuntimeSession`

职责：

- 实际运行资源的承载对象

最小字段建议：

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
- `allocated_at`
- `closed_at`

### 5.8 `ApprovalRequest`

职责：

- 记录审批流程中的请求和结论

最小字段建议：

- `id`
- `execution_id`
- `step_id`
- `policy_id`
- `status`
- `risk_level`
- `reason`
- `approver_id`
- `decision_payload_json`
- `requested_at`
- `decided_at`

### 5.9 `Artifact`

职责：

- 执行产物索引

最小字段建议：

- `id`
- `execution_id`
- `step_id`
- `artifact_type`
- `storage_uri`
- `metadata_json`
- `created_at`

### 5.10 `Policy`

职责：

- 记录治理规则

最小字段建议：

- `id`
- `name`
- `scope_type`
- `scope_id`
- `policy_type`
- `policy_rule_json`
- `status`
- `version`
- `created_at`

### 5.11 `MemoryItem`

职责：

- 平台长期记忆单元

最小字段建议：

- `id`
- `scope_type`
- `scope_id`
- `memory_type`
- `title`
- `content`
- `structured_payload_json`
- `confidence`
- `source_execution_id`
- `source_step_id`
- `status`
- `ttl_at`
- `last_used_at`
- `created_at`

### 5.12 `Evaluation`

职责：

- 执行复盘对象

最小字段建议：

- `id`
- `execution_id`
- `evaluation_type`
- `summary`
- `input_snapshot_json`
- `result_snapshot_json`
- `human_diff_json`
- `failure_analysis_json`
- `status`
- `created_at`

### 5.13 `CandidatePatch`

职责：

- 受控进化候选项

最小字段建议：

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
- `created_at`

### 5.14 `Promotion`

职责：

- 发布、灰度、回滚的正式记录

最小字段建议：

- `id`
- `target_type`
- `target_id`
- `promotion_type`
- `status`
- `release_notes`
- `approved_by`
- `started_at`
- `ended_at`

---

## 6. 关键枚举建议

### 6.1 `Execution.status`

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

### 6.2 `ExecutionStep.status`

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `blocked`

### 6.3 `RuntimeSession.state`

- `allocating`
- `ready`
- `busy`
- `frozen`
- `recovering`
- `closed`
- `error`

### 6.4 `MemoryItem.scope_type`

- `session`
- `user`
- `skill`
- `org`

### 6.5 `MemoryItem.memory_type`

- `preference`
- `fact`
- `pattern`
- `pitfall`
- `postmortem`
- `hint`

### 6.6 `CandidatePatch.patch_type`

- `memory_patch`
- `plan_patch`
- `policy_patch`
- `skill_version_patch`

---

## 7. 第一阶段必须落地的表

为了支撑 `Planner-only Agent OS` 的最小闭环，第一阶段建议强制落地：

- `executions`
- `execution_steps`
- `execution_events`
- `runtime_sessions`
- `artifacts`
- `memory_items`
- `evaluations`
- `candidate_patches`

以下对象可先复用现有结构或延后：

- `promotions`
- `policy`
- `approval_requests`
- 更复杂的 `skill capability binding`

---

## 8. 推荐索引

### 8.1 `executions`

- `(user_id, created_at desc)`
- `(skill_id, created_at desc)`
- `(status, created_at desc)`

### 8.2 `execution_steps`

- `(execution_id, step_index)`
- `(execution_id, status)`

### 8.3 `runtime_sessions`

- `(execution_id)`
- `(worker_id, state)`
- `(state, last_heartbeat_at)`

### 8.4 `memory_items`

- `(scope_type, scope_id, memory_type)`
- `(status, ttl_at)`
- `(source_execution_id)`

### 8.5 `candidate_patches`

- `(skill_id, created_at desc)`
- `(validation_status, review_status, promotion_status)`

---

## 9. 存储职责建议

### 9.1 PostgreSQL

适合保存：

- 业务真相源
- 审计记录
- Memory 索引
- Patch 和发布链记录

### 9.2 Redis

适合保存：

- 当前 step 指针
- runtime 高频状态
- 分布式锁
- 短期 Session Memory 热数据

### 9.3 Object Storage

适合保存：

- screenshot
- trace
- document output
- browser snapshot
- evaluation artifact

---

## 10. 与现有仓库的映射建议

### 10.1 优先映射

- `control-plane.execution` -> `Execution`
- `session-broker.runtime session` -> `RuntimeSession`
- `browser step log` -> `ExecutionStep / Artifact`

### 10.2 需要新引入

- `MemoryItem`
- `Evaluation`
- `CandidatePatch`
- `Promotion`

### 10.3 不建议继续混用

- 用 session 对象承载业务状态
- 用聊天历史代替 Memory
- 用临时日志代替 Evaluation

---

## 11. 一句话总结

`v3` 的数据模型重点不是“把所有表一次性设计完”，而是先把 4 条主线固定下来：

> `SkillVersion` 定义能力，`Execution` 承担业务，`RuntimeSession` 承担资源，`Memory/Evolution` 承担长期复利。
