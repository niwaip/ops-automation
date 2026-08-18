# 企业级技能平台 项目架构与目录结构重塑设计书 (v4.1)

本设计书基于企业级技能平台的最新业务定位进行重塑：平台以后端的**工作单元（Work Unit）**、**工作流（Workflow）**、**发布（Release）**和**技能（Skill）**为核心主链，用户侧主要通过 **AI 自然语言识别用户意图 -> 选择 Skill -> 生成参数 -> 自动执行** 完成任务。

平台同时内置两类关键能力：

- **浏览器模板能力**：录制、语义理解、回放、接管、导出。
- **文档模板能力**：模板定义、数据填充、渲染、报表生成。

未来系统还会持续接入更多专项 AI Agent，例如：

- **代码生成智能体**：根据用户意图生成 Python / JS 执行逻辑，并在受控沙箱中运行。
- **自然语言浏览器动作智能体**：理解用户语言，直接在网页中执行探索、点击、输入、读取等动作。
- **后续更多垂直 Agent**：如 SQL Agent、数据分析 Agent、专项审批 Agent 等。

因此，本次设计目标不只是“整理目录”，而是要让整个后端的**物理结构真正反映业务主链和职责边界**，并为未来的多 Agent 扩展建立稳定、可插拔、可治理的架构骨架。

---

## 一、现状全局分析：物理结构与业务本质的“错位”

历史后端曾按传统技术分层组织，如 `core/`、`orchestration/`、`domain/`、`runtime/`、`sessions/`。这些旧路径已逐步迁出或移除，但对应的分层问题仍然值得记录，因为它们解释了当前重构的出发点。

### 1. 核心业务概念散居，修改链路过长

- **Skill** 的配置、匹配、参数识别、前端展示分散在多个位置，导致任何一个 Skill 模型变更都需要跨服务同步修改。
- **Workflow / Work Unit** 的设计时定义、运行时调度、物理执行分散在 `platform`、`control-plane`、`temporal-worker` 等不同位置，链条长且不直观。
- **Release** 作为真正的“可执行资产”没有被物理凸显，仍然只是某个平台模块中的一个子功能。

这意味着开发者脑中理解的是一条业务链，但代码目录表现出来的却是几块技术桶，认知负担很高。

### 2. Release 作为核心门禁，没有被提升为一级架构中心

在平台真实业务中，**Release** 连接了：

- 设计时资产：Skill 草稿、Workflow 模板、Browser Template、Document Template、Agent Profile。
- 运行时资产：可执行定义、运行时适配器绑定、审批规则、回滚信息。

因此，Release 应该是**设计时到运行时之间的唯一网关和唯一受控入口**。如果它继续被埋在普通模块中，就会出现以下问题：

- 草稿、模板、发布态资产边界不清。
- “可编辑定义”和“可执行定义”混在一起。
- 审批、校验、发布、回滚难以形成清晰的一条流水线。

### 3. 浏览器模板与文档模板仍被当作普通工具，而不是平台能力域

浏览器录制/回放与文档模板/渲染并不是普通的“工具模块”，而是平台内置的两大核心能力域：

- 它们既有**设计时资产**，又有**运行时执行器**。
- 它们既服务于普通 Skill，也会服务于未来的专项 Agent。
- 它们都有独立的数据模型、验证规则、导出逻辑和运行时适配方式。

如果继续沿用旧的 `domain/*`、`orchestration/*`、`runtime/*` 拆散方式，会造成能力域内部高耦合、跨层遍布的问题。

### 4. AI Planner 与能力域执行逻辑混杂

当前 `ai-orchestrator` 既负责：

- 意图识别
- 参数识别
- 计划生成
- Skill 匹配

又承担：

- 浏览器录制会话管理
- 页面观察与执行控制
- 浏览器调试导出
- 具体领域动作推断

这会导致主 Planner 逐步膨胀成“万能服务”，失去通用性。未来一旦再加上 Code Agent、Browser NL Agent、更多专项 Agent，这种结构会快速失控。

### 5. 治理类能力缺少独立归属

系统中还存在一类并不属于业务主链，但又必须稳定存在的能力：

- 身份认证与权限
- 组织与租户
- 审计日志
- 策略校验与安全边界

如果这类能力不单独成面，就会不断被掺入 Skill、Release、Execution 主链中，最后重新把边界打散。

### 6. 缺少“共享契约层”，未来独立 Agent 会反向耦合

一旦 `code-generator-agent`、`browser-nl-agent` 独立部署，就必须有统一的跨服务契约，例如：

- `Agent Execution Protocol`
- `Runtime Capability Contract`
- `Release Manifest`
- `Execution Event` / `Takeover Event` / `Approval Event`

如果这些协议散落在某个服务源码里，多 Agent 扩展后一定会重新出现交叉依赖和重复定义。

---

## 二、设计原则：主链清晰、治理独立、契约先行、南向插拔

重塑后的项目结构应遵循以下原则：

### 1. 以业务主链命名，而不是以技术分层命名

目录结构应该让人一眼看出平台的主流程：

`用户意图 -> Skill -> Workflow / Work Unit -> Release -> Execution -> Runtime`

而不是仍然要求开发者先理解“这段逻辑为什么在 orchestration，另一段为什么在 domain”。

### 2. Design-time 与 Run-time 必须物理分离

- **Design-time**：负责资产定义、注册、编辑、校验、编译。
- **Run-time**：负责执行、调度、会话、状态、人工干预、资源分配。
- **Release**：作为两者之间的唯一门禁和桥梁。

只有这样，草稿资产、模板资产、发布资产、执行实例才能形成清晰生命周期。

### 3. Release 是唯一可执行资产

系统中允许存在草稿、模板、定义，但真正能够被执行控制面消费的，应该只有 **Release Manifest**。

换言之：

- Skill 草稿不能直接执行。
- Workflow 模板不能直接执行。
- Browser / Document Template 不能直接执行。
- Agent Profile 不能直接执行。

这些设计时资产必须先经过：

`注册 -> 绑定 -> 编译 -> 校验 -> 发布 -> 形成 Release Manifest`

然后由 `control-plane` 统一消费。

### 4. Agent 视为一种 Step Executor，而不是新的控制面

未来专项 Agent 会越来越多，但它们都不应成为顶层控制面。它们应该被抽象为：

- 一种可注册的执行器
- 一种特殊的 Step 处理方
- 一种通过统一协议与 `control-plane` 交互的受控运行单元

这样新增 Agent 时，平台只需要新增：

- Agent Profile
- 绑定规则
- 协议实现
- 运行时适配

而不需要重写核心编排逻辑。

### 5. 能力域保持端到端闭环

每个内置能力域都应包含自己的：

- 设计时资产
- 领域服务
- 运行时映射
- 导出与编译支持
- 与控制面的受控交互接口

浏览器域和文档域不再只是若干散落模块，而是端到端闭环的能力子系统。

### 6. 治理面北向独立，南向不污染主链

认证、权限、组织、审计、策略这类通用治理逻辑应独立存在。它们为主链提供约束和安全门禁，但不与主链业务对象混在一起。

### 7. 契约与 SDK 统一沉淀在共享包中

所有跨服务协议统一落在 `packages/` 中，而不是散落在某一个服务的内部源码里。这样才能支撑未来独立部署、单独演进和多语言实现。

### 8. 模块对外统一通过 `index.ts` 暴露

每个模块或子域只通过 `index.ts` 对外暴露入口，防止跨模块直接深入内部目录。所有大文件在新增需求时优先拆职责，不再继续堆砌。

---

## 三、目标架构：治理 + 五大业务平面 + 契约层

### 1. 最终目标结构

建议将后端重塑为 **“1 个治理平面 + 5 个业务平面 + 1 个共享契约层”**。

```text
apps/backend/
├── governance/                    # 平台治理平面
│   ├── identity-access/           # 认证、授权、角色、租户访问控制
│   ├── organization/              # 组织、部门、成员、租户结构
│   └── audit-policy/              # 审计、策略、发布合规、全局安全规则
│
├── intelligence/                  # 智能意图与专项 Agent 平面
│   ├── master-planner/            # 通用意图理解、参数收集、计划生成、委派
│   ├── codegen-agent/             # 代码生成专项智能体
│   └── browser-nl-agent/          # 自然语言浏览器动作智能体
│
├── registry-release/              # 设计时注册与发布平面
│   ├── skill-registry/            # Skill 定义管理
│   ├── workflow-registry/         # Workflow / Work Unit 模板管理
│   ├── template-registry/         # Browser / Document 模板目录管理
│   ├── agent-catalog/             # Agent Profile、能力画像、授权范围
│   └── release-manager/           # 编译、校验、发布、回滚、Release Manifest
│
├── execution-control/             # 运行时执行控制平面
│   ├── control-plane/             # Execution 生命周期、审批、接管、状态推进
│   └── session-broker/            # 会话、租约、worker 分配、浏览器资源管理
│
├── capabilities/                  # 平台内置能力域平面
│   ├── browser-domain/            # 浏览器录制、语义、模板、导出、领域运行时映射
│   └── document-domain/           # 文档模板、渲染、报表、数据填充
│
├── runtimes/                      # 物理执行平面
│   ├── browser-worker/            # Playwright 原子执行器
│   ├── replay-worker/             # CDP / 回放 Worker
│   ├── temporal-worker/           # Workflow Activity Worker
│   └── sandbox-worker/            # 代码执行隔离沙箱
│
└── var/                           # 本地运行期数据、临时产物、缓存文件

packages/
├── backend-contracts/
│   ├── agent-execution-protocol/
│   ├── runtime-capability-contract/
│   ├── release-manifest/
│   ├── execution-events/
│   └── common-dto/
├── backend-sdk/
│   ├── control-plane-client/
│   ├── registry-client/
│   └── runtime-client/
└── shared-utils/
```

### 2. 关于目录命名的说明

- 文档中采用最终稳定命名，如 `intelligence/`、`registry-release/`。
- 若迁移阶段需要临时使用 `1.intelligence/` 这类编号目录以降低搬迁风险，可以作为中间态存在。
- 但长期稳定态建议去掉编号，避免路径语义中混入迁移痕迹。

---

## 四、核心业务对象重定义

为了避免后续实现再次偏离主链，需要先重新定义几个关键对象的边界。

### 1. Skill

`Skill` 是**用户语义入口**，而不是执行器本身。它负责：

- 触发条件和匹配语义
- 参数契约定义
- 允许绑定的 Workflow / Capability / Agent 类型
- 暴露给用户的能力描述

### 2. Workflow Template

`Workflow Template` 是设计时流程模板，用来组织多个 `Work Unit` 的顺序、分支、依赖和输入输出映射。

### 3. Work Unit

`Work Unit` 是最小执行单元，可以表现为：

- 工具调用
- 能力域动作
- Workflow Activity
- Agent Task
- 审批/人工接管节点

### 4. Capability Template

`Capability Template` 是能力域内部的设计时资产，例如：

- 浏览器录制模板
- 文档渲染模板
- 报表配置模板

### 5. Agent Profile

`Agent Profile` 描述某个专项 Agent 的：

- 能力画像
- 输入输出模式
- 可见资源范围
- 允许调用的 Runtime 类型
- 安全边界和审批要求

### 6. Release Manifest

`Release Manifest` 是系统中的**唯一可执行资产**，由 `release-manager` 生成，包含：

- Skill 绑定信息
- Workflow / Work Unit 编译结果
- Capability Template 引用
- Agent Profile 绑定结果
- Runtime 适配信息
- 审批与安全校验结果
- 版本、回滚、追踪元数据

### 7. Execution

`Execution` 是某个 `Release Manifest` 在一次具体请求下生成的运行实例，负责记录：

- 状态推进
- 人工审批
- 接管断点
- 运行时输出
- 失败恢复与审计轨迹

---

## 五、各平面详细设计（目录与关键文件）

### 1. Intelligence 平面：主 Planner 与专项 Agent 矩阵

该平面只负责“理解意图、生成计划、补齐参数、委派 Agent”，不直接承载浏览器域或文档域内部实现。

#### `apps/backend/intelligence/master-planner/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── intent/
│   │   ├── intent.controller.ts
│   │   ├── intent.service.ts
│   │   ├── intent-router.policy.ts
│   │   ├── intent.dto.ts
│   │   └── index.ts
│   ├── params/
│   │   ├── param-recognizer.service.ts
│   │   ├── param-normalizer.service.ts
│   │   ├── param-missing-input.service.ts
│   │   └── index.ts
│   ├── planning/
│   │   ├── plan-generator.service.ts
│   │   ├── capability-selector.service.ts
│   │   ├── step-template-mapper.service.ts
│   │   └── index.ts
│   └── delegation/
│       ├── agent-delegation.service.ts
│       ├── agent-routing.policy.ts
│       └── index.ts
```

#### `apps/backend/intelligence/codegen-agent/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── generator/
│   │   ├── code-writer.service.ts
│   │   ├── dependency-resolver.service.ts
│   │   ├── prompt-assembly.service.ts
│   │   └── index.ts
│   ├── verification/
│   │   ├── security-lint.service.ts
│   │   ├── dry-run.service.ts
│   │   ├── package-assembler.service.ts
│   │   └── index.ts
│   └── export/
│       ├── generated-work-unit.mapper.ts
│       └── index.ts
```

#### `apps/backend/intelligence/browser-nl-agent/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── perception/
│   │   ├── dom-parser.service.ts
│   │   ├── screen-analyzer.service.ts
│   │   ├── page-state-summarizer.service.ts
│   │   └── index.ts
│   ├── action-loop/
│   │   ├── reasoning-loop.service.ts
│   │   ├── action-translator.service.ts
│   │   ├── action-memory.service.ts
│   │   └── index.ts
│   └── runtime-bridge/
│       ├── browser-worker.client.ts
│       ├── control-plane.reporter.ts
│       └── index.ts
```

### 2. Registry & Release 平面：设计时资产注册与发布编译中心

该平面管理所有设计时资产，并将其编译为统一的 `Release Manifest`。

#### `apps/backend/registry-release/skill-registry/src/`

```text
src/
├── modules/
│   ├── skill/
│   │   ├── skill-config.service.ts
│   │   ├── skill-schema.service.ts
│   │   ├── skill-binding-policy.service.ts
│   │   └── index.ts
```

#### `apps/backend/registry-release/workflow-registry/src/`

```text
src/
├── modules/
│   ├── workflow/
│   │   ├── workflow-template.service.ts
│   │   ├── work-unit-template.service.ts
│   │   ├── workflow-validator.service.ts
│   │   └── index.ts
```

#### `apps/backend/registry-release/template-registry/src/`

```text
src/
├── modules/
│   ├── browser-template/
│   │   ├── browser-template-catalog.service.ts
│   │   └── index.ts
│   ├── document-template/
│   │   ├── document-template-catalog.service.ts
│   │   └── index.ts
```

#### `apps/backend/registry-release/agent-catalog/src/`

```text
src/
├── modules/
│   ├── agent-profile/
│   │   ├── agent-profile.service.ts
│   │   ├── agent-scope-policy.service.ts
│   │   ├── agent-capability-matrix.service.ts
│   │   └── index.ts
```

#### `apps/backend/registry-release/release-manager/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── release/
│   │   ├── release.controller.ts
│   │   ├── release.service.ts
│   │   ├── release.aggregate.ts
│   │   ├── release-manifest.mapper.ts
│   │   └── index.ts
│   ├── compiler/
│   │   ├── release-compiler.service.ts
│   │   ├── workflow-binding.service.ts
│   │   ├── capability-binding.service.ts
│   │   ├── agent-binding.service.ts
│   │   └── index.ts
│   ├── validator/
│   │   ├── release-validator.service.ts
│   │   ├── security-validator.service.ts
│   │   ├── browser-template-validator.service.ts
│   │   ├── document-template-validator.service.ts
│   │   └── index.ts
│   ├── publisher/
│   │   ├── release-publish.service.ts
│   │   ├── release-rollback.service.ts
│   │   └── index.ts
│   └── audit/
│       ├── release-audit.service.ts
│       └── index.ts
```

### 3. Execution & Control 平面：统一生命周期与运行时编排

`control-plane` 只负责生命周期控制，不直接拥有具体领域内部逻辑。

#### `apps/backend/execution-control/control-plane/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── execution/
│   │   ├── api/
│   │   │   ├── execution.controller.ts
│   │   │   ├── execution.dto.ts
│   │   │   └── index.ts
│   │   ├── application/
│   │   │   ├── execution.service.ts
│   │   │   ├── execution-lifecycle.service.ts
│   │   │   ├── execution-start.service.ts
│   │   │   ├── execution-query.service.ts
│   │   │   └── index.ts
│   │   ├── planning/
│   │   │   ├── execution-plan-normalizer.service.ts
│   │   │   ├── execution-step-builder.service.ts
│   │   │   └── index.ts
│   │   ├── runtime/
│   │   │   ├── step-executor.service.ts
│   │   │   ├── runtime-adapter.registry.ts
│   │   │   ├── browser-runtime.adapter.ts
│   │   │   ├── document-runtime.adapter.ts
│   │   │   ├── workflow-runtime.adapter.ts
│   │   │   ├── sandbox-runtime.adapter.ts
│   │   │   └── index.ts
│   │   ├── human-control/
│   │   │   ├── approval.service.ts
│   │   │   ├── takeover.service.ts
│   │   │   ├── input-resolution.service.ts
│   │   │   └── index.ts
│   │   ├── state/
│   │   │   ├── execution-state.service.ts
│   │   │   ├── execution-event.service.ts
│   │   │   └── index.ts
│   │   └── index.ts
```

#### `apps/backend/execution-control/session-broker/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── session/
│   │   ├── session-allocation.service.ts
│   │   ├── session-lease.service.ts
│   │   ├── browser-session-pool.service.ts
│   │   └── index.ts
│   ├── worker-routing/
│   │   ├── runtime-routing.service.ts
│   │   └── index.ts
```

### 4. Capabilities 平面：平台内置能力域

能力域内部保留自己的设计时与运行时映射能力，但不直接承担顶层控制编排。

#### `apps/backend/capabilities/browser-domain/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── templates/
│   │   ├── browser-template.service.ts
│   │   ├── browser-template-compiler.service.ts
│   │   └── index.ts
│   ├── semantics/
│   │   ├── semantic-rule.service.ts
│   │   ├── semantic-runtime.service.ts
│   │   └── index.ts
│   ├── recorder/
│   │   ├── recorder-debug.service.ts
│   │   ├── recorder-session.service.ts
│   │   ├── recorder-observation.service.ts
│   │   ├── recorder-export.service.ts
│   │   └── index.ts
│   ├── runtime-facade/
│   │   ├── browser-capability.facade.ts
│   │   ├── browser-phase-mapper.ts
│   │   └── index.ts
│   └── policies/
│       ├── action-policy.service.ts
│       └── index.ts
```

#### `apps/backend/capabilities/document-domain/src/`

```text
src/
├── app.module.ts
├── modules/
│   ├── template/
│   │   ├── document-template.service.ts
│   │   ├── document-template-parser.service.ts
│   │   └── index.ts
│   ├── render/
│   │   ├── document-render.service.ts
│   │   ├── render-parameter.service.ts
│   │   └── index.ts
│   ├── report/
│   │   ├── report-generator.service.ts
│   │   ├── report-export.service.ts
│   │   └── index.ts
│   └── runtime-facade/
│       ├── document-capability.facade.ts
│       └── index.ts
```

### 5. Runtimes 平面：无状态原子执行器

Worker 与执行器只提供受控原子能力，不承载复杂业务编排。

- **`browser-worker`**：提供 Playwright / 浏览器原子操作，并支持向 `browser-nl-agent` 流式返回 DOM、截图和交互状态。
- **`replay-worker`**：提供浏览器录制回放、CDP 调试与接管协助。
- **`temporal-worker`**：提供标准化 Workflow Activity 执行。
- **`sandbox-worker`**：提供受控脚本/代码执行沙箱，只接受已编译校验的执行包。

### 6. Governance 平面：统一治理与合规控制

建议将以下模块统一迁入治理平面：

- `identity-access`：认证、角色、权限、令牌、SSO / LDAP 集成。
- `organization`：组织、成员、租户、资源归属。
- `audit-policy`：审计日志、安全策略、发布审批规则、全局风险控制。

它们服务于整个平台，但不直接进入业务主链编排。

### 7. Packages 契约层：多 Agent 解耦关键支点

需要统一沉淀以下共享契约：

- `Agent Execution Protocol`
- `Runtime Capability Contract`
- `Release Manifest`
- `Execution Events`
- `Takeover / Approval / Input Resolution DTO`

这层是未来多 Agent 独立部署的关键，不应省略。

---

## 六、关键职责边界与架构规则

为避免未来再次演化回“大而全服务”，必须明确以下边界规则：

### 1. `master-planner` 只做通用规划

允许职责：

- 理解自然语言意图
- 匹配 Skill
- 识别参数
- 生成 Execution Plan
- 委派专项 Agent

禁止职责：

- 直接承载浏览器录制调试实现
- 直接承载文档模板渲染细节
- 直接实现 Runtime 物理控制

### 2. `release-manager` 是唯一发布门禁

所有设计时资产都必须先进入 `release-manager` 编译、校验、审计，生成 `Release Manifest` 后才能交由控制面执行。

### 3. `control-plane` 只认统一执行协议

控制面只与以下对象交互：

- `Release Manifest`
- `Step Executor`
- `Runtime Adapter`
- `Execution Event`

控制面不应依赖某个能力域内部的具体 service 实现。

### 4. Agent 内部高频决策留在 Agent 自身

例如 `browser-nl-agent` 内部的 ReAct 循环、页面观察、动作选择都应留在该 Agent 服务内部；`control-plane` 只接收阶段性状态和最终结果。

### 5. Runtimes 只做原子执行

Worker 不负责理解用户意图、不负责规划流程、不负责持有业务主状态。它们只执行经过上层编排后的标准化请求。

### 6. 模块边界统一经由 `index.ts`

所有子域必须通过 `index.ts` 暴露公共接口，跨模块禁止深层 import 内部文件。

---

## 七、扩展性设计对比与演进优势

### 1. 新增“代码生成智能体”（Code Agent）

**旧结构下的痛点：**

1. 必须在 `ai-orchestrator` 中硬编码 Prompt、代码生成和执行逻辑。
2. 控制面需要直接知道“动态代码执行”这种特殊实现细节。
3. 代码安全、沙箱测试与普通业务逻辑混杂，边界混乱。

**新结构下的路径：**

1. 在 `intelligence/codegen-agent/` 新增专项服务。
2. 通过 `agent-catalog` 注册其能力画像与安全范围。
3. 通过 `release-manager` 绑定为标准化 `Work Unit` 执行形态。
4. `control-plane` 仅通过 `sandbox-runtime.adapter` 调度 `sandbox-worker`。

**收益：**

- 控制面不需要知道代码生成内部细节。
- 安全 lint、干跑测试、执行打包完全内聚。
- 新增和演进不污染主 Planner。

### 2. 新增“自然语言浏览器动作智能体”（Browser NL Agent）

**旧结构下的痛点：**

1. 主 Planner 需要适配大量浏览器语义判断。
2. 控制面被迫承担高频感知-动作循环。
3. 浏览器录制、观察、执行、接管与规划耦合在一起。

**新结构下的路径：**

1. 用户意图先由 `master-planner` 判断是否需要委派 `browser-nl-agent`。
2. 该 Agent 以标准 Step Executor 形式挂载到执行生命周期。
3. 高速循环保留在 Agent 内部，物理动作由 `browser-worker` 执行。
4. 控制面只接收状态、断点、成功/失败结果。

**收益：**

- 控制面仍保持稳定轻量。
- 浏览器域内部可以独立演进感知和决策策略。
- 后续更换模型、引入 VLM 或强化学习式策略时，不影响平台骨架。

### 3. 新增其他专项 Agent

采用该结构后，未来新增 SQL Agent、报表分析 Agent、外部系统交互 Agent 的接入成本都将显著下降。新增路径基本固定为：

1. 新增 Agent 服务。
2. 注册 Agent Profile。
3. 定义协议实现。
4. 绑定 Release。
5. 接入统一 Runtime 或专属 Runtime Adapter。

---

## 八、实施迁移路线规划

对于正在稳定运行的系统，建议采用 **“契约先行、边界先收敛、目录渐进迁移、测试保障收口”** 的策略，分四步进行。

### 第一步：冻结边界，先做逻辑封装

1. 给 `ai-orchestrator`、`control-plane`、`platform` 中的关键模块补齐 `index.ts` 外观层。
2. 将浏览器相关逻辑先在逻辑上收敛到 `browser` 边界内，不急于立即物理搬迁。
3. 将 Skill、Workflow、Release 的对外接口先收口，避免继续横向扩散。

### 第二步：抽取共享契约层

1. 在 `packages/backend-contracts/` 中定义：
   - `agent-execution-protocol`
   - `runtime-capability-contract`
   - `release-manifest`
   - `execution-events`
2. 控制面、专项 Agent、Runtime 优先改为依赖这些共享契约，而不是互相直接引用内部实现。

### 第三步：重组设计时与运行时平面

1. 将 `skill`、`execution-flow`、`temporal-workflow`、`capability-release` 重组到 `registry-release/`。
2. 将 `browser-template`、`browser-semantics`、`ai-orchestrator/modules/browser` 逐步并入 `capabilities/browser-domain/`。
3. 将 `document-engine`、`report` 合并到 `capabilities/document-domain/`。
4. 将 `control-plane`、`session-broker` 稳定到 `execution-control/`。

### 第四步：独立部署专项 Agent 与 Runtime

1. 为所有 Worker 实现统一的 `Runtime Capability Contract`。
2. 将 `codegen-agent`、`browser-nl-agent` 独立部署。
3. 确保它们只通过 `control-plane` 和共享契约交互，不再直接依赖其他服务内部源码。

---

## 九、工作区与工程配置建议

### 1. `pnpm-workspace.yaml` 推荐形态

```yaml
packages:
  - 'apps/backend/governance/*'
  - 'apps/backend/intelligence/*'
  - 'apps/backend/registry-release/*'
  - 'apps/backend/execution-control/*'
  - 'apps/backend/capabilities/*'
  - 'apps/backend/runtimes/*'
  - 'apps/frontend/*'
  - 'packages/*'
  - 'tests/*'
```

### 2. Docker / Compose 使用建议

- 所有 Docker 启动与测试统一通过 `./docker/start-smart.sh` 执行。
- `PROJECT_ROOT` 必须始终绑定当前仓库根目录。
- 迁移期间若服务路径发生变化，需要同步修正 compose 中的 service build/context 与 volume 映射。

### 3. 文件组织建议

- 每个模块内部优先拆为 `api / application / domain / infrastructure / index.ts` 或最接近其职责的结构。
- 业务大文件超过 500 行时，新增需求优先做职责下沉。
- 超过 800 行的 Service/Controller 默认先评估拆分，不再继续堆逻辑。

---

## 十、最终结论

本次重塑的本质，不是简单地把已有服务换个目录，而是要完成以下三件核心工作：

1. **让目录结构显式反映平台主链**：`Skill -> Workflow / Work Unit -> Release -> Execution -> Runtime`
2. **让 Release 成为唯一可执行资产**：设计时定义与运行时执行彻底解耦
3. **让 Agent 成为标准化的可插拔执行器**：未来新增专项 Agent 不再破坏控制面和主 Planner

在此基础上，再通过治理平面和共享契约层托住安全、审计、协议与独立部署能力，平台才能真正进入“稳定核心 + 可插拔南向能力 + 多 Agent 并行演进”的下一阶段。
