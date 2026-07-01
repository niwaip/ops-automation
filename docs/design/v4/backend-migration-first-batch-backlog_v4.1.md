# Backend Migration First Batch Backlog (v4.1)

日期：2026-06-25

> 本文从 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md) 的 `12. 首批 PR 拆分清单` 展开，目标是把首批迁移工作直接落成可执行 backlog。
>
> 配套文档：
> - [backend-migration-review-checklist_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-review-checklist_v4.1.md)
> - [backend-migration-pr-template_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-pr-template_v4.1.md)

---

## 1. 使用方式

本清单面向“首批 5 个迁移 PR”的实际执行。

建议使用原则：

1. 一次只启动一个主 PR。
2. 每个 PR 只解决一个主问题。
3. 每个 PR 都必须补最小验证记录。
4. 每个 PR 都必须明确回滚点。

建议状态流转：

- `todo`
- `in_progress`
- `review`
- `done`

当前文档中的状态已按 `2026-06-26` 的首轮结构验收结果同步更新；如需追溯验收依据，可结合以下记录阅读：

- [backend-structure-acceptance-record_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-structure-acceptance-record_v4.1.md)
- [release-manager-structure-acceptance-record_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-structure-acceptance-record_v4.1.md)

---

## 2. 批次总览

| ID | 名称 | 主目标 | 前置依赖 |
| :--- | :--- | :--- | :--- |
| `PR-01` | 基线冻结与归属说明 | 冻结入口与目录归属 | 无 |
| `PR-02` | `capability-release` 首刀拆分 | 收敛发布编排热点模块 | `PR-01` |
| `PR-03` | `temporal-workflow` runtime-bridge 首刀 | 隔离运行时执行辅助 | `PR-01` |
| `PR-04` | `browser/*` 依赖方向冻结 | 收紧 `planner` 对浏览器域深层依赖 | `PR-01` |
| `PR-05` | `backend-contracts/*` 首个源码化子包 | 验证新契约包的源码化迁移方式 | `PR-01`，建议晚于 `PR-02` ~ `PR-04` 启动 |

---

## 3. 当前状态快照

截至 `2026-06-26`，首批 5 个迁移 PR 的“首轮结构落点”已基本完成，当前更适合作为后续更深层职责迁移与运行验证的基线，而不再是纯待启动状态。

| ID | 当前状态 | 当前落点 |
| :--- | :--- | :--- |
| `PR-01` | `done` | 根 README、`core/platform`、`domain/*`、`packages/backend-contracts/*` 的冻结与归属说明已形成统一口径 |
| `PR-02` | `done` | `capability-release` 已形成 `release / compiler / validator / publisher / audit` 子层边界，并补齐首轮 façade 收敛 |
| `PR-03` | `done` | `temporal-workflow/runtime-bridge` 已建立，设计时注册面与运行时辅助已完成首轮隔离表达 |
| `PR-04` | `done` | `planner/*` 到 `browser/*` 的边界已冻结，当前未发现新的深层依赖扩张 |
| `PR-05` | `done` | `packages/backend-contracts/*` 已形成源码化子包模式，`src/`、`tsconfig`、构建入口与兼容壳均已落地 |

说明：

- 这里的 `done` 表示首批 backlog 所定义的“首轮结构性目标”已达成。
- 这不等于所有真实实现都已完成物理迁移，也不等于容器级与接口级回归已经全部补齐。
- 后续继续推进时，应以更小批次进入“真实实现外移、运行链验证、兼容壳清理”三个更高风险阶段。

---

## 4. 任务卡模板

每个执行项建议至少维护以下字段：

```md
## 标题
- ID:
- 状态:
- 负责人:

## 目标

## 纳入范围

## 不纳入范围

## 影响路径

## 验证要求
- 编译：
- 测试：
- 接口：
- 容器：

## 回滚点

## 完成定义
```

---

## 5. 首批任务卡

### 5.1 `PR-01` 基线冻结与归属说明

- `ID`: `PR-01`
- `状态`: `done`
- `建议负责人`: 架构 owner / 各模块 owner 联合评审

#### 目标

把“新增需求该进哪里、哪些旧路径冻结、哪些目录只是兼容壳”一次性说明清楚，阻止旧结构继续吸收新实现。

#### 纳入范围

- 更新 `apps/backend/README.md`
- 更新以下目录的 README 或边界说明：
  - `apps/backend/core/platform`
  - `apps/backend/intelligence/ai-orchestrator/src/modules/browser`
  - `apps/backend/domain/*`
  - `packages/backend-contracts/*`
- 明确以下冻结约束：
  - `core/platform` 兼容壳只转发，不新增核心业务实现
  - `domain/*` 不再接收新的能力域需求
  - `@ops/contracts` 不再新增共享契约

#### 不纳入范围

- 不拆任何业务实现
- 不移动目录
- 不修改路由、DTO、数据库 Schema

#### 影响路径

- `apps/backend/README.md`
- `apps/backend/core/platform/`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/`
- `apps/backend/domain/`
- `packages/backend-contracts/`

#### 验证要求

- 编译：文档类 PR，无额外编译要求
- 测试：无
- 接口：无
- 容器：无

#### 回滚点

- 单独回滚 README 与边界说明提交即可

#### 完成定义

- 团队能根据 README 直接判断新增需求归属
- 评审时可引用统一冻结规则
- 首批热点模块的“兼容壳 / 目标平面 / 冻结目录”描述一致

### 5.2 `PR-02` `capability-release` 首刀拆分

> 历史状态说明：本节保留第一批 backlog 制定时对 `modules/capability-release/*` 的任务分解，用于回看最初实施顺序；截至当前 Phase D，相关旧路径已退化为兼容壳，稳定实现与默认消费入口已切到 `core/platform/src/release-manager/*` 与 `@ops/release-manager/*`。

- `ID`: `PR-02`
- `状态`: `done`
- `建议负责人`: `core/platform` owner

#### 目标

先把 `capability-release` 从“大杂烩入口”收敛成可继续拆分的稳定 façade，为后续迁到 `release-manager` 做准备。

#### 纳入范围

- 围绕 `capability-release.service.ts`、`capability-release-runtime.service.ts` 收敛内部职责
- 优先补或收紧以下子层边界：
  - `release/`
  - `compiler/`
  - `validator/`
  - `publisher/`
  - `audit/`
- 保持 controller、route、主要对外 API 不变

#### 不纳入范围

- 不切换到 `apps/backend/registry-release/release-manager/` 物理路径
- 不重写发布协议
- 不大规模重写 smoke / deploy 主流程

#### 影响路径

- `apps/backend/core/platform/src/modules/capability-release/`
- `apps/backend/registry-release/release-manager/` 的文档或空壳导出面可小幅补齐，但不承接真实实现

#### 验证要求

- 编译：`apps/backend/core/platform` `typecheck` 或等效构建通过
- 测试：回归与 release 主链直接相关的单测 / 集成测试
- 接口：至少验证一次核心 release 入口行为
- 容器：如本批次涉及 Docker 运行链，则通过 `./docker/start-smart.sh` 启动对应服务做一次行为级验证

#### 回滚点

- 回滚 façade 接线和内部协作边界变更
- 保留新子层目录骨架，不强求同时删除

#### 完成定义

- `capability-release` 不再继续吸收新的横向职责
- 外部调用方仍通过稳定入口访问
- 后续可继续按 `release / compiler / validator / publisher / audit` 单独拆 PR

### 5.3 `PR-03` `temporal-workflow` runtime-bridge 首刀

- `ID`: `PR-03`
- `状态`: `done`
- `建议负责人`: `temporal-workflow` owner

#### 目标

优先把运行时执行辅助从设计时注册面中隔离，恢复 `activity/` 的设计时语义。

#### 纳入范围

- 围绕以下文件建立 `runtime-bridge` 或等效过渡层：
  - `temporal-activity-execution.service.ts`
  - `temporal-activity-execution.helpers.ts`
- 收敛 `activity/` 到以下职责：
  - Activity 注册
  - Activity CRUD
  - 定义解析
  - 校验前管理
- 保持 `controller`、`module`、对外导出稳定

#### 不纳入范围

- 不同步外移浏览器辅助逻辑
- 不同步重构 `execution-flow`
- 不切换到 `workflow-registry` 物理路径

#### 影响路径

- `apps/backend/core/platform/src/modules/temporal-workflow/`

#### 验证要求

- 编译：`apps/backend/core/platform` `typecheck` 或等效构建通过
- 测试：优先回归
  - `temporal-workflow-core.test.ts`
  - `temporal-workflow-draft.test.ts`
  - `temporal-workflow-template.test.ts`
  - `temporal-workflow-codegen.test.ts`
- 接口：至少验证一个 workflow / activity 相关核心入口
- 容器：若涉及运行路径或挂载验证，使用 `./docker/start-smart.sh` 启动对应服务并确认行为加载当前代码

#### 回滚点

- 回滚 `runtime-bridge` 接线
- 恢复 execution helper 对原主层的委托关系

#### 完成定义

- 运行时执行辅助不再直接混在设计时主层
- `activity/` 的职责边界更纯
- 下一批可继续处理 `browser-bridge` 或 `codegen / validation` 收敛

### 5.4 `PR-04` `browser/*` 依赖方向冻结

- `ID`: `PR-04`
- `状态`: `done`
- `建议负责人`: `ai-orchestrator` owner

#### 目标

先阻止 `planner/*` 继续深层导入浏览器域内部实现，为后续瘦身 `recorder-debug.service.ts` 与外移浏览器域做准备。

#### 纳入范围

- 收紧 `planner/*` 到 `browser/*` 的导入边界
- 优先通过以下稳定出口暴露依赖：
  - `browser/index.ts`
  - `browser/intent/index.ts`
  - 其他已存在的稳定子层入口
- 视情况补轻量 façade，但不大规模移动实现

#### 不纳入范围

- 不迁移到 `capabilities/browser-domain`
- 不改 WebSocket、gateway、controller 协议
- 不同步迁移 `domain/browser-template`
- 不同步迁移 `domain/browser-semantics`

#### 影响路径

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/`
- `apps/backend/intelligence/ai-orchestrator/src/modules/planner/` 或相关调用方

#### 验证要求

- 编译：`apps/backend/intelligence/ai-orchestrator` `typecheck` 或等效构建通过
- 测试：优先回归
  - `recorder-debug.core.spec.ts`
  - `recorder-debug.chat.spec.ts`
  - `browser-command.service.spec.ts`
- 接口：至少验证一个浏览器录制或浏览器命令核心入口
- 容器：如涉及真实启动验证，确认容器加载的是当前 worktree 代码

#### 回滚点

- 回滚导入路径收紧和 façade 接线
- 恢复原有稳定入口，不回滚无关内部小重构

#### 完成定义

- `planner/*` 不再新增对 `browser/*` 内部实现的深层依赖
- 浏览器域对外有更稳定的导出面
- 下一批可以继续瘦身 `recorder-debug.service.ts`

### 5.5 `PR-05` `backend-contracts/*` 首个源码化子包

- `ID`: `PR-05`
- `状态`: `done`
- `建议负责人`: 契约 / 平台基础设施 owner

#### 目标

选一个最稳定的 `backend-contracts/*` 子包，验证“源码化 + 构建化 + 渐进切换消费方”的迁移方式。

#### 纳入范围

- 从以下子包中优先选择一个切口：
  - `common-dto`
  - `execution-events`
  - `release-manifest`
- 为目标子包补齐：
  - `src/`
  - `tsconfig`
  - 构建脚本
  - 统一导出规则
- 选择一条最短消费链切换依赖
- 保留 `packages/contracts` 兼容壳

#### 不纳入范围

- 不要求一次性迁完全部契约包
- 不同步重写多个服务业务主流程
- 不提前删除 `@ops/contracts`

#### 影响路径

- `packages/backend-contracts/`
- `packages/contracts/`
- 一个最短消费链所在服务

#### 验证要求

- 编译：目标契约子包和消费方服务均可正常构建
- 测试：回归与该契约直接相关的消费方测试
- 接口：验证至少一条使用新契约的核心调用链
- 容器：如果消费方运行在 Docker 中，确认容器加载的是当前 worktree 代码与新契约产物

#### 回滚点

- 回滚消费方对新子包的依赖切换
- 保留新子包源码结构，不强求删除

#### 完成定义

- 至少一个 `backend-contracts/*` 子包具备真实源码承载能力
- 至少一条核心消费链不再直接依赖 `@ops/contracts`
- 后续可按同样模式批量迁移其他契约子包

---

## 6. 推荐排期

### Sprint 1

- `PR-01` 基线冻结与归属说明
- `PR-02` `capability-release` 首刀拆分

### Sprint 2

- `PR-03` `temporal-workflow` runtime-bridge 首刀
- `PR-04` `browser/*` 依赖方向冻结

### Sprint 3

- `PR-05` `backend-contracts/*` 首个源码化子包

说明：

- `PR-05` 建议略晚启动，因为它更依赖前面边界逐步稳定后的共识
- `PR-02`、`PR-03`、`PR-04` 理论上可并行，但最好不要由同一 reviewer 同时接三条热点链路

---

## 7. 风险提示

首批 backlog 最常见的失败方式不是“方向错”，而是“单个 PR 装了两个以上主问题”。

因此执行时必须持续检查：

1. 是否开始同时做拆职责和迁目录。
2. 是否开始顺手改 DTO、路由、Schema。
3. 是否开始把兼容壳和真实实现一起删掉。
4. 是否只验证了启动成功，却没有行为级验证。

---

## 8. 一句话结论

首批 backlog 的目标不是“多开几个迁移 PR”，而是用最小批次先冻结入口、切开热点职责、验证新契约落地方式，为后续真实物理迁移建立稳定前提。
