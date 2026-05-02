# 企业级 Skill 平台 Agent OS 完整路线图

**Full Roadmap v3.0**  
日期：2026-04-26

> 本文给出 `Planner-only Agent OS` 的完整实施路线，不只覆盖 `Phase 1`，而是把后续 `Memory / Policy / Evaluation / Evolution / Release / Code Runtime` 的落地顺序、阶段目标、依赖关系和退出标准统一规划清楚。目标是确保 Phase 1 不是孤立工程，而是整条演进路线中的第一段。

---

## 1. 文档目标

本文回答以下问题：

- `Phase 1` 后面到底还有哪些阶段
- 每个阶段的目标、交付物、依赖和退出标准是什么
- 哪些能力必须顺序推进，哪些能力可以并行推进
- 为什么当前先做 Browser 主链，而不是同时做完整 Memory / Evolution / Code Runtime

补充说明：

- 如果需要进一步看 `Phase 2` 到 `Phase 5` 的阶段边界，应继续阅读 `Enterprise-Skill-Platform_Phase-2-to-5-Implementation-Outline_v3.0.md`

---

## 2. 总体路线

推荐将 `v3` 的实施拆为 5 个正式阶段：

- `Phase 1`：执行主链收敛
- `Phase 2`：治理与可扩展运行时收敛
- `Phase 3`：记忆与复盘收敛
- `Phase 4`：受控进化与发布闭环
- `Phase 5`：高级运行时与平台化能力

一句话概括：

> 先把执行跑稳，再把治理做硬，再把记忆做实，再把进化接到发布链，最后补平台化高级能力。

---

## 3. 阶段总览

### 3.1 `Phase 1`：执行主链收敛

目标：

- `Execution` 成为业务真相源
- `RuntimeSession` 成为资源真相源
- `ai-orchestrator` 降级为 Planner
- Browser 主链路跑通

交付：

- `Execution` API
- `RuntimeSession` 控制接口
- Browser step 协议
- Takeover / Resume 主链
- 最小 Artifact
- `Evaluation enqueue`

### 3.2 `Phase 2`：治理与可扩展运行时收敛

目标：

- 正式引入 `PolicyDecision`
- 统一 step 级 gate
- 补 API Runtime / Document Runtime 的接入规范
- 将能力调用彻底 schema 化和 runtime 化

交付：

- `policy-service` 逻辑模块
- 风险分级与审批矩阵落地
- Capability allowlist / environment tag / data scope 策略
- API Runtime / Document Runtime 接入协议

### 3.3 `Phase 3`：记忆与复盘收敛

目标：

- 让系统具备正式 `Session Memory / Skill Memory / User Memory`
- 让每次执行可进入统一复盘
- 让 Planner 开始使用结构化 Memory，而不是主要依赖聊天历史

交付：

- `memory_items`
- Memory 检索与注入接口
- `evaluation-service` 逻辑模块
- 执行后复盘与失败分析结果结构化

### 3.4 `Phase 4`：受控进化与发布闭环

目标：

- 让失败与接管能转化为 `Memory Patch / Candidate Patch`
- 让 Patch 能进入 validate / review / publish
- 让平台具备“从经验学习，但不直接在线变异”的正式机制

交付：

- `candidate_patches`
- Patch 校验器
- SkillVersion Draft 自动生成链
- 与 `capability-release` 打通的发布闭环

### 3.5 `Phase 5`：高级运行时与平台化能力

目标：

- 补齐 Code Runtime
- 补齐更成熟的 Org Knowledge / Benchmark / Replay / Promotion
- 将平台从“单一 Browser 主链”扩展为多 Runtime、可持续演进的 Agent OS

交付：

- 正式 Code Runtime
- Replay / Benchmark 数据集
- Canary / Shadow / Promotion 策略
- 更成熟的门户与运营能力

---

## 4. 为什么要按这个顺序推进

### 4.1 先执行，后记忆

原因：

- 如果执行主链还不稳定，记忆只会积累噪声
- 没有统一 `Execution`，就没有可靠的 Memory 来源

### 4.2 先治理，后进化

原因：

- 没有 Policy 和发布边界，进化容易变成运行时失控
- Patch 必须建立在明确的风险与审批机制上

### 4.3 先 Browser，后多 Runtime

原因：

- 当前仓库 Browser 链路最成熟
- Browser 是最容易验证 `Execution + RuntimeSession + Takeover` 三件事的场景

### 4.4 先 Logic Boundary，后 Physical Split

原因：

- 第一阶段最大的风险不是服务拆不拆，而是职责继续混乱
- 逻辑边界稳定后，物理拆分会更自然

---

## 5. 各阶段详细规划

## 5.1 `Phase 1`：执行主链收敛

### 目标

- 正式形成 Browser 闭环
- 统一主状态写入口
- 去除 `ai-orchestrator` 对业务状态和高风险执行的直接耦合

### 核心对象

- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `ExecutionEvent`
- `Artifact`

### 关键服务

- `control-plane`
- `ai-orchestrator`
- `session-broker`
- `browser-worker`
- `portal`

### 退出标准

- 用户创建任务走 `Execution`
- Browser step 统一记录到 `ExecutionStep`
- `waiting_input / pending_approval / human_control` 跑通
- Portal 统一围绕 `Execution`

### 明确不做

- 完整 Memory 服务
- 自动 Patch 生成
- 正式 Code Runtime
- 多 Runtime 联合作业

---

## 5.2 `Phase 2`：治理与可扩展运行时收敛

### 目标

- 让 Policy 从“文档和判断”变成“正式可调用模块”
- 让 Runtime 从 Browser 单点扩展到 API / Document 接口层

### 核心对象

- `Policy`
- `ApprovalRequest`
- `DecisionRecord`

### 关键服务

- `control-plane`
- `auth`
- 新增或逻辑内聚的 `policy-service`
- `carbone-engine`

### 关键工作

- 引入 `PolicyDecision`
- 把审批矩阵固化为接口与规则
- 为 API Runtime 建立 allowlist 与 schema 校验
- 为 Document Runtime 建立草稿、预览、交付治理

### 退出标准

- `L0-L3` 风险分级正式生效
- `L2/L3` 动作进入审批或接管
- API Runtime 与 Document Runtime 拥有统一 step 接口

### 对 `Phase 1` 的依赖

- 必须已有统一 `Execution`
- 必须已有统一 `RuntimeSession`
- 必须已有主状态单写入口

---

## 5.3 `Phase 3`：记忆与复盘收敛

### 目标

- 让平台拥有正式 Memory 和 Evaluation
- 让 Planner 能读取可治理的长期经验

### 核心对象

- `MemoryItem`
- `Evaluation`

### 关键工作

- 引入 `Session Memory`
- 引入 `Skill Memory`
- 引入 `User Memory` 基础能力
- 定义 Memory 写入准则
- 执行结束后统一生成 Evaluation

### 退出标准

- Planner 可按 `skill / user / session` 读 Memory
- 执行结束后可生成标准化复盘结果
- Memory 具有来源、置信度和生命周期

### 对 `Phase 2` 的依赖

- 必须已有稳定执行链和统一审计
- 必须已有较稳定的失败分类与结果验证

---

## 5.4 `Phase 4`：受控进化与发布闭环

### 目标

- 让经验真正反哺 SkillVersion
- 让平台支持“学习，但不失控”

### 核心对象

- `CandidatePatch`
- `Promotion`

### 关键工作

- 失败和接管数据进入 Patch 生成器
- 将轻量问题写成 `Memory Patch`
- 将重度问题生成 `SkillVersion Draft`
- 接入 `capability-release` 的 validate / review / publish

### 退出标准

- 平台能从失败中生成候选改进
- 改进可经过验证与发布链正式上线
- 线上 SkillVersion 不被运行时直接改写

### 对 `Phase 3` 的依赖

- 必须有结构化 Evaluation
- 必须有 Memory 和 Artifact 的稳定输入

---

## 5.5 `Phase 5`：高级运行时与平台化能力

### 目标

- 完整进入多 Runtime 和平台运营阶段

### 关键工作

- 正式 Code Runtime
- Org Knowledge 深化
- Replay / Benchmark / Regression
- Shadow / Canary / Rollback
- 平台运营与可观测能力完善

### 退出标准

- 不同 Runtime 能在统一模型下运行
- 平台具备较成熟的回归、灰度和运营能力

---

## 6. 能力矩阵

### 6.1 按阶段引入的核心能力

- `Phase 1`
  - Execution
  - RuntimeSession
  - Browser Runtime
  - PlanDraft
  - Takeover / Resume

- `Phase 2`
  - PolicyDecision
  - ApprovalRequest
  - API Runtime
  - Document Runtime

- `Phase 3`
  - Session Memory
  - Skill Memory
  - User Memory
  - Evaluation

- `Phase 4`
  - CandidatePatch
  - Promotion
  - Release Integration

- `Phase 5`
  - Code Runtime
  - Replay / Benchmark
  - Org Knowledge 强化

---

## 7. 并行推进建议

### 7.1 可并行

- `Phase 1` 后半段与 `Phase 2` 的 Policy 设计准备可并行
- `Phase 2` 后半段与 `Phase 3` 的 Memory 数据模型设计可并行
- `Phase 3` 后半段与 `Phase 4` 的 Release 对接准备可并行

### 7.2 不建议并行

- 在 `Phase 1` 未完成前正式启动 Code Runtime
- 在没有 Evaluation 前正式做自动 Candidate Patch
- 在没有主状态收敛前做大规模服务拆分

---

## 8. 总体风险

### 8.1 架构风险

- 阶段目标不清导致 `Phase 1` 过载
- Memory 和 Evolution 提前落地导致系统复杂度暴增

### 8.2 工程风险

- 旧链路和新链路双写状态
- Portal 长期依赖旧对象模型
- Planner 改造与执行链改造脱节

### 8.3 组织风险

- 团队在“先做平台”还是“先保业务”之间摇摆
- 没有统一验收标准，导致阶段收口失败

---

## 9. 推荐里程碑

### Milestone A

- `Phase 1` 完成
- Browser 正式闭环跑通

### Milestone B

- `Phase 2` 完成
- Policy 与多 Runtime 接口稳定

### Milestone C

- `Phase 3` 完成
- Memory 与 Evaluation 进入正式主链

### Milestone D

- `Phase 4` 完成
- 进化与发布闭环打通

### Milestone E

- `Phase 5` 完成
- 平台进入可持续扩展阶段

---

## 10. 回看 `Phase 1` 的定位

`Phase 1` 不是“小试一下”，也不是“MVP 结束点”，它的真实定位是：

- 为后续所有阶段建立正式对象模型
- 为 Memory 和 Evolution 提供干净输入
- 为 Policy 和多 Runtime 提供统一承载

如果 `Phase 1` 没有收敛好，后面每一阶段都会继续被旧边界拖累。

---

## 11. 一句话总结

完整路线的关键是：

> `Phase 1` 先收敛执行，`Phase 2` 收敛治理，`Phase 3` 收敛记忆，`Phase 4` 收敛进化，`Phase 5` 再做真正的平台化扩展。
