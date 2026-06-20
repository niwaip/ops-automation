# 浏览器模版工作流条件分歧增强方案 v2.3

> 版本：v2.3  
> 日期：2026-06-15  
> 状态：待实现

---

## 目录

1. [目标与范围](#1-目标与范围)
2. [项目现状与整合性校对](#2-项目现状与整合性校对)
3. [核心决策](#3-核心决策)
4. [详细方案](#4-详细方案)
   - 4.1 [录制阶段改造](#41-录制阶段改造)
   - 4.2 [AI 条件分析接口](#42-ai-条件分析接口)
   - 4.3 [模板数据结构扩展](#43-模板数据结构扩展)
   - 4.4 [测试与执行阶段](#44-测试与执行阶段)
   - 4.5 [模板评审与发布](#45-模板评审与发布)
   - 4.6 [Skill 绑定与 AI 调用](#46-skill-绑定与-ai-调用)
   - 4.7 [开发拆分顺序](#47-开发拆分顺序)
5. [受影响文件清单](#5-受影响文件清单)
6. [风险与边界](#6-风险与边界)
7. [验证计划](#7-验证计划)
8. [开发任务拆单](#8-开发任务拆单)

---

## 1. 目标与范围

### 1.1 本次目标

本次仅增强**浏览器模版工作流**，让录制出来的浏览器模板支持“条件分歧判断”，并保证该能力在以下链路中完整可用：

```text
录制 -> 测试 -> review/publish -> 绑定/发布 skills -> AI 调用
```

目标是让用户在浏览器录制过程中，能够把某一步设置为“条件分歧点”，由 AI 基于当前页面内容自动生成判断步骤；之后该模板在测试、模板发布、Skill 绑定和 AI 调用时都按同一套模板语义运行。

### 1.2 本次范围

本次范围只包括以下内容：

- 浏览器模版录制面板中插入条件分歧点。
- AI 根据当前页面状态和用户意图生成条件判断步骤。
- 浏览器模板新增 `read_value`、`branch`、`takeover_gate` 三类步骤。
- 浏览器模板测试执行、正式执行、发布后的 Skill 执行均支持新步骤。
- 条件不满足时复用现有 `HUMAN_CONTROL` / 接管 / 通知链路。
- AI 调用已发布 Skill 时，能够正常消费包含条件步骤的浏览器模板。

### 1.3 明确不在本次范围

以下内容**不属于本次任务**：

- 不做平台级 Temporal 通用分支能力抽象。
- 不扩展 builtin activity 体系。
- 不新增“定时执行 Skills”能力。
- 不建设统一调度中心、统一触发层或通用 schedule 模型。
- 不重构全项目执行框架，只修改浏览器模版工作流相关链路。

---

## 2. 项目现状与整合性校对

### 2.1 当前真实链路

结合当前代码，浏览器模版工作流的真实链路比文档概念链路更具体，可拆成以下几个实际节点：

```text
录制阶段
  AIControls.tsx 维护 recorder 内部的 templateSteps
  -> 用户确认后调用 templateApi.create()
  -> 后端 TemplateService 保存 TemplateJSON

测试阶段
  AIControls.tsx 调用 sessionApi.create() / sessionApi.start()
  -> 以 template_id 启动测试会话
  -> 浏览器执行链按模板步骤执行

模板发布阶段
  templateApi.submitForReview(id)
  -> templateApi.publish(id, reviewedBy)
  -> 模板状态从 DRAFT -> REVIEW -> PUBLISHED

Skill 绑定阶段
  skillApi.create() / skillApi.update()
  -> SkillConfigDTO.templateId 绑定浏览器模板

AI 调用阶段
  planner.service.ts 在匹配到 skill 后读取 matchedSkill.templateId
  -> 进入现有 Skill 执行链
  -> 底层执行绑定的浏览器模板
```

### 2.2 当前已确认可复用能力

本次设计应尽量复用现有能力，不额外扩张系统边界：

- 浏览器录制面板已存在，主入口是 `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`。
- 浏览器模板后端已存在，主入口是 `apps/backend/domain/browser-template/src/modules/template/template.service.ts`。
- 浏览器模板校验器已存在，主入口是 `apps/backend/domain/browser-template/src/validators/template.validator.ts`。
- Playwright 脚本编译器已存在，但当前仅有一个入口文件 `apps/backend/domain/browser-template/src/compiler/playwright-to-json.ts`。
- 浏览器模板测试链已存在，录制页当前通过 `sessionApi.create/start` 触发测试，而不是另一套临时测试器。
- 模板评审与发布接口已存在，分别是 `POST /templates/:id/review` 和 `POST /templates/:id/publish`。
- Skill 管理已支持用 `templateId` 绑定模板。
- AI planner 侧已会把 `matchedSkill.templateId` 带入后续执行决策。
- `human_control` 通知和接管链路已可直接复用。

### 2.3 当前结构上的整合性结论

基于现状，本次方案要和以下事实保持一致：

#### 结论 1：录制保存链路的主改动点在 `AIControls.tsx`

当前录制页不是调用 `PlaywrightCompiler` 来保存模板，而是在前端把 recorder 内部的 `templateSteps` 直接转换为后端 `steps`，再调用 `templateApi.create()`。

因此本次“插入条件分歧点”的真正主入口是：

- `AIControls.tsx` 中的步骤状态管理
- `AIControls.tsx` 中的保存逻辑
- `AIControls.tsx` 中的测试逻辑

而不是只改 `playwright-to-json.ts`。

#### 结论 2：模板类型、校验器、前端 API 类型必须一起改

当前模板相关结构在以下几处各有一份：

- 后端领域类型：`apps/backend/domain/browser-template/src/types/template.types.ts`
- 后端校验器：`apps/backend/domain/browser-template/src/validators/template.validator.ts`
- 前端模板 API 类型：`apps/frontend/portal/src/api/template.ts`

如果只改其中一处，会出现：

- 前端能保存但后端校验失败
- 后端支持但前端类型不允许传递
- 模板发布成功但前端列表/详情缺字段

因此本次必须把这三层一起同步。

#### 结论 3：执行侧的关键入口是执行计划归一化和浏览器执行编排

当前 Control Plane 并不是直接“按模板 JSON 原样执行所有动作”，而是先把动作归一化成运行时命令，再进入浏览器执行链。

从现有代码看，本次至少需要关注：

- `execution-plan-normalization.service.ts`
- `browser-execution-constants.ts`
- `execution-browser-orchestration.service.ts`
- 相关 step / phase / runtime session 处理服务

因此文档中的“浏览器执行器支持新步骤”必须落实成更具体的改造点，而不是泛写“修改执行器”。

#### 结论 4：模板发布阶段应使用现有 `review -> publish` 语义

当前项目里模板状态流转不是抽象的“release service”，而是：

- `submitForReview`
- `publish`

因此文档后续统一使用“评审与发布”表述，避免让开发误以为还需要再新建一套 release 机制。

#### 结论 5：Skill 与 AI 调用的整合点是 `templateId`

当前 Skill 配置对象里已经有 `templateId` 字段，AI planner 在匹配 Skill 时也会透传 `templateId`。

因此本次目标不是新建一套“分支 Skill 协议”，而是保证：

- 带条件步骤的模板能被正常绑定到 Skill
- AI 匹配到 Skill 后，继续按现有 `templateId` 方式执行

### 2.4 当前已发现的一致性风险

为了让方案真正可落地，以下不一致点应在文档中明确为实施前提：

- `template.validator.ts` 当前还不认识 `read_value / branch / takeover_gate`。
- `template.validator.ts` 的动作列表里出现 `press`，而领域类型里是 `press_key`，这里本身就有一处现存不一致。
- `apps/frontend/portal/src/api/template.ts` 当前 `TemplateStep` 结构还没有 `branch`、`output_var` 等扩展字段。
- `execution-plan-normalization.service.ts` 当前只认识常规浏览器动作，还没有分支控制类动作。
- `AIControls.tsx` 当前保存模板时会自行把 recorder step 映射为 backend step，因此新增步骤不能只在后端注入，前端映射逻辑也必须补齐。

### 2.5 本次设计约束

- 新能力必须以“浏览器模板步骤”的形式存在，而不是额外旁路配置。
- 测试、评审、发布、AI 调用必须消费同一份模板语义，不能录制一套、执行另一套。
- 前端不提供复杂脚本编辑器，条件逻辑主要由 AI 生成。
- 只在必要位置扩展后端接口，不做平台级架构升级。
- 文档中引用的服务名、接口名、文件路径要尽量贴近现有代码。

---

## 3. 核心决策

| 议题         | 确认方案                                | 说明                          |
| ------------ | --------------------------------------- | ----------------------------- |
| 功能定位     | 仅浏览器模版工作流增强                  | 不上升为平台通用能力          |
| 条件录入方式 | 在录制面板中插入条件分歧点              | 保持录制心智一致              |
| AI 输入来源  | 后端直接读取当前页面状态                | 不要求前端上传 DOM 片段       |
| 条件步骤表示 | 扩展浏览器模板步骤类型                  | 进入模板 JSON，参与测试与发布 |
| 条件失败动作 | `takeover` / `stop` / `continue`        | 默认优先支持 `takeover`       |
| 接管通知     | 复用现有 `human_control`                | 不新增通知模块                |
| 前端展示方式 | 展示人类可读描述，只读                  | 不做脚本编辑器                |
| 发布兼容     | 新步骤进入模板校验、评审、发布链路      | 保证发布后行为一致            |
| Skill 兼容   | Skill 继续通过 `templateId` 绑定模板    | 不另起一套绑定协议            |
| AI 调用兼容  | 已发布 Skill 直接执行包含条件步骤的模板 | 不另起一套调用协议            |

---

## 4. 详细方案

### 4.1 录制阶段改造

#### 4.1.1 交互目标

用户在录制浏览器流程时，可以在某个步骤后插入条件判断，让后续执行根据页面内容决定：

- 继续执行
- 直接停止
- 进入人工接管

#### 4.1.2 当前代码中的实际入口

本次录制改造的核心入口不是一个抽象“录制模块”，而是 `AIControls.tsx` 中以下几类逻辑：

- `templateSteps` 状态管理
- 保存模板前的步骤转换逻辑
- 生成参数 schema 的逻辑
- 测试模板的入口按钮与处理逻辑

因此新增条件分歧点时，至少需要在录制页完成：

- 为步骤卡片增加“插入条件分歧点”入口
- 支持在 `templateSteps` 中插入结构化分支步骤
- 在保存为后端 `steps` 时，保留这些新步骤的结构

#### 4.1.3 录制面板交互

在现有录制步骤列表中，每个步骤卡片增加一个“插入条件分歧”入口：

```text
step_5  click [data-testid="row-0"]
[ 设置为条件分歧点 ]
```

点击后打开条件设置弹窗：

```text
- 用户输入自然语言判断意图
  例如：如果毛利率大于 20% 则继续，否则转人工审核

- 用户选择条件不满足时的动作
  takeover / stop

- 点击“AI 生成判断指令”
```

#### 4.1.4 录制阶段生成结果

AI 分析完成后，前端只读展示将要插入的步骤摘要：

- `read_value`：读取哪个元素、用什么方式读取、写入哪个变量。
- `branch`：判断描述、满足时动作、不满足时动作、接管原因。

用户确认后，将其插入当前模板步骤序列。

#### 4.1.5 UI 原则

- 不暴露复杂脚本编辑能力。
- 优先展示“自然语言描述 + 关键字段摘要”。
- 允许“重新生成”，不允许在前端任意编辑底层逻辑。
- 所有插入后的步骤都直接进入模板 JSON，后续测试和发布使用同一份数据。

### 4.2 AI 条件分析接口

#### 4.2.1 接口目标

在录制阶段，由 AI 根据“当前页面内容 + 用户意图”生成条件步骤规格。

#### 4.2.2 请求接口

```http
POST /ai/analyze-branch-condition
```

请求体：

```json
{
  "runtimeSessionId": "string",
  "userIntent": "如果毛利率大于20%则继续，否则需要人工审核",
  "onMismatch": "takeover"
}
```

返回体：

```json
{
  "branchStepSpec": {
    "readSelectors": [".gross-margin-cell", "[data-field='grossMargin']"],
    "readMethod": "innerText",
    "outputVar": "gross_margin_raw",
    "conditionFn": "(ctx) => { const v = parseFloat(String(ctx.gross_margin_raw || '').replace('%','')); return v >= 20; }",
    "takeoverReason": "当前毛利率 ${gross_margin_raw} 低于20%阈值，需人工确认",
    "onMismatch": "takeover",
    "onMatch": "continue",
    "description": "判断毛利率是否达到 20% 自动处理门槛"
  }
}
```

#### 4.2.3 后端处理流程

```text
前端提交 runtimeSessionId + userIntent
-> AI Orchestrator 调用 Browser Worker 获取当前页面状态
-> 读取页面文本 / HTML 等必要内容
-> 组装 Prompt 调用 LLM
-> 解析为 BranchStepSpec
-> 返回前端预览
```

#### 4.2.4 设计要求

- 页面内容由后端读取，前端只传 `runtimeSessionId`。
- AI 输出必须是结构化 JSON，而不是自然语言散文。
- 后端必须校验 AI 输出的字段完整性，避免无效步骤进入模板。
- 生成逻辑只服务浏览器模版录制，不扩展为通用工作流分析服务。

### 4.3 模板数据结构扩展

#### 4.3.1 ActionType 扩展

在浏览器模板动作类型中新增：

```typescript
export type ActionType =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'wait'
  | 'select'
  | 'check'
  | 'screenshot'
  | 'assert'
  | 'search'
  | 'smart_search'
  | 'hover'
  | 'press_key'
  | 'scroll'
  | 'type_text'
  | 'get_text'
  | 'snapshot'
  | 'read_page'
  | 'list_search_results'
  | 'click_result'
  | 'switch_latest_tab'
  | 'read_value'
  | 'branch'
  | 'takeover_gate';
```

#### 4.3.2 BranchStepSpec

AI 输出的条件规格：

```typescript
export interface BranchStepSpec {
  readSelectors: string[];
  readMethod: 'innerText' | 'textContent' | 'value';
  outputVar: string;
  conditionFn: string;
  takeoverReason: string;
  onMismatch: 'takeover' | 'stop' | 'continue';
  onMatch: 'continue' | 'stop';
  description: string;
}
```

#### 4.3.3 TemplateStep 扩展方式

`BranchStepSpec` 最终被展开为两个模板步骤：

1. `read_value`
2. `branch`

示例：

```json
[
  {
    "step_id": "step_3",
    "action": "read_value",
    "locator": {
      "type": "css",
      "value": ".gross-margin-cell"
    },
    "params": {
      "method": "innerText"
    },
    "output_var": "gross_margin_raw",
    "on_fail": "stop"
  },
  {
    "step_id": "step_4",
    "action": "branch",
    "branch": {
      "condition_fn": "(ctx) => { const v = parseFloat(ctx.gross_margin_raw.replace('%','')); return v >= 20; }",
      "on_match": "continue",
      "on_mismatch": "takeover",
      "takeover_reason": "当前毛利率 ${gross_margin_raw} 低于20%阈值，需人工确认后继续",
      "description": "判断毛利率是否达到20%自动处理门槛"
    },
    "on_fail": "stop"
  }
]
```

#### 4.3.4 整合要求

本次模板结构扩展必须同步到以下三层：

- 后端领域类型 `template.types.ts`
- 后端校验器 `template.validator.ts`
- 前端 API 类型 `src/api/template.ts`

否则模板结构无法贯通录制、保存和发布。

#### 4.3.5 模板校验要求

模板进入测试、评审和发布前，必须新增以下校验：

- `read_value` 必须有可用 locator。
- `read_value` 必须声明 `output_var`。
- `branch` 必须包含 `condition_fn`。
- `branch` 必须包含 `on_match` 和 `on_mismatch`。
- `takeover_gate` 如存在，必须包含接管原因或默认原因。
- 条件函数至少通过语法级校验，避免发布不可执行模板。
- 顺手修复现有 `press` / `press_key` 动作枚举不一致问题，避免在此次改动里继续扩散。

### 4.4 测试与执行阶段

#### 4.4.1 测试阶段目标

模板测试执行必须完整支持新步骤，而不是只在正式发布后才生效。

也就是说，录制后用户在测试模板时，就应该看到真实条件分歧行为：

- 条件满足 -> 后续步骤继续执行
- 条件不满足 + `stop` -> 测试终止
- 条件不满足 + `takeover` -> 进入接管状态

#### 4.4.2 当前代码中的测试入口

录制页当前不是直接调用一个“模板测试器”，而是：

```text
templateApi.create()
-> 保存模板
-> sessionApi.create({ template_id })
-> sessionApi.start({ template_id })
-> 跳转到会话详情页
```

因此本次只要模板结构和执行链正确支持新步骤，现有测试入口理论上就可以继续复用。

#### 4.4.3 执行上下文

执行浏览器模板时，在当前执行循环中维护变量上下文：

```typescript
interface ExecutionContext {
  variables: Record<string, string>;
}
```

`read_value` 将页面中读取的原始值写入 `variables`，`branch` 基于这些值进行判断。

#### 4.4.4 新步骤执行语义

##### `read_value`

执行逻辑：

1. 根据 locator 找到目标元素。
2. 使用 `innerText / textContent / value` 读取原始值。
3. 写入 `executionContext.variables[output_var]`。
4. 成功后继续下一步。

##### `branch`

执行逻辑：

1. 读取 `condition_fn`。
2. 以当前 `executionContext.variables` 作为输入执行判断。
3. 根据结果决定后续动作：
   - `matched=true` 且 `on_match='continue'` -> 继续
   - `matched=true` 且 `on_match='stop'` -> 停止
   - `matched=false` 且 `on_mismatch='continue'` -> 继续
   - `matched=false` 且 `on_mismatch='stop'` -> 失败
   - `matched=false` 且 `on_mismatch='takeover'` -> 进入接管

##### `takeover_gate`

执行逻辑：

- 无条件进入接管，用于后续可能的人工插入点。
- 本次可以先保留最小实现，不必在录制 UI 中重点暴露。

#### 4.4.5 控制平面改造落点

基于当前代码结构，本次执行链改造建议按以下层次落地：

- 在 `execution-plan-normalization.service.ts` 中识别模板中的新动作，并决定它们如何进入运行时命令或控制语义。
- 在浏览器执行编排服务中消费这些新增动作。
- 对 `read_value` 复用已有 `get_text / read_page` 能力，不额外造新浏览器协议。
- 对 `branch` 和 `takeover_gate`，优先在 Control Plane 内完成控制决策，而不是下沉到 Browser Worker。

#### 4.4.6 接管复用

`branch` 触发接管后，直接进入现有链路：

```text
branch 不满足
-> takeover_required
-> ExecutionHumanControlService
-> Execution.status = HUMAN_CONTROL
-> NotificationService 生成 human_control 通知
-> 前端小铃铛出现待处理项
-> 操作员接管 / resume
```

本次不新增任何通知体系，只复用现有能力。

### 4.5 模板评审与发布

#### 4.5.1 现有真实语义

当前项目里模板发布链路不是抽象的 `releaseService`，而是：

```text
DRAFT
-> submitForReview
-> REVIEW
-> publish
-> PUBLISHED
```

因此本次方案中“release”统一解释为“模板进入评审并最终发布”的流程。

#### 4.5.2 阶段要求

浏览器模板进入评审与发布前，必须把新步骤纳入现有校验体系，保证：

- 模板结构合法。
- 条件步骤可执行。
- 测试通过后再允许提交评审或发布。

#### 4.5.3 发布后的行为要求

发布后的模板中，`read_value / branch / takeover_gate` 必须原样保留并参与执行。

不能出现：

- 测试时识别新步骤。
- 发布后模板语义被降级。
- 已发布模板在 Skill 中不再执行条件步骤。

### 4.6 Skill 绑定与 AI 调用

#### 4.6.1 Skill 绑定现状

当前 Skill 配置对象已经有 `templateId` 字段，前端 `skillApi.create()` / `skillApi.update()` 也围绕这个字段进行绑定。

因此本次 Skill 侧目标非常明确：

- 带条件步骤的浏览器模板可以被正常绑定为 Skill。
- Skill 更新时不会丢失对该模板的引用关系。

#### 4.6.2 AI 调用现状

AI planner 在匹配到 Skill 时，当前会把 `matchedSkill.templateId` 继续带入后续执行逻辑。

因此本次 AI 调用兼容的本质是：

- 不改 planner 的主协议。
- 不新建一套“条件 Skill 特化协议”。
- 只保证底层模板执行链已经认识新步骤。

#### 4.6.3 兼容要求

- AI 不需要理解所有底层条件细节。
- AI 只需像调用普通 Skill 一样调用即可。
- 底层模板执行时，如遇条件不满足导致接管或停止，应把状态和结果正常返回到现有 AI 调用链路。

### 4.7 开发拆分顺序

为了减少跨链路返工，建议按以下顺序开发。

#### 阶段 1：模板结构打底

- 扩展后端 `template.types.ts`。
- 扩展前端 `src/api/template.ts`。
- 扩展 `template.validator.ts`。
- 先让模板可以合法保存与读取。

#### 阶段 2：录制端可插入条件步骤

- 在 `AIControls.tsx` 中增加“插入条件分歧点”入口。
- 增加 `BranchGateModal.tsx`。
- 增加分支分析 API 封装。
- 完成 `templateSteps -> backend steps` 的新步骤映射。

#### 阶段 3：AI 分析服务落地

- 新增 `branch-analysis` 模块。
- 新增 `POST /ai/analyze-branch-condition`。
- 打通 Browser Worker 页面状态读取与 LLM 输出校验。

#### 阶段 4：执行链支持新步骤

- 在执行计划归一化层识别新动作。
- 在浏览器执行编排链中补齐 `read_value / branch / takeover_gate` 语义。
- 打通接管复用。

#### 阶段 5：评审、发布、Skill 绑定、AI 调用回归

- 验证 `review -> publish` 不丢失步骤结构。
- 验证 Skill 绑定 `templateId` 后仍能执行新步骤。
- 验证 AI 调用命中 Skill 时正常执行分支模板。

---

## 5. 受影响文件清单

以下仅列本次范围内应关注的浏览器模版相关文件，并尽量对齐当前仓库真实路径。

### 5.1 浏览器模板领域

| 操作     | 文件                                                                            | 变更内容                                                          |
| -------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| MODIFY   | `apps/backend/domain/browser-template/src/types/template.types.ts`              | 新增 `read_value / branch / takeover_gate` 动作类型；扩展步骤结构 |
| MODIFY   | `apps/backend/domain/browser-template/src/validators/template.validator.ts`     | 增加新步骤校验；修正动作枚举一致性                                |
| MODIFY   | `apps/backend/domain/browser-template/src/modules/template/template.service.ts` | 确保创建、更新、发布前校验兼容新步骤                              |
| OPTIONAL | `apps/backend/domain/browser-template/src/compiler/playwright-to-json.ts`       | 如需支持脚本编译输出新步骤，再补充编译逻辑                        |

### 5.2 AI 分析接口

| 操作   | 文件                                                                                                | 变更内容                                        |
| ------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| NEW    | `apps/backend/orchestration/ai-orchestrator/src/modules/branch-analysis/branch-analysis.service.ts` | 根据当前页面状态和用户意图生成 `BranchStepSpec` |
| NEW    | `apps/backend/orchestration/ai-orchestrator/src/modules/branch-analysis/branch-analysis.dto.ts`     | 请求/响应 DTO                                   |
| NEW    | `apps/backend/orchestration/ai-orchestrator/src/modules/branch-analysis/branch-analysis.module.ts`  | 模块注册                                        |
| MODIFY | `apps/backend/orchestration/ai-orchestrator/src/modules/orchestration/orchestration.controller.ts`  | 新增 `POST /ai/analyze-branch-condition`        |

### 5.3 录制前端

| 操作   | 文件                                                                        | 变更内容                                       |
| ------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| MODIFY | `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`      | 增加“设置为条件分歧点”交互、保存映射、测试兼容 |
| NEW    | `apps/frontend/portal/src/features/recorder/components/BranchGateModal.tsx` | 条件设置与 AI 生成预览弹窗                     |
| NEW    | `apps/frontend/portal/src/features/recorder/lib/branch-analysis.api.ts`     | 分支分析接口封装                               |
| MODIFY | `apps/frontend/portal/src/api/template.ts`                                  | 扩展前端 `TemplateStep` 结构，兼容新步骤       |

### 5.4 浏览器执行与测试链路

| 操作   | 文件                                                                                                        | 变更内容                                       |
| ------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| MODIFY | `apps/backend/orchestration/control-plane/src/modules/execution/execution-plan-normalization.service.ts`    | 识别并归一化新模板动作                         |
| MODIFY | `apps/backend/orchestration/control-plane/src/modules/execution/browser-execution-constants.ts`             | 如需要，补充控制动作常量                       |
| MODIFY | `apps/backend/orchestration/control-plane/src/modules/execution/execution-browser-orchestration.service.ts` | 在浏览器执行编排中支持分支与接管语义           |
| MODIFY | `apps/backend/orchestration/control-plane/src/modules/execution/execution-human-control.service.ts`         | 复用现有接管链路，无需重构，只需确保调用点兼容 |
| MODIFY | `apps/backend/runtime/browser-worker/src/modules/browser/*`                                                 | 复用或补齐读取页面文本/元素值能力              |

### 5.5 模板评审与发布

| 操作   | 文件                                                                               | 变更内容                                         |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------ |
| MODIFY | `apps/backend/domain/browser-template/src/modules/template/template.controller.ts` | 评审/发布接口无需新建，但需保证新步骤可通过      |
| MODIFY | `apps/frontend/portal/src/api/template.ts`                                         | `submitForReview` / `publish` 相关类型兼容新步骤 |

### 5.6 Skill 绑定与 AI 调用

| 操作   | 文件                                                                                | 变更内容                                            |
| ------ | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| MODIFY | `apps/frontend/portal/src/api/skill.ts`                                             | 类型层确认 `templateId` 绑定流程不受影响            |
| MODIFY | `apps/frontend/portal/src/features/admin/skills/pages/SkillAdminPage.tsx`           | 如页面展示模板摘要，需兼容新模板能力                |
| VERIFY | `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts` | 确认 `matchedSkill.templateId` 路径无需额外协议改造 |

---

## 6. 风险与边界

### 6.1 主要风险

#### 风险 1：AI 生成的条件不稳定

表现：

- selector 不准确
- 变量名不合理
- 判断函数不可执行
- takeover reason 不可读

应对：

- 后端增加结构校验与语法校验。
- 前端展示只读摘要，支持“重新生成”。
- 发布前必须经过模板测试。

#### 风险 2：测试链与发布链不一致

表现：

- 录制后测试通过，但发布后执行器不识别新步骤。

应对：

- 保证测试、评审、正式执行消费同一套步骤定义。
- 避免在发布时做语义转换或降级。

#### 风险 3：多处类型定义不同步

表现：

- 后端支持新字段，但前端 API 类型没有同步。
- 前端能传递新字段，但后端校验器拒绝。
- 执行侧不认识新增动作。

应对：

- 先统一类型与校验，再做 UI 和执行链改造。
- 把 `template.types.ts`、`template.validator.ts`、`src/api/template.ts` 视为同一批改动。

#### 风险 4：范围膨胀

表现：

- 讨论过程中把本次需求扩成平台级调度、Temporal 通用分支、统一工作流抽象。

应对：

- 严格限定为浏览器模版工作流增强。
- 不引入“定时执行 Skills”实现任务。
- 不把本次文档写成全局架构改造方案。

### 6.2 本次边界结论

本方案的交付边界是：

- 浏览器模板支持条件分歧。
- 录制、测试、评审发布、Skill 绑定、AI 调用全链路打通。
- 接管和通知复用现有能力。

除此之外的能力建设，均不纳入本次交付。

---

## 7. 验证计划

### 7.1 单元测试

#### 条件分析服务

- 给定页面内容与用户意图，能生成结构完整的 `BranchStepSpec`。
- AI 返回缺字段时，接口能报错。
- `conditionFn` 非法时，校验失败。

#### 模板校验

- `read_value` 缺少 `output_var` 时校验失败。
- `branch` 缺少 `condition_fn` 时校验失败。
- `branch` 的 `on_mismatch` 非法时校验失败。
- `press` / `press_key` 动作枚举一致性回归通过。

#### 执行逻辑

- `read_value` 能正确读取并写入变量。
- `branch` 条件满足时继续执行。
- `branch` 条件不满足且 `stop` 时终止执行。
- `branch` 条件不满足且 `takeover` 时返回接管状态。

### 7.2 集成测试

#### 场景 1：录制插入条件分歧

```text
录制浏览器步骤
-> 在某一步后插入条件分歧点
-> AI 生成 read_value + branch
-> 模板保存成功
```

#### 场景 2：测试执行命中通过分支

```text
templateApi.create 保存模板
-> sessionApi.create/start 启动测试
-> read_value 读取到 25.5%
-> branch 返回 true
-> 后续步骤继续执行
-> 测试成功
```

#### 场景 3：测试执行触发接管

```text
templateApi.create 保存模板
-> sessionApi.create/start 启动测试
-> read_value 读取到 17.8%
-> branch 返回 false
-> on_mismatch = takeover
-> Execution.status = HUMAN_CONTROL
-> 通知中出现 requiresAction 项
```

#### 场景 4：评审与发布后保持一致

```text
模板测试通过
-> submitForReview
-> publish
-> 模板状态进入 PUBLISHED
-> 条件步骤仍保持原语义
```

#### 场景 5：绑定 Skill 后执行一致

```text
Skill 绑定 templateId
-> 手动触发 Skill 执行
-> 底层执行包含 branch 的浏览器模板
-> 条件步骤仍生效
```

#### 场景 6：AI 调用 Skill

```text
AI 匹配到带 templateId 的 Skill
-> planner 透传 templateId
-> 执行包含 branch 的浏览器模板
-> 条件满足则正常返回
-> 条件不满足则返回接管/失败状态
```

### 7.3 验收标准

满足以下条件即视为本次任务完成：

- 浏览器录制面板可插入条件分歧点。
- AI 能生成可落入模板的条件步骤。
- 浏览器模板测试链可执行新步骤。
- 模板评审与发布后不丢失条件步骤语义。
- Skill 绑定模板后执行链保持一致。
- AI 调用已发布 Skill 时兼容条件步骤。
- 条件不满足时可进入现有 `HUMAN_CONTROL` 流程。

---

## 8. 开发任务拆单

本节将方案进一步拆成可直接排期的开发任务。默认按“先打底、再接 UI、再打通执行链、最后做联调回归”的顺序推进。

### 8.1 拆单原则

- 每个任务尽量对应一组明确文件，避免多人同时改同一核心文件产生冲突。
- 优先解决“类型定义不同步”问题，再进入 UI 和执行链开发。
- 先打通保存与测试，再推进评审发布、Skill 绑定和 AI 调用回归。
- `AIControls.tsx` 体量已经较大，本次新增逻辑尽量下沉到新组件或独立 API 封装，避免继续堆叠。

### 8.2 任务总览

| 编号 | 任务                     | 优先级 | 前置依赖 | 产出                         |
| ---- | ------------------------ | ------ | -------- | ---------------------------- |
| T1   | 模板类型与校验打底       | P0     | 无       | 新步骤可合法保存与校验       |
| T2   | 录制端步骤模型扩展       | P0     | T1       | 前端可持有并保存条件步骤     |
| T3   | AI 条件分析接口          | P0     | 无       | 可生成 `BranchStepSpec`      |
| T4   | 条件分歧录制 UI          | P1     | T2, T3   | 录制页可插入条件分歧点       |
| T5   | 执行计划归一化支持新动作 | P0     | T1       | 执行链认识新模板动作         |
| T6   | 浏览器执行与接管链打通   | P0     | T5       | 测试执行与正式执行可运行分支 |
| T7   | 评审发布与模板 API 回归  | P1     | T1, T6   | 模板发布不丢语义             |
| T8   | Skill 绑定与 AI 调用回归 | P1     | T6, T7   | Skill/AI 可消费新模板        |
| T9   | 自动化测试与联调验收     | P1     | T1-T8    | 形成可回归验证集             |

### 8.3 详细拆单

#### T1 模板类型与校验打底

目标：

- 让后端和前端都认识 `read_value / branch / takeover_gate`
- 让模板保存、更新、校验、发布前检查都能接受新结构

涉及文件：

- `apps/backend/domain/browser-template/src/types/template.types.ts`
- `apps/backend/domain/browser-template/src/validators/template.validator.ts`
- `apps/frontend/portal/src/api/template.ts`

子任务：

- 扩展后端 `ActionType`。
- 为 `TemplateStep` 增加 `output_var`、`branch`、`takeover_reason` 等字段。
- 为前端 `TemplateStep` 类型同步增加对应字段。
- 在 `template.validator.ts` 中新增对 `read_value / branch / takeover_gate` 的结构校验。
- 修复现有 `press` / `press_key` 枚举不一致问题。

完成标准：

- `templateApi.create()` 可提交包含新步骤的模板而不报类型错误。
- 后端 `TemplateValidator.validate()` 可正确识别合法/非法分支步骤。
- `templateApi.validate()` 或保存时返回的错误信息能覆盖新步骤缺失字段场景。

#### T2 录制端步骤模型扩展

目标：

- 让录制页内部的 `templateSteps` 能表达条件分歧步骤
- 打通保存模板时的前端到后端步骤映射

涉及文件：

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
- 如有必要新增 `apps/frontend/portal/src/features/recorder/lib/template-step-mapper.ts`

子任务：

- 扩展 recorder 内部 `TemplateStep` 或同类本地状态结构。
- 设计前端内部步骤与后端 `TemplateStep` 的映射关系。
- 在保存模板逻辑中保留 `read_value / branch / takeover_gate`，不被现有普通动作映射覆盖。
- 评估并抽离 `AIControls.tsx` 中的步骤转换逻辑，避免继续增大单文件复杂度。

完成标准：

- 录制页本地步骤状态可插入条件步骤。
- 调用 `templateApi.create()` 时，新步骤不会在前端转换中丢失。
- 原有普通录制步骤保存行为不回归。

#### T3 AI 条件分析接口

目标：

- 提供一个只服务录制页的分支分析接口
- 输入运行时会话和自然语言意图，输出结构化 `BranchStepSpec`

涉及文件：

- `apps/backend/orchestration/ai-orchestrator/src/modules/branch-analysis/branch-analysis.service.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/branch-analysis/branch-analysis.dto.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/branch-analysis/branch-analysis.module.ts`
- `apps/backend/orchestration/ai-orchestrator/src/modules/orchestration/orchestration.controller.ts`

子任务：

- 定义 `analyze-branch-condition` 的 DTO。
- 封装从 `runtimeSessionId` 读取当前页面状态的逻辑。
- 设计 LLM Prompt，输出受约束的 JSON 结构。
- 增加 AI 输出校验与错误处理。

完成标准：

- 接口可稳定返回结构化 `branchStepSpec`。
- 字段缺失、无效 JSON、无效 `conditionFn` 都能返回明确错误。
- 不引入平台级通用分支分析能力，只服务录制场景。

#### T4 条件分歧录制 UI

目标：

- 用户可在录制页某一步后插入条件分歧点
- 可预览 AI 生成结果并确认插入

涉及文件：

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
- `apps/frontend/portal/src/features/recorder/components/BranchGateModal.tsx`
- `apps/frontend/portal/src/features/recorder/lib/branch-analysis.api.ts`

子任务：

- 在步骤列表中加入“设置为条件分歧点”入口。
- 新增弹窗，允许输入意图、选择 `onMismatch` 动作并调用后端分析接口。
- 将 `BranchStepSpec` 转换为 `read_value + branch` 两个模板步骤。
- 在步骤列表中展示条件步骤摘要。

完成标准：

- 用户可完成“选择步骤 -> 生成条件 -> 预览 -> 插入模板”的完整操作。
- 插入后的步骤可继续保存、测试。
- 不引入脚本编辑器，只展示只读摘要和重生成功能。

#### T5 执行计划归一化支持新动作

目标：

- 让 Control Plane 的执行计划层先认识新步骤
- 明确哪些动作进入浏览器命令，哪些动作作为控制语义在控制平面消费

涉及文件：

- `apps/backend/orchestration/control-plane/src/modules/execution/execution-plan-normalization.service.ts`
- `apps/backend/orchestration/control-plane/src/modules/execution/browser-execution-constants.ts`

子任务：

- 增加新动作的识别和归一化逻辑。
- 为 `read_value` 设计与现有 `get_text / read_page` 的复用策略。
- 为 `branch` 和 `takeover_gate` 设计控制语义结构，避免直接下沉成浏览器原子动作。
- 确认运行时变量存储位置和后续读取方式。

完成标准：

- 归一化层不会丢弃新步骤。
- 生成出的执行计划能区分“浏览器读取动作”和“控制动作”。
- 现有普通浏览器动作不回归。

#### T6 浏览器执行与接管链打通

目标：

- 测试执行和正式执行都能实际运行条件分歧
- 条件不满足时进入现有人工接管链路

涉及文件：

- `apps/backend/orchestration/control-plane/src/modules/execution/execution-browser-orchestration.service.ts`
- `apps/backend/orchestration/control-plane/src/modules/execution/execution-step-executor.service.ts`
- `apps/backend/orchestration/control-plane/src/modules/execution/execution-human-control.service.ts`
- `apps/backend/runtime/browser-worker/src/modules/browser/*`

子任务：

- 为 `read_value` 增加读取元素文本/值并回写变量上下文的执行逻辑。
- 为 `branch` 增加条件判断与分支决策逻辑。
- 为 `takeover_gate` 增加直接转接管的最小实现。
- 复用现有 `HUMAN_CONTROL` / 通知 / resume 链路。

完成标准：

- 测试会话中，`read_value` 可读值，`branch` 可决策。
- `onMismatch=takeover` 时，执行状态进入 `HUMAN_CONTROL`。
- 执行详情页和通知链路表现与现有接管保持一致。

#### T7 评审发布与模板 API 回归

目标：

- 新步骤在模板评审与发布过程中不丢失语义
- 前端模板 API 和后端控制器对齐

涉及文件：

- `apps/backend/domain/browser-template/src/modules/template/template.controller.ts`
- `apps/backend/domain/browser-template/src/modules/template/template.service.ts`
- `apps/frontend/portal/src/api/template.ts`

子任务：

- 回归 `submitForReview` / `publish` 流程对新步骤的支持。
- 校对 `validate`、`create`、`update`、`publish` 的返回结构是否都兼容新字段。
- 如前端存在模板详情或列表摘要展示，确认不会因新字段报错。

完成标准：

- 带条件步骤的模板可从 `DRAFT` 顺利进入 `PUBLISHED`。
- 发布前校验能准确拦截非法分支步骤。
- 发布后模板详情读取正常。

#### T8 Skill 绑定与 AI 调用回归

目标：

- 带条件步骤的模板绑定 Skill 后仍能正常运行
- AI 命中 Skill 时不需要额外协议改造

涉及文件：

- `apps/frontend/portal/src/api/skill.ts`
- `apps/frontend/portal/src/features/admin/skills/pages/SkillAdminPage.tsx`
- `apps/backend/orchestration/ai-orchestrator/src/modules/planner/planner.service.ts`

子任务：

- 回归 Skill 创建和编辑时的 `templateId` 绑定逻辑。
- 确认 Skill 管理页展示模板相关字段时不会因新结构异常。
- 验证 planner 侧继续通过 `templateId` 命中并执行，无需引入新协议。

完成标准：

- Skill 绑定带条件步骤模板后可正常执行。
- AI 调用命中该 Skill 时，底层浏览器模板分支逻辑生效。
- 调用结果、失败、接管状态能回到现有聊天/执行结果链路。

#### T9 自动化测试与联调验收

目标：

- 为本次改造建立最小但有效的回归集
- 覆盖模板结构、执行分支、接管和 Skill 绑定主链路

建议覆盖：

- `template.validator.ts` 单测
- `branch-analysis.service.ts` 单测
- 执行计划归一化单测
- `branch -> HUMAN_CONTROL` 集成测试
- Skill 绑定模板后的端到端冒烟验证

完成标准：

- 关键单测可稳定运行。
- 至少有一条集成链验证“保存模板 -> 测试执行 -> 进入接管”。
- 至少有一条联调验证“模板发布 -> Skill 绑定 -> AI 调用”。

### 8.4 推荐并行方式

如果多人并行开发，建议按以下方式拆分：

- 方向 A：`T1 + T7`
  负责模板结构、校验、评审发布与模板 API
- 方向 B：`T2 + T4`
  负责录制页步骤模型、弹窗 UI、前端保存映射
- 方向 C：`T3`
  负责 AI 条件分析接口与 LLM 输出校验
- 方向 D：`T5 + T6 + T8`
  负责执行链、接管复用、Skill/AI 调用回归

这种拆法的好处是：

- 后端领域模型和前端录制 UI 可并行
- AI 分析接口可独立推进
- 执行链在类型收口后再集中打通，冲突更少

### 8.5 建议里程碑

里程碑 1：

- 完成 `T1`
- 完成 `T3`
- 文档和接口结构冻结

里程碑 2：

- 完成 `T2`
- 完成 `T4`
- 录制页可以插入并保存条件步骤

里程碑 3：

- 完成 `T5`
- 完成 `T6`
- 测试执行可以真实命中分支和接管

里程碑 4：

- 完成 `T7`
- 完成 `T8`
- 模板发布、Skill 绑定、AI 调用全链路打通

里程碑 5：

- 完成 `T9`
- 验证与回归基线稳定
