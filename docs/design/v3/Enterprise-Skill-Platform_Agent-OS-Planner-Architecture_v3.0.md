# 企业级 Skill 平台 Agent OS 架构设计

**Agent OS Planner Architecture v3.0**  
日期：2026-04-26

> 本文在 `v2` 设计基础上，进一步明确 `ai-orchestrator` 的降级方向：只承担 Planner / Verifier / Failure Classifier，不再直接承担高权限执行。目标是把平台演进为一个可治理、可学习、可持续进化的 Agent OS。

---

## 1. 文档目标

本文回答以下问题：

- 当 `ai-orchestrator` 降级为 Planner 后，系统整体应该如何分层
- 哪些能力属于 Planner，哪些能力必须外移到 `Execution / Runtime / Policy`
- 平台如何支持长期记忆、经验沉淀和受控进化
- 当前仓库有哪些模块可以直接纳入新架构

---

## 2. 核心结论

### 2.1 `ai-orchestrator` 不再是系统内核

`ai-orchestrator` 的职责应收敛为：

- 目标理解
- Skill 路由
- 计划生成
- 参数补全
- 结果解释
- 失败分类

它不应再直接承担：

- 业务执行真相源
- Runtime 会话真相源
- 高风险写操作落地
- 技能在线进化与版本发布

### 2.2 Agent OS 的内核应由 5 个平面组成

- `Planner Plane`
- `Execution Control Plane`
- `Runtime Plane`
- `Policy Plane`
- `Memory & Evolution Plane`

### 2.3 执行与学习必须解耦

- 执行期只允许读 `Published SkillVersion`
- 学习期只能生成 `Memory Patch` 或 `Candidate Patch`
- 正式上线必须经过 `Validate -> Review -> Approve -> Publish`

---

## 3. 目标分层

### 3.1 Experience Layer

包含：

- Portal
- Chat UI
- Office Add-in
- 审批工作台
- 人工接管/恢复区

职责：

- 发起任务
- 查看执行状态
- 补参数
- 审批
- 接管
- 查看日志与产物

### 3.2 Planner Plane

核心服务：

- `ai-orchestrator`

核心职责：

- 将用户目标归一化为 `Goal`
- 根据可访问 Skill、Policy、Memory 生成 `Execution Plan`
- 识别参数缺失并返回 `InputRequest`
- 对执行结果做语义验证与下一步建议
- 对失败进行分类并生成结构化失败原因

输入：

- 用户请求
- Skill Registry
- Policy Snapshot
- Memory Context
- Org Knowledge

输出：

- `PlanDraft`
- `CapabilityIntent[]`
- `VerificationRule[]`
- `RiskHint`
- `FailureClassification`

限制：

- 不直接调用高风险 Runtime
- 不直接写业务系统
- 不直接修改 Published Skill

### 3.3 Execution Control Plane

核心对象：

- `Execution`
- `ExecutionStep`
- `ExecutionEvent`
- `Artifact`

核心职责：

- 创建正式执行实例
- 持有业务状态机
- 驱动 step 级调度
- 记录审计与结果
- 在 `waiting_input / pending_approval / human_control` 间切换

判断原则：

- 所有产品 UI 默认查看 `Execution`
- 所有治理系统默认围绕 `Execution` 做审批、审计和查询

### 3.4 Runtime Plane

包含：

- Browser Runtime
- API Runtime
- Document Runtime
- Future Code Runtime

资源对象：

- `RuntimeSession`

核心职责：

- 分配与回收实际运行资源
- 执行 typed capability
- 维持 runtime 健康状态
- 冻结、恢复、超时回收

判断原则：

- Runtime 是资源承载，不等于业务结果
- Runtime 成功不代表 Execution 成功

### 3.5 Policy Plane

核心对象：

- `Policy`
- `ApprovalRequest`
- `DecisionRecord`

职责：

- 风险分级
- 步骤级审批判断
- 人工接管触发
- 出网/文件/写操作约束
- 用户、角色、Skill、Capability 的委托授权

### 3.6 Memory & Evolution Plane

包含：

- `Session Memory`
- `User Memory`
- `Skill Memory`
- `Org Knowledge`
- `Evaluation`
- `Candidate Patch`
- `Promotion`

职责：

- 为 Planner 提供精确上下文
- 为 Execution 提供可恢复状态
- 将失败经验沉淀为长期资产
- 将人工接管纠正转成技能改进候选

---

## 4. 关键一等对象

平台的一等对象应为：

- `Skill`
- `SkillVersion`
- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `Capability`
- `Policy`
- `ApprovalRequest`
- `Artifact`
- `MemoryItem`
- `Evaluation`
- `CandidatePatch`
- `Promotion`

所有 API、权限边界、状态机设计都应围绕这些对象，而不是围绕具体技术实现命名。

---

## 5. Planner 的目标接口

Planner 不再输出依赖 Prompt 文本协议的 `Thought / Action / Action Input`，而应输出结构化对象。

### 5.1 `PlanDraft`

建议字段：

- `goal`
- `skill_id`
- `skill_version_id`
- `normalized_input`
- `required_inputs`
- `plan_steps`
- `verification_rules`
- `risk_summary`
- `memory_refs`
- `policy_refs`

### 5.2 `PlanStep`

建议字段：

- `step_index`
- `title`
- `capability_name`
- `runtime_type`
- `input_payload`
- `preconditions`
- `expected_output`
- `verification_rule`
- `risk_level`
- `fallback_strategy`

### 5.3 `FailureClassification`

建议字段：

- `error_type`
- `error_scope`
- `retryable`
- `requires_human`
- `candidate_memory_write`
- `candidate_patch_type`

---

## 6. Execution 与 Planner 的边界

### 6.1 Planner 负责“想”

- 解释用户目标
- 形成计划
- 给出建议的能力调用
- 判断参数是否足够
- 对执行结果做语义判断

### 6.2 Execution 负责“控”

- 接收 `PlanDraft`
- 创建 `Execution`
- 分解成 `ExecutionStep`
- 推进状态机
- 驱动审批和接管
- 归档日志、产物、结果

### 6.3 Runtime 负责“做”

- 按 `ExecutionStep` 实际执行 capability
- 返回结构化结果、断言结果、资源状态

### 6.4 Policy 负责“判”

- 是否允许执行
- 是否必须审批
- 是否必须人工接管
- 是否允许继续或取消

---

## 7. Memory 分层设计

### 7.1 `Session Memory`

范围：

- 单次 `Execution`

内容：

- 当前参数补全结果
- 当前 step 指针
- 最近 observation
- 恢复所需上下文

用途：

- 续跑
- 当前任务上下文注入

### 7.2 `User Memory`

范围：

- 用户级

内容：

- 语言偏好
- 输出风格
- 常用业务参数
- 常用系统范围

用途：

- 个性化规划
- 默认参数填充

### 7.3 `Skill Memory`

范围：

- `SkillVersion` 或 `Skill`

内容：

- 常见失败模式
- 稳定执行策略
- 特定页面/接口的注意事项
- 历史成功案例的归纳模式

用途：

- 提高 Planner 稳定性
- 降低重复失败率

### 7.4 `Org Knowledge`

范围：

- 组织级 / 部门级

内容：

- SOP
- 规则制度
- API 文档
- 数据字典

用途：

- 提供事实依据
- 避免依赖静态 Prompt

---

## 8. 自我进化闭环

### 8.1 触发条件

以下场景触发 `Evaluation`：

- `Execution.failed`
- `Execution.human_control`
- `Execution.succeeded` 但存在人工修正
- 明确的用户负反馈

### 8.2 输出分级

#### 轻量输出：`Memory Patch`

适用场景：

- 页面选择器变化
- 等待时间策略需要调整
- 某些参数组合有固定注意事项

落点：

- 写入 `Skill Memory`

#### 重量输出：`Candidate Patch`

适用场景：

- 计划顺序需要重排
- capability 选择错误
- 需要新增审批点
- 需要替换 SkillVersion 的流程定义

落点：

- 生成新的 `SkillVersion Draft`

### 8.3 发布闭环

完整闭环：

`Execution -> Evaluation -> Candidate Patch -> Validate -> Review -> Approve -> Publish -> Observe`

原则：

- 运行时不直接热改线上版本
- 进化必须走发布流程

---

## 9. 安全边界

### 9.1 Planner 默认不持有高权限

- 不直接持有数据库写权限
- 不直接持有任意 URL 出网权限
- 不直接持有文件系统高权限

### 9.2 Capability 必须是 typed 的

- 能力必须明确输入输出
- 能力必须带审计标签
- 能力必须支持策略评估

### 9.3 Code Runtime 必须独立

- 不允许继续沿用进程内随意 `subprocess` 风格执行
- 必须单独隔离资源、网络、文件系统和审计

---

## 10. 当前仓库的推荐映射

### 10.1 可以直接纳入

- `control-plane` -> Execution Control Plane
- `session-broker` -> Runtime Session Manager
- `browser-worker` -> Browser Runtime
- `auth/capability-release` -> Evolution / Publish Pipeline

### 10.2 可以保留但要降级

- `ai-orchestrator` -> Planner / Verifier / Failure Classifier

### 10.3 只保留思路，不建议继续作为正式内核

- 本地 subprocess 风格代码执行
- 强依赖正则解析的 ReAct 文本协议

---

## 11. 推荐实施原则

- 先把 `Execution` 变成业务真相源
- 再把 `RuntimeSession` 变成资源真相源
- 然后让 `ai-orchestrator` 只输出结构化计划
- 最后再接 Memory / Evaluation / Candidate Patch

这样可以避免继续在一个服务里混合“理解、执行、治理、进化”四类职责。

---

## 12. 一句话总结

`v3` 的核心不是“让 Agent 更自由”，而是：

> 让 `Planner` 更轻，让 `Execution` 更稳定，让 `Runtime` 更隔离，让 `Policy` 更硬，让 `Memory/Evolution` 真正形成长期复利。
