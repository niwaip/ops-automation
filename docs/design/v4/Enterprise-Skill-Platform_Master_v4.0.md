# 企业级 Skill 平台 `v4` 总纲

**Master v4.0**  
日期：2026-05-01

> 本文是 `v4` 设计文档的总入口。  
> `v4` 不是对 `v3` 的简单续写，而是在当前代码现态、服务边界、运行时治理、工具治理和外部接入诉求基础上，正式把平台收敛为“稳定契约优先、外部能力可独立接入、部署边界可长期演进”的企业级 Skill 平台。

---

## 1. `v4` 的定位

`v4` 的平台目标不是继续把系统理解成“一个 AI Core 加很多外挂能力”，而是明确把平台定义为：

- 以 `Skill` 为统一交付对象
- 以 `Execution` 为统一业务容器
- 以 `Runtime` 为统一执行适配层
- 以 `Tool Governance` 为统一能力门控层
- 以 `Release Pipeline` 为统一上线链路

一句话概括：

> Planner 负责理解，Execution 负责编排，Runtime 负责执行，Registry 负责发布，外部能力通过稳定契约接入。

---

## 2. 为什么进入 `v4`

`v3` 已经完成了一个关键转折：

- 把 `ai-orchestrator` 从“执行中心”收敛为 `Planner`
- 把 `Execution`、`Runtime`、`Policy`、`Memory` 提升为正式平面
- 建立了 Skill、Release、Tool Governance 的雏形

但在进入更复杂场景和外部能力接入阶段后，新的问题已经出现：

- 业务场景越来越多，必须支持高度定制
- 外部能力未来可能独立开发、独立部署、独立接入
- 当前仓库中的物理服务结构与逻辑边界尚未完全对齐
- 现有接口虽有雏形，但还没有被正式冻结为稳定契约
- 当前 `docker compose` 更像开发全栈启动方式，而不是正式部署蓝图

因此，`v4` 的核心任务不再是单纯扩展功能，而是：

1. 冻结正式稳定契约
2. 明确核心能力与外部能力边界
3. 收敛 Runtime 接入协议
4. 让部署模型与架构模型一致
5. 为外部团队接入提供正式路径

---

## 3. `v4` 的核心原则

### 3.1 契约优先于实现

- 可以替换 Planner 实现
- 可以替换 Runtime 实现
- 可以调整服务拆分方式
- 但不应破坏正式契约对象语义

### 3.2 北向统一，南向可插拔

- 对上统一通过 `Execution`
- 对内统一通过 `Skill`
- 对下统一通过 `Runtime Capability Contract`

### 3.3 发布优先于自由接入

- 外部能力不能直接绕过平台治理进入系统
- 必须最终进入 `Skill / Tool / Release` 正式链路

### 3.4 Runtime 只执行，不定义业务真相

- Runtime 成功只代表执行成功
- 最终业务结果由 `Execution + Verification` 决定

### 3.5 平台核心必须稳定，外部能力必须可独立演进

- 平台核心负责长期稳定契约
- 外部能力负责按协议接入并独立扩展

---

## 4. `v4` 的当前基线文档

`v4` 目录已经收敛为两份长期保留的高层文档：

### 4.1 系统总述

- [Master_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md)

用途：

- 定义平台总体定位
- 固化 `v4` 的核心原则、正式对象、稳定契约和分层心智
- 作为系统级高层描述

### 4.2 项目描述

- [Project-Description_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md)

用途：

- 描述当前仓库仍有效的项目范围
- 对齐现有实现主线和目录边界
- 作为项目级高层描述

---

## 5. `v4` 的正式对象

从 `v4` 开始，平台统一围绕以下正式对象协作：

- `Skill`
- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `ToolCatalog`
- `SkillToolBinding`
- `CapabilityRelease`
- `SkillDraft`
- `PublishedSkillRuntimeContext`
- `ArtifactRef`
- `SnapshotRef`

这些对象共同构成：

- 北向业务入口
- 治理入口
- 发布入口
- 运行时入口

---

## 6. `v4` 的正式稳定契约

`v4` 正式冻结以下四类稳定契约：

1. `Execution Contract`
2. `Skill Contract`
3. `Runtime Capability Contract`
4. `Tool Governance Contract`

### 6.1 `Execution Contract`

用于：

- 任务发起
- 状态查看
- 审批
- 输入补交
- 接管
- 恢复

它是平台最重要的北向业务契约。

### 6.2 `Skill Contract`

用于：

- 统一能力交付
- 承接手工 Skill、Flow、Temporal、外部能力发布

它是平台最重要的能力交付契约。

### 6.3 `Runtime Capability Contract`

用于：

- 统一 Browser / Document / Workflow / API / Code / Custom Runtime 的南向接入

它是平台最重要的执行接入契约。

### 6.4 `Tool Governance Contract`

用于：

- 工具目录治理
- Prompt / Runtime 暴露治理
- Skill 绑定治理
- 运行时工具边界治理

它是平台最重要的安全与门控契约。

---

## 7. `v4` 的正式分层

`v4` 推荐按六层理解平台：

1. `Experience Layer`
2. `Planner Layer`
3. `Execution Layer`
4. `Registry & Release Layer`
5. `Runtime Layer`
6. `Governance Layer`

### 7.1 Experience Layer

包含：

- `portal`
- `office-addin`
- 后续业务前端入口

### 7.2 Planner Layer

当前主承载：

- `ai-orchestrator`

### 7.3 Execution Layer

当前主承载：

- `control-plane`

### 7.4 Registry & Release Layer

当前主承载：

- `auth` 中的 `skill`
- `capability-release`
- `temporal-workflow`

### 7.5 Runtime Layer

当前主承载：

- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`

### 7.6 Governance Layer

当前主承载对象：

- `ToolCatalog`
- `SkillToolBinding`
- `CapabilitySnapshot`
- 审批与接管策略

---

## 8. `v4` 下核心能力与外部能力的关系

### 8.1 平台核心能力

必须长期稳定维护：

- Execution Core
- Skill Core
- Registry / Release Core
- Governance Core
- Planner Core
- Runtime Core

### 8.2 外部能力

允许独立开发、独立部署、独立演进：

- 浏览器执行器
- 文档执行器
- 第三方 API 执行器
- 行业专项执行器
- 第三方 Agent Worker
- 自定义 Tool Provider

### 8.3 外部能力接入原则

外部能力进入平台必须满足以下路径之一：

1. 作为 `Tool` 接入
2. 作为 `Runtime Adapter` 接入
3. 作为 `Flow / Workflow Source` 接入

不允许：

- 直接把外部能力绑定到 Planner 私有逻辑
- 直接让前端依赖某个 Runtime 私有协议
- 直接绕过 Execution 写业务主状态

---

## 9. `v4` 的部署心智

`v4` 推荐将部署正式划分为五组：

1. `基础设施组`
2. `核心控制组`
3. `规划与理解组`
4. `运行时组`
5. `体验组`

含义如下：

- 平台最小核心是 `核心控制组 + 基础设施组`
- Planner 是可替换理解层
- Runtime 是可插拔执行层
- 体验组是独立入口层

这意味着：

- 当前 `docker compose` 不能再被理解为长期唯一架构形态
- 后续外部能力应优先部署到 `运行时组`

---

## 10. `v4` 的迁移路线

`v4` 推荐按以下顺序迁移：

1. `P0 契约冻结`
2. `P1 控制面收敛`
3. `P2 Runtime 协议统一`
4. `P3 Registry 逻辑拆分`
5. `P4 部署分层化`
6. `P5 外部能力开放接入`

迁移原则：

- 先冻结契约
- 再适配现有实现
- 再做物理与部署层收敛
- 最后开放更大规模外部接入

---

## 11. `v4` 的阅读顺序

建议按以下顺序阅读：

1. [Master_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md)
2. [Project-Description_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md)

推荐用途：

- 系统层讨论：先读 `Master`
- 项目现状与目录边界：再读 `Project Description`

---

## 12. `v4` 的最终结论

`v4` 的本质不是“再做一轮更大的技术重构”，而是正式定义：

- 什么是平台核心
- 什么是可插拔外部能力
- 什么接口必须稳定
- 什么状态只能由谁写
- 外部能力到底通过什么方式接入
- 部署层如何与架构层保持一致

如果后续一个新能力不能被清晰映射到：

- `Execution`
- `Skill`
- `Runtime Capability Contract`
- `Tool Governance`

中的至少一类正式契约，那么它不应直接进入 `v4` 正式平台体系。
