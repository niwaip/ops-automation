# 企业级 Skill 平台 Agent OS Phase 2-5 实施纲要

**Phase 2-5 Implementation Outline v3.0**  
日期：2026-04-26

> 本文在 `Full Roadmap v3` 基础上，进一步把 `Phase 2` 到 `Phase 5` 明确化，目标是为后续细化提供稳定边界。本文不直接进入表级或代码级实现，而是把每个阶段的范围、对象、服务改动、接口方向、验收标准和明确后置项说明清楚。

---

## 1. 文档目标

本文回答以下问题：

- `Phase 2` 到 `Phase 5` 各自到底做什么
- 每个阶段会引入哪些对象、模块和接口
- 每个阶段哪些内容明确不做，避免范围膨胀
- 进入下一个阶段前需要具备什么前置条件

---

## 2. 使用原则

本文的作用是“阶段边界清单”，而不是完整设计替代品。

使用方式建议：

- 先用本文判断某项需求属于哪个阶段
- 再决定是否为该阶段补 `Blueprint / API / Data Model / Task Plan`
- 不要把本文中的阶段纲要直接当成最终代码实现规范

---

## 3. `Phase 2`：治理与可扩展运行时收敛

### 3.1 阶段目标

- 把 Policy 从“原则和文档”变成可执行的正式模块
- 把 Runtime 从 Browser 单点扩展为统一 runtime 接入模型
- 让高风险动作真正挂到 step 级 gate

### 3.2 In-Scope

- `PolicyDecision`
- `ApprovalRequest`
- `DecisionRecord`
- step 级 precheck / step-check / postcheck
- API Runtime 接入协议
- Document Runtime 接入协议
- 风险等级正式落地
- Capability allowlist / environment / data scope 治理

### 3.3 Out-of-Scope

- 完整长期 Memory 检索
- 自动 Candidate Patch
- Code Runtime 正式落地
- Replay / Benchmark 平台

### 3.4 核心对象

- `Policy`
- `ApprovalRequest`
- `DecisionRecord`
- `Capability`
- `SkillVersion.policy_snapshot_json`

### 3.5 服务改动

#### `control-plane`

- 增加 Policy precheck / step-check / postcheck 协调点
- 将审批从状态分支提升为正式流程入口

#### `auth`

- 承接更多 capability、skill、role 相关授权元数据
- 为 `PolicyDecision` 提供身份和授权输入

#### `ai-orchestrator`

- 输出更清晰的 `RiskHint`
- 不直接承担风险决策

#### `carbone-engine`

- 作为 Document Runtime 的第一个正式接入对象

### 3.6 接口方向

- `POST /internal/policy:precheck`
- `POST /internal/policy:step-check`
- `POST /internal/policy:postcheck`
- `POST /internal/runtime/api/steps:execute`
- `POST /internal/runtime/document/steps:execute`

### 3.7 验收标准

- `L0-L3` 风险分级可被系统实际执行
- `L2/L3` 动作能进入审批或接管
- API Runtime 和 Document Runtime 使用统一 step 协议
- Policy 不再依赖散落在工具实现里的临时判断

### 3.8 明确后置到 `Phase 3+`

- User / Skill / Org Memory 正式注入
- Evaluation 服务
- Patch 生成和发布闭环

---

## 4. `Phase 3`：记忆与复盘收敛

### 4.1 阶段目标

- 把 Memory 从 prompt 附属品变成正式对象
- 把执行结果和失败结果收敛为统一复盘输入
- 让 Planner 和 Verifier 开始使用结构化记忆

### 4.2 In-Scope

- `Session Memory`
- `Skill Memory`
- `User Memory` 最小版
- `Evaluation`
- Memory 检索接口
- Memory 写入准则
- Evaluation 结果结构化

### 4.3 Out-of-Scope

- 自动 SkillVersion Draft 生成
- 发布和灰度闭环
- Code Runtime 经验学习

### 4.4 核心对象

- `MemoryItem`
- `Evaluation`
- `Execution`
- `ExecutionStep`
- `Artifact`

### 4.5 服务改动

#### `ai-orchestrator`

- 支持读取 Memory Context
- 支持在 `plans:generate` 和 `plans:verify` 中接收结构化记忆输入

#### `control-plane`

- 在执行结束后统一触发 Evaluation
- 标准化失败原因和结果摘要

#### 新增或逻辑内聚的 `memory-service`

- 管理 `memory_items`
- 提供 scope 检索
- 控制记忆写入和过期策略

### 4.6 接口方向

- `POST /internal/memory:search`
- `POST /internal/memory:write`
- `POST /internal/evaluations:generate`
- `GET /internal/evaluations/{id}`

### 4.7 验收标准

- Planner 可按 `session / skill / user` 读记忆
- 执行结束可生成统一 Evaluation
- Memory 具有来源、置信度、生命周期和引用关系

### 4.8 明确后置到 `Phase 4+`

- 自动 Candidate Patch
- Patch validate / publish
- Promotion / shadow / canary

---

## 5. `Phase 4`：受控进化与发布闭环

### 5.1 阶段目标

- 让失败与接管数据进入正式进化链
- 让 Patch 成为正式对象
- 让进化通过发布链而不是运行时热改

### 5.2 In-Scope

- `CandidatePatch`
- `Memory Patch`
- `SkillVersion Draft Patch`
- Patch validate
- Patch review
- Patch publish / rollback
- 与 `capability-release` 打通

### 5.3 Out-of-Scope

- 完整自动自治优化
- 脱离人工审核的线上自动发布
- 大规模自适应 Prompt 变异系统

### 5.4 核心对象

- `CandidatePatch`
- `Promotion`
- `SkillVersion`
- `Evaluation`
- `MemoryItem`

### 5.5 服务改动

#### `auth/capability-release`

- 成为 Patch validate / review / publish 的正式承接面

#### `control-plane`

- 补充执行结束后的 patch 候选触发钩子

#### 新增或逻辑内聚的 `evolution-service`

- 负责聚合 Evaluation
- 负责生成 Patch 候选
- 负责将不同级别问题路由到 Memory Patch 或 SkillVersion Draft

### 5.6 接口方向

- `POST /internal/candidate-patches:generate`
- `GET /internal/candidate-patches/{id}`
- `POST /internal/candidate-patches/{id}:validate`
- `POST /internal/candidate-patches/{id}:promote`

### 5.7 验收标准

- 平台可从失败和接管中生成 Patch 候选
- Patch 可被验证、审核、发布
- Published SkillVersion 不被运行时直接修改

### 5.8 明确后置到 `Phase 5`

- Code Runtime 学习闭环
- 高级基准测试平台
- 更成熟的自动化运营系统

---

## 6. `Phase 5`：高级运行时与平台化能力

### 6.1 阶段目标

- 让平台从单链路系统进入多 Runtime、可回归、可灰度、可运营的平台化阶段

### 6.2 In-Scope

- 正式 `Code Runtime`
- Org Knowledge 深化
- Replay / Benchmark / Regression
- Shadow / Canary / Promotion
- 更完整的运营和可观测视图

### 6.3 Out-of-Scope

- 完全无治理自治 Agent
- 无人工审核的关键能力自动上线

### 6.4 核心对象

- `RuntimeSession` 的 code 扩展
- `Artifact`
- `Promotion`
- `MemoryItem`
- Benchmark / Replay 相关对象

### 6.5 服务改动

#### 新增或逻辑内聚的 `code-runtime`

- 负责安全运行代码
- 负责资源限制与审计

#### `portal`

- 增加回归、灰度、发布和复盘运营视图

#### `auth/capability-release`

- 扩展成更成熟的验证、灰度、回滚控制面

### 6.6 接口方向

- `POST /internal/runtime/code/steps:execute`
- `POST /internal/replays:run`
- `POST /internal/benchmarks:run`
- `POST /internal/promotions:shadow`
- `POST /internal/promotions:canary`

### 6.7 验收标准

- Code Runtime 在统一模型下运行
- 平台具备 replay / benchmark / promotion 的正式能力
- 多 Runtime 可在统一 `Execution / RuntimeSession` 模型下协同

---

## 7. 阶段间依赖图

### 7.1 `Phase 2` 依赖 `Phase 1`

原因：

- 没有统一 step 边界，就没有 Policy gate
- 没有统一 RuntimeSession，就无法扩展 API / Document Runtime

### 7.2 `Phase 3` 依赖 `Phase 1 + Phase 2`

原因：

- 没有稳定执行链和治理链，Memory 只会吸收不稳定噪声

### 7.3 `Phase 4` 依赖 `Phase 3`

原因：

- Patch 生成必须基于结构化 Evaluation 和 Memory

### 7.4 `Phase 5` 依赖 `Phase 2-4`

原因：

- 高级 Runtime 和平台化能力必须建立在稳定治理、记忆和发布闭环之上

---

## 8. 后续细化建议

在进入下一轮细化时，建议按以下顺序展开：

1. `Enterprise-Skill-Platform_Phase-2-Implementation-Blueprint_v3.0.md`
2. `Enterprise-Skill-Platform_Policy-Data-Model_v3.0.md`
3. `Enterprise-Skill-Platform_Policy-API-Spec_v3.0.md`
4. `Enterprise-Skill-Platform_Phase-3-Memory-and-Evaluation-Blueprint_v3.0.md`
5. `Enterprise-Skill-Platform_Memory-Data-Model_v3.0.md`
6. `Enterprise-Skill-Platform_Evaluation-API-Spec_v3.0.md`
7. `Enterprise-Skill-Platform_Phase-4-Evolution-and-Release-Blueprint_v3.0.md`
8. `Enterprise-Skill-Platform_Phase-5-Code-Runtime-and-Benchmark-Blueprint_v3.0.md`

---

## 9. 一句话总结

后续阶段的重点不是“想到什么加什么”，而是：

> 让每一阶段都只解决一类核心问题，并为下一阶段留下稳定边界，而不是把所有高级能力提前混进 `Phase 1`。
