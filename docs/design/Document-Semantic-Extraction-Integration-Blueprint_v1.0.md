# 文档参数语义提取 Subagent 接入改造蓝图

**版本：** v1.0  
**日期：** 2026-05-13  
**状态：** 设计中

---

## 背景

在 [Document-Semantic-Extraction-Subagent_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/Document-Semantic-Extraction-Subagent_v1.0.md) 中，已经定义了复杂文档任务引入语义提取 Subagent 的总体方案。  
本文件进一步回答“如何接到当前代码里”的问题，目标是：

- 明确接入边界；
- 明确应修改的现有模块；
- 明确 DTO / 状态 / UI 的最小侵入演进方式；
- 明确按阶段落地的 change set；
- 保持现有主流程可运行、可回退、可灰度。

本文件是**改造蓝图**，不是实现说明，不包含代码落地。

---

## 现有主链路与接入点

### 当前主链路

当前复杂文档任务大致经历以下链路：

1. `ai-orchestrator` 中 `PlannerService.generatePlan()` 完成：
   - 技能匹配；
   - 参数识别；
   - `required_inputs` 生成；
   - `planDraft` 输出。
2. `chat.controller.ts` 根据 `planDraft.required_inputs`：
   - 创建等待补输入的执行单；
   - 或直接创建执行中的执行单。
3. `control-plane` 中 `ExecutionService`：
   - 将 `requiredInputs` 固化到 `normalizedInputJson`；
   - 将执行单推进到 `waiting_input / queued / running`。
4. Portal `ExecutionDetailPage`：
   - 读取 `waiting_input` 步骤中的 `requiredInputs`；
   - 逐字段渲染补输入表单。

### 当前已定位的关键模块

- Planner： [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts)
- Task 模式与执行单恢复： [chat.controller.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts)
- Execution waiting_input 写入与恢复： [execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.service.ts)
- Portal 执行详情补输入 UI： [ExecutionDetailPage.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/executions/pages/ExecutionDetailPage.tsx)

### 推荐接入点

本蓝图推荐的接入点仍然是：

- `skill match` 之后；
- `buildRequiredInputs()` 之前。

也就是在 [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts#L36-L119) 的 `generatePlan()` 中插入复杂任务分流与 Subagent 调用，而不是在渲染侧临时修补。

原因：

- 此处上下文最完整；
- 尚未把错误缺失项写入执行单；
- 能最大程度复用现有执行、审批、观察、恢复链路。

---

## 改造总原则

### 1. 保持控制平面不变为第一优先级

不改变以下核心事实模型：

- `Execution.status`
- `Execution.currentStepId`
- `ExecutionStep.status`
- `ExecutionEvent`
- 执行单创建 / 恢复 / 取消 / 审批主逻辑

### 2. 先增强数据质量，再增强交互

第一优先级不是 UI，而是：

- 清洗技术噪音字段；
- 收敛数组字段；
- 让 `requiredInputs` 更合理；
- 降低错误 `waiting_input` 触发率。

UI 分组展示属于第二阶段增强。

### 3. 兼容旧 DTO，增量增加新语义字段

在过渡期内必须允许：

- 旧 `requiredInputs: RequiredInputDTO[]` 仍然可用；
- 新增 `semantic` 相关字段仅作为补充；
- Portal 老页面仍可展示旧格式；
- 新页面 / 新区块逐步消费新语义结构。

### 4. 所有增强均允许回退

必须支持通过配置关闭：

- 复杂度分流；
- Subagent 调用；
- 分组式 waiting_input；
- preview-ready 判定增强。

---

## 模块改造蓝图

## 模块 A：`ai-orchestrator / planner`

### 当前职责

`PlannerService.generatePlan()` 当前职责包括：

- 加载技能；
- 进行 skill match；
- 调用 `recognizerService.recognizeParams()`；
- 执行 `buildRequiredInputs()`；
- 根据缺失情况拼装 `planDraft`。

关键位置见：

- [generatePlan()](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts#L36-L119)
- [buildRequiredInputs()](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts#L468-L485)

### 改造目标

将 Planner 从“字段平铺式参数缺失构造器”升级为“可调用语义增强结果的计划拼装器”。

### 推荐新增组件

建议在 `ai-orchestrator` 内新增以下模块：

- `document-task-complexity.service.ts`
  - 判断当前任务是否应走 Subagent。
- `document-semantic-subagent.service.ts`
  - 调用语义提取逻辑并返回标准结果包。
- `document-semantic-adapter.service.ts`
  - 将语义结果包适配成现有 `recognizedParams / requiredInputs / planner hints`。
- `document-field-policy.service.ts`
  - 统一管理 `hard_required / soft_required / optional / derived` 及 `blocking / degrading / none`。

### Planner 侧改造方式

建议把 `generatePlan()` 内部改造成四段：

1. `matchSkill`
2. `recognizeParams` 或 `runSemanticSubagent`
3. `buildNormalizedRequiredInputs`
4. `buildPlanDraft`

建议新流程：

```text
match skill
-> 判定是否 complex_document
-> simple: 走 recognizeParams + buildRequiredInputs
-> complex_document: 走 semantic subagent + adapter
-> 统一产出 PlanDraftDTO
```

### 建议新增的 Planner 内部能力

- `decidePlanningMode(matchedSkill, recognizedPreview)`
- `buildSemanticPlanningContext(...)`
- `adaptSemanticResultToPlanDraft(...)`
- `buildWaitingInputGroups(...)`
- `buildPreviewReadiness(...)`

### 对现有 `PlanDraftDTO` 的建议扩展

在兼容原字段的前提下，建议增加：

```ts
semantic?: {
  mode: 'simple' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  groupedMissing?: Array<{
    group: string;
    title: string;
    blocking: boolean;
    summary?: string;
    fields: string[];
  }>;
  semanticModel?: Record<string, unknown>;
}
```

注意：

- 原有 `required_inputs` 继续保留；
- `semantic` 作为增强字段，不破坏现有调用方。

### 本模块第一阶段只改什么

第一阶段只建议做：

- 加复杂度分流；
- 加 Subagent 结果适配；
- 让 `required_inputs` 不再包含模板循环标记和明显错误类型字段。

第一阶段不建议做：

- 大规模重写 `PlanDraftDTO`；
- 替换掉所有现有 `recognizerService` 调用；
- 引入新的执行状态。

---

## 模块 B：`ai-orchestrator / chat.controller`

### 当前职责

`handleTaskMode()` 当前职责包括：

- 生成 `planDraft`；
- 如果有缺失，创建可恢复执行单；
- 如果已有 `executionId` 且在 `waiting_input`，尝试提交补充输入；
- 观察执行状态并推送流式事件。

关键位置见：

- [handleTaskMode()](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts#L949-L1190)

### 改造目标

让聊天入口理解“复杂文档 waiting_input 不再只是字段列表”，而是：

- 分组缺失；
- 预览可用但正式未就绪；
- 自然语言补充一整组数据。

### 推荐改造点

#### 1. 创建执行单时附带 `semantic` 增强信息

当前执行单创建时主要传：

- `input`
- `usage`
- `planDraft`

建议继续沿用 `planDraft` 透传，但让其中可携带：

- `semantic.previewReady`
- `semantic.groupedMissing`
- `semantic.semanticModel`

这样 control-plane 不需要理解整个 Subagent 内部逻辑，也能保留显示所需上下文。

#### 2. 恢复 waiting_input 时优先按组解释

当前在 [chat.controller.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts#L976-L1037) 中，恢复逻辑是：

- 拿到 `missingInputs`
- 对用户输入做一次 `buildWaitingInputPayload()`
- 再提交字段字典

建议未来改造为：

- 若执行单带有 `groupedMissing`：
  - 先识别用户是在补哪个组；
  - 再调用 Subagent 做“组级解析”；
  - 最后仍提交字段字典给 control-plane。

也就是说，聊天入口增强的是“解释用户补充的语义”，而不是改写 control-plane 协议。

#### 3. WAITING_INPUT 流式事件增加组级提示

当前流式结果更多是：

- 缺少哪些字段；
- 执行单 ID；
- 请补充后再继续。

建议增强为：

- 缺少哪几个业务组；
- 哪些组是阻塞项；
- 当前是否可直接预览；
- 如果你只补一组，优先补哪一组。

### 本模块第一阶段只改什么

第一阶段建议只做：

- 将 `planDraft.semantic` 透传到流式响应与执行单输入；
- 在聊天 WAITING_INPUT 文案中优先展示 `groupedMissing.summary`；
- 不改控制平面的输入接口结构。

---

## 模块 C：`control-plane / execution.service`

### 当前职责

`ExecutionService.submitInputAndResume()` 当前逻辑是：

- 从 `normalizedInputJson.requiredInputs` 读取缺失字段；
- 只允许提交 `missingInputs` 中的字段；
- 更新执行单与步骤；
- 若补齐则推进到 `queued/running`。

关键位置见：

- [submitInputAndResume()](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.service.ts#L576-L717)

### 改造目标

保持 control-plane 仍是执行真相源，但让它能承载更多语义上下文，而不要求它理解完整文档语义模型。

### 推荐改造点

#### 1. `normalizedInputJson` 增加语义增强区

建议在不破坏原结构的前提下新增：

```json
{
  "input": {},
  "requiredInputs": [],
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": [],
    "fieldPolicies": {},
    "semanticModel": {}
  }
}
```

注意：

- control-plane 只负责存和透传；
- 不要求它在第一阶段理解 `semanticModel`。

#### 2. `submitInputAndResume()` 保持字段级提交协议

第一阶段不建议把 control-plane 的输入协议改成组级。  
仍然保持：

```json
{
  "stepId": "...",
  "input": {
    "buyerParty": "...",
    "items[].quantity": 3
  }
}
```

原因：

- 与当前执行单恢复流程兼容；
- 改动最小；
- 聊天和 Portal 都可以继续用现有 submit API。

#### 3. 允许 partial submit 同时更新语义快照

当前 partial submit 只更新：

- `requiredInputs`
- `input`

建议后续增强为：

- 同步刷新 `semantic.groupedMissing`
- 同步刷新 `previewReady / finalReady`

这样一轮补输入后，系统可以知道：

- 虽然还没全部补齐，但已经可以预览；
- 或者仍然缺某个阻塞组。

#### 4. `getRequiredInputs()` 增加兼容语义层兜底

未来如果 `requiredInputs` 与 `semantic.groupedMissing` 同时存在，建议规则是：

- 执行推进仍以 `requiredInputs` 为准；
- UI 展示优先看 `semantic.groupedMissing`；
- 若 `semantic` 缺失，则退回老行为。

### 第一阶段只改什么

第一阶段建议只做：

- `normalizedInputJson` 容器扩展；
- 事件 payload 允许带 `semantic` 摘要；
- 不新增状态，不修改主状态机。

---

## 模块 D：`control-plane / dto / mapper / mcp`

### 当前问题

执行单详情现在主要暴露：

- `failureReason`
- `resultJson`
- `normalizedInput`
- `steps`

但没有稳定对外暴露：

- `previewReady`
- `groupedMissing`
- `semantic mode`

### 推荐改造点

建议检查并扩展以下区域：

- `execution.dto.ts`
- `execution.mapper.ts`
- `mcp.service.ts`

建议新增只读输出字段：

```ts
semantic?: {
  mode?: 'simple' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  groupedMissing?: Array<...>;
}
```

这样：

- Portal 页面能直接读取；
- MCP / 调试工具也能看见；
- 不用每次自己从 `normalizedInputJson` 深挖。

### 第一阶段建议

第一阶段只加只读透传字段，不改变接口主语义。

---

## 模块 E：`portal / ExecutionDetailPage`

### 当前职责

当前执行详情页在 [ExecutionDetailPage.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/executions/pages/ExecutionDetailPage.tsx) 中：

- 从 `waitingInputStep.inputJson.requiredInputs` 取字段；
- 逐字段渲染 `Form.Item`；
- 按字段类型渲染 `Input / InputNumber / Switch`；
- 提交时继续以字段字典发送。

### 当前问题

对于复杂文档：

- 一次展示几十个字段；
- 缺少分组；
- 数组字段无法自然输入；
- 用户不知道哪些是阻塞项；
- 用户不知道是否已经达到可预览条件。

### 推荐改造目标

让 Portal 执行详情页从“字段表单页”升级为“分组补输入工作台”。

### 推荐改造方式

#### 第一阶段：只做展示增强，不改提交协议

新增一个语义增强区块，展示：

- 当前模式：`simple / complex_document`
- `previewReady / finalReady`
- 缺失分组卡片
- 每组摘要和阻塞性标记

原有字段表单仍保留，作为兼容兜底。

推荐 UI 结构：

1. 顶部 `Alert`
   - 文案：“当前为复杂文档任务，仍缺少 2 个关键业务组”
2. `groupedMissing` 卡片区
   - 标的清单
   - 交付计划
   - 付款计划
3. 兼容字段表单区
   - 仅展开当前组涉及的字段

#### 第二阶段：支持组级自然语言补充

在每个组卡片中增加：

- `TextArea`
- “用自然语言补这个业务组”
- 提交后调用聊天式解析或专用解析接口

但输出仍然落回字段字典提交。

#### 第三阶段：支持 Preview Ready 提示

若：

- `previewReady=true`
- `finalReady=false`

则页面应显示：

- 允许预览按钮
- 正式生成按钮仍提示还缺阻塞项

### 本模块第一阶段必须避免的事

- 不要直接删掉旧字段表单；
- 不要在第一次迭代就强依赖组级提交接口；
- 不要让复杂文档页与简单执行单详情页分裂成两套完全不同的页面。

---

## 模块 F：`portal / ExecutionListPage` 与通知中心

### 当前问题

执行列表和通知中心已能识别 `waiting_input`，但对复杂文档仅能提示“待补输入”，信息密度不足。

### 推荐改造

对于带 `semantic.groupedMissing` 的执行单，列表页和通知中心可增强显示：

- `待补 2 组信息`
- `可预览`
- `缺少标的清单`

这有助于用户快速判断当前卡点，而不需要每次点进详情页。

第一阶段可只增加摘要标签，不改列表主结构。

---

## 模块 G：`document-side services`

### 涉及范围

虽然本蓝图主接入点不在 `carbone-engine`，但文档语义增强要与下游保持一致，因此建议同步做契约对齐。

重点关注：

- `ai-identifier.service.ts`
- 文档模板 skill 参数路径标准化逻辑
- validate / preview 样例补齐逻辑

### 推荐目标

保证以下几件事在语义层和模板层表达一致：

- 循环只认业务数组组；
- 模板循环标记不暴露到 waiting_input；
- 路径标准化结果能作为 canonical key 参考；
- 复杂文档的 preview 样例骨架可回流给 Subagent 作为先验。

### 这里第一阶段不直接改什么

- 不要求 `carbone-engine` 立即依赖 control-plane 的 semantic DTO；
- 不要求把 validate / preview 改成基于 semanticModel。

第一阶段更适合做“标准路径与 canonical key 对齐”。

---

## DTO 与数据结构改造建议

## 1. `PlanDraftDTO`

建议扩展字段：

```ts
semantic?: {
  mode: 'simple' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  groupedMissing?: GroupedMissingDTO[];
  semanticModel?: Record<string, unknown>;
  fieldPolicies?: Record<string, unknown>;
}
```

## 2. `RequiredInputDTO`

建议保留原结构，但可选增加：

```ts
group?: string;
requiredLevel?: 'hard_required' | 'soft_required' | 'optional' | 'derived';
renderImpact?: 'blocking' | 'degrading' | 'none';
```

说明：

- 第一阶段这些字段只作为增强元数据；
- 不要求所有调用方都立刻使用。

## 3. `ExecutionDto`

建议新增透传字段：

```ts
semantic?: {
  mode?: 'simple' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  groupedMissing?: GroupedMissingDTO[];
}
```

## 4. `ExecutionStep.inputJson`

当前结构仍保留：

```json
{
  "requiredInputs": []
}
```

建议兼容扩展为：

```json
{
  "requiredInputs": [],
  "groupedMissing": [],
  "semanticSummary": {
    "previewReady": true,
    "finalReady": false
  }
}
```

---

## 分阶段实施蓝图

## Phase 0：契约预埋

目标：

- 不改变行为，只预埋扩展字段。

改动建议：

- `PlanDraftDTO` 增加 `semantic?`
- `ExecutionDto` 增加 `semantic?`
- `normalizedInputJson` 允许 `semantic`
- Portal 读取到 `semantic` 时不报错

验收：

- 老任务无感；
- 新字段不影响现有执行单运行。

## Phase 1：Planner 语义增强接入

目标：

- 只增强复杂文档任务的参数质量。

改动建议：

- 在 `PlannerService.generatePlan()` 增加复杂度分流；
- 接入 Subagent；
- 通过 adapter 输出更干净的 `required_inputs`；
- 去除模板循环标记、噪音字段和明显错误类型字段。

验收：

- 复杂文档任务进入 `waiting_input` 的字段数量明显下降；
- 旧任务不回归。

## Phase 2：Control-plane 语义透传

目标：

- 执行单可携带 `semantic` 增强元数据。

改动建议：

- `normalizedInputJson.semantic` 落库；
- 执行单 DTO 对外透传；
- 事件 payload 中增加语义摘要。

验收：

- 执行详情页能拿到 `groupedMissing / previewReady`；
- 不影响 resume / cancel / approve。

## Phase 3：Portal 分组展示

目标：

- 用户能按业务组理解缺失项。

改动建议：

- ExecutionDetailPage 增加复杂文档模式卡片；
- 展示 `groupedMissing`；
- 展示 `previewReady / finalReady`；
- 旧字段表单继续保留。

验收：

- 复杂文档执行单可读性明显提升；
- 简单任务页不受影响。

## Phase 4：组级自然语言补充

目标：

- 用户可以“补一组话”，而不是“补几十个字段”。

改动建议：

- 聊天与 Portal 增加组级输入入口；
- 由 Subagent 把组级自然语言转换成字段字典；
- control-plane 仍接收字段字典。

验收：

- 多数组合同类模板补输入成功率提升；
- 继续保持协议兼容。

## Phase 5：Preview Ready 联动

目标：

- 复杂文档允许先预览、后补全。

改动建议：

- Portal 增加 preview-ready 展示；
- 聊天结果增加“可预览但未正式就绪”的提示；
- 文档流中引入预览优先的非阻塞策略。

验收：

- 减少“明明能预览却停在 waiting_input”的情况。

---

## 风险与防线

### 风险 1：Planner 复杂度过高

防线：

- Subagent 与 adapter 抽独立 service；
- Planner 只做 orchestration。

### 风险 2：DTO 扩展后前端兼容性问题

防线：

- 全部新增字段均为 optional；
- 旧页面优先按旧字段运行。

### 风险 3：组级补输入与字段级提交不一致

防线：

- 第一阶段所有提交仍走字段字典；
- 组级输入只存在于解析前端层，不进入 control-plane 协议。

### 风险 4：复杂任务识别误判

防线：

- 增加 `complexity decision` 调试快照；
- 配置开关可回退到旧路径。

---

## 建议的首批变更清单

如果只做第一轮最有价值、最小侵入的改造，建议按以下顺序推进：

1. `ai-orchestrator`
   - 为 Planner 增加复杂度分流与 Subagent adapter
2. `PlanDraftDTO`
   - 增加 `semantic?`
3. `control-plane`
   - 允许 `normalizedInputJson.semantic` 与 DTO 透传
4. `portal / ExecutionDetailPage`
   - 增加 `groupedMissing / previewReady` 展示区
5. `chat.controller`
   - 优先展示业务组级缺失摘要

这个顺序的好处是：

- 最大收益首先发生在“减少错误 waiting_input”；
- 不需要先重写 UI；
- 不会破坏主执行链路。

---

## 最终建议

最优落地策略不是“大改主流程”，而是分三层推进：

1. **Planner 先变聪明**
   - 先把进入执行单前的参数质量做好；
2. **Control-plane 只做语义透传**
   - 不承担文档理解职责；
3. **Portal 再逐步升级交互**
   - 从字段表单演进到分组补输入。

因此，这个蓝图的核心结论是：

- **第一主战场在 `ai-orchestrator / planner`**
- **第二主战场在 DTO 透传与 Portal 展示**
- **control-plane 保持稳定，不做大逻辑重写**
