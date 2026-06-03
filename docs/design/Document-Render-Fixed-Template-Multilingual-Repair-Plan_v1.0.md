# 固定模板文档生成多语言渲染修复方案 v1.0

## 1. 背景

当前固定模板文档生成链路已经统一收口到 `/studio/render-resolved`，理论上应由 Carbone runtime 结合模板绑定规则、`workflowInputParams`、`workflowInputPolicy` 与 `prepareLocalizedRenderData` 完成多语言渲染数据展开，再生成最终 Word 文档。

但实际验证结果显示：

- 固定模板场景下生成的 Word 内容不正确；
- 多语言字段未按模板要求展开；
- Word 中应出现的本地化字段内容缺失或落错字段。

本方案聚焦修复“固定模板 + 文档渲染 + 多语言”链路，不涉及通用 HTTP/结构化转换链路，也不涉及 AI 代码生成提示词优化。

## 2. 问题现象

在固定模板文档工作流中，用户输入原始业务参数后，最终生成的 Word 文档没有得到正确的多语言内容，典型表现包括：

- 传入的是业务原始值，但模板期望的是 `xxx_zh`、`xxx_ja`、`xxx_en` 等本地化字段；
- 文档中部分字段为空；
- 文档中只出现默认语言内容，未出现目标语言内容；
- 模板中的双语/多语槽位没有被正确填充。

## 3. 当前链路

当前固定模板文档生成主链路如下：

1. 前端或工作流编辑器生成固定模板 Workflow DSL。
2. `buildFixedDocumentRenderWorkflowCode()` 生成固定模板 Workflow Python 代码。
3. Workflow 执行共享 `documentRender` Activity。
4. `documentRender` Activity 调用 `/studio/render-resolved`。
5. `render-resolved` 在满足条件时，通过 `templateWorkflowService.renderData()` 生成多语言渲染数据。
6. Carbone 使用最终 `data` 渲染 Word 文档。

当前关键代码位置：

- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow-fixed-document-workflow-code.helpers.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/fixed-activity-templates.ts`
- `apps/backend/domain/carbone-engine/src/modules/studio/studio-render.controller.ts`

## 4. 根因分析

### 4.1 固定模板 Workflow 未透传运行时多语言元数据

当前 `buildFixedDocumentRenderWorkflowCode()` 生成的 Workflow 代码，在构造 `activity_input` 时只传了以下核心字段：

- `templateId`
- `skillId`
- `data`
- `outputFormat`
- `sourceLanguage`
- `targetLanguages`
- `outputName`

但没有透传以下关键字段：

- `workflowInputParams`
- `workflowInputPolicy`
- `prepareLocalizedRenderData`

这导致下游 `render-resolved` 无法获得多语言数据展开所需的完整上下文。

### 4.2 Workflow 在上游手工折叠了 render data

当前 fixed helper 中存在 `_build_render_data()`、`_extract_binding_locale()`、`_resolve_localized_binding_value()` 等逻辑，试图在 Workflow 代码中自行根据 binding path 推导多语言字段。

这会带来两个问题：

- 上游先行折叠后，`render-resolved` 无法基于原始业务输入再执行统一的 runtime renderData 逻辑；
- 当前 locale 推断逻辑只覆盖 `cn/zh` 与 `jp/ja`，属于局部启发式，无法稳定覆盖 `en` 及未来更多语言场景。

### 4.3 共享 `documentRender` Activity 读取了元数据但没有真正下发

当前 `fixed-activity-templates.ts` 中的共享 `documentRender` Activity 已经读取了：

- `workflowInputParams`
- `workflowInputPolicy`
- `prepareLocalizedRenderData`
- `sourceLanguage`
- `targetLanguages`

但这些字段并没有完整写入发往 `/studio/render-resolved` 的 `payload`。

也就是说，即使上层 Workflow 补传了这些字段，Activity 也会在请求 Carbone runtime 之前再次丢失关键信息。

### 4.4 `render-resolved` 的多语言展开条件未被触发

`studio-render.controller.ts` 中只有在满足以下条件时，才会调用 `templateWorkflowService.renderData()` 做多语言展开：

- `prepareLocalizedRenderData === true`
- 存在有效 `templateFieldSpecs`

当前固定模板链路没有稳定传入 `prepareLocalizedRenderData=true`，也没有稳定透传 `workflowInputParams` 与 `workflowInputPolicy`，因此 runtime 侧无法进入统一多语言渲染逻辑。

## 5. 目标

本次修复目标如下：

- 固定模板文档工作流不再自行手写多语言字段折叠逻辑；
- 多语言数据展开统一收口到 `/studio/render-resolved`；
- Workflow 生成代码与共享 `documentRender` Activity 均完整透传 runtime 所需元数据；
- `zh / ja / en / 未来扩展语言` 均走统一 runtime 规则，不再依赖 Workflow 代码中的后缀猜测；
- 修复后固定模板生成的 Word 内容与 `render-resolved` 单独调用结果保持一致。

## 6. 修改方案

### 6.1 修改固定模板 Workflow 生成逻辑

文件：

- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow-fixed-document-workflow-code.helpers.ts`

修改原则：

- 不在 Workflow 代码中自行做多语言 render data 拼装；
- 保留参数归一化和必填校验；
- 将原始业务入参作为 runtime 输入透传；
- 将多语言相关运行时元数据一并透传给 `documentRender` Activity。

具体调整：

1. 删除或最小化以下 helper 在生成代码中的使用：
   - `_build_render_data()`
   - `_extract_binding_locale()`
   - `_resolve_localized_binding_value()`
   - `_set_bound_value()`
   - `_ensure_array_path()`
   - `_set_nested_value()`
2. `activity_input["data"]` 改为直接传 `normalized_params`，而不是 `_build_render_data(normalized_params)`。
3. 在 `activity_input` 中新增：
   - `workflowInputParams`
   - `workflowInputPolicy`
   - `prepareLocalizedRenderData`
4. `prepareLocalizedRenderData` 在固定模板文档链路下默认传 `True`。
5. 保留 `sourceLanguage`、`targetLanguages`、`outputName`、`templateId`、`skillId` 透传。

建议生成后的目标结构示意：

```python
activity_input = {
    "templateId": "...",
    "skillId": "...",
    "data": normalized_params,
    "workflowInputParams": {...},
    "workflowInputPolicy": {...},
    "prepareLocalizedRenderData": True,
    "sourceLanguage": "...",
    "targetLanguages": [...],
    "outputFormat": "docx",
    "outputName": "...",
}
```

### 6.2 修改共享 `documentRender` Activity

文件：

- `apps/backend/core/platform/src/modules/temporal-workflow/fixed-activity-templates.ts`

修改原则：

- Activity 不重建多语言逻辑；
- Activity 只负责参数校验、请求转发和返回下载结果；
- 所有 runtime 侧需要的字段必须原样透传到 `/studio/render-resolved``。

具体调整：

1. 在构造 `payload` 时补充透传：
   - `sourceLanguage`
   - `targetLanguages`
   - `workflowInputParams`
   - `workflowInputPolicy`
   - `prepareLocalizedRenderData`
2. 若存在 `sourceLanguage` 或 `targetLanguages`，且上游未显式指定 `prepareLocalizedRenderData`，固定模板链路默认设为 `True`。
3. 保持现有 `/studio/render-resolved` 调用方式不变，不新增新的文档渲染入口。

目标效果：

- Workflow 传给 Activity 的上下文，不会在 Activity 内被截断；
- `render-resolved` 可以完整获得 runtime 兼容层所需信息。

### 6.3 统一职责边界

职责重构原则如下：

- Workflow 负责参数校验、执行编排、调用 Activity；
- `documentRender` Activity 负责调用统一文档渲染入口；
- `/studio/render-resolved` 负责根据模板 binding plan 与语言配置生成最终渲染数据；
- Carbone 引擎只负责使用最终 `data` 渲染文档。

换句话说：

- 不再允许 Workflow 代码自行决定 `partyAName_zh`、`partyAName_ja` 应如何拼出；
- 统一由 runtime renderData 生成这些字段。

## 7. 详细改动清单

### 7.1 `temporal-workflow-fixed-document-workflow-code.helpers.ts`

计划改动：

- 删除上游 locale 猜测逻辑；
- 删除上游多语言字段折叠逻辑；
- 保留 `RENDER_BINDINGS` 仅在确有必要时用于向 runtime 传递配置，而不是直接生成最终 render data；
- 生成代码时内联：
  - `workflowInputParams`
  - `workflowInputPolicy`
  - `prepareLocalizedRenderData=True`
- `data` 改为 `normalized_params`。

### 7.2 `fixed-activity-templates.ts`

计划改动：

- 在 `payload` 中补充：
  - `payload["sourceLanguage"]`
  - `payload["targetLanguages"]`
  - `payload["workflowInputParams"]`
  - `payload["workflowInputPolicy"]`
  - `payload["prepareLocalizedRenderData"]`
- 增加显式日志，便于确认 Activity 是否进入多语言透传模式。

### 7.3 单元测试与回归测试

需要同步修复或新增测试：

- `apps/backend/core/platform/test/temporal-workflow-template.test.ts`
- `apps/backend/domain/carbone-engine/src/modules/studio/studio.controller.workflow.spec.ts`

重点校验：

1. 生成的固定模板 Workflow 代码中包含：
   - `"data": normalized_params`
   - `"workflowInputParams": {...}`
   - `"workflowInputPolicy": {...}`
   - `"prepareLocalizedRenderData": True`
2. 共享 `documentRender` Activity 生成代码中包含：
   - `payload["workflowInputParams"] = workflow_input_params`
   - `payload["workflowInputPolicy"] = workflow_input_policy`
   - `payload["prepareLocalizedRenderData"] = True`
3. `render-resolved` 在固定模板调用场景下能够命中：
   - `templateWorkflowService.renderData()`
4. 最终传给渲染引擎的数据包含：
   - `xxx_zh`
   - `xxx_ja`
   - `xxx_en`（如模板配置存在）

## 8. 验证方案

### 8.1 静态验证

- 重新生成固定模板 Workflow 代码；
- 检查生成的 Python 中是否仍存在上游多语言字段拼装逻辑；
- 确认 `activity_input` 中存在 runtime 所需全部字段。

### 8.2 接口验证

选取一个带多语言模板字段的固定模板工作流，执行以下验证：

1. 调用固定模板工作流生成代码接口；
2. 确认生成代码中：
   - `data` 使用 `normalized_params`
   - 存在 `workflowInputParams`
   - 存在 `workflowInputPolicy`
   - 存在 `prepareLocalizedRenderData=True`
3. 执行真实 Workflow 验证或文档渲染验证；
4. 检查 `/studio/render-resolved` 请求体是否携带上述字段；
5. 检查 `templateWorkflowService.renderData()` 是否被调用；
6. 检查最终 `engine.render()` 输入中是否包含本地化字段。

### 8.3 业务验证

准备一个最小可验证模板：

- 原始语言：`zh`
- 目标语言：`ja`
- 文档类型：Word
- 字段示例：
  - `partyAName`
  - `contractTitle`
  - `signDate`

验收结果要求：

- Word 中中文位填充中文；
- 日文位填充日文；
- 未配置的语言不应误填；
- 输出文件名、下载链接、渲染格式保持不变。

## 9. 风险与兼容性

### 9.1 风险

- 若部分旧工作流依赖当前错误的上游字段折叠逻辑，修复后其行为会发生变化；
- 若模板元数据或 `workflowInputPolicy` 缺失，runtime 仍可能无法正确展开本地化字段；
- 若历史测试用例写死了旧行为，需要同步更新。

### 9.2 兼容策略

- 本次只调整固定模板文档渲染链路；
- 不改动 `/studio/render-resolved` 对外接口契约；
- 不新增新的 workflow DSL 字段；
- 优先复用已存在的 runtime renderData 机制，避免引入第二套多语言渲染规则。

## 10. 实施顺序

建议按以下顺序落地：

1. 修改 `temporal-workflow-fixed-document-workflow-code.helpers.ts`
2. 修改 `fixed-activity-templates.ts`
3. 更新 `temporal-workflow-template.test.ts`
4. 更新 `studio.controller.workflow.spec.ts`
5. 本地执行固定模板多语言渲染回归验证
6. 再验证普通单语言模板未受影响

## 11. 预期结果

修复完成后，固定模板文档生成链路应满足：

- Workflow 不再手工做多语言字段拼装；
- Activity 不再吞掉 runtime 元数据；
- `render-resolved` 统一负责多语言 render data 生成；
- 固定模板生成的 Word 文档内容与模板语言配置一致；
- 中文、日文、英文等多语言字段都能按照模板绑定规则正确落位。

## 12. 本次不处理内容

本次方案不覆盖以下内容：

- AI 生成路径的提示词优化；
- 固定 HTTP/结构化转换链路问题；
- Word 模板识别或模板资产化流程调整；
- Carbone 引擎底层渲染算法调整。

---

如进入实施阶段，建议优先以“删除上游多语言折叠逻辑 + 透传 runtime 元数据”为最小修复集，先恢复正确性，再视情况清理冗余 helper 与补齐更多语言场景测试。
