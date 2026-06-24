# AI 浏览器录制到模板发布调用整体流程与现状校对 v1.2

> 版本：v1.2  
> 日期：2026-06-21  
> 状态：已按当前代码校对，持续更新
> 定位：根目录总览文档；浏览器执行细分规范请优先配合 `docs/design/v4/` 中的浏览器专题文档一起阅读

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [当前真实链路总览](#2-当前真实链路总览)
3. [端到端主流程](#3-端到端主流程)
4. [核心模块职责](#4-核心模块职责)
5. [当前设计与业界最佳实践的对照](#5-当前设计与业界最佳实践的对照)
6. [当前仍值得推进的改进项](#6-当前仍值得推进的改进项)
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
- 标记哪些能力已经完成，哪些能力仍处于收口阶段。

### 1.1.1 与 v4 文档的关系

本文档负责回答“浏览器链路整体是怎么串起来的”，重点是跨模块总览：

- 录制
- 导出
- bridge / publish
- published skill runtime
- control-plane 展示、循环与接管

`docs/design/v4/` 中的浏览器专题文档负责回答“某一块该怎么设计”，重点是分主题细化：

- 浏览器执行指南：AI 输入输出、执行边界、步骤规范
- Browser Loop Workflow：loop 从 runtime 黑盒迁移到 workflow 可见模型
- Browser Phase Execution and Recovery：phase 切分、接管、恢复与展示契约

因此，本文档不是 `v4` 的替代品，而是它们的入口总览与现状校对。

### 1.2 本次范围

本文档只关注浏览器录制与浏览器 Skill 相关链路，不展开以下内容：

- 文档模板与 Carbone 流程。
- 非浏览器类型 Skill 的设计细节。
- 通用 Planner 全链路改造。
- 平台级安全治理的完整制度设计。

本次文档更新的明确约束：

- 基本链路已经跑通，当前重点是“校对现状、收口契约、补充可观测性与前端展示”，不再把已完成能力继续写成待办。

### 1.3 当前结论前提

本文基于当前代码与最近真实验证结果建立，已确认：

- 浏览器循环执行已经过真实 E2E 验证，可执行到终止条件。
- 浏览器条件分支已经过真实 E2E 验证，支持 `continue` 与 `takeover`。
- `RecorderDebugService` 已进入持续拆分阶段，聊天流、执行、观察刷新、导出装配等职责已经拆分到独立 service。
- 录制态已经接入统一动作风险分级、阻断和确认逻辑。
- 发布态已经接入 `browser-recording-ir/v1`、执行计划校验器、`degradedMode / degradeReason` 与 trace 字段。
- control-plane 已支持 `browser_loop_workflow` 规划与 loop-aware 归一化，不再只依赖 runtime 黑盒循环。

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

这条链路有三个重要特点：

- 探索态和生产态已经明显分层。
- 条件、循环、接管等复杂语义依赖结构化 `templateSteps` 与 `runtimeMetadata.executionPlan`，而不是依赖模型在运行时自由发挥。
- 对于需要逐步可见、可接管的浏览器循环执行，control-plane 已开始将 loop 提升为 workflow 可见模型，而不是继续完全留在 runtime 内部吞掉。

---

## 3. 端到端主流程

### 3.1 阶段 A：录制与聊天控制

前端录制界面由 `AIControls.tsx` 驱动，负责维护 recorder 相关状态，并调用后端 `recorder-debug` 接口。

主流程如下：

```text
用户输入自然语言
-> 前端调用 /ai/recorder-debug/chat
-> RecorderDebugService.chat()
-> observePage() / buildCandidatesAndTrace()
-> RecorderDebugChatFlowService.resolveFlow()
-> BrowserCommandService.parseCommand()
-> BrowserActionValidatorService.assessCommands()
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
- `pendingRiskConfirmation`
- `suggestedParameters`
- `candidates / candidateTrace`

### 3.2 阶段 B：页面观察与元素理解

当前项目优先使用结构化页面观察，而不是纯截图。

页面理解来源主要包括：

- DOM 结构探测脚本。
- 页面文本读取结果。
- snapshot / accessibility 风格的结构化信息。
- observation candidate 提示。

当前实现中，结构探测与 observation 装配已不再只是“按钮和输入框列表”，而是会进一步形成候选上下文，主要包括：

- `inputs`
- `buttons`
- `rows`
- `regions`
- `headings`
- `links`
- `pageSemantics`
- `candidates`
- `candidateTrace`
- `suggestedParameters`

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

命令进入录制执行层后，会先做统一动作校验与必要的风险确认，再调用 browser worker 执行实际浏览器动作。

执行完成后：

- 成功命令才会写入 `executedCommands`。
- 失败命令不会污染录制导出。
- 执行后会刷新 observation，作为下一轮自然语言解析的上下文。
- 高风险动作会进入确认分支，而不是直接静默执行。

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
-> BrowserRecordingExecutionPlanValidatorService.validateForRuntime()
-> CapabilityReleaseBrowserRecordingService.buildRuntimePlan()
-> 优先读取 runtimeMetadata.executionPlan
-> 调 browser-worker 执行具体步骤
```

在 published skill runtime 阶段：

- 普通步骤按顺序执行。
- `read_value` 会把页面读取结果写入变量。
- `branch` 会基于 `conditionFn` 判断 `continue / stop / takeover`。
- 发布态执行会输出 `executionPlanVersion`、`degradedMode / degradeReason`、trace 与最小 runtime evidence。

补充说明：

- 对“已发布 skill 的参数化执行”场景，平台仍会消费 `runtimeMetadata.executionPlan` 构造 runtime plan。
- 对“执行中心 / control-plane 需要逐步展示和接管”的场景，当前已经有 `browser_loop_workflow` 规划与 `loop_workflow` 归一化路径，用来保留轮次、步骤和恢复点可见性。

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

### 4.2 录制后端编排层

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts`

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

- `apps/backend/runtimes/browser-worker/src/modules/browser/...`

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

### 5.2 已经显式落地的能力

| 方向                     | 当前状态                                             | 问题                            |
| ------------------------ | ---------------------------------------------------- | ------------------------------- |
| Action Validator         | 已有统一 `BrowserActionValidatorService`             | recorder 侧已落地，runtime 侧仍可继续收口 |
| 风险动作确认             | 已有 `safe/caution/confirm/forbidden` 和确认流程     | 前端提示体验仍可继续优化        |
| ExecutionPlan 契约优先级 | 已有 `executionPlanVersion` 和 `executionPlan first` | 旧数据兼容路径仍需长期清理      |
| Plan Validation          | 已有 bridge/publish/runtime 三段校验器               | 规则还可继续扩展                |
| Traceability             | 已有 `recorderSessionId/exportArtifactId/...` trace  | 跨产品展示仍不够集中            |
| Loop Workflow            | 已有 `browser_loop_workflow` 和 `loop_workflow`      | 文档与产品口径还需统一          |

### 5.3 当前仍未完全收口的能力

| 方向              | 当前状态                                           | 剩余问题                    |
| ----------------- | -------------------------------------------------- | --------------------------- |
| ReAct 状态结构    | 已有 observation、execution result、control hints  | 还没有统一成显式状态对象    |
| 策略化恢复        | 已有 freeze / resume / reconcile                   | 还缺统一恢复决策矩阵        |
| 审计可视化        | 已有 audit、phase takeover、execution summary      | 详情页/抽屉口径仍需继续统一 |
| 旧路径兼容治理    | 已有 degradedMode 和 fallback 识别                 | legacy 数据仍需逐步收敛     |
| Trace 展示        | trace 字段已存在                                   | 缺少稳定的产品展示入口      |

### 5.4 不建议直接照搬的方向

- 不建议把当前体系重构成 MCP-first。
- 不建议把截图视觉模型作为主观察源。
- 不建议让模型直接执行任意 Playwright 代码。
- 不建议为了引入“行业术语”而弱化现有 `templateSteps + executionPlan` 的结构化优势。

---

## 6. 当前仍值得推进的改进项

### 6.1 改进项 A：显式状态化 Recorder Prompt

#### 现状

当前已经有 observation、candidate、control hints、risk confirmation，但还没有固化成统一的 recorder state DTO。

#### 继续推进的目标

把录制态模型输入从“多块上下文拼接”进一步升级成更显式的状态对象，减少长会话漂移。

### 6.2 改进项 B：恢复决策矩阵

#### 现状

当前已有 disambiguation、retry、takeover、resume、reconcile，但不同入口下的恢复策略仍然偏分散。

#### 继续推进的目标

明确常见失败场景的标准恢复策略，统一 recorder、runtime、control-plane 三侧口径。

### 6.3 改进项 C：审计与接管视图统一

#### 现状

runtime 已有 audit、branch/loop evidence、phase takeover 与 execution summary，但产品展示仍在持续收口。

#### 继续推进的目标

在执行详情页、抽屉、聊天卡片中，统一展示条件判断、循环轮次、接管原因与恢复动作。

### 6.4 改进项 D：继续收缩 RecorderDebugService

#### 现状

`RecorderDebugService` 已拆出聊天流、执行、观察刷新、导出等子服务，但主 orchestrator 仍有继续收缩空间。

#### 继续推进的目标

保持主服务只承担 orchestration，避免重新堆回策略与格式化逻辑。

### 6.5 改进项 E：旧路径兼容治理

#### 现状

当前已具备 `executionPlanVersion`、validator、`degradedMode` 和 fallback 标识，但 legacy 模板/skill 仍然存在。

#### 继续推进的目标

让旧路径继续可识别、可提示、可逐步迁移，而不是长期与主路径并存混淆。

### 6.6 改进项 F：全链路 Trace 展示

#### 现状

trace 字段已经在 export、publish、runtime 中存在，但还没有形成稳定的产品反查入口。

#### 继续推进的目标

让发布后问题可以稳定反查到 recorder session、export artifact、release、published skill 与 runtime execution。

---

## 7. 下一步任务清单

以下任务仅保留尚未完全收口、仍值得继续推进的部分。

### 7.1 P0：显式状态化 Recorder Prompt

- 为 `BrowserCommandService` 与 recorder chat 引入统一状态对象 contract。
- 让 prompt 能稳定看到 `previousActionResult / memory / nextGoal / riskLevel / candidateActions`。

### 7.2 P0：恢复决策矩阵与错误分类

- 明确定位歧义、页面轻微变化、权限问题、结构化计划缺失等场景的标准恢复路径。
- 统一 `disambiguation / retry / takeover / stop / resume` 的判定口径。

### 7.3 P0：审计与接管视图统一

- 继续统一执行详情页、抽屉与聊天卡片中的 branch / loop / takeover 展示。
- 让用户能直接看到条件判断值、循环轮次、接管原因和恢复动作。

### 7.4 P1：Legacy 路径治理

- 明确 legacy 模板和 skill 的产品提示与运行时退化表现。
- 逐步缩小“旧路径看起来能跑、实际语义降级”的灰区。

### 7.5 P1：继续拆分 RecorderDebugService 与 Spec

- 延续当前小步拆分策略，防止主服务和主 spec 再次膨胀。
- 继续把 orchestration 外的策略、格式化、状态组装下沉到独立 service。

### 7.6 P1：Traceability 展示闭环

- 在产品侧提供稳定入口，让 runtime 结果能反查 recorder/export/release/published skill。

---

## 8. 最小改动落地点与 Patch 顺序

本节改为记录“当前已经落地的低风险补强”和“剩余推荐顺序”，避免继续把已完成事项写成 patch 计划。

### 8.1 已完成的低风险补强

当前已经落地：

- `browser-recording-ir/v1`
- `executionPlan first` 的读取优先级显式化
- `BrowserRecordingExecutionPlanValidatorService`
- `degradedMode / degradeReason`
- trace ids
- runtime evidence
- recorder 侧动作风险分级和确认逻辑

### 8.2 当前仍不建议大改的部分

- 不推翻 `recorder export -> release snapshot -> runtime execution` 主链路。
- 不重写 `RecorderDebugService` 的录制交互模型。
- 不改 release / skill draft / publish 的基本流程语义。
- 不改 browser-worker 的基础动作执行协议。
- 不把当前体系强行改造成 MCP-first。

### 8.3 推荐继续收口的顺序

1. 统一 recorder prompt state contract
2. 统一恢复决策矩阵
3. 统一执行详情页 / 抽屉 / 聊天的审计与接管展示
4. 收口 legacy 路径提示与降级口径
5. 持续拆分 recorder orchestration 与 spec

### 8.4 模块改动速查表

| 模块                                       | 当前评价                                | 本轮建议                                                |
| ------------------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| `AIControls.tsx`                           | 录制 UI、export、save、publish 职责较重 | 先不大拆，确保新路径继续作为默认发布路径                |
| `RecorderDebugService`                     | 主编排职责合理，已持续拆分              | 继续保持 orchestration，不再塞 export / validation 细节 |
| `RecorderTemplateExportService`            | branch / loop 语义生成核心              | 后续可补 explanation / debug metadata，但不影响本轮     |
| `RecorderExportAssemblyService`            | export 总装边界清晰                     | 继续保持 `executionPlan` 与导出资产装配边界             |
| `CapabilityReleasePublishService`          | bridge 入口合理                         | 继续保留 validator 与兼容模式                           |
| `CapabilityReleaseBrowserRecordingService` | runtime plan 构造核心                   | 与 control-plane loop workflow 口径继续收敛            |
| `CapabilityReleaseRuntimeService`          | 执行 branch / loop / takeover 主入口    | 继续补强 evidence 与 trace 的对外展示                   |
| `browser-worker`                           | 执行层相对稳定                          | 不引入自由代码执行，继续保持受控动作模型                |

### 8.5 新旧路径兼容策略

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

### 10.5 当前回归基线

当前文档校对时，已验证：

- 循环浏览器 skill 可执行多轮后终止。
- 条件模板与重新桥接发布后的条件 skill 都能正常运行。
- 录制态高风险动作存在确认分支，不再直接静默执行。
- 发布态可读取 `executionPlanVersion`、validator 结果和 `degradedMode` 相关信号。
- control-plane 已能对 browser loop 生成 workflow-aware 归一化结果，并在执行详情中展示轮次与接管信息。

---

## 11. 受影响文件清单

以下文件是理解和推进本设计的核心代码边界：

### 11.1 录制与导出

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-chat-flow.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/intent/browser-command.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/intent/atomic-parsers/browser-action-validator.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-structure-probe.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-observation.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-snapshot.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/intent/recorder-disambiguation.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/export/recorder-export-assembly.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/export/recorder-template-export.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/export/recorder-export.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/loop/recorder-loop.service.ts`

### 11.2 发布与运行时

- `apps/backend/core/platform/src/modules/capability-release/capability-release-publish.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-skill-draft.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-runtime.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/capability-release-browser-recording.service.ts`
- `apps/backend/core/platform/src/modules/capability-release/browser-recording-execution-plan-validator.service.ts`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/export/browser-recording-execution-plan.ts`

### 11.3 浏览器执行、控制平面与展示

- `apps/backend/runtimes/browser-worker/src/modules/browser/adapters/playwright-cli.adapter.ts`
- `apps/backend/execution-control/control-plane/src/modules/execution/step-runner/planning/execution-planning.service.ts`
- `apps/backend/execution-control/control-plane/src/modules/execution/step-runner/planning/execution-plan-normalization.service.ts`
- `apps/backend/execution-control/control-plane/src/modules/execution/step-runner/browser/browser-loop-workflow-plan.builder.ts`
- `apps/backend/execution-control/control-plane/src/modules/execution/human-control/execution-human-control.service.ts`
- `apps/backend/execution-control/control-plane/src/modules/execution/step-runner/runtime/runtime-execution.orchestrator.ts`
- `apps/frontend/portal/src/features/executions/pages/ExecutionDetailPage.tsx`

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
- 统一恢复策略
- 收口 legacy 与降级治理
- 继续收缩 recorder orchestration
- 更清晰的恢复与可观测性
