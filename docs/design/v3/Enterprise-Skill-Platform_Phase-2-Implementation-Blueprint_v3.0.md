# 企业级 Skill 平台 Agent OS Phase 2 实施蓝图

**Phase 2 Implementation Blueprint v3.0**  
日期：2026-04-26

> 本文是 `Phase 2` 的实施蓝图，目标是在 `Phase 1` 已收敛执行主链的基础上，把治理能力和可扩展运行时正式落地。重点不是新增更多自由能力，而是让高风险动作进入正式 `PolicyDecision`、让 API / Document Runtime 接入统一模型。

---

## 1. 文档目标

本文聚焦以下问题：

- `Phase 2` 到底落哪些对象、接口和服务改动
- `PolicyDecision` 如何挂接到 `Execution` 主链
- API Runtime 和 Document Runtime 如何以统一方式接入
- `Phase 1` 需要预留哪些字段与边界，才能安全进入 `Phase 2`

---

## 2. 阶段定位

`Phase 2` 的本质是两件事：

- 把治理从文档和分支判断，收敛为正式可调用的 `Policy` 模块
- 把 Runtime 从 Browser 单链路，扩展为可接入 API / Document 的统一 step 模型

一句话概括：

> `Phase 1` 解决“谁在执行”，`Phase 2` 解决“什么情况下允许执行，以及执行到哪些 Runtime”。

---

## 3. In-Scope

- `PolicyDecision`
- `ApprovalRequest`
- `DecisionRecord`
- `Execution` 级 precheck
- `ExecutionStep` 级 step-check
- `Execution` 级 postcheck
- 风险分级正式落地
- Capability allowlist
- 环境与数据域治理
- API Runtime 接入协议
- Document Runtime 接入协议

## 3.1 Out-of-Scope

- `Session / User / Skill Memory` 正式主链
- `Evaluation` 正式服务
- `CandidatePatch`
- `Code Runtime`
- Replay / Benchmark / Canary

---

## 4. 阶段目标

### 4.1 治理目标

- 高风险动作不再通过散落在工具里的条件判断控制
- 审批、接管、阻断都有正式决策对象
- `L0-L3` 风险等级进入正式执行链

### 4.2 运行时目标

- API Runtime 与 Document Runtime 拥有统一 step 接入模型
- 运行时不再只是 Browser 的特例扩展

### 4.3 平台目标

- `Execution` 仍是业务真相源
- `RuntimeSession` 仍是资源真相源
- Planner 仍只输出计划和风险提示，不直接拥有最终裁决权

---

## 5. 关键对象

### 5.1 `Policy`

职责：

- 表示平台中可执行的治理规则集合

最小职责：

- 定义 scope
- 定义 risk 规则
- 定义审批和接管条件
- 定义 allow / deny 条件

### 5.2 `PolicyDecision`

职责：

- 某次执行或某个 step 的正式决策结果

结果类型：

- `allow`
- `require_approval`
- `require_human`
- `deny`

### 5.3 `ApprovalRequest`

职责：

- 记录需要审批的正式请求

### 5.4 `DecisionRecord`

职责：

- 记录一次 Policy 决策的输入、输出和解释

### 5.5 `Capability`

在 `Phase 2` 中的增强职责：

- 不只是可调用能力列表
- 还是治理粒度单位

### 5.6 `SkillVersion.policy_snapshot_json`

职责：

- 固化 SkillVersion 发布时依赖的策略快照
- 避免运行期策略漂移导致行为不可审计

---

## 6. 治理挂点

### 6.1 Precheck

触发时机：

- `POST /executions` 创建后、进入执行前

输入：

- 用户身份
- Skill / SkillVersion
- Planner `RiskHint`
- 输入摘要

输出：

- 是否允许创建执行
- 是否直接进入 `pending_approval`
- 是否需要限制 runtime 范围

### 6.2 Step-check

触发时机：

- 每个 `ExecutionStep` 执行前

输入：

- 当前 Execution
- 当前 Step
- Capability
- Runtime 类型
- 当前输入 payload

输出：

- `allow`
- `require_approval`
- `require_human`
- `deny`

### 6.3 Postcheck

触发时机：

- step 执行后
- execution 完成后

输入：

- step 输出
- 验证结果
- runtime 返回的事实

输出：

- 是否允许继续
- 是否要求人工复核
- 是否要求额外审计记录

---

## 7. 风险模型落地

### 7.1 风险来源

风险应由多维输入共同决定：

- Skill 默认风险
- Capability 风险
- 输入数据范围
- Runtime 类型
- 环境标签
- 批量程度
- 是否对外发送

### 7.2 风险输出

输出至少包括：

- `risk_level`
- `reason_codes`
- `required_controls`
- `effective_scope`

### 7.3 默认策略

- `L0`
  - 默认 `allow`
- `L1`
  - 默认 `allow`，建议验证
- `L2`
  - 默认 `require_approval`
- `L3`
  - 默认 `require_human` 或 `deny`

---

## 8. API Runtime 接入蓝图

### 8.1 目标

- 用统一 `ExecutionStep` 模型承接内部 API 操作

### 8.2 step 结构要求

每个 API step 至少需要：

- `capability_name`
- `runtime_type = api`
- `method`
- `host`
- `path`
- `headers_policy`
- `request_schema`
- `response_schema`
- `idempotency_policy`
- `timeout_policy`

### 8.3 治理要求

- 按 `host + path + method` 白名单
- 环境隔离
- 输入输出 schema 校验
- 写操作显式标记

### 8.4 当前仓库落点

- `control-plane`
  - 负责挂 Policy 和 Execution 主链
- 新的 API Runtime 逻辑模块
  - 可先逻辑内聚在 `control-plane` 或独立 service

---

## 9. Document Runtime 接入蓝图

### 9.1 目标

- 让文档生成、预览、渲染、交付成为正式 runtime，而不是单独旁路

### 9.2 step 结构要求

每个 Document step 至少需要：

- `capability_name`
- `runtime_type = document`
- `template_ref`
- `input_schema`
- `output_type`
- `delivery_mode`
- `approval_required_hint`

### 9.3 治理要求

- 默认先草稿态
- 对外交付前必须走 Policy
- 文档产物必须进入 Artifact 索引

### 9.4 当前仓库落点

- `carbone-engine`
  - 作为第一阶段最自然的 Document Runtime 承接服务

---

## 10. 服务改动清单

### 10.1 `control-plane`

必须新增：

- Policy 协调模块
- precheck / step-check / postcheck 调用点
- `ApprovalRequest` 主链
- `DecisionRecord` 归档

必须保持不变的原则：

- 仍然是 `Execution.status` 唯一主写入口

### 10.2 `auth`

必须新增或补强：

- 用户、角色、Skill、Capability 的授权查询能力
- environment / data scope / capability binding 元数据

### 10.3 `ai-orchestrator`

必须补充：

- 更清晰的 `RiskHint`
- 更明确的 capability 需求表达

不应新增：

- 自己做最终 Policy 判断

### 10.4 `carbone-engine`

必须补充：

- 统一 step 接口
- 文档 artifact 引用输出
- 交付模式治理钩子

---

## 11. 存储分工

### 11.1 PostgreSQL

新增或扩展保存：

- `policies`
- `approval_requests`
- `decision_records`
- `skill_versions.policy_snapshot_json`

### 11.2 Redis

新增或扩展保存：

- 审批等待态的短期锁
- step gate 决策缓存

### 11.3 Object Storage

扩展保存：

- 文档草稿
- 渲染结果
- 决策附件

---

## 12. 接口方向

### 12.1 Policy

- `POST /internal/policy:precheck`
- `POST /internal/policy:step-check`
- `POST /internal/policy:postcheck`

### 12.2 Approval

- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `GET /executions/{id}/approvals`

### 12.3 Runtime

- `POST /internal/runtime/api/steps:execute`
- `POST /internal/runtime/document/steps:execute`

---

## 13. 与 `Phase 1` 的交接要求

进入 `Phase 2` 前必须已经满足：

- `ExecutionStep` 粒度稳定
- Browser Runtime 已走统一 step 协议
- `Execution.status` 单写入口已经生效
- Planner 输出结构化计划和 `RiskHint`

否则：

- Policy 无法可靠挂接
- API / Document Runtime 无法复用统一模型

---

## 14. 退出标准

以下条件全部满足时，可认为 `Phase 2` 完成：

- `PolicyDecision` 已进入主链
- `ApprovalRequest` 是正式对象，不再只是状态分支
- API Runtime 已接入统一 step 协议
- Document Runtime 已接入统一 step 协议
- `L0-L3` 风险等级对实际执行生效
- 高风险动作可被审批、接管或阻断

---

## 15. 明确后置

以下内容明确后置到 `Phase 3+`：

- Memory 正式注入
- Evaluation 正式主链
- Candidate Patch 自动生成
- Code Runtime

---

## 16. 一句话总结

`Phase 2` 的任务不是“扩更多能力”，而是：

> 把治理做成正式系统，把运行时做成统一模型，让后续的 Memory 和 Evolution 有稳定边界可挂。
