# 企业级 Skill 平台 Agent OS 总纲

**Master v3.0**  
日期：2026-04-26

> 本文是 `v3` 设计的顶层总纲，用于统一 `Planner-only Agent OS` 的目标、分层、核心对象、服务映射与演进路线。它与 `v2` 的区别在于：将 `ai-orchestrator` 明确降级为 Planner，将 `Execution / Runtime / Policy / Memory / Evolution` 提升为正式的一等平面。

---

## 1. 定位

`v3` 的平台目标不是构建一个“更自由的自治 Agent”，而是构建一个：

- 以 `Skill` 为交付单元
- 以 `Execution` 为业务真相源
- 以 `RuntimeSession` 为资源真相源
- 以 `Policy` 为风险边界
- 以 `Memory` 为长期上下文
- 以 `Evolution` 为受控进化机制

的一体化企业 Agent OS。

一句话概括：

> Agent 负责理解，系统负责治理，Runtime 负责执行，平台负责学习。

---

## 2. 为什么进入 `v3`

`v2` 已经基本回答了以下问题：

- Skill 平台的总体方向
- 运行时与治理边界
- Execution 主模型
- MVP 的交付路径

但随着对 `ai-orchestrator` 的深入梳理，`v2` 暴露出 4 个持续性问题：

- `ai-orchestrator` 仍然承担了过多执行语义
- Memory 仍偏向临时上下文，不是长期可治理对象
- Evolution 还停留在想法和局部流程，没有正式接入 Skill 发布链
- 运行时边界和权限边界虽有设计，但还没有彻底从 Planner 中剥离

因此，`v3` 的目标是完成一次明确的职责重排。

---

## 3. `v3` 的核心原则

### 3.1 Planner 只负责理解与建议

- Planner 可以生成计划
- Planner 可以做验证和失败分类
- Planner 不直接落高风险动作

### 3.2 Execution 是正式业务容器

- 一切业务状态以 `Execution` 为准
- UI、审计、审批、接管都默认围绕 `Execution`

### 3.3 Runtime 只负责资源与执行

- Runtime 不定义业务是否成功
- Runtime 不持有审批结论
- Runtime 只执行被允许的 typed capability

### 3.4 Policy 必须独立存在

- 谁能做什么
- 什么时候需要审批
- 什么时候必须人工接管
- 哪些能力禁止自动执行

这些都不应藏在 Prompt 或运行时分支逻辑里。

### 3.5 Memory 必须分层治理

- Session Memory
- User Memory
- Skill Memory
- Org Knowledge

Memory 不是聊天记录归档，而是平台长期资产。

### 3.6 Evolution 必须受控

- 运行时可以观察
- 运行时可以提出 patch
- 运行时不能直接修改线上 Skill

---

## 4. 目标分层

### 4.1 Experience Layer

包含：

- Portal
- Chat UI
- Office Add-in
- 审批工作台
- Execution 内联接管/恢复区

### 4.2 Planner Plane

核心职责：

- Goal 理解
- Skill 路由
- 参数补全
- 计划生成
- 结果验证
- 失败分类

主服务：

- `ai-orchestrator`

### 4.3 Execution Control Plane

核心职责：

- 任务创建
- 状态推进
- Step 编排
- 审计记录
- 中断与恢复

主对象：

- `Execution`
- `ExecutionStep`
- `ExecutionEvent`

### 4.4 Runtime Plane

核心职责：

- 分配运行资源
- 执行 typed capability
- 冻结、恢复、关闭
- 回传资源和执行结果

主对象：

- `RuntimeSession`

### 4.5 Policy Plane

核心职责：

- 风险分级
- Capability 授权
- 审批判断
- 接管判断
- 数据边界和执行边界校验

### 4.6 Memory & Knowledge Plane

核心职责：

- 提供高相关上下文
- 沉淀用户、技能、组织经验
- 为 Planner 和 Verifier 提供可检索记忆

### 4.7 Evolution Plane

核心职责：

- 对失败和接管进行复盘
- 生成 `Memory Patch`
- 生成 `Candidate Patch`
- 接入验证、审核、发布链

---

## 5. 关键一等对象

`v3` 的统一语言应包括：

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

---

## 6. 与当前仓库的映射

### 6.1 直接纳入

- `control-plane`
  - 作为 `Execution Control Plane` 起点
- `session-broker`
  - 作为 `RuntimeSession Manager`
- `browser-worker`
  - 作为 Browser Runtime
- `auth/capability-release`
  - 作为 Validate / Review / Publish / Rollback 主链

### 6.2 保留但降级

- `ai-orchestrator`
  - 收敛为 Planner / Verifier / Failure Classifier

### 6.3 只保留思路

- 本地进程内 subprocess 风格代码执行
- 强依赖文本协议解析的 ReAct 控制流

---

## 7. `v3` 的核心链路

推荐主链路如下：

`Request -> Planner -> PlanDraft -> Policy Precheck -> Execution -> Runtime -> Verification -> Result`

在异常场景下，链路可分叉为：

- `waiting_input`
- `pending_approval`
- `human_control`
- `failed`

执行结束后统一进入：

`Evaluation -> Memory Patch / Candidate Patch -> Validate -> Review -> Publish`

---

## 8. 设计文档关系

`v3` 文档建议按以下顺序阅读：

1. `Enterprise-Skill-Platform_Master_v3.0.md`
2. `Enterprise-Skill-Platform_Agent-OS-Planner-Architecture_v3.0.md`
3. `Enterprise-Skill-Platform_Agent-OS-Execution-and-Migration-Blueprint_v3.0.md`
4. `Enterprise-Skill-Platform_Core-Data-Model_v3.0.md`

分工如下：

- `Master v3`
  - 统一目标、原则、分层和路线
- `Planner Architecture v3`
  - 解释 Planner 降级后的架构边界
- `Execution and Migration Blueprint v3`
  - 定义迁移路线和 Execution 模型
- `Core Data Model v3`
  - 定义对象和表结构骨架

---

## 9. 演进路线

### 9.1 第一阶段

- `Execution` 成为业务真相源
- `RuntimeSession` 成为资源真相源
- `ai-orchestrator` 输出结构化计划

### 9.2 第二阶段

- 引入 `Skill Memory`
- 引入 `PolicyDecision`
- 引入统一 step 执行协议

### 9.3 第三阶段

- 引入 `Evaluation`
- 引入 `Candidate Patch`
- 接入发布和灰度链

### 9.4 第四阶段

- 实现更完整的 User Memory / Org Knowledge / Code Runtime
- 建立更成熟的 replay、benchmark、promotion 体系

---

## 10. 不是要做什么

`v3` 明确不追求：

- 完全无治理的自治 Agent
- 让 Planner 直接读写所有内部系统
- 用更长 Prompt 代替系统边界设计
- 让运行时直接热修线上 Skill

---

## 11. 成功标准

如果 `v3` 落地成功，平台应具备以下特征：

- 用户看到的是统一 `Execution`
- 审批和接管围绕 `Execution` 运转
- Runtime 可独立扩展和替换
- Planner 变轻，且更容易替换模型和策略
- Memory 成为可积累资产
- Evolution 走正式发布链，而不是运行时偷偷变异

---

## 12. 一句话总结

`v3` 的本质是一次架构重排：

> 把“聪明”从执行器里拆出来，把“稳定”从 Prompt 里搬出来，把“进化”从想法变成正式系统能力。
