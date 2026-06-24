# 企业级技能平台 项目架构重塑迁移实施清单 (v4.1)

**Migration Checklist v4.1**  
日期：2026-06-23

> 本文是 [`project_architecture_redesign.md`](file:///Users/chain/Documents/MyProject/ops-automation/docs/project_architecture_redesign.md) 的配套实施清单。  
> 它不重复解释目标架构本身，而是回答一个更落地的问题：  
> **当前仓库中的后端服务，应该按什么顺序、以什么方式，逐步迁移到新的“治理 + 五大业务平面 + 契约层”结构。**

---

## 1. 文档目标

本文聚焦四类问题：

1. 当前后端各服务、各模块，最终分别归属到哪个目标平面。
2. 哪些内容先做逻辑收敛，哪些内容后做物理迁移。
3. `pnpm-workspace`、Docker、公共契约、测试验证应如何配合迁移。
4. 每一阶段的完成标准、风险点和回滚策略是什么。

---

## 2. 迁移总原则

### 2.1 不做一次性大爆炸式搬迁

本次重构不能采用“全量挪目录、全量改 import、全量改部署”的一次性方案。正确方式是：

1. 先冻结边界。
2. 再抽共享契约。
3. 再做逻辑收敛。
4. 最后做物理迁移与部署拆分。

### 2.2 先逻辑归属，后物理归属

在迁移初期，允许代码物理上还在旧目录，但必须先明确其**逻辑归属**已经切换。例如：

- `ai-orchestrator/modules/browser` 在第一阶段可以仍留在原服务中，
- 但其逻辑归属已经应被视为 `capabilities/browser-domain`，
- 新增需求只能沿着这个新归属扩展，不得再按旧结构扩散。

### 2.3 Release 是唯一可执行资产

迁移中所有设计时对象最终都必须收敛到：

`草稿 / 模板 / 规则 -> release-manager -> Release Manifest -> control-plane`

任何跳过 `Release Manifest` 直接执行模板、直接执行草稿、直接执行 Agent Profile 的新实现，都视为违背目标架构。

### 2.4 控制面保持稳定，专项能力南向迁移

迁移过程中，`control-plane` 是优先稳定的核心，不应该随着浏览器域、文档域、Agent 域调整而被反复改骨架。真正应该持续南向下沉的是：

- 浏览器录制与执行细节
- 文档模板解析与渲染细节
- 专项 Agent 的内部决策循环

### 2.5 共享契约优先于独立部署

在 `codegen-agent`、`browser-nl-agent` 真正独立部署之前，必须先完成：

- `Agent Execution Protocol`
- `Runtime Capability Contract`
- `Release Manifest`
- `Execution Event DTO`

否则物理拆分只会把现有耦合从单体目录复制成跨服务耦合。

---

## 3. 当前现态服务到目标平面的映射总表

下面的映射以“当前仓库现态”为基础，给出每个主要服务/模块的目标归属和迁移策略。

| 当前路径 | 当前职责 | 目标平面 | 目标服务/模块 | 迁移策略 |
| :--- | :--- | :--- | :--- | :--- |
| `apps/backend/core/platform/src/modules/auth` | 认证、登录、权限入口 | `governance` | `identity-access` | `auth.service` 与 auth 请求/response 契约已迁入 `identity-access`，`controller`、`module` 与旧 dto/response 兼容壳仍留在 `platform` |
| `apps/backend/core/platform/src/modules/organization` | 组织、部门、归属 | `governance` | `organization` | `organization.service`、`organization.controller`、组织请求 DTO 与 response 契约已迁入 `governance/organization`，`module` 与旧 controller/DTO 兼容壳仍留在 `platform` |
| `apps/backend/core/platform/src/modules/user` | 用户信息管理 | `governance` | `identity-access` | 用户查询、角色变更、启停用主体已迁入 `identity-access`；当前仅保留 controller/module 兼容壳 |
| `apps/backend/core/platform/src/guards/*` | 访问控制守卫 | `governance` | `identity-access` | `RolesGuard`、`JwtAuthGuard`、`RbacGuard` 已归位；`RbacGuard` 通过 reader token 接回平台查询实现 |
| `apps/backend/core/platform/src/decorators/*` | 权限与角色装饰器 | `governance` | `identity-access` | 已完成首批物理归位 |
| `apps/backend/core/platform/src/strategies/*` | JWT / LDAP 等策略 | `governance` | `identity-access` | `ldap.strategy`、`jwt.strategy` 已归位；`jwt.strategy` 通过 reader token 接回平台查询实现 |
| `apps/backend/core/platform/src/modules/skill` | Skill 管理、匹配、绑定、校验 | `registry-release` | `skill-registry` | 已在 `apps/backend/registry-release/skill-registry/README.md` 中显式纳入统一逻辑视图，并继续按 `registry / binding / access / matching / enrichment / validation` 收敛 |
| `apps/backend/core/platform/src/modules/execution-flow` | 流程模板定义 | `registry-release` | `workflow-registry` | 已在 `apps/backend/registry-release/workflow-registry/README.md` 中显式纳入统一逻辑视图，并已补充 `flow-template/README.md`、`validation/README.md` 说明 Flow 模板注册面、模板服务以及验证结果类型与验证 facade 的统一边界 |
| `apps/backend/core/platform/src/modules/temporal-workflow` | Workflow / Activity 模板、代码生成、草稿 | `registry-release` | `workflow-registry` | 已在 `apps/backend/registry-release/workflow-registry/README.md` 中显式纳入统一逻辑视图，并继续按 `workflow / activity / codegen / validation` 收敛，且其校验服务与类型出口已统一纳入 `validation/README.md` 说明 |
| `apps/backend/core/platform/src/modules/capability-release` | 发布、编译、校验、运行时绑定 | `registry-release` | `release-manager` | 已在 `apps/backend/registry-release/release-manager/README.md` 中显式纳入统一逻辑视图，并已补充 `release/README.md`、`compiler/README.md`、`validator/README.md`、`publisher/README.md`、`audit/README.md` 说明发布主入口、构建装配、发布前校验、发布后桥接与审计收口边界 |
| `apps/backend/intelligence/ai-orchestrator/src/modules/planner/*` | 参数识别、Skill 匹配、计划生成 | `intelligence` | `master-planner` | 已显式形成 `facade / intent / params / plan / planning / skill` 逻辑视图，并明确浏览器专属能力不再回流到 `planner` |
| `apps/backend/intelligence/ai-orchestrator/src/modules/recognizer/*` | 识别与提示构建 | `intelligence` | `master-planner` | 服务已归位，模块继续收敛 |
| `apps/backend/intelligence/ai-orchestrator/src/modules/model/*` | 模型选择与调用 | `intelligence` | `master-planner` | 服务已归位，模块继续收敛 |
| `apps/backend/intelligence/ai-orchestrator/src/modules/react-engine/*` | 工具推理、执行决策 | `intelligence` | `master-planner` | 服务已归位，模块继续收敛 |
| `apps/backend/intelligence/ai-orchestrator/src/modules/agent/*` | Agent 抽象入口 | `intelligence` | `master-planner/delegation` | 已通过 `modules/planner/delegation` 建立逻辑视图，后续再决定是否物理并入 |
| `packages/backend-contracts/agent-profile` | Agent Profile 共享合同 | `contracts` | `agent-catalog` | 已新增共享 `Agent Profile` 合同包，供 `ai-orchestrator` 与专项 Agent 复用 |
| `packages/backend-contracts/agent-execution-protocol` | 专项 Agent 与控制面的共享执行协议 | `contracts` | `specialized-agent ingress` | 已提供开始请求、进度事件、结果回传三类合同，供 `control-plane` 与专项 Agent 后续按标准协议接入 |
| `apps/backend/intelligence/codegen-agent/*` | 代码生成、预校验、结果封装 | `intelligence` | `codegen-agent` | 已形成最小服务骨架与 `contracts / generator / verification / export` 逻辑视图，后续再接入控制面注册与独立部署 |
| `docs/design/v4/codegen-agent-minimum-placement_v4.1.md` | `codegen-agent` 最小落点设计 | `intelligence` | `codegen-agent` | 已补齐与共享 `Agent Profile`、`master-planner`、`sandbox-worker` 的边界说明，并与当前骨架对齐 |
| `apps/backend/intelligence/browser-nl-agent/*` | 自然语言浏览器高频循环、观察、运行时桥接 | `intelligence` | `browser-nl-agent` | 已形成最小服务骨架与 `contracts / perception / action-loop / runtime-bridge` 逻辑视图，后续再接入控制面委派与独立部署 |
| `docs/design/v4/browser-nl-agent-minimum-placement_v4.1.md` | `browser-nl-agent` 最小落点设计 | `intelligence` | `browser-nl-agent` | 已补齐与 `browser-domain`、`browser-worker`、`control-plane` 的三层边界说明，并与当前骨架对齐 |
| `apps/backend/intelligence/ai-orchestrator/src/modules/browser/*` | 浏览器录制、观察、执行、导出、浏览器意图 | `capabilities` | `browser-domain`，部分逻辑外溢到 `browser-nl-agent` | 已显式形成 `gateway / recorder / observation / session / export / runtime-facade` 逻辑出口，物理实现暂仍留在 `ai-orchestrator` |
| `apps/backend/execution-control/control-plane/*` | 执行生命周期、审批、接管、运行时适配 | `execution-control` | `control-plane` | 已完成首轮路径归位 |
| `apps/backend/execution-control/session-broker/*` | 会话、分配、锁、冻结、runtime session | `execution-control` | `session-broker` | 已完成首轮路径归位，并已形成 `session / runtime-session / allocation / lock / freeze / worker-routing` 职责视图 |
| `apps/backend/domain/browser-template/*` | 浏览器模板管理、编译、校验 | `capabilities` | `browser-domain/templates` | 已明确“设计时模板资产 + 本地过渡发布接口”边界，`publish / deprecate / revoke` 后续收敛到 `release-manager` |
| `apps/backend/domain/browser-semantics/*` | 浏览器语义规则、发布、运行时 | `capabilities` | `browser-domain/semantics` | 已明确 `rule-set / release / runtime` 三层边界，其中 `release` 为过渡发布态，统一门禁后续收敛到 `release-manager` |
| `apps/backend/capabilities/browser-domain/README.md` | 浏览器能力域统一归属说明 | `capabilities` | `browser-domain` | 已建立域级归属说明、内部结构草图与模板/语义规则的发布边界说明，后续按该视图逐步物理迁移 |
| `apps/backend/domain/document-engine/*` | 文档模板、渲染、Studio、参数发现 | `capabilities` | `document-domain` | 已明确承接 `template / render / runtime-facade` 逻辑层，并在正式渲染结果中补充 `artifacts: ArtifactRef[]` |
| `apps/backend/domain/report/*` | 报表分析、导出、模板生成 | `capabilities` | `document-domain/report` | 已明确承接 `report` 主层，局部复用 `template / render` 逻辑层，并在报表结果中补充 `artifacts: ArtifactRef[]` |
| `apps/backend/capabilities/document-domain/README.md` | 文档能力域统一归属说明 | `capabilities` | `document-domain` | 已建立域级归属说明、`template / render / report / runtime-facade` 结构草图与统一产物语义说明 |
| `docs/design/v4/document-domain-artifact-alignment_v4.1.md` | 文档域产物语义对齐说明 | `capabilities` | `document-domain` | 已记录 `document-engine` / `report` 向统一 `ArtifactRef` 对齐的当前映射规则与过渡约束 |
| `apps/backend/runtimes/browser-worker/*` | 浏览器原子执行 | `runtimes` | `browser-worker` | 已完成首轮路径归位，并纳入 `apps/backend/runtimes/README.md` 的统一运行时视图 |
| `apps/backend/runtimes/replay-worker/*` | 回放、CDP、接管辅助 | `runtimes` | `replay-worker` | 已完成首轮路径归位，并纳入 `apps/backend/runtimes/README.md` 的统一运行时视图 |
| `apps/backend/runtimes/temporal-worker/*` | Workflow Activity 执行 | `runtimes` | `temporal-worker` | 已完成首轮路径归位，并纳入 `apps/backend/runtimes/README.md` 的统一运行时视图 |
| `apps/backend/runtimes/sandbox-worker/*` | 动态代码沙箱执行与校验 | `runtimes` | `sandbox-worker` | 已完成独立目录承接，并纳入 `apps/backend/runtimes/README.md` 的统一运行时视图 |
| `apps/backend/runtimes/README.md` | 运行时平面统一视图与路径规划 | `runtimes` | `runtimes` | 已建立 browser/replay/temporal/sandbox 四类 worker 的职责、协议与部署边界说明 |
| `apps/backend/runtime/temporal-worker/src/sandbox/*` | 沙箱执行 HTTP 接口 | `runtimes` | `sandbox-worker` | 历史来源路径，已由 `apps/backend/runtimes/sandbox-worker` 承接 |
| `apps/backend/runtime/sandbox-agent/*` | Python 沙箱执行器 | `runtimes` | `sandbox-worker` | 历史来源路径，已由 `apps/backend/runtimes/sandbox-worker` 承接 |

---

## 4. 当前服务内部的优先拆分建议

### 4.1 `core/platform` 不是一个服务搬完就结束，而是要先按模块所有权拆

建议把当前 `core/platform` 拆成三类所有权：

#### A. 治理类

- `auth`
- `organization`
- `user`
- `guards`
- `decorators`
- `strategies`

#### B. 注册类

- `skill`
- `execution-flow`
- `temporal-workflow`

#### C. 发布类

- `capability-release`

这一步先不要求立刻拆成三个物理服务，但必须先在代码责任、README、接口说明中把所有权说清楚。

### 4.2 `ai-orchestrator` 必须先做“Planner 与 Browser 域”切割

建议先在逻辑上拆成两块：

#### A. 通用 Planner 逻辑

- `planner/*`
- `recognizer/*`
- `model/*`
- `agent/*`
- `react-engine/*` 中真正通用的计划与工具决策部分

#### B. 浏览器能力域逻辑

- `browser/execute/*`
- `browser/observe/*`
- `browser/export/*`
- `browser/session/*`
- `browser/loop/*`
- `browser/api/*`
- `browser/intent/*`

这一步完成后，`browser/*` 新增功能就不能再被当作“orchestrator 内部实现”，而必须按 `browser-domain` 设计。

### 4.3 `document-engine` 与 `report` 需要尽快合并视图

虽然两者当前是不同服务，但逻辑上都属于文档能力域：

- `document-engine` 更偏模板与渲染工作台
- `report` 更偏导出与结果生成

建议先形成统一的 `document-domain` 视图，再决定是否保留多个部署单元。

### 4.4 `temporal-worker` 中的 `sandbox` 必须拆出去

当前 `temporal-worker` 内同时承载：

- Workflow Worker
- Sandbox 执行接口

这会混淆“工作流 Activity 执行”和“动态代码沙箱执行”两类完全不同的运行时语义。建议在较早阶段就拆出独立 `sandbox-worker`。

---

## 5. 分阶段迁移实施清单

建议按六个阶段推进。

### `M0` 基线冻结阶段

#### 目标

形成正式迁移基线，避免重构期间继续扩散旧模式。

#### 工作项

1. 将 [`project_architecture_redesign.md`](file:///Users/chain/Documents/MyProject/ops-automation/docs/project_architecture_redesign.md) 作为架构目标基线。
2. 将本文作为迁移顺序与执行清单基线。
3. 在 `apps/backend/README.md` 中补充“目标架构迁移中”说明。
4. 明确一条团队规则：
   - 新增后端能力优先放入目标归属，不再继续按旧的 `core / domain / orchestration / runtime` 心智扩散。

#### 验收标准

- 团队对目标平面和迁移顺序达成一致。
- 后续需求设计开始引用新平面命名。

### `M1` 边界冻结阶段

#### 目标

先在现有服务中冻结逻辑边界，不急于物理搬目录。

#### 工作项

1. `core/platform` 中为 `skill`、`execution-flow`、`temporal-workflow`、`capability-release` 补充清晰的模块导出入口。
2. `ai-orchestrator` 中对 `browser` 子域建立单独网关层，禁止外部直接深层引用其内部实现。
3. `control-plane` 明确其唯一写边界：
   - `Execution` 状态推进
   - 审批与接管
   - Runtime 适配调度
4. `session-broker` 明确其唯一职责：
   - 会话与资源分配
   - 租约与锁
   - Runtime Session 生命周期

#### 验收标准

- 新增代码不再跨旧目录随意引用。
- 关键模块都具备稳定 `index.ts` 或等效入口。

### `M2` 契约抽取阶段

#### 目标

将跨服务共享协议从具体服务内部抽出到 `packages/`。

#### 需要抽出的第一批契约

- `Release Manifest`
- `Agent Execution Protocol`
- `Runtime Capability Contract`
- `Execution Event DTO`
- `Approval / Takeover / Input Resolution DTO`
- `ArtifactRef / SnapshotRef / RuntimeError` 统一结构

#### 工作项

1. 创建 `packages/backend-contracts/`。
2. 将控制面与 Runtime 间的 DTO 抽出。
3. 将专项 Agent 与控制面的交互事件抽出。
4. 将 Release 产物结构抽出，禁止服务私有结构继续外溢。

#### 验收标准

- `control-plane`、`browser-worker`、`temporal-worker`、`sandbox-worker`、未来 `codegen-agent` 能通过共享契约通信。
- 新的跨服务 DTO 不再定义在单一服务源码内部。

### `M3` 设计时资产重组阶段

#### 目标

把“注册”和“发布”从旧平台服务中拆成清晰两层。

#### 具体动作

1. 将 `skill` 迁为 `skill-registry`。
2. 将 `execution-flow` + `temporal-workflow` 统一到 `workflow-registry`。
3. 将浏览器模板、文档模板目录能力统一为 `template-registry`。
4. 将 `capability-release` 迁为 `release-manager`。
5. 新增 `agent-catalog` 作为未来专项 Agent 的准入与能力画像中心。

#### 本阶段重点约束

- `Release Manifest` 必须由 `release-manager` 统一生成。
- 任何浏览器模板、文档模板、Workflow 模板都不能绕开发布中心直接被控制面执行。

#### 验收标准

- 设计时资产的读写归属清晰。
- 发布链成为唯一受控门禁。

### `M4` 能力域收敛阶段

#### 目标

把浏览器域与文档域从“散落模块”收敛成端到端能力域。

#### 浏览器域动作

1. `domain/browser-template` -> `capabilities/browser-domain/templates`
2. `domain/browser-semantics` -> `capabilities/browser-domain/semantics`
3. `ai-orchestrator/modules/browser/*` -> `capabilities/browser-domain/recorder`、`runtime-facade` 或未来 `browser-nl-agent`
4. 浏览器录制导出逻辑与模板资产编译逻辑统一视图
5. 浏览器模板与语义规则当前保留局部发布接口，但统一发布门禁目标仍是 `release-manager`

#### 文档域动作

1. `domain/document-engine` -> `capabilities/document-domain`
2. `domain/report` -> `capabilities/document-domain/report`
3. 统一文档模板、渲染、报表与产物导出语义

#### 验收标准

- 浏览器域新增功能不再进入 `ai-orchestrator`
- 文档域新增功能不再拆散到多个无关服务

### `M5` Runtime 与部署归位阶段

#### 目标

完成 `runtimes/` 平面和部署脚本归位。

#### 工作项

1. `runtime/browser-worker` 迁到 `apps/backend/runtimes/browser-worker`（已完成）
2. `runtime/replay-worker` 迁到 `apps/backend/runtimes/replay-worker`（已完成）
3. `runtime/temporal-worker` 迁到 `apps/backend/runtimes/temporal-worker`（已完成）
4. 从 `temporal-worker/src/sandbox` 与历史 `runtime/sandbox-agent` 路径整合出独立 `apps/backend/runtimes/sandbox-worker`
5. 历史 `sessions/session-broker` 已迁到 `apps/backend/execution-control/session-broker`（已完成）
6. 更新 `pnpm-workspace.yaml`
7. 更新 `docker/start-smart.sh`、Compose 文件中的路径与挂载

#### 验收标准

- 新目录下服务可独立启动
- Compose 能正确挂载当前 worktree 路径
- Runtime 路径变更不影响控制面调用链

### `M6` 专项 Agent 独立部署阶段

#### 目标

让 `codegen-agent`、`browser-nl-agent` 成为真正可独立演进的微服务。

#### 工作项

1. 先以共享契约接入控制面。
2. 再从 `master-planner` 中剥离专项决策逻辑。
3. 完成 Agent Profile 注册、授权与审批规则绑定。
4. 将 Agent 自身的高频循环保留在 Agent 内部，不再回写控制面内部状态机。

当前状态：

- 已有共享 `Agent Profile` 合同包：`packages/backend-contracts/agent-profile`
- 已有共享执行协议合同包：`packages/backend-contracts/agent-execution-protocol`
- `codegen-agent` 与 `browser-nl-agent` 的专项设计文档都已明确：后续接入 `control-plane` 时优先复用共享执行协议，而不是直接耦合控制面私有 DTO
- 已补充专项 Agent 协议字段归属说明：`docs/design/v4/specialized-agent-execution-protocol-boundary_v4.1.md`，明确哪些字段进入共享协议，哪些字段保留在 Agent 本地契约
- 已补充专项 Agent 共享协议示例载荷：`docs/design/v4/specialized-agent-execution-protocol-examples_v4.1.md`，明确 `input / context / payload / output` 四类容器的实例形状
- 已补充 `planner/delegation` README：`apps/backend/intelligence/ai-orchestrator/src/modules/planner/delegation/README.md`，明确未来如何从计划步骤、执行单和上下文组装 `AgentExecutionStartRequest`
- 已补充 `planner/delegation/request-builder.md`：明确 `plan step -> input`、`execution context -> executionId`、`session / prior outputs -> context` 的最小映射规则
- 已补充 `planner/delegation/adapter-skeleton.md`：明确未来委派适配器的最小输入、标准请求输出、进度事件回收与最终结果回收边界
- 已补充 `planner/delegation/event-handoff.md`：明确未来委派层如何以最小标准容器把 `progress / result` 回交上游编排层
- 已补充 `planner/delegation/integration-placement.md`：明确未来真实委派适配器在 `planner/delegation` 内的挂载位置、稳定入口与对上对下依赖方向
- 已补充 `planner/delegation/migration-cutover.md`：明确未来如何在保持 `planner` 与 `delegation` 稳定出口不变的前提下，从 `modules/agent` 平滑切到本地委派适配器
- 已补充 `planner/delegation/validation-checklist.md`：明确未来 delegation adapter 接线时的最小验证范围、通过标准与验收口径

#### 验收标准

- 新增 Agent 时无需改动控制面核心模型
- Agent 通过标准协议接入
- 可单独部署、单独扩容、单独升级

---

## 6. 仓库级实际操作清单

下面是从工程角度需要实际执行的变更项。

### 6.1 目录创建顺序

建议先创建空目录与 README，再开始迁移代码：

```text
apps/backend/
├── governance/
├── intelligence/
├── registry-release/
├── execution-control/
├── capabilities/
└── runtimes/

packages/
├── backend-contracts/
├── backend-sdk/
└── shared-utils/
```

### 6.2 `pnpm-workspace.yaml` 更新顺序

建议分两步：

#### 第一步：兼容期

保留旧路径与新路径同时存在：

```yaml
packages:
  - 'apps/backend/governance/*'
  - 'apps/backend/intelligence/*'
  - 'apps/backend/registry-release/*'
  - 'apps/backend/execution-control/*'
  - 'apps/backend/capabilities/*'
  - 'apps/backend/runtimes/*'
  - 'apps/*'
  - 'apps/*/*'
  - 'apps/*/*/*'
  - 'tests/*'
  - 'packages/*'
  - 'packages/*/*'
```

当前状态说明：

- `pnpm-workspace.yaml` 已显式纳入目标新平面：
  - `apps/backend/governance/*`
  - `apps/backend/intelligence/*`
  - `apps/backend/registry-release/*`
  - `apps/backend/execution-control/*`
  - `apps/backend/capabilities/*`
  - `apps/backend/runtimes/*`
- 同时仍保留旧路径宽兼容 glob：
  - `apps/*`
  - `apps/*/*`
  - `apps/*/*/*`
- 这意味着 `Batch D4` 的兼容期目标已经具备，后续稳定期再移除旧路径兼容范围即可。

#### 第二步：稳定期

当服务迁移完成后，删除旧路径：

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

### 6.3 Docker / Compose 调整清单

所有调整都应统一通过 `./docker/start-smart.sh` 驱动。

必须检查：

1. Compose 中的 `build.context`
2. Compose 中的 `volumes`
3. 各服务启动命令中的工作目录
4. 依赖服务名与环境变量
5. 任何写死的旧路径引用

特别注意：

- `PROJECT_ROOT` 必须指向当前 worktree 根目录
- 路径迁移后必须验证容器真正加载的是新目录代码

当前状态说明：

- `docker/start-smart.sh` 仍通过导出 `PROJECT_ROOT` 来绑定当前 worktree 根目录，并可解析 `docker/compose/*` 下的 compose 文件。
- 当前 compose 挂载路径已覆盖新平面，如：
  - `apps/backend/execution-control/control-plane`
  - `apps/backend/execution-control/session-broker`
  - `apps/backend/intelligence/ai-orchestrator`
  - `apps/backend/runtimes/browser-worker`
  - `apps/backend/runtimes/sandbox-worker`
- 本轮已清理 Docker 侧残留的旧 `apps/backend/orchestration/control-plane/*` 注释路径。
- 仍保留少量历史兼容命名，例如 `SANDBOX_AGENT_URL` 与 `sandbox-agent-task-queue`；当前它们已实际指向 `sandbox-worker`，后续如需统一协议命名，再单独开批次处理。

### 6.4 README 与设计文档同步清单

迁移过程中至少需要同步更新以下文档：

- `apps/backend/README.md`
- `docs/project_architecture_redesign.md`
- `docs/design/v4/README.md`
- `docker` 相关蓝图文档
- 任何对外 API / Runtime Protocol 文档

---

## 7. 风险点与控制策略

### 7.1 风险：目录先搬，契约未稳

**表现：**

- import 大量爆炸
- 服务间 DTO 互相复制
- 控制面和 Runtime 反而更耦合

**控制策略：**

- 先做 `M1`、`M2`
- 后做 `M3`、`M4`、`M5`

### 7.2 风险：`ai-orchestrator` 迁移过程中继续承接浏览器新逻辑

**表现：**

- 迁移尚未完成，新的浏览器能力又继续堆回旧目录

**控制策略：**

- 从基线冻结日起，所有浏览器新增能力一律按 `browser-domain` 归属设计

### 7.3 风险：`core/platform` 继续承担过多新能力

**表现：**

- Skill、Workflow、Release、IAM 新增逻辑继续混堆

**控制策略：**

- 在评审中明确模块所有权
- 任何新增模块必须先标注目标平面归属

### 7.4 风险：Compose 路径迁移后服务看似启动，实际跑旧代码

**表现：**

- 本地改了代码但容器行为没变化

**控制策略：**

- 强制通过 `start-smart.sh`
- 路径改动后逐个服务重启并检查日志

---

## 8. 每阶段完成后的验收口径

### `M1` 之后

- 主要模块边界冻结
- 新增代码不再沿旧边界扩散

### `M2` 之后

- 共享契约可被控制面、Runtime、专项 Agent 共同复用

### `M3` 之后

- 设计时资产注册、发布、编译边界清晰
- Release 成为唯一执行门禁

### `M4` 之后

- 浏览器域与文档域具备清晰闭环
- `ai-orchestrator` 不再承载浏览器能力域内部实现

### `M5` 之后

- 新旧路径切换完成
- workspace 与 Docker 配置稳定

### `M6` 之后

- 新增 Agent 不再触碰控制面核心结构
- 平台进入真正的多 Agent 解耦演进阶段

---

## 9. 推荐的第一批实际执行任务

如果要从现在立即开始，我建议第一批任务严格按下面顺序做：

1. 给 `ai-orchestrator/modules/browser` 建立清晰外观层与模块边界。
2. 给 `core/platform` 中的 `skill`、`temporal-workflow`、`capability-release` 明确模块所有权与导出入口。
3. 新建 `packages/backend-contracts`，先落 `Release Manifest` 与 `Runtime Capability Contract`。
4. 设计 `session-broker` 在目标结构中的 README 与职责边界。
5. 评估 `temporal-worker/src/sandbox` 与 `runtime/sandbox-agent` 的合并拆分方案。
6. 完成 `pnpm-workspace.yaml` 的兼容期配置。

这六步完成后，再进入真正的物理迁移，会稳很多。

---

## 10. 最终结论

本次项目架构重塑的关键，不在于“把目录换个名字”，而在于按以下顺序完成结构重建：

1. **先冻结边界**
2. **再抽共享契约**
3. **再重组设计时资产**
4. **再收敛能力域**
5. **最后完成 Runtime 与专项 Agent 的独立化**

只要按这个顺序执行，即使迁移周期较长，也能保证：

- 当前系统持续可运行
- 新需求不再继续堆到旧架构上
- Release 逐步成为唯一可执行资产
- 多 Agent 扩展真正具备稳定落点
