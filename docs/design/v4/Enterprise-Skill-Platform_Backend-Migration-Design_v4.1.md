# 企业级技能平台 后端迁移设计书 (v4.1)

日期：2026-06-24

> 本文基于当前仓库现状编写，目标是把“后端结构评估结论”转成一份可执行的迁移设计书。
>
> 本文与以下文档配套使用：
> - [project_architecture_redesign.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/project_architecture_redesign.md)
> - [Enterprise-Skill-Platform_Project-Architecture-Restructuring-Migration-Checklist_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Project-Architecture-Restructuring-Migration-Checklist_v4.1.md)
> - [Enterprise-Skill-Platform_Project-Architecture-Restructuring-Implementation-Backlog_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Project-Architecture-Restructuring-Implementation-Backlog_v4.1.md)
> - [backend-migration-first-batch-backlog_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-first-batch-backlog_v4.1.md)
> - [backend-migration-review-checklist_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-review-checklist_v4.1.md)
> - [backend-migration-pr-template_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-migration-pr-template_v4.1.md)

---

## 1. 文档目的

本文聚焦五个问题：

1. 当前后端结构的真实迁移基线是什么。
2. 哪些问题是“命名过渡态”，哪些问题已经构成可维护性风险。
3. 为什么本轮迁移应坚持“先拆职责，再搬目录”。
4. 每个目标平面的设计边界、迁移入口和禁止事项是什么。
5. 接下来 90 天内，应该按什么顺序推进，才能降低回归和返工风险。

---

## 2. 当前基线判断

截至 `2026-06-24`，仓库现状不是“旧架构完全未动”，也不是“新架构已经落定”，而是处于**逻辑归属已开始切换、物理实现仍大量过渡共存**的阶段。

### 2.1 已经成立的迁移事实

- `core/platform` 已明确被定义为迁移期聚合壳，而非长期目标边界。
- `governance/identity-access`、`governance/organization` 已经是实际承载实现的独立包。
- `execution-control/control-plane`、`execution-control/session-broker`、`runtimes/*` 已完成首轮目录归位。
- `registry-release/*`、`capabilities/*` 已经建立目标路径与逻辑归属说明。
- `packages/backend-contracts/*` 已经建立第一批共享契约落点。

### 2.2 仍然存在的结构性问题

- `core/platform` 中仍保留迁移成本最高的设计时资产与发布逻辑。
- `registry-release/*` 目前仍主要是 re-export 壳，未形成真实实现包。
- `ai-orchestrator` 仍同时承载通用 Planner 与大量浏览器能力域实现。
- `capabilities/*` 目前只有 README 和目标结构说明，真实代码仍在 `domain/*` 与 `ai-orchestrator/modules/browser/*`。
- `packages/contracts` 仍被实际依赖，旧契约链路尚未退出。

### 2.3 当前应如何理解“迁移状态”

本轮迁移应将后端划分为三种状态：

1. **目标边界已落地**
   - 例如 `governance/*`、`execution-control/*`、`runtimes/*`
2. **逻辑归属已切换，但物理实现未完成**
   - 例如 `core/platform/src/modules/skill`
   - 例如 `core/platform/src/workflow-registry`
   - 例如 `core/platform/src/release-manager`
3. **目标路径已声明，但仍待承接真实实现**
   - 例如 `apps/backend/capabilities/*`
   - 例如 `apps/backend/registry-release/*`

因此，本设计书不建议采用“一次性全量目录搬迁”，而强调先把第二类状态做实，再推进第三类状态。

---

## 3. 现状风险排序

本节只列真正影响后续迁移效率和系统可维护性的风险，不把所有过渡痕迹都当作同等级问题。

### 3.1 P0 风险：超大职责文件持续膨胀

当前最需要优先处理的是以下文件 / 模块：

- `core/platform/src/modules/temporal-workflow/fixed-activity-templates.ts`
- `core/platform/src/modules/temporal-workflow/runtime-bridge/temporal-activity-execution.service.ts`
- `core/platform/src/modules/temporal-workflow/temporal-workflow-fixed-workflow-code.helpers.ts`
- `apps/backend/registry-release/release-manager/release/*`
- `apps/backend/registry-release/release-manager/publisher/*`

这些文件的问题不只是“行数大”，而是同时承担了：

- 设计时草稿编排
- 编译与代码生成
- 发布前校验
- 运行时绑定
- 浏览器或文档能力域的局部装配

如果不先拆职责，后续无论迁移到 `registry-release`、`capabilities` 还是 `runtimes`，都会把旧耦合原样复制到新目录。

### 3.2 P0 风险：`ai-orchestrator` 的通用规划与浏览器域混居

`ai-orchestrator` 当前既承载：

- `planner`
- `recognizer`
- `react-engine`
- `chat`
- `model`

又承载大量 `modules/browser/*` 逻辑，包括：

- `intent`
- `execute`
- `loop`
- `session`
- `export`
- `observation`
- `gateway`

这会导致主 Planner 无法稳定成为“通用规划中枢”，浏览器能力也无法独立演进。

### 3.3 P1 风险：目标平面已命名，但实现包仍停留在薄壳入口

典型表现：

- `apps/backend/registry-release/release-manager/src/index.ts`
  - 该类包根薄壳已在后续 Phase E 删除；当前同类风险主要转移到仍未收口为真实实现文件的稳定子路径与目录边界

当前这类入口仍可能只是对子层或 `core/platform` 的薄转发。即使个别根入口已在后续 Phase E 删除，如果包内主要实现仍停留在兼容导出层，这种状态也只能短期接受，否则团队会误以为“代码已经迁过去了”。

### 3.4 P1 风险：能力域目标路径存在，但新功能入口仍不够硬约束

虽然 `capabilities/browser-domain/README.md` 和 `capabilities/document-domain/README.md` 已给出逻辑归属说明，但如果没有进一步建立：

- import 边界
- README 约束
- 评审规则
- 新功能入口规则

新增需求仍然容易继续落进 `domain/*` 或 `ai-orchestrator/modules/browser/*`。

### 3.5 P2 风险：共享契约双轨长期并存

当前同时存在：

- `packages/contracts`
- `packages/backend-contracts/*`

而且 `control-plane` 仍直接依赖 `@ops/contracts`。如果不先补齐 `backend-contracts` 的源码和构建入口，旧包就无法平滑退出。

---

## 4. 迁移设计原则

### 4.1 先拆职责，再搬目录

本轮迁移的第一原则是：

1. 先把大模块切成可理解的职责片段。
2. 再建立稳定导出面。
3. 最后才做物理迁移。

原因是：

- 先搬目录只会放大 import 变更面。
- 先拆职责可以更早暴露边界问题。
- 兼容壳可以保留更久，回滚更容易。

### 4.2 先逻辑归属，后物理归属

允许一段时间内出现：

- 代码物理位于 `core/platform`
- 但逻辑归属已经是 `skill-registry`

或：

- 代码物理位于 `ai-orchestrator/modules/browser`
- 但逻辑归属已经是 `capabilities/browser-domain`

这类状态。

但必须满足两个前提：

1. 新增需求按新归属扩展，不再按旧结构扩散。
2. 对外稳定入口已经体现新归属，而不是继续暴露旧模块名。

### 4.3 Release 是唯一可执行门禁

所有设计时对象最终都必须收敛到：

`草稿 / 模板 / 规则 / Agent Profile -> release-manager -> Release Manifest -> control-plane`

任何新增实现如果绕开 `Release Manifest` 直接执行草稿、模板、规则或 Agent Profile，都视为违背目标架构。

### 4.4 控制面优先稳定，能力细节持续南向下沉

迁移过程中，`control-plane` 的核心职责应保持稳定：

- Execution 生命周期推进
- 审批、接管、输入提交
- Runtime 适配调度

应持续南向下沉的内容包括：

- 浏览器录制与观察细节
- 文档模板与渲染细节
- 专项 Agent 的高频决策循环
- 各类 Runtime 的执行实现

### 4.5 共享契约先于独立部署

在 `codegen-agent`、`browser-nl-agent`、未来更多专项 Agent 真正独立部署之前，必须先完成共享协议和共享类型的归位。否则独立部署只会把本地耦合复制成跨服务耦合。

---

## 5. 目标结构与边界设计

### 5.1 顶层目标平面

后端长期目标保持以下六层结构：

```text
apps/backend/
├── governance/
├── intelligence/
├── registry-release/
├── execution-control/
├── capabilities/
├── runtimes/
└── var/

packages/
├── backend-contracts/
├── contracts/          # 迁移期保留，最终退出
└── user-core/          # 跨前端体验层共享核心，暂不纳入本轮后端平面迁移
```

### 5.2 治理平面

#### 负责

- 身份认证、授权、角色与访问控制
- 组织、成员、归属关系
- 与平台级审计和策略相关的横切能力

#### 不负责

- Skill / Workflow / Release 设计时资产
- Execution 生命周期
- 浏览器或文档能力域内部逻辑

#### 当前迁移策略

- 保持 `identity-access`、`organization` 作为真实实现包。
- `core/platform/modules/auth|user|organization` 已在后续 Phase E 中删除；平台侧当前仅保留 bridge module 与 runtime provider 绑定。
- `strategies/*`、`guards/*`、`decorators/*` 的平台转发壳已在后续 Phase E 中删除，相关消费方统一切到 `@ops/identity-access`。
- `core/platform/src/governance/{identity-access,organization}/*` 当前仍不是 deletion-ready compat shell，而是包侧 token 绑定到 `PrismaService` 等平台运行时依赖的实际 provider 锚点；除非后续继续抽离 repository/reader 适配层，否则应视为当前最终锚点。

### 5.3 Intelligence 平面

#### 负责

- 通用意图识别
- 参数识别与补齐
- 计划生成
- 专项 Agent 委派
- 专项 Agent 的本地高频循环

#### 不负责

- 浏览器能力域内部资产管理
- 文档域模板与渲染实现
- 发布门禁
- Runtime 原子执行

#### 当前迁移策略

- 把 `ai-orchestrator` 稳定为“主 Planner + 委派入口”。
- 逐步将 `modules/browser/*` 的实现责任外移到 `capabilities/browser-domain` 或 `browser-nl-agent`。
- 未来新增专项 Agent 一律进 `intelligence/*`，不再回堆到 `ai-orchestrator`。

### 5.4 Registry-Release 平面

#### 负责

- Skill 注册资产
- Workflow / Flow / Activity 模板资产
- Release 编译、校验、发布、回滚
- 面向可执行资产的 Manifest 生成

#### 不负责

- 执行实例生命周期
- 浏览器 Worker / Sandbox Worker 原子执行
- 用户交互式规划循环

#### 当前迁移策略

- `core/platform/src/modules/skill`、`workflow-registry`、`release-manager` 继续作为过渡实现承载层。
- `apps/backend/registry-release/*` 先保留包名与逻辑命名，再逐步承接真实代码。
- 所有新设计时能力优先向 `skill-registry / workflow-registry / release-manager` 逻辑视图收敛。

### 5.5 Execution-Control 平面

#### 负责

- Execution 状态流转
- 审批、接管、输入提交
- Runtime 适配与调度
- 会话、租约、锁、资源分配

#### 不负责

- Skill / Workflow / Template 编辑
- Release 编译与发布
- 浏览器或文档域内部规则与模板维护

#### 当前迁移策略

- 保持 `control-plane` 骨架稳定，不让能力域细节回流。
- `ProxyModule`、`auth` 中间层等历史泛职责模块只允许收口，不允许扩张。
- 后续新增执行逻辑进入 `execution/*`，新增会话与资源逻辑进入 `session-broker/*`。

### 5.6 Capabilities 平面

#### 负责

- 浏览器能力域的模板、语义、录制、导出、运行时桥接
- 文档能力域的模板、渲染、报表、产物语义、运行时桥接

#### 不负责

- 通用 Planner 主循环
- 平台级统一发布门禁
- Runtime Worker 原子执行实现

#### 当前迁移策略

- 短期内允许 `domain/*` 继续运行。
- 团队规则上应立即冻结：**新能力域需求只进 `capabilities/*` 逻辑视图**。
- 中期再按服务逐个推进真实物理迁移；当前 `browser-template`、`browser-semantics`、`report` 已完成各自首轮运行包根目录迁移，`document-engine` 仍处于入口收口后、尚未正式搬目录的阶段。

### 5.7 Runtimes 平面

#### 负责

- 接收标准化调用协议
- 执行原子动作
- 返回标准化结果与产物引用

#### 不负责

- 用户意图识别
- 发布审批
- 设计时资产管理
- Execution 主状态推进

#### 当前迁移策略

- `browser-worker`、`replay-worker`、`temporal-worker`、`sandbox-worker` 保持运行时职责单一。
- 与 `control-plane` 的交互尽量只通过 `runtime-capability-contract`。

### 5.8 `packages/user-core` 的定位

#### 当前判断

`packages/user-core` 不属于本轮后端平面迁移的主体对象，它更接近**跨前端应用的体验层共享核心包**，当前主要承载：

- 前端 API 封装
- 前端 domain model
- 运行时配置与工具函数
- 状态与端口抽象

#### 迁移结论

本轮后端迁移中：

1. `user-core` 保留，不并入 `governance/identity-access`
2. 不作为 `packages/contracts` 的替代者
3. 不纳入 `governance / registry-release / capabilities / runtimes` 任一后端平面

#### 后续建议

`user-core` 需要单独补充 README，明确它是：

- 面向 `user-web / portal / mobile / desktop` 的共享体验层核心

而不是：

- 后端身份治理包
- 后端共享契约包

如后续团队认为当前命名会持续造成误解，可在本轮后端迁移完成后，再单独评估是否重命名为更接近前端语义的共享包名称。

---

## 6. 关键热点模块的专项迁移设计

### 6.1 `capability-release` -> `release-manager`

#### 当前问题

`capability-release.service.ts` 和 `capability-release-runtime.service.ts` 同时承担了：

- Release 生命周期编排
- Skill 草稿关联
- 运行时绑定
- Browser Recording 装配
- Temporal schema 编译
- 发布后 smoke 与部署辅助

#### 设计目标

当前 `apps/backend/registry-release/release-manager/` 下已经存在：

- `release/`
- `compiler/`
- `validator/`
- `publisher/`
- `audit/`

这些目录骨架，因此本节不是空想式设计，而是要把 `core/platform` 中已存在的真实实现逐步填充到这五类稳定子层中。

先在原目录内拆成稳定子层：

- `release/`
- `compiler/`
- `validator/`
- `publisher/`
- `audit/`

然后再迁到：

`apps/backend/registry-release/release-manager/`

#### 实施原则

1. 第一批不改外部路由和对外 API。
2. 第一批只拆内部职责和 façade。
3. 待导出面稳定后，再迁移真实实现到目标包。

### 6.2 `temporal-workflow` -> `workflow-registry`

#### 当前问题

`temporal-workflow` 当前同时混有：

- Workflow 草稿与模板
- Activity 注册与校验
- 代码生成
- 浏览器 Workflow 草稿辅助
- 运行时执行辅助

补充说明：

- `execution-flow` 当前已经是更轻量的 Flow 模板注册面。
- 它仍然属于 `workflow-registry`，但本节聚焦的热点模块是更重、更混杂的 `temporal-workflow`。
- 因此这里先单列 `temporal-workflow`，`execution-flow` 按相同原则同步收敛即可。

#### 设计目标

当前目录的逻辑边界已经收敛为 `workflow-template`、`activity`、`codegen`、`validation` 四类核心能力，以及 `browser-bridge`、`runtime-bridge` 两类迁移期过渡层；其中历史 `workflow/`、`codegen/` 分组聚合壳已在后续 Phase E 删除，但真实实现仍部分散落在根层文件与 `core/platform/src/workflow-registry/*` 之间。

因此这里的目标不是立刻把整个模块物理搬到 `workflow-registry`，而是先在原目录内收敛成“四类稳定核心能力 + 两类迁移期过渡层”：

- `workflow-template`：Workflow 草稿、模板、配置、归一化
- `activity/`：Activity 注册、CRUD、定义解析
- `codegen/`：Workflow / Activity 代码生成与固定模板辅助
- `validation/`：Workflow / Activity 校验、façade、HTTP 适配
- `browser-bridge/`：迁移期临时层，承接浏览器专属草稿辅助，后续再下沉到 `browser-domain`
- `runtime-bridge/`：迁移期临时层，承接运行时执行辅助，后续再下沉到 `execution-control` 或 `runtimes`

这样可以先把 `workflow-registry` 的设计时注册面稳定下来，再决定每类实现的最终物理归属。

#### 实施原则

1. 第一刀先把运行时执行辅助从设计时主层中隔离，优先恢复 `activity/` 的纯设计时语义。
2. 第二刀再把浏览器专属辅助逻辑切到迁移期 `browser-bridge/`，待 `browser-domain` 承接层稳定后再外移。
3. 首轮只拆内部职责，不改 `controller`、`module`、对外导出和主要调用入口。
4. 不要求一次性把所有 helper 全搬走，但新增逻辑必须进入对应子层，`temporal-workflow.service.ts` 只允许继续收敛为 façade。

### 6.3 `ai-orchestrator/modules/browser/*` -> `browser-domain`

#### 当前问题

`modules/browser/*` 文件量大、接口多、测试多，且和 Planner、ReAct、Chat 共处一个服务，导致：

- 浏览器能力域难以独立演进
- 主 Planner 难以保持通用
- 边界认知成本持续升高

#### 设计目标

把浏览器能力收敛为以下逻辑层：

- `recorder`
- `observation`
- `session`
- `export`
- `runtime-facade`

同时保留当前物理过渡目录的现实约束：

- `api/` 继续承载控制器与 HTTP 入口
- `gateway/` 继续承载平台接入点
- `execute/` 仍是 `recorder / observation / session / runtime-facade` 的过渡实现承载层
- `observe/` 仍承载页面快照、观察与刷新底层服务
- `loop/`、`recovery/` 仍作为 `recorder` 的协作子层存在

因此这里的目标不是立刻把所有文件搬到 `capabilities/browser-domain`，而是先让 `ai-orchestrator/modules/browser/*` 的目录语义和依赖方向，真实反映未来 `browser-domain` 的子层边界。

但这里必须区分两类迁移目标：

1. **浏览器能力域主体**，最终进入 `capabilities/browser-domain`
2. **高变更率自然语言动作决策**，逐步外移到：

- `intelligence/browser-nl-agent`

建议按下表理解当前子层的最终归属：

| 当前子层 | 主要内容 | 目标归属 |
| :--- | :--- | :--- |
| `intent/` | 浏览器动作语义解析、命令 profile、语义运行时 | 以 `capabilities/browser-domain` 为主；其中高频自然语言动作决策可逐步拆给 `browser-nl-agent` |
| `observe/`、`observation/` | 页面快照、页面观察、执行后刷新 | `capabilities/browser-domain/recorder/observation` |
| `execute/` | 录制调试主流程、执行协调、响应拼装 | `capabilities/browser-domain/recorder` |
| `loop/` | loop、条件分支、循环导出辅助 | `capabilities/browser-domain/recorder` |
| `session/` | 录制会话、session store、session coordinator | `capabilities/browser-domain/recorder/session` |
| `export/` | 录制导出、模板导出、执行计划导出 | `capabilities/browser-domain/export` |
| `recovery/` | phase recovery、恢复编排 | `capabilities/browser-domain/recorder/recovery` |
| `runtime-facade/` | 面向 `control-plane` / `browser-worker` 的域桥接 | `capabilities/browser-domain/runtime-facade` |
| `gateway/` | WebSocket / 平台入口接入点 | 迁移期可继续保留在 `ai-orchestrator` 作为平台入口层，后续再评估是否抽为独立 ingress |

因此，本节“外移到 `browser-nl-agent`”只指**高频自然语言动作决策部分**，并不指整个 `modules/browser/*` 主体。

#### 实施原则

1. 第一刀先冻结依赖方向，`planner/*` 不再新增对 `execute/*`、`observe/*`、`session/*` 等内部实现的深层导入。
2. 第二刀优先收敛 `recorder-debug.service.ts`，让它回到录制主入口 façade，而不是继续承担 session、observation、chat-flow、execution、response 的总装层。
3. 第三刀把 `observe/*`、`session/*`、`loop/*` 视为 `recorder` 协作子层，逐步收敛外部 import 到稳定出口。
4. `intent/*` 当前先明确归属为浏览器域语义层，不把它继续混入主 Planner；其中高变更率自然语言动作决策再逐步外移到 `browser-nl-agent`。
5. 首轮不改 controller、gateway、WebSocket 入口和主要 API 契约，先形成统一外观层，再移动实现。

### 6.4 `domain/*` -> `capabilities/*`

#### 当前问题

当前 `domain/` 这个层级在架构语义上已经过时，但其中四个服务都是真实运行单元，不能粗暴搬迁。

#### 设计目标

将：

- `browser-template`
- `browser-semantics`

统一为：

- `capabilities/browser-domain/*`

将：

- `document-engine`
- `report`

统一为：

- `capabilities/document-domain/*`

这里要强调，“统一”为**逻辑归属统一**，不是一次性做物理大搬家。当前迁移仍需以“单个服务”为主，而不是按零散文件横向搬运；其中 `report` 已迁到 `capabilities/document-domain/report`，`browser-template`、`browser-semantics` 与 `document-engine` 也都已完成真实运行入口迁移和旧目录 Phase E 收口，旧 `domain/*` 目录当前仅保留历史 `README.md` 作为迁移说明锚点。

建议按两组能力域分别收口：

- 浏览器域：`browser-template` 与 `browser-semantics` 已完成各自运行包根目录迁移和旧目录收口，后续重点转为统一 `capabilities/browser-domain/*` 下的边界、README 与稳定导出面
- 文档域：`report` 已迁入 `capabilities/document-domain/report`；`document-engine` 也已完成真实运行入口迁移与旧目录收口，后续重点转为统一 `capabilities/document-domain/*` 下的共享 DTO、依赖方向与能力说明

#### 实施原则

1. 立即冻结：新能力域需求不再进入 `domain/*`，新增逻辑只允许进入目标能力域的逻辑视图或兼容壳后方的新子层。
2. 第一阶段只统一边界，不统一目录；优先补 README、稳定导出、共享契约和调用说明，让团队先能明确判断归属。
3. 第二阶段按“单个服务”推进物理迁移；当前 `browser-template`、`browser-semantics`、`document-engine` 与 `report` 已分别完成对应批次，后续新增同类迁移仍保持“一次只迁一个真实运行单元”。
4. 任何一次服务迁移都必须连同 workspace、Compose、启动脚本与真实接口回归一起验证，确认容器加载的是当前 worktree 代码后再删旧路径。

### 6.5 `packages/contracts` -> `packages/backend-contracts`

#### 当前问题

旧包 `packages/contracts` 仍被使用，新包 `backend-contracts/*` 还不完整，且当前以编译产物为主。

#### 设计目标

让 `backend-contracts/*` 成为唯一共享契约源头，至少补齐：

- `src/`
- `tsconfig`
- 构建脚本
- 发布入口

当前实际状态是：

- `packages/contracts` 仍是单包 `@ops/contracts`，且以根层 `index.js`、`execution.js`、`errors.js` 等编译产物为主
- `packages/backend-contracts/*` 已经拆出多个子包，例如 `common-dto`、`execution-events`、`release-manifest`、`runtime-capability-contract`、`agent-profile`、`agent-execution-protocol`
- 但这些新包目前同样主要只有 `index.js` / `index.d.ts`，源码承载能力和统一构建入口都还不完整

因此本节的目标不是“已经迁完”，而是让新契约包从“声明性空壳”变成真正可维护的源码仓位。

#### 实施原则

1. 先补齐每个 `backend-contracts/*` 子包的 `src/`、`tsconfig`、构建脚本和统一导出规则，停止只靠手工维护编译产物。
2. 再按契约主题逐个迁依赖，优先迁最稳定、跨服务复用最明确的 DTO 和事件定义，不在首轮同步重写业务主流程。
3. 迁移期间允许 `packages/contracts` 继续作为兼容壳存在，但禁止新增共享契约再落回 `@ops/contracts`。
4. 待主要消费方已切到 `backend-contracts/*`，再删除 `packages/contracts`，并同步收窄 workspace 中对旧路径的兼容范围。

---

## 7. 分阶段迁移路线

### 7.1 Phase A：基线冻结

#### 目标

- 冻结新功能入口
- 冻结模块所有权
- 防止旧结构继续扩散

#### 动作

1. 在 `apps/backend/README.md` 和各目标 README 中明确当前归属规则。
2. 约束 `core/platform` 兼容壳只做转发，不做新实现。
3. 约束 `domain/*` 进入冻结状态，新能力域需求只进 `capabilities/*` 逻辑视图。
4. 约束 `ai-orchestrator/planner/*` 不再承接浏览器域新增实现。

#### 建议批次

1. 一个 PR 只补 README、模块边界说明和目录归属说明。
2. 一个 PR 只加冻结约束，例如 `core/platform` 或 `domain/*` 的新增实现约束，不同时碰多个热点模块内部逻辑。
3. 若需要补 lint / import 约束或 review checklist，单独作为治理 PR 提交，不和业务重构混做。

#### 完成标准

- 新增需求评审时可直接判断归属。
- 兼容壳目录不再出现新增业务 service。

#### 禁止事项

- 禁止同时修改对外路由
- 禁止修改数据库 Schema
- 禁止删除旧兼容壳
- 禁止趁机做跨服务 DTO 大规模改名

### 7.2 Phase B：职责拆分

#### 目标

在不改变部署拓扑的前提下，优先拆解超大模块。

#### 动作

1. 拆 `capability-release`。
2. 拆 `temporal-workflow`。
3. 拆 `ai-orchestrator/modules/browser/*`。
4. 为关键大模块建立 façade、assembler、validator、mapper、publisher、adapter 等稳定子层。

#### 建议批次

1. 一个 PR 只拆一个热点模块，例如只拆 `capability-release` 或只拆 `temporal-workflow`。
2. 一个 PR 只做一刀，例如“先隔离 runtime 辅助”或“先收紧 planner 依赖”，不要把同一模块的三四种职责拆分合并在一次提交里。
3. 若同一模块既要补 façade，又要移动 helper，优先先补 façade，下一批再移动实现。

#### 完成标准

- 超大文件停止继续增长。
- 关键模块的目录层次开始反映目标职责。

#### 禁止事项

- 禁止同时修改对外路由
- 禁止同时修改数据库 Schema
- 禁止顺手替换底层 Prisma 查询策略
- 禁止删除旧兼容壳或旧导出面

### 7.3 Phase C：包级落地

#### 目标

让目标平面的目录不再只是壳。

#### 动作

1. 让 `registry-release/*` 承接真实实现。
2. 让 `backend-contracts/*` 承接真实源码。
3. 为 `capabilities/*` 承接真实服务代码做好入口准备。

#### 建议批次

1. 一个 PR 只让一个目标平面承接一类真实实现，例如只处理 `release-manager`，或只处理一个 `backend-contracts/*` 子包。
2. 共享契约 PR 只处理契约源码、构建和消费方切换，不顺手重写服务主流程。
3. 若需要新增兼容导出或 re-export，先保留旧入口，等消费方切完再收口。

#### 完成标准

- `registry-release/*` 不再简单依赖 `@ops/platform` 整包。
- 新共享 DTO 进入 `backend-contracts/*`，不再定义在单一服务内部。

#### 禁止事项

- 禁止在同一批次同时推进大规模物理目录搬迁
- 禁止在共享契约落地时同步重写业务主流程
- 禁止让新包直接绕过兼容层接管全部调用方

### 7.4 Phase D：物理迁移与部署调整

#### 目标

逐步完成服务级和目录级迁移，同时保持运行链路稳定。

#### 动作

1. 逐个迁移 `domain/*` 到 `capabilities/*`。
2. 逐个迁移 `core/platform` 中的实现到 `registry-release/*`。
3. 更新 workspace、Compose、脚本和文档。
4. 每完成一个服务迁移，都通过 `start-smart.sh` 验证真实加载新代码。

#### 建议批次

1. 一个 PR 最多迁一个真实运行单元，例如一个 `domain/*` 服务或一个 `registry-release/*` 子模块。
2. workspace、Compose、脚本调整优先和对应服务迁移绑定提交，不做跨多个服务的集中式路径重排。
3. 每次迁移都单独记录启动命令、验证接口和回滚点，确保失败时可以只回退这一批。

#### 完成标准

- 容器挂载路径和工作树路径一致。
- 服务行为与代码所在路径一致。

#### 禁止事项

- 禁止绕过 `./docker/start-smart.sh`
- 禁止在未做端到端验证前删除旧路径
- 禁止把“目录迁移、协议改名、部署调整”合并进同一个 PR

### 7.5 Phase E：收口与清理

#### 目标

清理迁移期遗留物，收敛到最终结构。

#### 动作

1. 删除空壳或纯 re-export 过渡包。
2. 删除 `packages/contracts`。
3. 删除 `domain/*` 中已迁移完成的旧路径。
4. 收窄 `pnpm-workspace.yaml` 的旧路径兼容 glob。

#### 建议批次

1. 一个 PR 只删除一类遗留物，例如只删一个旧包、一个旧目录或一组纯 re-export 壳。
2. 删除动作必须晚于消费方切换完成，并附带一次最小回归记录。
3. `pnpm-workspace.yaml` 的兼容 glob 收窄建议放在收口尾声单独提交，避免与业务迁移互相影响。

#### 完成标准

- 目标平面命名和物理目录一致。
- 不再存在长期双轨结构。

#### 禁止事项

- 禁止在尚有调用方未迁完时提前删包
- 禁止在没有回滚点的情况下集中清理多个旧目录
- 禁止把收口清理和新需求开发混在同一个 PR

---

## 8. PR 与实施控制规则

为避免迁移失控，建议每个批次遵循以下规则：

1. 一个 PR 只处理一个主问题。
2. 优先做“拆职责”或“迁目录”其中一种，不要混做。
3. 优先保持对外 API、事件、路由和 DTO 稳定。
4. 先加 façade 与兼容层，再删旧路径。
5. 每个批次都要有独立回归范围和独立回滚点。

推荐的批次粒度：

- 单个 PR 只拆一个大文件或一个大模块子层。
- 涉及共享契约的 PR 尽量不同时改大规模业务逻辑。
- 涉及 Compose 路径的 PR 必须单独验证容器实际加载的新代码。

### 8.1 迁移后验证 Checklist

每个迁移批次至少应补一份最小验证记录，建议按以下 checklist 执行：

1. **编译验证**
   - 目标服务 `typecheck` 或等效构建通过
2. **测试验证**
   - 跑与本批次直接相关的单测或集成测试，不要求全仓回归，但必须覆盖改动主链
3. **接口验证**
   - 对受影响的核心入口至少发起一次真实 HTTP 请求或等效调用，确认行为与预期一致
4. **容器验证**
   - 涉及 Docker 挂载或路径迁移时，必须通过 `./docker/start-smart.sh` 启动对应服务，并再次请求核心接口确认加载的是当前 worktree 代码
5. **回滚验证**
   - 明确本批次若失败应回退哪个 commit、哪个兼容层、哪个目录出口

其中第 3 和第 4 条不能只靠“服务启动成功”代替，必须至少有一个行为级验证结果。

### 8.2 推荐 PR 模板

建议每个迁移 PR 至少包含以下信息：

1. **主问题**
   - 本批次只解决哪个主问题，例如“隔离 `temporal-workflow` runtime 辅助”或“收紧 `planner` 对 `browser/*` 的深层依赖”
2. **变更边界**
   - 本批次明确改哪些模块、不改哪些模块，避免评审时误判范围
3. **兼容策略**
   - 是否保留旧 façade、旧导出、旧目录壳；哪些兼容层将在后续批次删除
4. **验证记录**
   - 编译结果、测试范围、接口验证结果、容器验证结果
5. **回滚点**
   - 若失败，应回退哪个 commit、恢复哪个导出面或哪个兼容层

推荐写法如下：

```md
## 主问题
- 只处理：
- 不处理：

## 变更边界
- 涉及模块：
- 保持稳定：

## 兼容策略
- 保留的兼容层：
- 后续计划删除：

## 验证记录
- typecheck / build：
- tests：
- API / 行为验证：
- 容器验证：

## 回滚方式
- 回滚 commit：
- 恢复兼容层：
```

---

## 9. 90 天推荐顺序

### 第 1-2 周

1. 冻结新增需求入口与模块所有权。
2. 给 `core/platform`、`ai-orchestrator/modules/browser`、`domain/*` 补齐明确边界说明。
3. 确立“大文件不再横向膨胀”的团队规则。

建议产出：

- 边界说明 PR
- 目录归属 README PR
- 代码评审检查项或团队约束清单

### 第 3-6 周

1. 拆 `capability-release`。
2. 拆 `temporal-workflow`。
3. 拆 `ai-orchestrator/modules/browser` 中最重的子层。

建议节奏：

- 先做 `capability-release` 的 façade / publisher / compiler 收敛
- 再做 `temporal-workflow` 的 runtime / browser 辅助隔离
- 最后做 `browser/*` 的 recorder 主链路和 planner 依赖收紧

### 第 7-10 周

1. 让 `registry-release/*` 逐步承接真实实现。
2. 给 `backend-contracts/*` 补齐源码与构建。
3. 迁移 `control-plane` 等服务对 `@ops/contracts` 的依赖。

建议产出：

- 至少一个 `registry-release/*` 子层承接真实实现
- 至少一个 `backend-contracts/*` 子包补齐源码和构建链
- 至少一条核心消费链脱离 `@ops/contracts`

### 第 11-13 周

1. 按服务逐个推进 `domain/*` -> `capabilities/*`。
2. 更新 Compose、workspace、README 与专项文档。
3. 开始清理第一批已经无用的过渡壳。

建议节奏：

- 每 1-2 周只迁一个真实运行服务
- 每迁完一个服务就单独完成容器验证和接口回归
- 清理动作始终落后于消费方切换，不和服务迁移并批提交

---

## 10. 非目标事项

本文明确不建议在同一阶段同时推进以下事项：

- 一次性重命名全部服务与包名
- 一次性重写所有测试
- 一次性修改全部前端消费路径
- 在未补齐共享契约前直接强推专项 Agent 独立部署
- 在未验证 Compose 与挂载路径前直接删除旧服务路径

---

## 11. 验收口径

### 11.1 阶段与验收维度对照

| Phase | 主要验收维度 |
| :--- | :--- |
| A（基线冻结） | 结构验收 `11.2` |
| B（职责拆分） | 代码验收 `11.4`，并辅以结构验收 `11.2` |
| C（包级落地） | 代码验收 `11.4` + 工程验收 `11.3` |
| D（物理迁移） | 工程验收 `11.3` + 架构验收 `11.5` |
| E（收口清理） | 架构验收 `11.5`，并复核结构验收 `11.2` |

### 11.2 结构验收

- 新增需求的归属判断稳定。
- 目标平面与物理目录逐步一致。
- 过渡壳目录不再承接新增业务实现。

### 11.3 工程验收

- workspace 能同时支撑兼容期与新路径。
- Docker / Compose 真实挂载当前 worktree。
- 后端服务启动后行为与新代码一致。

### 11.4 代码验收

- 超大文件数量持续下降。
- 新增跨服务 DTO 不再进入服务私有源码。
- 模块对外引用逐步收敛到稳定出口。

### 11.5 架构验收

- `release-manager` 成为唯一执行门禁。
- `control-plane` 不再承接能力域细节。
- `ai-orchestrator` 逐步回归“通用规划 + 委派中枢”。
- `capabilities/*` 真正承接浏览器域和文档域。

### 11.6 最小验收记录格式

为避免“做完了但无法复核”，建议每个阶段性批次至少沉淀一份最小验收记录，格式可统一为：

1. **批次名称**
   - 例如：`Phase B / temporal-workflow runtime-bridge 首刀`
2. **目标**
   - 本批次试图解决的单一主问题
3. **影响范围**
   - 涉及的服务、模块、包、Compose 或 workspace 调整
4. **验证结果**
   - 编译、测试、接口、容器验证各自的结果
5. **结论**
   - 是否达到本阶段完成标准，是否允许进入下一批次

建议格式如下：

```md
## 批次名称

## 目标

## 影响范围

## 验证结果
- 编译：
- 测试：
- 接口：
- 容器：

## 结论
- 是否通过：
- 遗留问题：
- 下一批次前置条件：
```

---

## 12. 首批 PR 拆分清单

为避免路线图停留在“方向正确但难以下手”，建议首批执行直接按以下 backlog 推进。

### 12.1 PR-01：基线冻结与归属说明

#### 目标

先把“新需求该进哪里”说清楚，避免旧结构继续扩张。

#### 建议范围

- 更新 `apps/backend/README.md`
- 更新 `core/platform`、`ai-orchestrator/modules/browser`、`domain/*`、`packages/backend-contracts/*` 的 README 或边界说明
- 明确 `core/platform`、`domain/*`、`@ops/contracts` 的冻结约束

#### 不包含

- 不拆业务实现
- 不改对外 API
- 不改数据库 Schema

### 12.2 PR-02：`capability-release` 首刀拆分

#### 目标

先把 `capability-release` 收敛为 `release / compiler / validator / publisher / audit` 稳定子层中的第一刀。

#### 建议范围

- 只补 façade 与内部协作边界
- 优先隔离发布编排与编译装配职责
- 保持 controller、route、对外调用面不变

#### 不包含

- 不迁目录到 `registry-release/*`
- 不顺手改发布协议
- 不重写 smoke / deploy 主流程

### 12.3 PR-03：`temporal-workflow` runtime-bridge 首刀

#### 目标

先把运行时执行辅助从设计时注册面中隔离出来。

#### 建议范围

- 围绕 `temporal-activity-execution.service.ts` 及相关 helper 建立 `runtime-bridge` 或等效过渡层
- 让 `activity/` 回到“注册、CRUD、定义解析、校验前管理”的设计时语义
- 保持 `controller`、`module`、导出入口稳定

#### 不包含

- 不同步外移浏览器辅助
- 不同步重构 `execution-flow`
- 不切换到 `workflow-registry` 物理路径

### 12.4 PR-04：`browser/*` 依赖方向冻结

#### 目标

先阻止 `planner/*` 继续深层依赖浏览器域内部实现。

#### 建议范围

- 收紧 `planner/*` 到 `browser/*` 的导入边界
- 优先通过 `browser/index.ts` 或稳定子层出口暴露依赖
- 为后续瘦身 `recorder-debug.service.ts` 做准备

#### 不包含

- 不迁移到 `capabilities/browser-domain`
- 不改 WebSocket / gateway 协议
- 不同步迁移 `browser-template` 或 `browser-semantics`

### 12.5 PR-05：`backend-contracts/*` 首个源码化子包

#### 目标

选择一个最稳定的子包，完成从“编译产物壳”到“可维护源码包”的首轮落地。

#### 建议范围

- 为一个 `backend-contracts/*` 子包补 `src/`、`tsconfig`、构建脚本和统一导出
- 选一条最短消费链验证迁移方式
- 保留 `packages/contracts` 兼容壳

#### 不包含

- 不要求一次性迁完全部契约
- 不顺手重写多个服务的业务主流程
- 不提前删除 `@ops/contracts`

### 12.6 建议顺序

建议按以下顺序推进首批 PR：

1. `PR-01` 基线冻结与归属说明
2. `PR-02` `capability-release` 首刀拆分
3. `PR-03` `temporal-workflow` runtime-bridge 首刀
4. `PR-04` `browser/*` 依赖方向冻结
5. `PR-05` `backend-contracts/*` 首个源码化子包

这样排序的原因是：

- 先冻结入口，再拆热点模块，避免拆分过程中旧结构继续吸收新需求
- 先拆职责最重的 `core/platform` 热点，再碰浏览器域高变更路径
- 共享契约源码化放在首批末段，更容易基于前面已经稳定下来的边界推进

---

## 13. 一句话结论

本轮后端迁移的核心，不是“尽快把代码搬到新目录”，而是先把 `core/platform`、`ai-orchestrator/modules/browser`、旧契约链路中的高耦合职责拆开，再让 `registry-release`、`capabilities`、`backend-contracts` 逐步承接真实实现。只有这样，迁移才是在建立新骨架，而不是把旧问题复制到新路径。
