# 企业级 Skill 平台稳定接口与外部能力架构方案

**Architecture Proposal v4.0**  
日期：2026-05-01

> 本文是在 `v3` 总纲、服务边界、运行时治理以及当前代码现态基础上形成的 `v4` 正式方案。  
> `v4` 的重点不再是继续抽象平台愿景，而是把“哪些能力属于平台核心、哪些能力属于外部接入、哪些接口必须稳定、哪些部署边界必须长期保持”定义为正式规则。  
> 本文可直接作为后续架构设计、外部团队接入、接口冻结、服务拆分和 Docker 部署分层的基线文档。

---

## 1. 文档目标

本文解决以下问题：

- 平台的 `核心能力` 与 `外部能力` 应如何划分
- 面向多场景定制时，哪些接口必须保持长期稳定
- 外部团队独立开发能力时，应通过什么方式接入系统
- 当前仓库服务结构为什么会让职责看起来不清晰
- `docker compose` 应如何从“开发全量启动脚本”收敛为“分层部署结构”
- 哪些现有 API 可以冻结为 `v1`，哪些仍应视为内部实现

---

## 2. `v4` 的核心结论

### 2.1 平台不再以“单个 AI Core”定义自己

`v4` 不应再把系统理解为“一个 AI Core 加若干外部外挂能力”，而应理解为：

- 以 `Skill` 为交付对象
- 以 `Execution` 为统一业务容器
- 以 `Runtime` 为统一执行适配层
- 以 `Tool Governance` 为统一能力门控层
- 以 `Release Pipeline` 为统一上线链路

一句话概括：

> Planner 负责理解，Execution 负责编排，Runtime 负责执行，Registry 负责发布，外部能力通过稳定契约接入。

### 2.2 `v4` 最重要的不是“更多能力”，而是“稳定接口”

后续平台要支持：

- 多业务场景定制
- 不同团队独立开发外部能力
- 不同运行时并行演进
- Skill 的长期复用和组合

因此 `v4` 的第一优先级不是新增更多 AI 功能，而是冻结以下四类稳定契约：

1. `Execution Contract`
2. `Skill Contract`
3. `Runtime Capability Contract`
4. `Tool Governance Contract`

### 2.3 物理服务可以暂时不拆，但逻辑边界必须先冻结

第一阶段可以继续保留当前仓库中的物理服务形态：

- `control-plane`
- `ai-orchestrator`
- `auth`
- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`

但从 `v4` 开始，所有设计、接入和重构都必须以“逻辑契约”而不是“当前服务里写了什么代码”作为基准。

---

## 3. 现态问题总结

### 3.1 当前系统已经具备的基础

当前代码现态已经具备以下关键能力：

- `Planner` 基础能力
  - Skill 匹配
  - 参数识别
  - 计划生成
  - 失败分类
- `Execution` 基础能力
  - 创建
  - 状态推进
  - 审批
  - 接管
  - 恢复
  - SSE 事件流
- `Skill / Release` 基础能力
  - Skill 元数据管理
  - Skill 权限管理
  - Tool Catalog
  - SkillToolBinding
  - Capability Release
  - Skill Draft 生成与发布
- `Runtime` 基础能力
  - Browser Runtime
  - Document Runtime
  - Temporal Workflow Runtime
  - RuntimeSession 管理雏形

### 3.2 当前看起来“职责不清”的根因

职责不清并不是因为没有边界设计，而是因为 `逻辑边界` 与 `物理承载` 还没有彻底分开。

最典型的问题有：

- `auth` 同时承载了
  - 身份认证
  - RBAC
  - Skill Registry
  - Capability Release
  - Temporal Workflow 管理
- `ai-orchestrator` 已经被定义为 Planner，但仍然保留较多工具执行和运行时裁剪逻辑
- `control-plane` 是 Execution 的天然宿主，但仍夹杂代理壳和下游耦合逻辑
- `session-broker` 是 Runtime 资源平面，但仍存在被误用为业务执行状态面的风险
- 当前 `docker compose` 反映的是“本地开发怎么全量启动”，不是“长期稳定的架构分层”

### 3.3 当前最需要修复的不是功能缺失，而是接口歧义

如果不先解决接口歧义，后续会持续出现以下问题：

- 外部团队不知道该接 `ai-orchestrator` 还是 `control-plane`
- 新能力不知道该先注册成 Tool 还是先直接做 Skill
- Runtime 团队会绕过 Execution，直接定义业务状态
- Portal 可能绕过正式控制面，直接拼接下游服务语义
- 部署层会继续把“服务之间能相互调用”误当成“职责可以相互重叠”

---

## 4. `v4` 的目标架构

### 4.1 目标分层

`v4` 推荐把平台正式划分为六层：

1. `Experience Layer`
2. `Planner Layer`
3. `Execution Layer`
4. `Registry & Release Layer`
5. `Runtime Layer`
6. `Governance Layer`

### 4.2 各层职责

#### 4.2.1 Experience Layer

包含：

- `portal`
- `office-addin`
- 后续业务前端
- 外部系统嵌入式入口

职责：

- 发起任务
- 展示 Execution
- 展示审批和接管
- 展示 Skill 与发布资产

原则：

- 不直接编排底层 Runtime
- 不直接判断业务执行状态
- 不直接依赖某个外部能力的私有接口

#### 4.2.2 Planner Layer

当前承载服务：

- `ai-orchestrator`

职责：

- Goal 理解
- Skill 路由
- 参数识别
- 计划生成
- 风险提示
- 结果验证
- 失败分类

原则：

- 只输出建议，不写业务主状态
- 不直接绑定某个外部能力的私有协议
- 不作为外部团队接入主入口

#### 4.2.3 Execution Layer

当前承载服务：

- `control-plane`

职责：

- 创建 `Execution`
- 维护 `ExecutionStep`
- 推进状态
- 审批、接管、恢复
- 输出事件流
- 聚合审计

原则：

- 所有北向业务入口统一通过 `Execution API`
- 所有业务状态以 `Execution` 为准
- 不允许 Runtime 自行定义“业务已成功”

#### 4.2.4 Registry & Release Layer

当前承载服务：

- `auth` 中的 `skill`、`capability-release`、`temporal-workflow`

职责：

- Skill 元数据管理
- Tool Catalog 管理
- SkillToolBinding 管理
- Skill Draft 生成、编辑、审批、发布
- Flow / Temporal 产物发布成 Skill

原则：

- 外部团队交付能力最终必须进入这一层
- 发布前阻断优先于运行时报错
- Skill 是平台唯一正式交付对象

#### 4.2.5 Runtime Layer

当前承载服务：

- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`

职责：

- 分配运行资源
- 执行 typed capability
- freeze / resume / close
- 返回结构化执行结果
- 返回 snapshot / artifact / logs

原则：

- 只执行，不解释业务是否最终成功
- 只接受结构化请求，不接受自由文本任务
- 对上必须暴露统一 Runtime Contract

#### 4.2.6 Governance Layer

当前承载位置：

- `ToolCatalog`
- `SkillToolBinding`
- `CapabilitySnapshot`
- 审批和接管相关逻辑

职责：

- 工具可见性治理
- 风险等级治理
- Prompt / Runtime 暴露控制
- Skill 对工具的绑定闭环
- 运行时最终工具快照裁剪

原则：

- 治理规则必须显式化
- 治理对象必须可审计、可发布阻断

---

## 5. 核心能力与外部能力的正式划分

### 5.1 平台核心能力

以下能力属于平台必须长期稳定维护的核心能力：

#### 5.1.1 Execution Core

包括：

- Execution 创建
- 状态机
- Step 编排
- 输入补交
- 审批
- 接管
- 事件订阅

这是平台最核心的北向契约。

#### 5.1.2 Skill Core

包括：

- Skill 定义
- Skill 版本语义
- 参数模式
- Tool 绑定
- 发布态
- 运行时元数据

这是平台最核心的资产契约。

#### 5.1.3 Registry / Release Core

包括：

- Skill 发布链
- Draft 管理
- Build / Validate / Review / Publish / Rollback
- SourceType 管理

这是平台最核心的上线治理契约。

#### 5.1.4 Governance Core

包括：

- Tool Catalog
- 风险等级
- Prompt 暴露控制
- Runtime 暴露控制
- 审批策略
- 运行时工具上下文

这是平台最核心的安全与边界契约。

#### 5.1.5 Planner Core

包括：

- 技能匹配
- 参数识别
- PlanDraft 生成
- 失败分类
- 结果验证

这是平台最核心的理解与建议契约。

#### 5.1.6 Runtime Core

包括：

- RuntimeSession 管理
- 能力执行调度
- 标准结果回传
- snapshot / artifact 产出语义

这是平台最核心的执行适配契约。

### 5.2 外部能力

以下能力统一视为“外部能力”，允许独立开发、独立部署、独立演进：

- 浏览器自动化能力
- 文档渲染能力
- 第三方 API 连接器
- 业务系统写入器
- 专项行业流程执行器
- 第三方 Agent Worker
- 第三方工具包 / Skill 包

### 5.3 外部能力的正式要求

所有外部能力必须满足以下条件之一，才能进入系统：

1. 作为 `Tool` 被注册到 Tool Catalog
2. 作为 `Runtime Adapter` 挂到 Runtime Layer
3. 作为 `Flow / Temporal / Capability Source` 被发布链接管

不允许：

- 直接把外部能力接到 Portal
- 直接把外部能力耦合到 Planner Prompt
- 直接让外部能力绕过 Execution 写业务状态

---

## 6. `v4` 稳定接口总览

### 6.1 四类必须冻结的稳定契约

`v4` 正式规定以下四类契约为平台一级稳定接口：

1. `Execution Contract`
2. `Skill Contract`
3. `Runtime Capability Contract`
4. `Tool Governance Contract`

### 6.2 `Execution Contract`

#### 6.2.1 作用

这是面向：

- Portal
- Office Add-in
- 外部业务系统
- MCP / API 客户端

的统一业务入口。

#### 6.2.2 最小稳定语义

必须长期保持稳定的操作包括：

- `createExecution`
- `getExecution`
- `listExecutions`
- `getExecutionSteps`
- `submitInput`
- `approveExecution`
- `rejectExecution`
- `takeoverExecution`
- `resumeExecution`
- `cancelExecution`
- `streamExecutionEvents`

#### 6.2.3 设计原则

- 执行发起方不应直接关心底层 Runtime 类型
- 统一通过 `skillId / capabilityId + input` 发起
- 返回值中必须带标准状态、当前步骤、审批态、接管态、资源链接
- 事件流必须保持稳定事件类型和最小字段集

### 6.3 `Skill Contract`

#### 6.3.1 作用

这是平台内外所有能力统一进入系统的正式形态。

#### 6.3.2 最小稳定字段

建议冻结以下字段语义：

- `id`
- `name`
- `description`
- `triggerKeywords`
- `paramsSchema`
- `executionFlowTemplateIds`
- `executionFlow`
- `tools`
- `effectiveTools`
- `apiEndpoints.runtimeMetadata`
- `isPublished`
- `publishedReleaseId`

#### 6.3.3 设计原则

- Skill 必须是“可发布、可执行、可审计”的对象
- Skill 必须可以承载来自不同 SourceType 的能力
- Skill 不得扩大调用方原本没有的权限边界

### 6.4 `Runtime Capability Contract`

#### 6.4.1 作用

这是平台 Runtime 层与外部执行器之间的统一南向契约。

#### 6.4.2 最小稳定输入

建议统一为：

- `executionId`
- `stepId`
- `runtimeSessionId`
- `capabilityType`
- `action`
- `input`
- `policyContext`
- `traceContext`

#### 6.4.3 最小稳定输出

建议统一为：

- `success`
- `status`
- `output`
- `errorCode`
- `errorMessage`
- `snapshotId`
- `artifactRefs`
- `requiresTakeover`
- `takeoverReason`
- `rawResult`

#### 6.4.4 设计原则

- Runtime 不接受自由文本任务
- Runtime 不输出业务结论，只输出执行事实
- 所有 Runtime 适配器必须遵循统一结果结构

### 6.5 `Tool Governance Contract`

#### 6.5.1 作用

这是 Tool 进入 Prompt、进入 Runtime、被 Skill 绑定、被审批门控的统一规则。

#### 6.5.2 最小稳定字段

- `name`
- `displayName`
- `runtimeType`
- `status`
- `riskLevel`
- `allowSkillBinding`
- `promptExposure`
- `defaultRequiresConfirmation`
- `defaultRequiresApproval`

#### 6.5.3 设计原则

- Tool 是治理对象，不只是代码类
- Skill 的运行时工具集合必须来自正式绑定与快照交集
- 发布阻断优先于运行时拒绝

---

## 7. 外部能力接入模型

### 7.1 接入模型 A：作为 Tool 接入

适用场景：

- 单点 API 能力
- 专项浏览器动作
- 文件解析器
- 轻量写入器

接入步骤：

1. 实现 Tool
2. 注册到 Tool Catalog
3. 配置风险和暴露策略
4. 允许 Skill 绑定
5. 经发布链上线

优点：

- 接入成本低
- 治理粒度细

限制：

- 只适合原子能力
- 不适合承载复杂长流程

### 7.2 接入模型 B：作为 Runtime Adapter 接入

适用场景：

- 浏览器执行器
- 文档引擎
- 第三方业务系统连接器
- 第三方 Agent Worker

接入步骤：

1. 实现统一 Runtime Capability Contract
2. 接入 Runtime Layer
3. 通过 Skill 或 Flow 调度使用
4. 由 Execution 统一承接状态

优点：

- 对外部团队最友好
- 平台边界最清晰
- 适合独立部署和独立扩容

限制：

- 需要平台先定义统一 Runtime 协议

### 7.3 接入模型 C：作为 Flow / Temporal Source 接入

适用场景：

- 业务流程型能力
- 模板生成型能力
- 复杂审批与步骤编排型能力

接入步骤：

1. 提供 `Execution Flow Template` 或 `Temporal Workflow`
2. 进入 Capability Release
3. 生成 Skill Draft
4. 审批并发布成 Skill

优点：

- 与平台发布治理高度一致
- 易于追踪来源、版本和回滚

限制：

- 上线链路更重

### 7.4 `v4` 正式推荐顺序

优先级建议如下：

1. 长期独立开发的外部能力：优先 `Runtime Adapter`
2. 轻量原子能力：优先 `Tool`
3. 复杂业务流程能力：优先 `Flow / Temporal Source`

---

## 8. 服务职责正式方案

### 8.1 `control-plane`

`v4` 正式定位：

- 唯一 `Execution Control Plane`

必须保留：

- Execution 北向 API
- 执行状态机
- 审批 / 接管 / 恢复
- Execution 事件流

必须禁止继续扩大：

- 作为纯代理壳无限转发
- 承担 Skill Registry 职责
- 直接承载某个具体 Runtime 私有协议

### 8.2 `ai-orchestrator`

`v4` 正式定位：

- `Planner Facade`

必须保留：

- Skill 匹配
- 参数识别
- PlanDraft
- 验证与失败分类

必须收敛：

- 不再作为外部能力接入主入口
- 不再承担业务主状态写入
- 不再绑定具体外部系统协议

### 8.3 `auth`

`v4` 正式定位：

- 第一阶段同时承接：
  - `Identity Service`
  - `Skill Registry / Release Service`

后续目标：

- 概念上拆为两个逻辑域
  - `identity-service`
  - `skill-registry-release-service`

必须保留：

- 登录与鉴权
- RBAC
- Skill Registry
- Tool Catalog
- Capability Release

### 8.4 `session-broker`

`v4` 正式定位：

- `Runtime Manager`

必须保留：

- RuntimeSession 分配
- 资源租约
- freeze / resume
- worker / profile 绑定

必须禁止：

- 写业务成功失败结论
- 承担审批或业务编排语义

### 8.5 `browser-worker`

`v4` 正式定位：

- `Browser Runtime Adapter`

必须保留：

- 结构化 step 执行
- snapshot
- health
- recorder
- takeover signal

必须演进：

- 标准化输入输出协议
- 与统一 Runtime Contract 对齐

### 8.6 `carbone-engine`

`v4` 正式定位：

- `Document Runtime Adapter`

必须保留：

- 模板预览
- 渲染
- 文档相关执行结果输出

必须禁止：

- 承担 Skill 治理或发布治理

### 8.7 `temporal-worker`

`v4` 正式定位：

- `Workflow Runtime Adapter`

必须保留：

- Temporal worker 执行
- workflow / activity 承载

必须对齐：

- 统一 Runtime Contract
- Artifact / logs / result 标准化回传

---

## 9. Docker Compose 分层部署方案

### 9.1 当前问题

当前 `docker-compose.base.yml` 主要服务于“本地全栈开发”，因此：

- 它展示了所有服务都能一起启动
- 但没有清晰表达“哪个服务属于哪个架构层”
- 也没有明确“哪些服务是核心必选，哪些属于可插拔运行时”

### 9.2 `v4` 推荐部署分组

建议从 `v4` 开始按五组理解和组织 Compose：

#### 9.2.1 基础设施组

- `postgres`
- `redis`

#### 9.2.2 核心控制组

- `control-plane`
- `auth`

#### 9.2.3 规划与理解组

- `ai-orchestrator`

#### 9.2.4 运行时组

- `session-broker`
- `browser-worker`
- `carbone-engine`
- `temporal-worker`
- 后续外部 Runtime Adapter

#### 9.2.5 体验组

- `portal`
- `office-addin`

### 9.3 `v4` 正式规则

从 `v4` 开始，部署层应遵循以下规则：

1. `control-plane + auth + postgres + redis` 构成最小平台核心
2. `ai-orchestrator` 是可替换的 Planner 实现，但对外接口语义必须稳定
3. `browser-worker / carbone-engine / temporal-worker` 均应视为 Runtime Adapter，而非平台控制面
4. 新外部能力若独立部署，优先进入“运行时组”，而不是直接进入“核心控制组”
5. Compose 文件应逐步拆成：
   - `core`
   - `planner`
   - `runtime`
   - `experience`
   - `full-dev`

### 9.4 推荐的 Compose 结构

建议后续逐步演进为：

- `docker-compose.core.yml`
- `docker-compose.planner.yml`
- `docker-compose.runtime.yml`
- `docker-compose.experience.yml`
- `docker-compose.full.yml`

这样可以让不同团队明确：

- 核心平台如何独立启动
- 外部 Runtime 如何按需挂载
- 体验层如何独立调试

---

## 10. `v4` 正式接口冻结建议

### 10.1 可以冻结为 `v1` 的接口

建议尽快定义并冻结以下 API 语义：

#### 10.1.1 Execution API

- `POST /executions`
- `GET /executions`
- `GET /executions/:id`
- `GET /executions/:id/steps`
- `POST /executions/:id/submit-input`
- `POST /executions/:id/approve`
- `POST /executions/:id/reject`
- `POST /executions/:id/takeover`
- `POST /executions/:id/resume`
- `POST /executions/:id/cancel`
- `GET /executions/:id/events/stream`

#### 10.1.2 Skill Registry API

- `GET /skills`
- `GET /skills/:id`
- `POST /skills`
- `PUT /skills/:id`
- `POST /skills/:id/validate-tools`
- `GET /skills/:id/tool-bindings`
- `PUT /skills/:id/tool-bindings`

#### 10.1.3 Release API

- `POST /capability-releases`
- `POST /capability-releases/:id/build`
- `POST /capability-releases/:id/validate/static`
- `POST /capability-releases/:id/generate-skill-draft`
- `POST /capability-releases/:id/approve`
- `POST /capability-releases/:id/publish-skill`
- `GET /capability-releases/runtime/skills/:skillId/context`

#### 10.1.4 Planner API

- `POST /ai/plans/generate`
- `POST /ai/recognize-params`
- `POST /skills/match`

### 10.2 不应直接对外承诺稳定的内部接口

以下接口或内部机制不建议作为平台正式对外契约：

- `ToolExecutor` 内部执行语义
- ReAct 迭代过程事件细节
- 内部 Prompt 模板
- 动态 Flow Tool 命名规则
- 某个 Runtime 的私有 HTTP 细节

原则：

- 对外承诺对象级契约
- 不对外承诺内部编排细节

---

## 11. `v4` 标准接入流程

### 11.1 外部 Runtime 团队接入

标准流程：

1. 平台定义 Runtime Capability Contract
2. 外部团队实现自己的 Runtime Adapter
3. 通过配置声明支持的 capabilityType / action
4. 平台在 Registry 中配置其可用范围
5. Skill 或 Flow 在发布链中绑定该能力
6. Execution 统一编排并审计

### 11.2 外部 Tool 团队接入

标准流程：

1. 提交 Tool 定义
2. 注册 Tool Catalog
3. 配置风险级别和暴露策略
4. 绑定到 Skill
5. 经验证与发布链上线

### 11.3 外部流程团队接入

标准流程：

1. 提供 Flow Template 或 Temporal Workflow
2. 进入 Capability Release
3. 生成 Skill Draft
4. 人工审核
5. 发布为正式 Skill

---

## 12. `v4` 实施顺序

### 12.1 第一阶段：冻结逻辑契约

目标：

- 明确四类稳定契约
- 输出统一 DTO 与错误码规范
- 明确北向与南向边界

工作项：

1. 冻结 Execution API 语义
2. 冻结 Skill Contract 字段语义
3. 冻结 Published Skill Runtime Context 结构
4. 明确 Tool Governance 标准字段

### 12.2 第二阶段：Runtime 南向收敛

目标：

- 让 Browser / Document / Temporal / 外部 Runtime 都进入统一适配层

工作项：

1. 抽象统一 Runtime Capability Contract
2. 标准化 result / snapshot / artifact 回传
3. 明确 takeover / approval / failure 语义

### 12.3 第三阶段：Registry 从身份域概念拆分

目标：

- 降低外部团队理解成本
- 让 Skill / Release 形成独立平台面

工作项：

1. 在文档和 API 命名上先完成逻辑拆分
2. 再视情况完成物理拆分

### 12.4 第四阶段：部署分层化

目标：

- 让 Docker 层和架构层一致

工作项：

1. 拆分 compose 文件
2. 支持独立 Runtime Adapter 按需启动
3. 支持核心平台与运行时分开部署

---

## 13. `v4` 的正式原则

从 `v4` 开始，平台必须长期遵守以下原则：

1. 平台对外只承诺对象级稳定契约，不承诺内部实现细节
2. 所有业务任务统一进入 `Execution`
3. 所有正式能力统一交付为 `Skill`
4. 所有执行器统一挂到 `Runtime Layer`
5. 所有工具统一纳入 `Tool Governance`
6. 所有上线统一经过 `Release Pipeline`
7. Planner 只负责理解与建议，不再作为能力接入主入口

---

## 14. 最终结论

`v4` 的核心不是再做一个更大的 Agent，而是正式把平台收敛成：

- 一个稳定的 `Execution` 业务容器
- 一个稳定的 `Skill` 交付与发布系统
- 一个稳定的 `Runtime` 适配层
- 一个稳定的 `Tool Governance` 门控层
- 一个可让外部团队独立开发并安全接入的开放架构

因此，后续所有新增能力都应回答四个问题：

1. 它最终以什么 `Skill` 形态进入系统
2. 它通过什么 `Runtime` 或 `Tool` 契约接入
3. 它如何被 `Execution` 编排与审计
4. 它如何被 `Registry / Release / Governance` 治理

如果这四个问题没有被清晰回答，则该能力不应进入正式平台架构。
