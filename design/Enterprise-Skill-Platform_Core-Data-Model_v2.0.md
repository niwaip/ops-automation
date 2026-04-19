# 企业级 Skill 平台核心数据模型草案

**Core Data Model v2.0**  
日期：2026-04-19

> 本文从落地实现角度定义平台的核心数据对象、建议表结构、关键索引与存储职责。

---

## 1. 目标

本文聚焦以下目标：

- 给出一套适合 MVP 到 v2 的核心数据模型
- 明确哪些数据应该放在关系库，哪些放在 Redis、对象存储、检索库
- 为后续 API 设计和服务拆分提供统一基础

建议存储分工如下：

- PostgreSQL：主数据、关系、审批、策略、执行索引
- Redis：会话、锁、短期上下文、运行时状态
- Object Storage：截图、文档、模板包、trace、artifact 文件
- Search / FTS / Vector：wiki、memory 检索、全文索引

---

## 2. 核心实体总览

建议优先落地以下实体：

- `skills`
- `skill_versions`
- `capabilities`
- `skill_capability_bindings`
- `executions`
- `execution_steps`
- `runtime_sessions`
- `approval_requests`
- `artifacts`
- `policies`
- `memory_items`
- `evaluations`
- `candidate_patches`
- `promotions`

---

## 3. Skill 与版本

### 3.1 `skills`

用途：

- 保存 Skill 的稳定身份和业务归属

建议字段：

```text
id
name
display_name
description
category
owner_team
risk_level
visibility_scope
default_runtime_type
status
created_by
created_at
updated_at
```

建议索引：

- `unique(name)`
- `(owner_team, status)`
- `(category, status)`

### 3.2 `skill_versions`

用途：

- 保存某个 Skill 的具体执行定义

建议字段：

```text
id
skill_id
version
state
input_schema_json
output_schema_json
plan_template_json
verification_rules_json
prompt_bundle_ref
template_bundle_ref
allowed_runtime_types_json
created_by
created_at
published_at
```

建议索引：

- `unique(skill_id, version)`
- `(skill_id, state)`
- `(published_at desc)`

说明：

- prompt、模板包等大对象可放对象存储，只在表中保留引用

---

## 4. Capability 体系

### 4.1 `capabilities`

用途：

- 保存平台支持的原子能力定义

建议字段：

```text
id
name
domain
risk_level
input_schema_json
output_schema_json
preconditions_json
postconditions_json
retry_policy_json
idempotency_strategy
status
created_at
updated_at
```

建议索引：

- `unique(name)`
- `(domain, status)`
- `(risk_level, status)`

### 4.2 `skill_capability_bindings`

用途：

- 保存某个 SkillVersion 可调用哪些能力

建议字段：

```text
id
skill_version_id
capability_id
usage_mode
is_required
constraint_json
created_at
```

建议索引：

- `unique(skill_version_id, capability_id)`
- `(capability_id)`

---

## 5. Execution 体系

### 5.1 `executions`

用途：

- 一次 Skill 执行的主记录

建议字段：

```text
id
tenant_id
skill_id
skill_version_id
initiator_user_id
executor_identity
status
risk_level
approval_state
runtime_strategy
goal_text
input_payload_json
normalized_goal_json
result_summary_json
started_at
finished_at
created_at
updated_at
```

建议索引：

- `(tenant_id, created_at desc)`
- `(initiator_user_id, created_at desc)`
- `(skill_id, created_at desc)`
- `(status, created_at desc)`
- `(approval_state, created_at desc)`

### 5.2 `execution_steps`

用途：

- step 级执行日志与断点恢复

建议字段：

```text
id
execution_id
step_index
step_type
capability_name
target_summary
input_snapshot_ref
output_snapshot_ref
result
error_class
error_message
retry_count
duration_ms
takeover_triggered
created_at
```

建议索引：

- `unique(execution_id, step_index)`
- `(execution_id, created_at)`
- `(capability_name, created_at desc)`
- `(result, created_at desc)`

说明：

- 浏览器与文档执行域优先统一使用 step 记录，便于审批、接管、恢复

---

## 6. RuntimeSession 体系

### 6.1 `runtime_sessions`

用途：

- 保存运行时会话主数据

建议字段：

```text
id
execution_id
runtime_type
worker_ref
resource_profile
state
lease_expires_at
health_status
endpoints_json
metadata_json
created_at
updated_at
closed_at
```

建议索引：

- `(execution_id)`
- `(runtime_type, state)`
- `(worker_ref, state)`
- `(lease_expires_at)`

### 6.2 Redis Runtime 状态

建议 Key：

- `execution:{id}:state`
- `runtime:{id}:state`
- `runtime:{id}:lease`
- `lock:profile:{profile_id}`
- `execution:{id}:current_step`

说明：

- 高频、短期、需要原子更新的数据放 Redis
- 可审计、可查询历史的数据落 PostgreSQL

---

## 7. 审批模型

### 7.1 `approval_requests`

用途：

- 高风险任务的审批主对象

建议字段：

```text
id
execution_id
step_id
request_type
reason
risk_level
requested_by
approver_scope
decision
decision_comment
decided_by
requested_at
decided_at
expires_at
```

建议索引：

- `(execution_id, requested_at desc)`
- `(decision, requested_at desc)`
- `(approver_scope, decision)`
- `(expires_at)`

### 7.2 `approval_events`

用途：

- 保存审批流程中的动作链

建议字段：

```text
id
approval_request_id
actor_id
event_type
comment
metadata_json
created_at
```

---

## 8. Artifact 体系

### 8.1 `artifacts`

用途：

- 保存执行产物索引

建议字段：

```text
id
execution_id
artifact_type
storage_ref
mime_type
content_schema
visibility_level
checksum
size_bytes
created_by
created_at
```

建议索引：

- `(execution_id, created_at desc)`
- `(artifact_type, created_at desc)`
- `(visibility_level, created_at desc)`

### 8.2 对象存储命名建议

```text
artifacts/{tenant_id}/{execution_id}/{artifact_id}
templates/{skill_id}/{version}/bundle
snapshots/{execution_id}/{step_index}
```

---

## 9. Policy 体系

### 9.1 `policies`

用途：

- 保存平台治理规则

建议字段：

```text
id
policy_type
subject_selector_json
resource_selector_json
action
condition_expression
effect
priority
status
created_by
created_at
updated_at
```

建议索引：

- `(policy_type, status)`
- `(action, effect, status)`
- `(priority desc)`

说明：

- `subject_selector_json` 可表示 role、department、tenant、service account
- `resource_selector_json` 可表示 skill、runtime、artifact、memory 范围

---

## 10. Memory 体系

### 10.1 `memory_items`

用途：

- 保存长期或中期记忆对象

建议字段：

```text
id
scope_type
scope_id
memory_type
title
content
metadata_json
source_execution_id
visibility_policy
ttl_seconds
confidence
created_at
updated_at
```

建议索引：

- `(scope_type, scope_id, created_at desc)`
- `(memory_type, created_at desc)`
- `(source_execution_id)`

### 10.2 检索层建议

- PostgreSQL FTS：适合结构化文本与小规模知识页
- Vector Store：适合语义相似召回
- Wiki Store：适合组织知识蒸馏后的结构化页面

说明：

- 不建议只依赖向量库
- 建议保留结构化 title、type、scope、source 字段便于治理

---

## 11. Evaluation 与 Evolution

### 11.1 `evaluations`

用途：

- 保存执行或版本评估结果

建议字段：

```text
id
target_type
target_id
metrics_json
score
verdict
summary
evaluated_by
evaluated_at
```

建议索引：

- `(target_type, target_id, evaluated_at desc)`
- `(score desc, evaluated_at desc)`

### 11.2 `candidate_patches`

用途：

- 保存候选改进

建议字段：

```text
id
skill_id
base_version_id
patch_type
patch_payload_json
source_evidence_json
status
generated_by
created_at
updated_at
```

建议索引：

- `(skill_id, created_at desc)`
- `(base_version_id, status)`
- `(patch_type, status)`

### 11.3 `promotions`

用途：

- 保存灰度、发布、回滚记录

建议字段：

```text
id
skill_id
from_version_id
to_version_id
strategy
approval_ref
result
notes
promoted_by
promoted_at
```

建议索引：

- `(skill_id, promoted_at desc)`
- `(to_version_id)`

---

## 12. 多存储职责建议

### PostgreSQL 适合

- Skill、SkillVersion
- Capability
- Execution、ExecutionStep 索引
- ApprovalRequest
- Policy
- Artifact 元数据
- MemoryItem 元数据
- Evaluation、CandidatePatch、Promotion

### Redis 适合

- 当前执行状态
- 当前 step 指针
- runtime lease
- profile 锁
- waiting input / pending approval 的临时快照

### Object Storage 适合

- 截图
- PDF / DOCX 产物
- 模板包
- 浏览器 trace
- 大型 prompt bundle

### Search / FTS / Vector 适合

- wiki 页面
- org memory
- skill memory
- 语义检索索引

---

## 13. 最小 API 聚合建议

### Skill Control Plane

- `POST /skills`
- `GET /skills/:id`
- `POST /skills/:id/versions`
- `POST /skills/:id/publish`
- `POST /skills/:id/revoke`

### Execution

- `POST /executions`
- `GET /executions/:id`
- `GET /executions/:id/steps`
- `POST /executions/:id/cancel`
- `POST /executions/:id/resume`

### Approval

- `GET /approvals`
- `POST /approvals/:id/approve`
- `POST /approvals/:id/reject`

### Runtime

- `GET /runtime-sessions/:id`
- `POST /runtime-sessions/:id/takeover`
- `POST /runtime-sessions/:id/release`

### Memory

- `POST /memory/query`
- `POST /memory/write`

---

## 14. MVP 推荐最小表集

如果先做 MVP，建议优先实现：

- `skills`
- `skill_versions`
- `executions`
- `execution_steps`
- `runtime_sessions`
- `approval_requests`
- `artifacts`
- `policies`

第二阶段再补：

- `memory_items`
- `evaluations`
- `candidate_patches`
- `promotions`

---

## 15. 结论

核心数据模型的目标不是一开始追求最全，而是先把平台最重要的几个事实稳定下来：

- Skill 是什么
- 这次执行是什么
- 用了什么 Runtime
- 哪一步做了什么
- 谁批准了什么
- 产出了什么
- 哪些知识和经验被沉淀了

只要这几条主线的数据模型稳定，后续无论是接 Memory、Evolution，还是做更复杂的 Runtime 编排，都会顺很多。
