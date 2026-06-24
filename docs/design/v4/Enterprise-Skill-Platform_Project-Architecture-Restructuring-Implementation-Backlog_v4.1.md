# 企业级技能平台 项目架构重塑实施 Backlog (v4.1)

**Project Architecture Restructuring Implementation Backlog v4.1**  
日期：2026-06-23

> 本文是以下两份文档的实施分解版本：  
> - [project_architecture_redesign.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/project_architecture_redesign.md)  
> - [Enterprise-Skill-Platform_Project-Architecture-Restructuring-Migration-Checklist_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Project-Architecture-Restructuring-Migration-Checklist_v4.1.md)
>
> 目标不是再解释架构原则，而是把“目标态”转成能直接排期、分批开发、逐项验收的任务清单。

---

## 1. 文档目的

本文回答三个执行层问题：

1. 第一批到底先做哪些事。
2. 每一批改哪些目录、哪些模块、哪些边界。
3. 每一批如何验收、如何控制 PR 范围、如何降低回滚风险。

---

## 2. 本 Backlog 的使用边界

本文只覆盖“项目架构重塑”的第一阶段核心任务，不覆盖所有业务细节优化。

### 2.1 覆盖范围

- `core/platform` 的注册、发布、治理边界收敛
- `ai-orchestrator` 的 Planner / Browser 域切割
- `backend-contracts` 的第一批共享契约落地
- `session-broker`、`control-plane`、`runtime/*` 的目标结构对齐
- `pnpm-workspace.yaml` 与工程路径兼容期调整

### 2.2 暂不覆盖

- 所有前端页面的接口切换
- 所有历史测试的系统性重写
- 一次性全部搬迁所有服务目录
- 所有专项 Agent 的真正独立部署

---

## 3. 当前实施基线

截至 `2026-06-23`，已经具备以下基础：

1. 已形成 `v4.1` 架构设计总文档。
2. 已形成 `v4.1` 迁移实施清单。
3. 仓库内已经存在以下核心服务雏形：
   - `control-plane`
   - `ai-orchestrator`
   - `session-broker`
   - `browser-worker`
   - `replay-worker`
   - `temporal-worker`
   - `browser-template`
   - `browser-semantics`
   - `document-engine`
   - `report`
4. 浏览器域与执行控制面都已存在一定程度的子目录拆分，不是完全从零开始。

本 backlog 默认基于“现有服务保持可运行”的前提推进。

---

## 4. 优先级总览

| 优先级 | 任务主题 | 目标 | 风险 | 推荐批次 |
| :--- | :--- | :--- | :--- | :--- |
| P0 | 冻结边界与网关 | 阻止旧结构继续扩散 | 低 | Batch A1-A3 |
| P0 | 抽取共享契约 | 为后续迁移建立共同语言 | 中 | Batch A4-A6 |
| P0 | `capability-release` 收敛为 `release-manager` 逻辑视图 | 建立唯一发布门禁 | 高 | Batch B1-B2 |
| P1 | `ai-orchestrator` 切分 Planner / Browser | 防止主 Planner 继续膨胀 | 高 | Batch B3-B5 |
| P1 | 浏览器域统一视图 | 合并模板、语义、录制、导出 | 中 | Batch C1-C3 |
| P1 | 文档域统一视图 | 合并模板、渲染、报表 | 中 | Batch C4-C5 |
| P1 | Runtime 与 `session-broker` 归位 | 统一执行与资源平面 | 中 | Batch D1-D3 |
| P2 | 兼容期 workspace / Docker 调整 | 为后续物理迁移铺路 | 中 | Batch D4-D5 |
| P2 | 专项 Agent 入口预留 | 为 `codegen-agent`、`browser-nl-agent` 准备落点 | 低 | Batch E1-E2 |

---

## 5. 推荐批次设计

建议按 `A -> B -> C -> D -> E` 五组批次推进。每个批次都应保持：

1. 改动范围受控
2. 可独立验证
3. 可独立回滚

### 5.1 Batch A1：冻结 `core/platform` 模块导出边界

目标：

1. 明确 `core/platform` 中哪些模块属于治理、注册、发布。
2. 为 `skill`、`execution-flow`、`temporal-workflow`、`capability-release` 补齐稳定导出入口。
3. 降低外部模块对内部实现文件的直接深层引用。

建议文件：

1. `apps/backend/core/platform/src/modules/skill/index.ts`
2. `apps/backend/core/platform/src/modules/execution-flow/index.ts`
3. `apps/backend/core/platform/src/modules/temporal-workflow/index.ts`
4. `apps/backend/core/platform/src/modules/capability-release/index.ts`
5. `apps/backend/core/platform/src/app.module.ts`

验收：

1. 相关模块对外暴露入口清晰。
2. 无新增跨模块深层 import。
3. 原有接口行为不变。

回归重点：

1. Skill 管理接口
2. Temporal workflow 草稿与模板接口
3. Capability release 相关接口

### 5.2 Batch A2：冻结 `ai-orchestrator/browser` 子域边界

目标：

1. 给 `browser/*` 建立统一对外网关。
2. 明确 `planner/*` 与 `browser/*` 的逻辑边界。
3. 为后续迁移到 `browser-domain` 做准备。

建议文件：

1. `apps/backend/intelligence/ai-orchestrator/src/modules/browser/index.ts`
2. `apps/backend/intelligence/ai-orchestrator/src/modules/browser/*/index.ts`
3. `apps/backend/intelligence/ai-orchestrator/src/modules/planner/*`

验收：

1. 目录外部引用尽量通过 `browser/index.ts` 或子目录网关。
2. 新增浏览器逻辑不再从 `planner` 反向长链路依赖。

回归重点：

1. Recorder debug 主链路
2. Browser command / intent 主链路
3. 导出与观察相关测试

### 5.3 Batch A3：冻结 `control-plane` 与 `session-broker` 的唯一职责

目标：

1. 明确 `control-plane` 只负责 `Execution` 生命周期与运行时编排。
2. 明确 `session-broker` 只负责会话、资源、租约、锁。
3. 用 README 或模块注释把边界写清楚。

建议文件：

1. `apps/backend/execution-control/control-plane/src/modules/execution/index.ts`
2. `apps/backend/execution-control/session-broker/src/index.ts`
3. `apps/backend/README.md`

验收：

1. 边界说明可被团队直接引用。
2. 新需求评审时可以据此判断归属。

### 5.4 Batch A4：创建 `packages/backend-contracts` 骨架

目标：

1. 建立共享契约层目录。
2. 定义第一批子包命名与 README。
3. 不急于一次性写完全部协议，但先把承载位置固定。

建议目录：

```text
packages/backend-contracts/
├── agent-execution-protocol/
├── runtime-capability-contract/
├── release-manifest/
├── execution-events/
└── common-dto/
```

验收：

1. 目录结构建立完成。
2. README 说明每个子包承载对象。
3. 后续新增共享协议有唯一落点。

### 5.5 Batch A5：抽取 `Runtime Capability Contract`

目标：

1. 从 `control-plane` 与现有 runtime 中抽出统一运行时请求/响应结构。
2. 对齐：
   - `RuntimeStepInvokeRequest`
   - `RuntimeStepInvokeResult`
   - `ArtifactRef`
   - `SnapshotRef`
   - `RuntimeError`

建议文件来源：

1. `apps/backend/execution-control/control-plane/src/modules/execution/adapters/*`
2. `apps/backend/runtimes/browser-worker/src/dto/*`
3. `apps/backend/runtimes/temporal-worker/src/*`

验收：

1. `browser-worker` 与 `control-plane` 至少共享同一套运行时 DTO。
2. 不再新增私有返回结构。

### 5.6 Batch A6：抽取 `Release Manifest` 初版

目标：

1. 从 `capability-release` 中抽出发布产物结构。
2. 明确设计时对象与发布态对象的区别。
3. 为 `control-plane` 最终只消费 `Release Manifest` 做准备。

建议文件来源：

1. `apps/backend/core/platform/src/modules/capability-release/interfaces.ts`
2. `apps/backend/core/platform/src/modules/capability-release/*.service.ts`

验收：

1. 文档与类型层面能够区分：
   - Skill 草稿
   - Workflow 模板
   - Template 资产
   - Release Manifest

---

## 6. 发布与注册中心重组批次

### 6.1 Batch B1：将 `capability-release` 收敛为 `release-manager` 逻辑中心

目标：

1. 先不搬目录，先把 `capability-release` 内部分成：
   - `release`
   - `compiler`
   - `validator`
   - `publisher`
   - `audit`
2. 为未来物理迁移到 `registry-release/release-manager` 做准备。

建议文件：

1. `apps/backend/core/platform/src/modules/capability-release/*`

验收：

1. 发布编译、校验、发布、回滚职责比当前更清晰。
2. `capability-release.service.ts` 不再持续膨胀。

### 6.2 Batch B2：重组 `skill`、`execution-flow`、`temporal-workflow` 的逻辑所有权

目标：

1. 明确：
   - `skill` -> `skill-registry`
   - `execution-flow` + `temporal-workflow` -> `workflow-registry`
2. 梳理它们之间的绑定关系和发布依赖关系。

建议动作：

1. 先写模块 README 或注释，标明目标归属。
2. 再拆出内部 facade / mapper / validator 边界。

当前进展：

1. `skill` 已通过本地 README 与稳定 `index.ts` 明确切换到 `skill-registry` 逻辑归属，并显式形成 `registry / binding / access / matching / enrichment / validation` 分层。
2. 已新增 `apps/backend/registry-release/skill-registry/README.md`，把当前 `skill` 模块统一解释为设计时 Skill 注册资产，并明确它与 `workflow-registry`、`release-manager`、`control-plane` 的边界。
3. `execution-flow` 已通过本地 README 与稳定 `index.ts` 明确切换到 `workflow-registry` 逻辑归属，并显式形成 `registry / template / validation` 分层。
4. `temporal-workflow` 已通过本地 README 与稳定 `index.ts` 明确切换到 `workflow-registry` 逻辑归属，并显式形成 `workflow / activity / codegen / validation` 分层。
5. 已新增 `apps/backend/registry-release/workflow-registry/README.md`，把 `execution-flow` 与 `temporal-workflow` 统一解释为同一类设计时工作流注册资产，并明确它们与 `release-manager`、`control-plane`、runtime worker 的边界。
6. 已新增 `apps/backend/registry-release/workflow-registry/validation/README.md`，把 `execution-flow/validation` 与 `temporal-workflow/validation` 的校验 facade、校验服务与相关类型统一解释为 `workflow-registry/validation` 子层。
7. 已新增 `apps/backend/registry-release/workflow-registry/flow-template/README.md`，把 `execution-flow/registry`、`execution-flow/template`、模板控制器、模块与模板 DTO 统一解释为 `workflow-registry/flow-template` 子层。
8. `capability-release` 已通过本地 README 与稳定 `index.ts` 明确切换到 `release-manager` 逻辑归属，并显式形成 `release / compiler / validator / publisher / audit` 分层。
9. 已新增 `apps/backend/registry-release/release-manager/README.md`，把当前 `capability-release` 模块统一解释为发布侧中心，并明确它与 `skill-registry`、`workflow-registry`、`control-plane`、runtime worker 的边界。
10. 已新增 `apps/backend/registry-release/release-manager/release/README.md`，把发布主入口、Manifest 装配与主流程收口逻辑统一解释为 `release-manager/release` 子层。
11. 已新增 `apps/backend/registry-release/release-manager/compiler/README.md`，把构建、浏览器录制装配与 Temporal schema 辅助逻辑统一解释为 `release-manager/compiler` 子层。
12. 已新增 `apps/backend/registry-release/release-manager/publisher/README.md`，把发布动作、部署绑定、运行时绑定与 smoke 校验逻辑统一解释为 `release-manager/publisher` 子层。
13. 已新增 `apps/backend/registry-release/release-manager/validator/README.md`，把发布前校验、录制动作约束与执行计划验证逻辑统一解释为 `release-manager/validator` 子层。
14. 已新增 `apps/backend/registry-release/release-manager/audit/README.md`，把发布侧审计语义、事件映射与审计结果收口逻辑统一解释为 `release-manager/audit` 子层。

验收：

1. 团队在读代码时能判断“这是注册逻辑还是发布逻辑”。
2. 新增 workflow 相关能力不再直接继续堆到 `skill.service.ts`。

### 6.3 Batch B3：拆分 `planner` 的通用能力与浏览器专属能力

目标：

1. 保留 `planner` 只承接：
   - Skill 匹配
   - 参数识别
   - 计划生成
   - Agent 委派
2. 不再让其继续吸收浏览器录制与执行细节。

建议文件：

1. `apps/backend/intelligence/ai-orchestrator/src/modules/planner/*`
2. `apps/backend/intelligence/ai-orchestrator/src/modules/browser/*`

验收：

1. 浏览器域逻辑新增代码不进入 `planner/*`
2. `planner.service.ts` 或其后续 facade 只关注通用规划链路

### 6.4 Batch B4：建立 `master-planner` 逻辑视图

目标：

在当前 `ai-orchestrator` 内，先形成未来 `master-planner` 的逻辑目录视图：

- `intent`
- `params`
- `planning`
- `delegation`

建议动作：

1. 先通过子目录与 `index.ts` 建立视图。
2. 暂不要求先做物理服务拆分。

验收：

1. 目录结构能反映目标态。
2. 新增 Planner 逻辑进入对应子目录，而不是继续堆进大文件。

### 6.5 Batch B5：为 `agent-catalog` 预留模型与协议落点

目标：

1. 在文档和 contracts 层明确 `Agent Profile` 结构。
2. 先不落独立服务，但为未来 `agent-catalog` 预留对象模型。

当前进展：

1. 已在 `packages/backend-contracts/agent-profile` 建立共享 `Agent Profile` 合同落点。
2. `codegen-agent` 与 `ai-orchestrator` 开始对齐到同一 Agent Profile 模型。

验收：

1. 后续新增 `codegen-agent`、`browser-nl-agent` 时不需要重新发明 Agent 注册模型。

---

## 7. 能力域收敛批次

### 7.1 Batch C1：建立 `browser-domain` 统一逻辑视图

目标：

将以下现态逻辑统一视为 `browser-domain`：

1. `domain/browser-template`
2. `domain/browser-semantics`
3. `ai-orchestrator/modules/browser/*`

建议输出：

1. 一份模块归属说明
2. 一份浏览器域内部结构草图

当前进展：

1. 已在 `apps/backend/capabilities/browser-domain/README.md` 建立统一归属说明。
2. 已给出 `templates / semantics / recorder / runtime-facade` 的结构草图。

验收：

1. 浏览器新增需求的归属判断清晰。
2. 录制、模板、语义、导出不再被当成四套完全独立系统。

### 7.2 Batch C2：优先收敛浏览器模板与语义规则的发布接口

目标：

1. 识别 `browser-template` 与 `browser-semantics` 当前的发布、运行时、版本化接口。
2. 与 `release-manager` 形成清晰边界。

当前进展：

1. 已确认 `browser-template` 当前属于“设计时模板资产 + 本地过渡发布接口”。
2. 已确认 `browser-semantics` 当前属于“设计时规则集 + 本地发布态 + 稳定运行时解析”。
3. 已在 `apps/backend/capabilities/browser-domain/README.md` 补充域级发布边界说明，明确模板与语义规则的局部发布门禁后续收敛到 `release-manager`。

验收：

1. 模板与语义规则都能清晰区分设计时、发布态与运行时。
2. `release-manager` 作为统一发布门禁的目标边界被明确记录。

### 7.3 Batch C3：评估 `RecorderDebugService` 的最终归属拆分

目标：

将其进一步拆解为：

1. `recorder`
2. `observation`
3. `session`
4. `export`
5. 部分高频动作决策未来外移到 `browser-nl-agent`

当前进展：

1. 已在 `ai-orchestrator/modules/browser` 根层补出 `recorder / observation / runtime-facade` 逻辑出口。
2. 已补出 `gateway` 逻辑出口，用来收口浏览器域控制器入口。
3. `session / export` 继续作为稳定出口保留，`loop` 仍暂作为 recorder 支撑实现。
4. `api / execute / observe / recovery` 当前保留为物理过渡目录，不在本批做实现迁移。

验收：

1. 后续可进一步进入真实 `browser-domain` 结构。

### 7.4 Batch C4：建立 `document-domain` 统一逻辑视图

目标：

统一以下逻辑为 `document-domain`：

1. `domain/document-engine`
2. `domain/report`

建议分成：

1. `template`
2. `render`
3. `report`
4. `runtime-facade`

当前进展：

1. 已在 `apps/backend/capabilities/document-domain/README.md` 建立统一文档域归属说明。
2. 已给出 `template / render / report / runtime-facade` 的结构草图。
3. 已明确 `document-engine` 主要承接 `template / render / runtime-facade`，`report` 主要承接 `report` 并局部复用 `template / render`。

验收：

1. 文档域新增功能不再在多个旧服务之间随机分散。

### 7.5 Batch C5：统一文档产物语义

目标：

1. 统一文档渲染结果、报表导出结果的产物结构。
2. 与 `ArtifactRef` 对齐。

当前进展：

1. `document-engine` 已通过 `document-artifact.helper.ts` 在 `RenderResponse` 中补充 `artifacts: ArtifactRef[]`。
2. `report` 已通过 `report-artifact.helper.ts` 在 `ReportDTO` 中补充 `artifacts: ArtifactRef[]`。
3. 已存在专项对齐文档 `docs/design/v4/document-domain-artifact-alignment_v4.1.md`，记录两侧当前映射规则与过渡约束。
4. 已在 `apps/backend/capabilities/document-domain/README.md` 补充统一产物语义说明，明确新接入方优先消费 `artifacts`。

验收：

1. `control-plane` 不需要知道文档域的私有返回格式。

---

## 8. Runtime 与工程归位批次

### 8.1 Batch D1：规划 `sandbox-worker` 独立拆分方案

目标：

明确如何从：

1. 历史 `apps/backend/runtime/temporal-worker/src/sandbox/*`
2. 历史 `apps/backend/runtime/sandbox-agent/*`

整合出目标态：

`apps/backend/runtimes/sandbox-worker/`

验收：

1. 拆分方案文档化。
2. 运行时协议、启动方式、依赖项明确。

### 8.2 Batch D2：收敛 `session-broker` 到目标职责视图

目标：

把 `allocation / lock / freeze / runtime-session / session` 统一映射到未来的 `session-broker` 结构。

建议动作：

1. 先写模块边界说明。
2. 再评估是否需要内部目录细分为：
   - `session`
   - `lease`
   - `allocation`
   - `worker-routing`

验收：

1. `session-broker` 新增需求不再继续混堆。

### 8.3 Batch D3：补齐 `runtimes` 平面 README 与路径规划

目标：

为以下服务建立统一视图：

1. `browser-worker`
2. `replay-worker`
3. `temporal-worker`
4. `sandbox-worker`

当前进展：

1. 已新增 `apps/backend/runtimes/README.md` 作为运行时平面的统一入口说明。
2. 已明确 `browser-worker / replay-worker / temporal-worker / sandbox-worker` 的职责边界、协议边界与部署边界。
3. 已在统一视图中明确 `control-plane`、`session-broker` 与各 runtime worker 的分工。
4. 已将历史 `temporal-worker/src/sandbox/*`、`runtime/sandbox-agent/*` 标记为由 `apps/backend/runtimes/sandbox-worker` 承接。

验收：

1. 各 worker 的职责边界、协议边界、部署边界清晰。

### 8.4 Batch D4：`pnpm-workspace.yaml` 进入兼容期配置

目标：

在不破坏现有构建的前提下，同时支持旧路径与新路径。

建议动作：

1. 增加：
   - `apps/backend/governance/*`
   - `apps/backend/intelligence/*`
   - `apps/backend/registry-release/*`
   - `apps/backend/execution-control/*`
   - `apps/backend/capabilities/*`
   - `apps/backend/runtimes/*`
2. 暂时保留旧路径 glob。

当前进展：

1. `pnpm-workspace.yaml` 已显式纳入：
   - `apps/backend/governance/*`
   - `apps/backend/intelligence/*`
   - `apps/backend/registry-release/*`
   - `apps/backend/execution-control/*`
   - `apps/backend/capabilities/*`
   - `apps/backend/runtimes/*`
2. 当前兼容期仍保留旧路径宽匹配：
   - `apps/*`
   - `apps/*/*`
   - `apps/*/*/*`
3. 现态已经满足“新旧路径同时可被 workspace 纳入”的目标，后续只需在稳定期再收窄旧路径兼容范围。

验收：

1. workspace 仍可正常安装与解析依赖。
2. 新平面路径已具备纳入能力。

### 8.5 Batch D5：Docker 路径兼容性检查

目标：

梳理以下对象中的旧路径引用：

1. `docker/start-smart.sh`
2. `docker-compose*.yml`
3. 任何仍写死历史 `apps/backend/orchestration/*`、`apps/backend/runtime/*` 的构建路径

当前进展：

1. `docker/start-smart.sh` 已继续通过 `PROJECT_ROOT` 绑定当前 worktree 根目录，并优先解析 `docker/compose/*` 下的 compose 文件。
2. 现有 compose 挂载路径已切到新平面路径，如：
   - `apps/backend/execution-control/control-plane`
   - `apps/backend/execution-control/session-broker`
   - `apps/backend/intelligence/ai-orchestrator`
   - `apps/backend/runtimes/browser-worker`
   - `apps/backend/runtimes/sandbox-worker`
3. 本轮已清理 `docker/sql/migrations/001_init.sql` 中残留的旧 `apps/backend/orchestration/control-plane/*` 注释路径，且旧物理目录已从仓库中移除。
4. 仍存在 `SANDBOX_AGENT_URL`、`TEMPORAL_SANDBOX_AGENT_URL`、`sandbox-agent-task-queue` 等历史兼容命名，但当前指向对象已是 `sandbox-worker`，这批不直接改协议名。

验收：

1. 路径迁移后容器仍能挂载当前 worktree 代码。
2. 不出现“服务启动成功但跑的是旧代码”的隐性问题。

---

## 9. 专项 Agent 准备批次

### 9.1 Batch E1：`codegen-agent` 最小落点设计

目标：

先定义最小目录与契约，不急于马上生成完整服务。

最小要素：

1. `Agent Profile`
2. `Generated Work Unit`
3. `Sandbox Runtime Binding`
4. `Security Lint` 结果结构

当前进展：

1. `apps/backend/intelligence/codegen-agent` 已具备最小服务骨架，包括 `package.json`、`app.module.ts` 与 `src/index.ts`。
2. 已在 `src/contracts/codegen-agent.types.ts` 落下四类核心对象：
   - `CodegenAgentProfile`
   - `GeneratedWorkUnit`
   - `SandboxRuntimeBinding`
   - `SecurityLintResult`
3. 已形成 `contracts / generator / verification / export` 的逻辑视图。
4. 已通过 `@ops/backend-agent-profile` 对齐共享 `Agent Profile`，并在专项文档中明确与 `master-planner`、`agent-catalog`、`sandbox-worker` 的边界。
5. 已明确后续接入 `control-plane` 时优先复用 `@ops/backend-agent-execution-protocol`，而不是直接耦合控制面私有 DTO。
6. 已通过 `specialized-agent-execution-protocol-boundary_v4.1.md` 明确：共享协议只承载执行外壳，`GeneratedWorkUnit`、`SecurityLintResult` 等对象继续保留在 `codegen-agent` 本地契约。
7. 已通过 `specialized-agent-execution-protocol-examples_v4.1.md` 给出 `codegen-agent` 的开始请求、进度事件、终态结果示例载荷。
8. 已通过 `planner/delegation/README.md` 明确未来委派层如何从计划步骤、执行单和上下文组装 `AgentExecutionStartRequest`。
9. 已通过 `planner/delegation/request-builder.md` 明确 `plan step / execution context / session context` 到共享执行协议字段的最小映射规则。
10. 已通过 `planner/delegation/adapter-skeleton.md` 明确未来委派适配器的最小输入、共享请求输出、标准进度事件消费与终态结果消费边界。
11. 已通过 `planner/delegation/event-handoff.md` 明确未来委派层如何将共享 `progress / result` 事件整理为最小 handoff 容器并回交上游编排层。
12. 已通过 `planner/delegation/integration-placement.md` 明确未来真实委派适配器的稳定挂载位置仍在 `planner/delegation`，并通过 `planner` 保持对上稳定入口。
13. 已通过 `planner/delegation/migration-cutover.md` 明确未来从 `delegation/index.ts -> modules/agent` 平滑切换到本地委派适配器的最小替换顺序。
14. 已通过 `planner/delegation/validation-checklist.md` 明确未来 delegation adapter 接线批次的最小验证范围、通过标准与验收口径。

验收：

1. 后续要启动 `codegen-agent` 时，已有明确落点。

### 9.2 Batch E2：`browser-nl-agent` 最小落点设计

目标：

先定义它与 `browser-domain`、`browser-worker`、`control-plane` 的边界：

1. 什么属于 Agent 内部高频循环
2. 什么属于 Browser Domain 共享能力
3. 什么属于 Runtime 原子执行

当前进展：

1. `apps/backend/intelligence/browser-nl-agent` 已具备最小服务骨架，包括 `README.md`、`package.json`、`app.module.ts` 与 `src/index.ts`。
2. 已在 `src/contracts/browser-nl-agent.types.ts` 落下最小契约对象：
   - `BrowserNlAgentSession`
   - `BrowserObservationSnapshot`
   - `BrowserAtomicAction`
   - `BrowserNlAgentTurnResult`
3. 已形成 `contracts / perception / action-loop / runtime-bridge` 的逻辑视图。
4. 已在专项文档中明确与 `browser-domain`、`browser-worker`、`control-plane` 的三层边界，并明确 `ai-orchestrator` 只负责委派而不再承载高频自然语言浏览器主循环。
5. 已明确后续接入 `control-plane` 时优先复用 `@ops/backend-agent-execution-protocol`，而不是直接耦合控制面私有 DTO。
6. 已通过 `specialized-agent-execution-protocol-boundary_v4.1.md` 明确：共享协议只承载执行外壳，`BrowserNlAgentSession`、`BrowserAtomicAction`、`BrowserNlAgentTurnResult` 等对象继续保留在 `browser-nl-agent` 本地契约。
7. 已通过 `specialized-agent-execution-protocol-examples_v4.1.md` 给出 `browser-nl-agent` 的开始请求、进度事件、终态结果示例载荷。
8. 已通过 `planner/delegation/README.md` 明确未来委派层如何从计划步骤、执行单和上下文组装 `AgentExecutionStartRequest`。
9. 已通过 `planner/delegation/request-builder.md` 明确 `plan step / execution context / session context` 到共享执行协议字段的最小映射规则。
10. 已通过 `planner/delegation/adapter-skeleton.md` 明确未来委派适配器的最小输入、共享请求输出、标准进度事件消费与终态结果消费边界。
11. 已通过 `planner/delegation/event-handoff.md` 明确未来委派层如何将共享 `progress / result` 事件整理为最小 handoff 容器并回交上游编排层。
12. 已通过 `planner/delegation/integration-placement.md` 明确未来真实委派适配器的稳定挂载位置仍在 `planner/delegation`，并通过 `planner` 保持对上稳定入口。
13. 已通过 `planner/delegation/migration-cutover.md` 明确未来从 `delegation/index.ts -> modules/agent` 平滑切换到本地委派适配器的最小替换顺序。
14. 已通过 `planner/delegation/validation-checklist.md` 明确未来 delegation adapter 接线批次的最小验证范围、通过标准与验收口径。

验收：

1. 不会把未来 `browser-nl-agent` 重新堆进 `ai-orchestrator/modules/browser`

---

## 10. 每批次的 PR 控制建议

为避免重构失控，建议每个批次 PR 遵循以下规则：

1. 单个 PR 只做一个批次或一个子批次。
2. 单个 PR 尽量只改一个主服务，跨服务改动以 contracts 为限。
3. 先加导出层和兼容层，再删旧路径。
4. 先保证测试和诊断稳定，再做下一批。
5. 避免把“目录搬迁、协议重命名、业务逻辑调整”塞进同一个 PR。

---

## 11. 推荐的第一批实际开工顺序

如果从现在开始直接进入开发，建议严格按以下顺序启动：

1. `Batch A1`：冻结 `core/platform` 中注册与发布模块导出边界
2. `Batch A2`：冻结 `ai-orchestrator/browser` 子域边界
3. `Batch A4`：创建 `packages/backend-contracts` 骨架
4. `Batch A5`：抽取 `Runtime Capability Contract`
5. `Batch A6`：抽取 `Release Manifest` 初版
6. `Batch B1`：收敛 `capability-release` 为 `release-manager` 逻辑中心
7. `Batch B3`：拆分 `planner` 与 `browser` 逻辑所有权
8. `Batch D4`：把 `pnpm-workspace.yaml` 调整到兼容期配置

这个顺序的好处是：

1. 先冻结规则，避免新代码继续走旧路径
2. 先建立 contracts，避免后续重构没有共同语言
3. 再开始动发布中心和 Planner，大幅降低返工概率

---

## 12. 一句话总结

> 这份 backlog 的核心不是“尽快搬目录”，而是先把边界、契约和发布中心稳住，让后续每一次迁移都在正确骨架上发生，而不是把旧耦合原样搬到新目录里。
