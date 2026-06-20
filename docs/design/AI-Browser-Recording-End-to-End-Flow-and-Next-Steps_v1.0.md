# AI 浏览器录制到模板发布调用整体流程与下一步设计 v1.1

> 版本：v1.1  
> 日期：2026-06-18  
> 状态：进行中

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [当前真实链路总览](#2-当前真实链路总览)
3. [端到端主流程](#3-端到端主流程)
4. [核心模块职责](#4-核心模块职责)
5. [当前设计与业界最佳实践的对照](#5-当前设计与业界最佳实践的对照)
6. [项目内建议采纳的改进项](#6-项目内建议采纳的改进项)
7. [下一步任务清单](#7-下一步任务清单)
8. [最小改动落地点与 Patch 顺序](#8-最小改动落地点与-patch-顺序)
9. [轻量优化约束](#9-轻量优化约束)
10. [验证计划](#10-验证计划)
11. [受影响文件清单](#11-受影响文件清单)

---

## 1. 目标与范围

### 1.1 文档目标

本文档用于统一说明当前项目中“AI 自然语言控制浏览器”的真实实现链路，覆盖以下完整路径：

```text
浏览器录制
-> 页面观察与自然语言解析
-> 执行与会话沉淀
-> 导出模板与 Skill 草稿
-> Bridge / Review / Publish
-> Runtime 调用已发布 Skill
-> 条件分支 / 循环 / 人工接管
```

文档同时输出两类结果：

- 梳理当前已经落地、并且经过真实端到端验证的处理流程。
- 结合项目现状，把值得采纳的改进点沉淀为下一步明确任务。

### 1.2 本次范围

本文档只关注浏览器录制与浏览器 Skill 相关链路，不展开以下内容：

- 文档模板与 Carbone 流程。
- 非浏览器类型 Skill 的设计细节。
- 通用 Planner 全链路改造。
- 平台级安全治理的完整制度设计。

本次文档更新还新增一个明确约束：

- 基本链路已经跑通，本轮优化以“补 contract、补校验、补可观测性”为主，不进行大改或重写主流程。

### 1.3 当前结论前提

本文基于当前代码与最近真实验证结果建立，已确认：

- 浏览器循环执行已经过真实 E2E 验证，可执行到终止条件。
- 浏览器条件分支已经过真实 E2E 验证，支持 `continue` 与 `takeover`。
- `RecorderDebugService` 已进入持续拆分阶段，结构探测、observation、snapshot、disambiguation、export assembly 等已独立成 service。

---

## 2. 当前真实链路总览

当前项目里，AI 浏览器控制不是“LLM 直接自由操控 Playwright”，而是一条更偏工程化的链路：

```text
用户自然语言
-> Recorder Chat 编排
-> 结构化页面观察
-> 受限浏览器命令
-> 浏览器执行
-> 记录会话与执行结果
-> 导出为 templateSteps / executionPlan / runtimeMetadata
-> Bridge 成 capability release / skill draft
-> Publish 成 published skill
-> Runtime 严格按结构化 plan 执行
```

这条链路有两个重要特点：

- 探索态和生产态已经初步分层。
- 条件、循环、接管等复杂语义依赖结构化 `templateSteps` 与 `runtimeMetadata.executionPlan`，而不是依赖模型在运行时自由发挥。

---

## 3. 端到端主流程

### 3.1 阶段 A：录制与聊天控制

前端录制界面由 `AIControls.tsx` 驱动，负责维护 recorder 相关状态，并调用后端 `recorder-debug` 接口。

主流程如下：

```text
用户输入自然语言
-> 前端调用 /ai/recorder-debug/chat
-> RecorderDebugService.chat()
-> observePageSafely()
-> BrowserCommandService.parseCommand()
-> executeBrowserCommands()
-> refreshObservationAfterExecution()
-> 结果回到前端继续交互
```

这一阶段的关键作用不是直接形成最终模板，而是沉淀以下录制资产：

- `history`
- `executedCommands`
- `lastObservation`
- `loopDraft`
- `pendingDisambiguation`

### 3.2 阶段 B：页面观察与元素理解

当前项目优先使用结构化页面观察，而不是纯截图。

页面理解来源主要包括：

- DOM 结构探测脚本。
- 页面文本读取结果。
- snapshot / accessibility 风格的结构化信息。
- observation candidate 提示。

当前实现中，`RecorderStructureProbeService` 负责把结构探测结果组装成 `RecorderProbeObservationLike`，其中包括：

- `inputs`
- `buttons`
- `rows`
- `regions`
- `headings`
- `links`
- `pageSemantics`

这一设计和业界“优先 accessibility snapshot / DOM，再退回视觉”的方向一致，也更适合当前业务页面。

### 3.3 阶段 C：自然语言解析为受限动作

`BrowserCommandService` 并不是让模型直接返回任意代码，而是要求：

- 只返回 JSON。
- 只使用允许的浏览器动作集合。
- 在已有页面上下文中优先使用结构化候选目标。

因此当前项目实际上已经具备“受限动作空间 + JSON 规划输出”的基础能力。

这一阶段产物是标准化的 `BrowserCommand[]`，常见动作包括：

- `navigate`
- `click`
- `fill`
- `scroll`
- `snapshot`
- `screenshot`
- `read_value`
- `waitforselector`

### 3.4 阶段 D：浏览器执行与会话沉淀

命令进入 `RecorderDebugService.executeBrowserCommands()` 后，会调用 browser worker 执行实际浏览器动作。

执行完成后：

- 成功命令才会写入 `executedCommands`。
- 失败命令不会污染录制导出。
- 执行后会刷新 observation，作为下一轮自然语言解析的上下文。

这一步保证录制结果不是“用户以为做了什么”，而是“系统确认执行成功的动作集合”。

### 3.5 阶段 E：导出模板与 Skill 草稿

当用户点击导出后，前端会调用 `/ai/recorder-debug/export`。

后端主流程如下：

```text
RecorderDebugService.exportArtifacts()
-> RecorderExportAssemblyService.buildExportArtifacts()
-> RecorderTemplateExportService.buildTemplateStepsForExport()
-> RecorderLoopService 优化 loop 结构
-> RecorderParameterService 推导参数
-> RecorderExportService 组装 publishPayload / runtimeMetadata
```

这一阶段输出的关键资产包括：

- `templateSteps`
- `loopDraft`
- `skillDraft.publishPayload`
- `runtimeMetadata.executionPlan`
- `script`
- `guidance`

其中最关键的是：

- `templateSteps` 是浏览器流程的结构化表达。
- `runtimeMetadata.executionPlan` 是已发布 skill 在 runtime 执行时真正依赖的结构化计划。

### 3.6 阶段 F：模板保存与平台桥接

当前前端存在两条路径：

#### 路径 1：录制后直接保存模板

前端将 recorder 导出结果保存到模板系统，用于后续查看、复用和手动发布。

#### 路径 2：将导出结果桥接为 capability release / skill draft

平台入口为：

```text
POST /capabilities/bridge/recorder-export
```

平台侧会：

- 创建或更新 capability release。
- 落 source snapshot。
- 生成 skill draft。
- 等待 review / approve。

### 3.7 阶段 G：Review 与 Publish

平台在 capability release 通过审批后，会把 skill draft 发布为正式 skill。

发布后的 skill 不再依赖 recorder 会话本身，而是依赖 capability source snapshot 中保存的：

- `apiEndpoints.runtimeMetadata`
- `executionPlan`
- `templateSteps`
- `loopDraft`

这一步非常关键，因为浏览器 runtime 的行为最终取决于已发布 skill 的快照内容，而不是录制页面当前显示内容。

### 3.8 阶段 H：Runtime 执行已发布 Skill

运行入口为：

```text
POST /capabilities/runtime/execute
```

平台侧流程如下：

```text
CapabilityReleaseRuntimeService.executeBrowserRecordingPublishedSkill()
-> 读取 release source payload
-> CapabilityReleaseBrowserRecordingService.buildRuntimePlan()
-> 解析 templateSteps / executionPlan / loopDraft
-> 调 browser-worker 执行具体步骤
```

在 runtime 阶段：

- 普通步骤按顺序执行。
- `read_value` 会把页面读取结果写入变量。
- `branch` 会基于 `conditionFn` 判断 `continue / stop / takeover`。
- `loop` 会根据 `stopWhen` 与 `eachIteration` 执行循环。

### 3.9 阶段 I：人工接管与恢复

当出现以下情况时，系统可以进入人工接管：

- 条件分支命中 `takeover`。
- 浏览器执行层要求人工介入。
- 运行时恢复策略要求冻结当前浏览器会话。

当前项目已有完整链路：

- browser worker 会把会话切换到 `HUMAN_CONTROL`。
- control-plane 会把 execution 标记为人工控制态。
- 用户处理完后可以 resume。
- `ExecutionReconcileService` 和相关 human control service 可以帮助继续执行。

因此项目已经不仅有“失败即终止”，而是具备“冻结 -> 人工处理 -> 对账 -> 恢复”的恢复能力。

---

## 4. 核心模块职责

### 4.1 前端录制层

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`

职责：

- 维护 recorder UI 状态。
- 发起 chat / export / save / publish 等交互。
- 承接录制态与模板保存态的前端逻辑。

### 4.2 录制编排层

- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-debug.service.ts`

职责：

- 维护 recorder session。
- 串联 observation、parse、execute、export。
- 作为录制态主 orchestrator，而不是承载所有细节实现。

### 4.3 录制子能力服务

主要包括：

- `recorder-structure-probe.service.ts`
- `recorder-observation.service.ts`
- `recorder-snapshot.service.ts`
- `recorder-disambiguation.service.ts`
- `recorder-export-assembly.service.ts`
- `recorder-template-export.service.ts`
- `recorder-parameter.service.ts`
- `recorder-loop.service.ts`

职责：

- 把结构探测、候选生成、快照匹配、导出组装、参数推断、循环处理等职责从主服务拆开。

### 4.4 平台发布层

- `capability-release-publish.service.ts`
- `capability-release-skill-draft.service.ts`

职责：

- 桥接 recorder export 为 capability release。
- 生成 draft payload。
- 保留 source snapshot，供发布后 runtime 使用。

### 4.5 平台 runtime 层

- `capability-release-runtime.service.ts`
- `capability-release-browser-recording.service.ts`

职责：

- 从已发布 skill 的 source snapshot 构造 runtime plan。
- 执行浏览器模板语义。
- 处理 branch、loop、takeover、audit。

### 4.6 浏览器执行层

- `apps/backend/runtime/browser-worker/src/modules/browser/...`

职责：

- 执行实际浏览器动作。
- 管理 runtime session。
- 支持 freeze / resume / takeover codegen。

### 4.7 人工接管与控制平面

- `execution-human-control.service.ts`
- `browser-phase.executor.ts`
- `runtime-execution.orchestrator.ts`

职责：

- 把浏览器 runtime 的 `takeover_required` 映射为 execution 生命周期事件。
- 支持进入 `HUMAN_CONTROL`、恢复执行和接管记录沉淀。

---

## 5. 当前设计与业界最佳实践的对照

### 5.1 已经具备的能力

| 最佳实践方向                      | 当前项目状态                                             | 结论   |
| --------------------------------- | -------------------------------------------------------- | ------ |
| 结构化页面观察优先                | 已有 probe、snapshot、candidate、pageSemantics           | 已采用 |
| 受限动作空间                      | 模型输出受限为 JSON + 允许动作集合                       | 已采用 |
| Observe -> Think -> Act -> Verify | 已有页面观察、命令解析、执行、read_value / stopWhen 校验 | 已采用 |
| 错误恢复                          | 已有 disambiguation、takeover、resume、reconcile         | 已采用 |
| 审计                              | runtime 有 audit event 能力                              | 已采用 |
| 探索与固化分层                    | recorder export 与 published skill runtime 已分层        | 已采用 |

### 5.2 已经部分具备，但还不够显式的能力

| 方向                     | 当前状态                                             | 问题                            |
| ------------------------ | ---------------------------------------------------- | ------------------------------- |
| ReAct 状态结构           | 已有 observation、execution result、control hints    | 还没有统一成显式状态对象        |
| Action Validator         | 已有 `validationRules` 文案和固定 executionPlan 约束 | 还缺统一的机器可执行校验层      |
| 风险动作确认             | 已有 takeover 和 human control                       | 还没有动作分级策略              |
| 策略化恢复               | 已有 freeze / resume / reconcile                     | 还缺统一恢复决策矩阵            |
| 审计可视化               | 已有 audit event 和 phase takeover                   | 展示层还不够集中                |
| ExecutionPlan 契约优先级 | runtime 已优先读取 `runtimeMetadata.executionPlan`   | 还没有明确写成唯一可信 contract |
| Traceability             | 已有 release / draft / published skill 等标识        | 还没有形成完整反查链 contract   |

### 5.3 不建议直接照搬的方向

- 不建议把当前体系重构成 MCP-first。
- 不建议把截图视觉模型作为主观察源。
- 不建议让模型直接执行任意 Playwright 代码。
- 不建议为了引入“行业术语”而弱化现有 `templateSteps + executionPlan` 的结构化优势。

---

## 6. 项目内建议采纳的改进项

### 6.1 改进项 A：显式状态化 Recorder Prompt

#### 目标

把当前录制态模型输入从“自然语言上下文拼接”升级成更显式的状态对象，减少长会话漂移。

#### 建议状态字段

```json
{
  "previousActionResult": "success | failed | unknown",
  "memory": "已完成动作和剩余目标",
  "currentPageSummary": "当前页面摘要",
  "candidateActions": [],
  "riskLevel": "safe | caution | confirm",
  "nextGoal": "下一步目标"
}
```

#### 价值

- 更贴近 ReAct 控制模式。
- 更适合循环录制、多轮纠错和人工恢复后继续。
- 方便后续把 prompt 策略沉淀成稳定 contract。

### 6.2 改进项 B：统一动作校验器

#### 目标

在 `parseCommand -> executeBrowserCommands` 之间新增统一校验层，对动作做前置约束。

#### 建议覆盖

- 跳转域名白名单。
- 下载动作白名单。
- 高风险动作人工确认。
- 与当前 user goal 不一致的越界导航。
- 参数型 skill 执行时禁止改写固定步骤。

#### 价值

- 把现有 `validationRules` 从提示语升级成真正的执行前约束。
- 降低模型偶发漂移对生产执行的影响。

### 6.3 改进项 C：动作风险分级

#### 目标

对浏览器动作建立统一风险分级，并在 recorder、runtime、takeover 侧共用。

#### 初始建议分级

- `safe`：scroll、snapshot、read_value、wait
- `caution`：navigate、switch_tab、普通 click
- `confirm`：approve、submit、download、delete、外部域跳转
- `forbidden`：未授权代码执行、绕过固定 executionPlan 的步骤改写

#### 价值

- 为人工确认和接管提供统一依据。
- 让前端提示、runtime 拦截、audit 记录使用同一套语义。

### 6.4 改进项 D：恢复决策矩阵

#### 目标

明确浏览器执行失败后的标准恢复策略，而不是只靠局部判断。

#### 建议决策

- 定位歧义：先 disambiguation。
- 页面轻微变化：允许重试一次并刷新 observation。
- 条件不满足：`takeover_required`。
- 登录失效或权限不足：直接进入 human control。
- 结构化计划缺失：阻断执行并打审计。

#### 价值

- 降低相似错误在不同入口下行为不一致的问题。
- 让 runtime / recorder / control-plane 恢复语义更统一。

### 6.5 改进项 E：审计与接管视图统一

#### 目标

把 runtime 的 audit event、branch 结果、loop 状态、takeover 记录在产品侧统一呈现。

#### 建议展示项

- 当前执行到哪一步。
- 最近一次 `read_value` 读到了什么。
- `branch` 的条件表达式、人类可读说明和判定结果。
- `loop` 当前第几轮、终止条件是什么。
- takeover 原因和恢复动作。

#### 价值

- 降低排障成本。
- 提高录制导出、发布、执行三阶段的一致性可观测性。

### 6.6 改进项 F：继续收缩 RecorderDebugService

#### 目标

继续把 `RecorderDebugService` 收敛成纯 orchestration layer。

#### 建议方向

- 继续审视剩余 prompt build / control hint / session state merge 是否值得下沉。
- 避免在主服务中重新堆积导出、恢复、验证、格式化逻辑。
- 后续若测试文件继续膨胀，同步拆分 spec。

#### 价值

- 保持录制主服务职责清晰。
- 让后续策略升级更容易落在独立 service 上。

### 6.7 改进项 G：固化 ExecutionPlan 作为唯一运行时契约

#### 目标

明确 `runtimeMetadata.executionPlan` 是浏览器 runtime 的唯一可信执行契约，其他字段只作为兼容、展示或迁移辅助。

#### 设计原则

- runtime 执行优先读取 `release.sourcePayload.runtimeMetadata.executionPlan`。
- `runtimeMetadata.templateSteps` 仅作为兼容或展示辅助，不作为长期主契约。
- `executionFlow` 和 legacy steps 仅用于旧数据兜底，不应继续承载高级语义演进。

#### 建议最小结构

```json
{
  "executionPlanVersion": "browser-recording-ir/v1",
  "templateSteps": [],
  "parameters": [],
  "outputs": [],
  "loopDraft": {},
  "runtimeHints": {},
  "executionLimits": {}
}
```

#### 价值

- 降低多份元数据并存导致的不一致。
- 为后续 branch / loop / recovery 演进提供稳定 IR。
- 让 bridge、publish、runtime 三段围绕同一份结构协作。

### 6.8 改进项 H：发布前 Plan Validation

#### 目标

在 bridge / publish 之前对 `executionPlan` 做结构化校验，尽量把错误拦在发布前，而不是在 runtime 里被动发现。

#### 建议校验项

- `templateSteps` 是否存在且非空。
- `stepId` 是否唯一。
- `branch` 引用的变量是否由前置 `read_value` 或输入参数提供。
- `loop stopWhen` 是否可解析。
- `outputs` 是否有来源。
- 高风险动作是否具备明确策略。

#### 价值

- 降低高级语义在发布后退化为普通 steps 的概率。
- 减少 `branch step missing conditionFn` 这类问题再次出现。

### 6.9 改进项 I：退化治理与 Degraded Mode

#### 目标

当 runtime 遇到缺失元数据或只能 fallback 到旧路径时，避免静默退化，显式输出退化状态与原因。

#### 建议最小返回

```json
{
  "degradedMode": true,
  "degradeReason": "missing runtimeMetadata.executionPlan.loopDraft"
}
```

#### 价值

- 让排障更直接，不需要依靠猜测判断是不是走了 legacy fallback。
- 为后续审计和产品提示提供统一信号。

### 6.10 改进项 J：全链路 Traceability

#### 目标

定义从 runtime 结果一路反查到录制与导出的最小追踪链。

#### 建议最小链路字段

- `recorderSessionId`
- `exportArtifactId`
- `releaseId`
- `skillDraftId`
- `publishedSkillId`
- `runtimeExecutionId`

#### 价值

- 出现异常时可以从发布后 skill 反查到原始录制与导出上下文。
- 方便条件与循环类问题做跨阶段定位。

---

## 7. 下一步任务清单

以下任务按优先级排列，作为下一阶段的设计任务与实施 backlog。

### 7.1 P0：显式状态化 Recorder Prompt

#### 目标

为 `BrowserCommandService` 与 recorder chat 引入统一状态对象 contract。

#### 任务

- 设计 recorder prompt state DTO。
- 在 `RecorderDebugService` 中组装统一状态输入。
- 改造 `BrowserCommandService` prompt 模板。
- 补回归测试，验证多轮录制下的稳定性。

#### 验收标准

- 模型 prompt 中可稳定看到 `previousActionResult / memory / nextGoal`。
- 多轮录制和循环录制场景下，误判率不高于当前实现。

### 7.2 P0：统一动作校验器与风险分级

#### 目标

把动作校验与风险分级从零散逻辑升级为统一模块。

#### 任务

- 定义动作风险等级枚举。
- 新增浏览器动作 validator service。
- 在 recorder 执行前接入 validator。
- 在 runtime 执行前复用相同策略。
- 将高风险动作与 human confirmation / takeover 打通。

#### 验收标准

- 相同动作在 recorder 和 runtime 侧风险判断一致。
- 高风险动作能够被拦截、确认或接管。

### 7.3 P0：固化 ExecutionPlan IR 与 Version

#### 目标

在不大改当前链路的前提下，为浏览器执行计划补齐正式 IR contract 与版本字段。

#### 任务

- 定义 `BrowserRecordingExecutionPlan v1` 的最小结构。
- 在导出、bridge、publish、runtime 文档与代码中统一优先级。
- 增加 `executionPlanVersion` 字段。
- 保持现有字段兼容，不做大规模重构。

#### 验收标准

- runtime 侧的主读取路径被显式定义为 `runtimeMetadata.executionPlan`。
- 新发布 skill 的 source snapshot 中可稳定看到版本化 execution plan。

### 7.4 P0：发布前 Plan Validation

#### 目标

在 bridge / publish 前补一层 execution plan 校验，尽量前置发现问题。

#### 任务

- 新增 plan validation 规则集合。
- 校验 `templateSteps`、`stepId`、`branch variable`、`loop stopWhen`、`outputs`。
- 以轻量方式接入 bridge 或 publish 前置流程。
- 保留兼容模式，不阻断已有健康链路。

#### 验收标准

- 高级语义缺失的 payload 不再静默进入发布态。
- 常见结构问题能在发布前得到明确报错。

### 7.5 P1：恢复决策矩阵

#### 目标

明确常见失败场景的标准恢复路径。

#### 任务

- 归类常见浏览器失败。
- 输出错误类别到恢复策略映射表。
- 在 recorder 和 runtime 中统一接线。
- 增加针对性单测与 E2E 样本。

#### 验收标准

- 常见失败路径不会因入口不同出现截然不同的恢复行为。
- takeover、retry、stop 的策略可追踪、可解释。

### 7.6 P1：审计与接管可视化

#### 目标

统一呈现 branch / loop / takeover / audit 证据。

#### 任务

- 设计浏览器执行审计视图字段。
- 聚合 runtime audit、phase takeover、step results。
- 前端提供执行过程与接管原因展示。

#### 验收标准

- 用户可以直接看到条件判断值、循环轮次、接管原因和恢复动作。

### 7.7 P1：退化治理与 Traceability

#### 目标

补齐退化状态标记和全链路追踪字段，但不改动已跑通的主执行逻辑。

#### 任务

- 定义 `degradedMode / degradeReason` 最小返回结构。
- 增加 release 到 runtime 的关键 trace id 透传策略。
- 明确从 runtime 反查 recorder/export/release 的字段关系。

#### 验收标准

- fallback 到旧路径时可显式识别。
- 出现问题时可从 runtime 结果反查到 release 和导出上下文。

### 7.8 P1：继续拆分 RecorderDebugService 与 Spec

#### 目标

延续当前的小步重构策略，防止主服务和主 spec 再次膨胀。

#### 任务

- 继续检查剩余 wrapper 和 orchestration 边界。
- 按职责拆分 `recorder-debug.service.spec.ts`。
- 每轮拆分后继续跑 diagnostics、单测、重启、真实 E2E。

#### 验收标准

- `RecorderDebugService` 继续收缩。
- Spec 不再成为新的超大文件。

---

## 8. 最小改动落地点与 Patch 顺序

本节用于把“不要大改、只做低风险补强”的原则进一步收敛成可执行补丁包，避免讨论再次发散到重构主链路。

### 8.1 本轮不改

以下内容本轮不作为改造目标：

- 不改 `recorder export -> release snapshot -> runtime execution` 主链路。
- 不重写 `RecorderDebugService` 的录制交互模型。
- 不改 release / skill draft / publish 的基本流程语义。
- 不改 browser-worker 的基础动作执行协议。
- 不推翻当前已验证通过的 loop / branch 样本。

### 8.2 本轮只加

本轮推荐只补以下低风险能力：

- `executionPlanVersion`
- `executionPlan first` 的读取优先级显式化
- `executionPlan validator`
- `degradedMode / degradeReason`
- trace ids
- runtime evidence

### 8.3 Patch 1：固化 ExecutionPlan Contract

#### 目标

不改变当前执行逻辑，只把已有的执行计划结构正式化、版本化，并把读取优先级写清楚。

#### 建议最小结构

```json
{
  "executionPlanVersion": "browser-recording-ir/v1",
  "templateSteps": [],
  "parameters": [],
  "outputs": [],
  "loopDraft": {},
  "runtimeHints": {},
  "executionLimits": {}
}
```

#### 建议落点

- `RecorderExportService`
- `RecorderExportAssemblyService`
- `CapabilityReleasePublishService`
- `CapabilityReleaseBrowserRecordingService`
- `CapabilityReleaseRuntimeService`

#### 验收标准

- 新导出的 `skillDraft.publishPayload` 中包含 `executionPlanVersion`。
- bridge 后的 `sourcePayload.runtimeMetadata.executionPlan` 中包含 `executionPlanVersion`。
- runtime 可明确记录当前使用的 `executionPlanVersion`。

### 8.4 Patch 2：加 Plan Validation

#### 目标

在不影响健康数据路径的前提下，尽量把明显坏数据拦在 bridge / publish 前。

#### 建议新增

- `BrowserRecordingExecutionPlanValidatorService`

#### 建议函数

- `validateForBridge(payload)`
- `validateForPublish(payload)`
- `validateForRuntime(payload)`

#### 第一阶段建议分级

`error`:

- 没有 `templateSteps`
- `stepId` 重复
- `branch` 引用不存在的变量
- 标记为 loop skill 但没有可解析的 `stopWhen`

`warning`:

- 没有 `outputs`
- 没有 `executionLimits`
- 没有 trace ids

#### 验收标准

- 正常 E2E 不受影响。
- 缺失关键 branch / loop 元数据的 payload 不能静默发布。
- runtime fallback 时能明确标识原因。

### 8.5 Patch 3：补 Runtime 可观测性

#### 目标

让运行时在不改变主执行逻辑的前提下，具备最小可排障能力。

#### 建议最小结果结构

```json
{
  "executionPlanVersion": "browser-recording-ir/v1",
  "degradedMode": false,
  "degradeReason": null,
  "trace": {
    "recorderSessionId": "...",
    "exportArtifactId": "...",
    "releaseId": "...",
    "skillDraftId": "...",
    "publishedSkillId": "...",
    "runtimeExecutionId": "..."
  },
  "runtimeEvidence": {
    "currentStepId": "...",
    "currentLoopIteration": 3,
    "lastReadValue": {
      "var": "statusText",
      "value": "..."
    },
    "lastBranchDecision": {
      "condition": "...",
      "result": "continue"
    },
    "takeoverReason": null
  }
}
```

#### 第一阶段原则

- 先输出最小 trace 和 evidence，不追求一次性覆盖所有字段。
- 先保证 branch / loop / takeover 场景可解释，再逐步补细。

### 8.6 推荐实施顺序

在当前阶段，推荐的低风险落地顺序如下：

1. `executionPlanVersion`
2. `runtime executionPlan first` 读取优先级显式化
3. `bridge / publish Plan Validation`
4. `degradedMode / degradeReason`
5. trace id 透传
6. runtime branch / loop evidence 记录
7. 再做动作风险分级和恢复矩阵

### 8.7 模块改动速查表

| 模块                                       | 当前评价                                | 本轮建议                                                |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| `AIControls.tsx`                           | 录制 UI、export、save、publish 职责较重 | 先不大拆，确保新路径继续作为默认发布路径                |
| `RecorderDebugService`                     | 主编排职责合理，已持续拆分              | 继续保持 orchestration，不再塞 export / validation 细节 |
| `RecorderTemplateExportService`            | branch / loop 语义生成核心              | 后续可补 explanation / debug metadata，但不影响本轮     |
| `RecorderExportAssemblyService`            | export 总装边界清晰                     | 增加 `executionPlanVersion` 透传                        |
| `CapabilityReleasePublishService`          | bridge 入口合理                         | 接入 Plan Validation，并保留兼容模式                    |
| `CapabilityReleaseBrowserRecordingService` | runtime plan 构造核心                   | 显式固化 `executionPlan first` 读取优先级               |
| `CapabilityReleaseRuntimeService`          | 执行 branch / loop / takeover 主入口    | 补 `degradedMode`、trace、runtime evidence              |
| `browser-worker`                           | 执行层相对稳定                          | 不引入自由代码执行，继续保持受控动作模型                |

### 8.8 新旧路径兼容策略

当前项目仍同时存在：

- 老路径：前端直接步骤转模板
- 新路径：`recorder export -> exportArtifacts -> 保存模板 / 发布 skill`

本轮不强删老路径，建议采用以下兼容策略：

1. 新建模板和新发布 skill 默认优先走新路径。
2. 老路径产物在文档和产品上明确标记为 `legacy`。
3. legacy 模板或 skill 如果缺少 `executionPlan`，runtime 返回 `degradedMode = true`。
4. 前端可提示：该模板不支持完整的高级条件 / 循环语义。

这套策略的目标不是立即迁移所有历史数据，而是让主链路逐步自然收敛，同时避免旧数据“看起来能跑、实际语义降级”。

---

## 9. 轻量优化约束

以下约束适用于本轮及后续一段时间内的浏览器链路优化：

- 不推翻现有 `recorder export -> release snapshot -> runtime execution` 主链路。
- 不把当前体系改造成另一套 MCP-first 架构。
- 不在基本链路已跑通时引入大规模 schema 重写。
- 新增 contract、validation、trace 字段时优先保持向后兼容。
- 先补“明确规则和观测”，再补“更复杂的语义能力”。

---

## 10. 验证计划

后续所有相关改动都应遵循同一套验证节奏：

### 10.1 静态验证

- TypeScript diagnostics。
- 受影响 service / controller / runtime 文件的类型检查。

### 10.2 单元测试

- `recorder-debug.service.spec.ts`
- 新拆分 service 对应 spec
- capability release runtime 相关测试

### 10.3 集成验证

- bridge -> approve -> publish-skill
- release source snapshot 内容检查
- published skill runtime 结果检查

### 10.4 真实 E2E

至少持续验证两类真实样本：

- 循环执行样本：直到命中终止条件。
- 条件执行样本：一组走 `continue`，一组走 `takeover`。

### 10.5 本阶段回归基线

当前文档建立时，已验证：

- 循环浏览器 skill 可执行 3 轮后终止。
- 条件模板与重新桥接发布后的条件 skill 都能正常运行。

---

## 11. 受影响文件清单

以下文件是理解和推进本设计的核心代码边界：

### 11.1 录制与导出

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-debug.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/browser-command.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-structure-probe.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-observation.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-snapshot.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-disambiguation.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-export-assembly.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-template-export.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-export.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-loop.service.ts`

### 11.2 发布与运行时

- `apps/backend/core/platform/src/modules/capability-release/capability-release-publish.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-skill-draft.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-runtime.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-browser-recording.service.ts`

### 11.3 浏览器执行与恢复

- `apps/backend/runtime/browser-worker/src/modules/browser/adapters/playwright-cli.adapter.ts`
- `apps/backend/orchestration/control-plane/src/modules/execution/execution-human-control.service.ts`
- `apps/backend/orchestration/control-plane/src/modules/execution/runtime-execution.orchestrator.ts`

---

## 附：一句话总结

当前项目最正确的方向不是“让 LLM 自由控制浏览器”，而是：

```text
让 LLM 在录制态负责理解和探索，
把探索结果固化成 templateSteps / executionPlan，
再让平台 runtime 以结构化语义严格执行，
并在条件、循环、失败场景下接入审计与人工接管。
```

下一阶段最值得推进的工作不是更换技术名词，而是继续补强五件事：

- 显式状态化控制
- 统一动作安全约束
- 固化 execution plan contract
- 补齐发布前校验与退化治理
- 更清晰的恢复与可观测性
