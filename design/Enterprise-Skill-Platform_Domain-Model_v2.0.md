# 企业级 Skill 平台领域模型

**Domain Model v2.0**  
日期：2026-04-19

> 本文定义平台的核心领域对象、它们之间的关系，以及后续服务拆分时应遵守的对象边界。

---

## 1. 设计目标

领域模型的目的不是描述数据库表本身，而是建立一套稳定的系统语言，让产品、架构、服务和权限规则围绕同一组对象演进。

本平台应统一围绕以下对象建模：

- `Skill`
- `SkillVersion`
- `Capability`
- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `Policy`
- `ApprovalRequest`
- `Artifact`
- `MemoryItem`
- `Evaluation`
- `CandidatePatch`
- `Promotion`

---

## 2. Skill

### 定义

`Skill` 是企业能力的逻辑身份，不直接等于某一段 prompt、某一套模板或某一个脚本。

### 作用

- 作为企业可授权、可复用的能力入口
- 承载业务语义和治理边界
- 聚合其版本、依赖能力、风险等级、可见范围

### 建议字段

- `skill_id`
- `name`
- `display_name`
- `description`
- `category`
- `owner_team`
- `risk_level`
- `visibility_scope`
- `default_runtime_type`
- `status`

### 说明

- `Skill` 是稳定身份
- 具体执行逻辑属于 `SkillVersion`

---

## 3. SkillVersion

### 定义

`SkillVersion` 是某个 Skill 在某一时刻的可执行定义。

### 作用

- 保存 prompt、规则、模板绑定、参数 schema、能力依赖
- 支持 review、approval、publish、rollback

### 建议字段

- `skill_version_id`
- `skill_id`
- `version`
- `state`
- `input_schema`
- `output_schema`
- `required_capabilities`
- `allowed_runtime_types`
- `plan_template`
- `verification_rules`
- `created_by`
- `created_at`

### 状态建议

- `draft`
- `review`
- `approved`
- `published`
- `deprecated`
- `revoked`

---

## 4. Capability

### 定义

`Capability` 是 Skill 可调用的原子能力，必须具备明确的输入输出和风险语义。

### 典型例子

- `browser.navigate`
- `browser.click`
- `browser.fill`
- `document.render`
- `template.compile`
- `file.parse`
- `internal_api.call`

### 建议字段

- `capability_id`
- `name`
- `domain`
- `risk_level`
- `input_schema`
- `output_schema`
- `preconditions`
- `postconditions`
- `retry_policy`
- `idempotency_strategy`

### 原则

- Capability 不能是自由文本黑盒
- Capability 必须能被审计、验证、限权和替换实现

---

## 5. Execution

### 定义

`Execution` 表示一次 Skill 的执行实例，是权限、审计、人工介入和结果归档的主容器。

### 作用

- 连接用户委托、SkillVersion、Runtime、Memory、Artifact
- 记录执行状态和风险上下文

### 建议字段

- `execution_id`
- `skill_id`
- `skill_version_id`
- `initiator_user_id`
- `tenant_id`
- `status`
- `risk_level`
- `approval_state`
- `runtime_strategy`
- `input_payload`
- `normalized_goal`
- `started_at`
- `finished_at`

### 状态建议

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

---

## 6. ExecutionStep

### 定义

`ExecutionStep` 是一次 Execution 内的最小可观测动作。

### 作用

- 支持重试、断点恢复、审批暂停、人工接管续跑
- 支持 step 级日志和评估

### 建议字段

- `execution_step_id`
- `execution_id`
- `step_index`
- `step_type`
- `capability_name`
- `locator_or_target_summary`
- `input_snapshot_ref`
- `output_snapshot_ref`
- `result`
- `error_class`
- `retry_count`
- `duration_ms`

### 原则

- 浏览器和文档类执行域优先 step 化
- 关键步骤要支持断点重试和后置验证

---

## 7. RuntimeSession

### 定义

`RuntimeSession` 是某种受控运行环境中的具体会话，如浏览器会话、文档渲染会话、API 执行上下文。

### 类型建议

- `browser`
- `document`
- `api`
- `code`

### 建议字段

- `runtime_session_id`
- `runtime_type`
- `execution_id`
- `worker_ref`
- `resource_profile`
- `state`
- `endpoints`
- `lease_expires_at`
- `health_status`

### 说明

- `RuntimeSession` 是执行底座
- 它不决定业务权限，但必须服从 Policy

---

## 8. Policy

### 定义

`Policy` 是平台的治理规则，用于决定谁可以在什么条件下做什么。

### 策略维度

- Subject：用户、角色、部门、服务账号
- Action：execute、edit、publish、approve、takeover、resume、view
- Resource：skill、execution、artifact、memory、runtime
- Condition：风险等级、环境、租户、业务域、设备、时间、数据等级
- Effect：allow、deny、require_approval、require_takeover

### 建议字段

- `policy_id`
- `policy_type`
- `subject_selector`
- `resource_selector`
- `action`
- `condition_expression`
- `effect`
- `priority`

---

## 9. ApprovalRequest

### 定义

`ApprovalRequest` 表示某个执行动作或执行阶段进入人工治理流程。

### 触发场景

- 高风险写操作
- 对外发送
- 批量修改
- 财务/法务类关键动作
- 模型无法安全决策的关键节点

### 建议字段

- `approval_request_id`
- `execution_id`
- `step_id`
- `reason`
- `risk_level`
- `requested_by`
- `approver_scope`
- `decision`
- `decision_comment`
- `decided_at`

---

## 10. Artifact

### 定义

`Artifact` 是执行过程或结果产出的可引用对象。

### 例子

- 截图
- 文档草稿
- 渲染后的 PDF
- 模板
- 结构化 JSON 输出
- 审计快照

### 建议字段

- `artifact_id`
- `execution_id`
- `artifact_type`
- `storage_ref`
- `content_schema`
- `visibility_level`
- `created_at`

---

## 11. MemoryItem

### 定义

`MemoryItem` 是平台的记忆单元，不等于聊天消息。

### 记忆层次

- `session`
- `user`
- `org`
- `skill`

### 内容类型

- `fact`
- `preference`
- `procedure`
- `failure_pattern`
- `summary`
- `artifact_link`

### 建议字段

- `memory_item_id`
- `scope_type`
- `scope_id`
- `memory_type`
- `content`
- `metadata`
- `source_execution_id`
- `visibility_policy`
- `ttl`
- `confidence`

---

## 12. Evaluation

### 定义

`Evaluation` 用于衡量一次执行或某个版本的质量。

### 指标分类

- 技术指标：成功率、耗时、重试数、人工接管率
- 业务指标：完成率、草稿可接受度、误操作率、人工节省

### 建议字段

- `evaluation_id`
- `target_type`
- `target_id`
- `metrics`
- `score`
- `verdict`
- `evaluated_at`

---

## 13. CandidatePatch

### 定义

`CandidatePatch` 表示对 SkillVersion 的候选改进，而不是直接改线上版本。

### 来源

- 失败样本分析
- 人工接管后的修复动作
- 参数识别优化
- locator 修复
- 组织知识更新

### 建议字段

- `candidate_patch_id`
- `skill_id`
- `base_version_id`
- `patch_type`
- `patch_payload`
- `source_evidence`
- `status`

### 状态建议

- `draft`
- `generated`
- `validated`
- `approved`
- `rejected`
- `promoted`

---

## 14. Promotion

### 定义

`Promotion` 记录一个候选版本如何进入线上。

### 作用

- 支持 shadow、canary、publish、rollback
- 提供完整变更可追溯链

### 建议字段

- `promotion_id`
- `skill_id`
- `from_version_id`
- `to_version_id`
- `strategy`
- `approval_ref`
- `result`
- `promoted_at`

---

## 15. 对象关系

推荐关系如下：

- 一个 `Skill` 对应多个 `SkillVersion`
- 一个 `SkillVersion` 依赖多个 `Capability`
- 一个 `Execution` 绑定一个 `SkillVersion`
- 一个 `Execution` 包含多个 `ExecutionStep`
- 一个 `Execution` 可绑定一个或多个 `RuntimeSession`
- 一个 `Execution` 可生成多个 `Artifact`
- 一个 `Execution` 可触发零个或多个 `ApprovalRequest`
- 一个 `Execution` 会读写多个 `MemoryItem`
- 一个 `SkillVersion` 可产生多个 `CandidatePatch`
- 一个 `CandidatePatch` 经过评估后形成 `Promotion`

---

## 16. 服务边界建议

### Skill Control Plane

拥有：

- `Skill`
- `SkillVersion`
- `ApprovalRequest`
- `Promotion`
- `Policy`

### Runtime Manager

拥有：

- `RuntimeSession`
- 执行调度状态
- 资源分配与回收

### Orchestrator

拥有：

- `Execution`
- `ExecutionStep`
- 规划与验证逻辑

### Memory Service

拥有：

- `MemoryItem`
- 检索与写入策略

### Evaluation / Evolution

拥有：

- `Evaluation`
- `CandidatePatch`

### Artifact Service

拥有：

- `Artifact`
- 存储引用与访问控制

---

## 17. 结论

当平台围绕这些领域对象设计时：

- 文档不会再以某个单服务为中心
- 权限能落到 Skill、Runtime、Memory、Artifact 等真实资源上
- 记忆、评估、进化可以自然融入系统，而不是后期外挂

因此，后续架构与代码重构都应优先围绕这些对象展开。
