# 企业级 Skill 平台 Agent OS Policy 数据模型

**Policy Data Model v3.0**  
日期：2026-04-26

> 本文定义 `Phase 2` 所需的 Policy 数据模型，目标是把风险分级、审批、接管和阻断从散落在代码与 Prompt 中的判断，收敛为正式对象。本文重点覆盖 `Policy`、`PolicyDecision`、`ApprovalRequest`、`DecisionRecord` 以及它们与 `Execution`、`ExecutionStep`、`Capability` 的关系。

---

## 1. 文档目标

本文回答以下问题：

- `Phase 2` 需要哪些治理对象
- 这些对象的最小字段是什么
- 它们和 `Execution / Step / Capability / SkillVersion` 的关系是什么
- 哪些字段是第一版必须落地，哪些可以后置

---

## 2. 设计原则

### 2.1 决策对象化

- 风险判断必须形成正式 `PolicyDecision`
- 审批必须形成正式 `ApprovalRequest`
- 关键判定必须形成正式 `DecisionRecord`

### 2.2 规则与结果分离

- `Policy` 定义规则
- `PolicyDecision` 定义执行时结果

### 2.3 技术与业务边界分离

- `Policy` 不直接替代 `Execution`
- `PolicyDecision` 不直接修改 Runtime 资源状态
- 决策结果应由 `Execution Control Plane` 执行

### 2.4 可审计

- 每次关键决策必须可回放输入、输出、理由

---

## 3. 核心对象清单

`Phase 2` 最少引入：

- `Policy`
- `PolicyBinding`
- `PolicyDecision`
- `ApprovalRequest`
- `DecisionRecord`

推荐与现有对象联动：

- `Execution`
- `ExecutionStep`
- `SkillVersion`
- `Capability`

---

## 4. 对象关系

### 4.1 主关系

- 一个 `Policy` 可被多个 scope 绑定
- 一个 `SkillVersion` 可绑定多个 `Policy`
- 一次 `Execution` 可产生多个 `PolicyDecision`
- 一个 `ExecutionStep` 可产生多个 `PolicyDecision`
- 一个 `PolicyDecision` 可触发零个或一个 `ApprovalRequest`
- 一个 `PolicyDecision` 应至少对应一个 `DecisionRecord`

### 4.2 推荐 scope

支持至少以下 scope：

- `skill`
- `skill_version`
- `capability`
- `runtime_type`
- `org`

---

## 5. 对象定义

### 5.1 `Policy`

职责：

- 表示一条正式治理规则

最小字段建议：

- `id`
- `name`
- `policy_type`
- `scope_type`
- `scope_id`
- `status`
- `priority`
- `rule_json`
- `default_effect`
- `created_at`
- `updated_at`

说明：

- `policy_type` 示例：
  - `risk_rule`
  - `approval_rule`
  - `takeover_rule`
  - `allowlist_rule`
  - `environment_rule`
- `default_effect` 示例：
  - `allow`
  - `deny`
  - `review`

### 5.2 `PolicyBinding`

职责：

- 记录 `Policy` 与对象之间的绑定关系

最小字段建议：

- `id`
- `policy_id`
- `target_type`
- `target_id`
- `binding_mode`
- `created_at`

说明：

- `target_type` 可取：
  - `skill`
  - `skill_version`
  - `capability`
  - `runtime_type`
  - `org`
- `binding_mode` 可取：
  - `inherited`
  - `explicit`

### 5.3 `PolicyDecision`

职责：

- 表示一次运行时决策的正式结果

最小字段建议：

- `id`
- `execution_id`
- `step_id`
- `policy_id`
- `decision_type`
- `decision`
- `risk_level`
- `reason_codes_json`
- `explanations_json`
- `required_controls_json`
- `effective_scope_json`
- `expires_at`
- `created_at`

说明：

- `decision_type` 可取：
  - `precheck`
  - `step_check`
  - `postcheck`
- `decision` 可取：
  - `allow`
  - `require_approval`
  - `require_human`
  - `deny`

### 5.4 `ApprovalRequest`

职责：

- 表示一次正式审批请求

最小字段建议：

- `id`
- `execution_id`
- `step_id`
- `policy_decision_id`
- `status`
- `risk_level`
- `request_reason`
- `request_payload_json`
- `required_approvers_json`
- `decision_payload_json`
- `requested_at`
- `decided_at`

说明：

- `status` 可取：
  - `pending`
  - `approved`
  - `rejected`
  - `expired`
  - `cancelled`

### 5.5 `DecisionRecord`

职责：

- 保存决策证据与解释

最小字段建议：

- `id`
- `execution_id`
- `step_id`
- `policy_decision_id`
- `input_snapshot_json`
- `output_snapshot_json`
- `actor_type`
- `actor_id`
- `trace_ref`
- `created_at`

说明：

- `actor_type` 可取：
  - `system`
  - `policy_engine`
  - `approver`
  - `operator`

---

## 6. 与现有对象的关系

### 6.1 `Execution`

需要增加或利用：

- `risk_level`
- `status`

关系：

- 一个 `Execution` 会产生多个 `PolicyDecision`
- 一个 `Execution` 可产生多个 `ApprovalRequest`

### 6.2 `ExecutionStep`

需要增加或利用：

- `capability_name`
- `runtime_type`
- `input_json`
- `output_json`

关系：

- `step_check` 的主要挂点

### 6.3 `SkillVersion`

需要增加或利用：

- `policy_snapshot_json`

关系：

- SkillVersion 发布时应带策略快照

### 6.4 `Capability`

需要增加或利用：

- `risk_level`
- `runtime_type`
- `input_schema_json`
- `output_schema_json`

关系：

- Capability 是 Policy 的重要治理粒度

---

## 7. 推荐枚举

### 7.1 `Policy.policy_type`

- `risk_rule`
- `approval_rule`
- `takeover_rule`
- `allowlist_rule`
- `environment_rule`

### 7.2 `Policy.status`

- `draft`
- `active`
- `deprecated`
- `disabled`

### 7.3 `PolicyDecision.decision`

- `allow`
- `require_approval`
- `require_human`
- `deny`

### 7.4 `PolicyDecision.decision_type`

- `precheck`
- `step_check`
- `postcheck`

### 7.5 `ApprovalRequest.status`

- `pending`
- `approved`
- `rejected`
- `expired`
- `cancelled`

---

## 8. 第一版强制落地的表

`Phase 2` 第一版建议强制落地：

- `policies`
- `policy_bindings`
- `policy_decisions`
- `approval_requests`
- `decision_records`

第一版可先不做复杂层：

- 策略 DSL 编辑器
- 多级审批模板中心
- 复杂版本化策略继承树

---

## 9. 推荐索引

### 9.1 `policies`

- `(scope_type, scope_id, status)`
- `(policy_type, status)`

### 9.2 `policy_bindings`

- `(target_type, target_id)`
- `(policy_id)`

### 9.3 `policy_decisions`

- `(execution_id, created_at desc)`
- `(step_id, created_at desc)`
- `(decision_type, decision)`

### 9.4 `approval_requests`

- `(execution_id, status)`
- `(step_id, status)`
- `(requested_at desc)`

### 9.5 `decision_records`

- `(execution_id, created_at desc)`
- `(policy_decision_id)`

---

## 10. 数据流建议

### 10.1 Precheck 流

- 读取相关 `Policy`
- 生成 `PolicyDecision`
- 写 `DecisionRecord`
- 若需要审批，生成 `ApprovalRequest`

### 10.2 Step-check 流

- 读取 step 相关 `Capability`、`Runtime` 和 `Policy`
- 生成 `PolicyDecision`
- 更新 `Execution` 下一步行为

### 10.3 Postcheck 流

- 读取执行结果和验证结果
- 生成 `PolicyDecision`
- 必要时追加审批或阻断记录

---

## 11. 与当前仓库的映射

### 11.1 `control-plane`

适合承接：

- `PolicyDecision` 调用协调
- `ApprovalRequest` 主链
- `DecisionRecord` 归档

### 11.2 `auth`

适合承接：

- `Policy`、`PolicyBinding` 元数据
- 用户、角色、Skill、Capability 关系

### 11.3 `ai-orchestrator`

只应提供：

- `RiskHint`
- 计划上下文

不应直接持有：

- 正式 PolicyDecision 主写逻辑

---

## 12. 一句话总结

`Phase 2` 的 Policy 数据模型核心是：

> 让规则、绑定、决策、审批、证据各自成为正式对象，这样治理才不会继续藏在 Prompt、工具分支和人工约定里。
