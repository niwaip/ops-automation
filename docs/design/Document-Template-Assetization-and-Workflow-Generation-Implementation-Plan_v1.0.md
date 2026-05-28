# 文档模板资产化与工作流固定生成落地计划 `v1.0`

日期：2026-05-27

> 目标
>
> - 让文档模板可以作为可导入导出的资产跨系统迁移。
> - 让“通过文档模板生成工作流”成为一次性、确定性的代码生成过程。
> - 让 `carbone-engine` 收敛为纯渲染运行时，不再承担工作流语义中心职责。

---

## 1. 背景

当前系统中，文档模板相关能力分散在三个位置：

- `office-addin` 负责模板参数识别、模板生成、AI 指南生成，同时残留部分“工作流草稿/保存”入口。
- `carbone-engine` 既承担模板识别和模板保存，也承担 `templateFieldSpecs -> carboneBindingPlan` 的编译与持久化。
- `portal + temporal-workflow` 负责“创建工作流”页面和工作流代码生成，但“通过文档模板创建工作流”当前只消费 `templateId / variables / skillId` 等有限元信息。

这导致当前存在三个结构性问题：

- 模板语义依赖运行中的服务和历史存储，难以作为资产完整迁移。
- 文档模板生成工作流时没有一次性固化全部语义，运行时仍然依赖动态补信息。
- `carbone-engine` 同时承担资产构建与运行时渲染两类职责，边界过宽。

---

## 2. 设计结论

本次改造采用以下三条硬约束作为最终设计原则：

- **模板资产不依赖数据库才能成立。**
- **通过文档模板生成工作流时，必须通过代码生成把全部语义固定下来。**
- **`carbone-engine` 只负责渲染，不再承担工作流编排语义中心。**

对应的最终口径如下：

- `office-addin` 只负责模板参数解析、模板生成、AI 指南生成。
- 文档模板的“字段定义、语言信息、绑定规则、说明信息”必须内聚为模板资产自身的一部分。
- `portal / temporal-workflow` 在“通过模板创建工作流”时读取模板资产，生成完整的 `workflowDsl + activityDsl + generated code`。
- `carbone-engine` 在运行态只接收模板资产引用和最终渲染数据，执行 `template + data -> output`。

---

## 3. 改造目标

### 3.1 业务目标

- 支持将文档模板导出为可迁移资产包，在另一套系统中导入后仍可生成同等工作流。
- 支持在 `portal` 的“通过文档模板创建工作流”入口中一键生成完整工作流，而不是依赖历史保存状态。
- 让工作流发布后具备稳定、可审计、可复现的输入输出契约。

### 3.2 技术目标

- 将 `templateFieldSpecs`、`languageProfile`、`renderPlan` 从“运行时附加元数据”提升为“模板资产主数据”。
- 将当前 `carboneBindingPlan` 重命名或等价收敛为更中性的模板渲染计划对象，例如 `renderPlan`。
- 在 Temporal 工作流生成阶段完成确定性编译，避免运行时回查模板隐式语义。
- 移除“只有先在 addin 保存过 template workflow，portal 才能创建完整工作流”的隐式依赖。

---

## 4. 非目标

- 本期不解决模板资产的对象存储归档与 CDN 分发。
- 本期不重做 `office-addin` 的全部识别 UI，只收敛职责和保存出口。
- 本期不强制删除现有数据库表，但新架构不得以数据库为唯一事实来源。
- 本期不要求浏览器模板工作流和文档模板工作流共用完全相同的资产格式，只要求文档模板先闭环。

---

## 5. 目标架构

### 5.1 角色划分

#### `office-addin`

职责：

- 提取 Office 文档结构。
- 识别模板参数和字段。
- 生成 AI 指南。
- 生成模板文件和模板资产清单。

不再负责：

- 工作流草稿生成。
- 工作流正式保存。
- 工作流绑定计划的最终归档中心。

#### `carbone-engine`

职责：

- 模板结构识别与资产构建辅助。
- 模板渲染。
- 模板资产导入导出接口。

不再负责：

- Temporal 工作流生成中心。
- 工作流运行时参数语义补完。
- 通过历史数据库记录决定工作流生成结果。

#### `portal + temporal-workflow`

职责：

- 从模板资产生成工作流。
- 固定输入输出参数。
- 固定 Activity 配置。
- 固定工作流代码。
- 管理后续验证、编辑、发布流程。

### 5.2 目标主链路

#### 模板资产构建链路

1. `office-addin` 提取 `DocumentIR` 并识别字段。
2. 后端基于字段定义编译模板资产清单。
3. 模板二进制文件与清单一起组成模板资产。
4. 资产可导出、导入、跨环境迁移。

#### 工作流创建链路

1. `portal` 选择一个文档模板资产。
2. `temporal-workflow` 服务读取模板资产清单。
3. 编译生成完整 `workflowDsl`、`activityDsl`、输入输出参数和生成代码。
4. 保存为 Temporal 工作流记录。

#### 运行时渲染链路

1. 工作流运行时完成输入校验和参数组织。
2. 渲染 Activity 将最终 `data` 传给 `carbone-engine`。
3. `carbone-engine` 只执行渲染并返回产物。

---

## 6. 模板资产模型

### 6.1 推荐资产包结构

```text
template-asset/
  template.bin                    # docx/xlsx/pptx 原始模板
  template.manifest.json          # 模板资产清单
  skill-guide.json                # 可选，AI 指南
  preview.html                    # 可选，预览缓存
```

### 6.2 `template.manifest.json` 建议结构

```json
{
  "assetVersion": "1.0",
  "assetType": "document_template",
  "template": {
    "templateId": "uuid",
    "fileName": "contract.docx",
    "format": "docx"
  },
  "languageProfile": {
    "sourceLanguage": "zh",
    "targetLanguages": ["en"],
    "documentMode": "single_or_bilingual"
  },
  "templateFieldSpecs": [],
  "renderPlan": {
    "version": 1,
    "bindings": []
  },
  "variables": [],
  "loops": [],
  "skillGuideRef": {
    "embedded": true,
    "file": "skill-guide.json"
  },
  "sourceMetadata": {
    "generatedAt": "2026-05-27T00:00:00.000Z",
    "generatedBy": "office-addin"
  }
}
```

### 6.3 关于 `carboneBindingPlan`

建议进行术语收敛：

- 对外资产层统一改名为 `renderPlan`。
- 代码内部允许短期保留 `carboneBindingPlan` 兼容字段。
- 迁移期可采用双写：
  - `templateWorkflow.carboneBindingPlan`
  - `templateWorkflow.renderPlan`

长期目标：

- 资产层、工作流生成层、运行时配置层都使用 `renderPlan`。
- `carbone` 不再拥有该对象的命名主导权，只消费最终渲染参数。

---

## 7. 关键设计决策

### 7.1 不再以 DB 作为模板资产唯一事实来源

要求：

- 任意模板资产必须可以脱离数据库独立存在。
- 导入到新系统时，只要资产包完整，就能重新生成工作流。

落地方式：

- 模板清单中的 `templateFieldSpecs`、`languageProfile`、`renderPlan` 都必须落到文件资产中。
- 数据库中可以缓存索引、检索字段、上传记录，但不能成为唯一语义来源。

### 7.2 工作流生成必须是“全量固定化编译”

要求：

- 创建工作流时即固定 `inputParams`、`outputParams`、Activity 配置、渲染计划、生成代码。
- 运行时不再回查模板是否“已经保存过 workflow”。

落地方式：

- `generateTemplateWorkflowDraft()` 读取模板资产清单，而不是只读 `variables`。
- 工作流生成结果必须显式带上：
  - 模板资产引用
  - `renderPlanVersion`
  - `templateFieldCount`
  - 生成时间与来源信息

### 7.3 `carbone-engine` 只做渲染

要求：

- 运行时 `carbone-engine` 不负责解释工作流、推断字段绑定、补齐语义。

落地方式：

- 渲染 Activity 将最终 `renderData` 和模板资产引用作为入参发给 `carbone-engine`。
- `carbone-engine` 不再承担“根据历史模板 workflow 元数据重建运行逻辑”的职责。

---

## 8. 现状代码映射

### 8.1 现有关键实现

- `office-addin` 工作流残留逻辑：
  - `apps/frontend/office-addin/src/components/AIIdentifyPanel/useAIIdentifyPanel.ts`
  - `apps/frontend/office-addin/src/components/useTemplateWorkflow.ts`
- `carbone-engine` 模板工作流编译：
  - `apps/backend/domain/carbone-engine/src/modules/studio/template-workflow.service.ts`
- `carbone-engine` 模板保存与模板详情输出：
  - `apps/backend/domain/carbone-engine/src/modules/studio/studio.controller.ts`
- `portal` 创建工作流页面：
  - `apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx`
  - `apps/frontend/portal/src/features/admin/temporal/components/WorkflowEditModal.tsx`
- Temporal 模板工作流草稿生成：
  - `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.service.ts`

### 8.2 当前不符合目标边界的点

- `office-addin` 内仍保留“暂存草稿 / 正式保存模板”式工作流入口。
- `carbone-engine` 内由 `compileAndPersistTemplate()` 编译并持久化 `carboneBindingPlan`，但该结果没有成为工作流生成的标准输入。
- `generateTemplateWorkflowDraft()` 只消费模板基础元数据，没有消费完整模板资产语义。

---

## 9. 实施阶段

## 9.1 Phase 0: 契约冻结

目标：

- 在文档层统一术语和目标结构，避免边开发边改口径。

任务：

- 冻结模板资产清单结构。
- 冻结 `renderPlan` 数据结构。
- 冻结“模板资产 -> 工作流草稿”的输入输出 DTO。
- 明确兼容期 `carboneBindingPlan` 与 `renderPlan` 的映射关系。

产出：

- 模板资产 DTO 文档。
- 工作流生成 DTO 文档。

验收：

- `office-addin`、`carbone-engine`、`portal`、`temporal-workflow` 四端对同一份结构达成一致。

## 9.2 Phase 1: 资产化改造

目标：

- 让模板语义从“数据库附带元数据”变成“模板资产主数据”。

任务：

- 在 `carbone-engine` 中新增模板资产清单构建逻辑。
- 将 `templateFieldSpecs`、`languageProfile`、`renderPlan` 统一写入模板清单文件。
- 为模板详情接口返回完整资产清单。
- 增加模板资产导出接口。
- 增加模板资产导入接口。

建议接口：

- `POST /studio/template-assets/build`
- `GET /studio/template-assets/:id`
- `GET /studio/template-assets/:id/export`
- `POST /studio/template-assets/import`

代码改造点：

- `template-workflow.service.ts`
  - 抽出 `compileBindingPlan()` 的通用结果结构。
  - 增加 `buildTemplateAssetManifest()`。
- `studio.controller.ts`
  - 新增资产导入导出接口。
  - 现有 `GET /studio/templates/:id` 补充返回 `templateAssetManifest`。

验收：

- 单个模板可导出为资产包。
- 删除数据库记录后，仅依赖资产包仍可重新导入恢复模板语义。

## 9.3 Phase 2: 工作流生成固定化

目标：

- 让“通过文档模板创建工作流”只依赖模板资产，不依赖历史数据库状态。

任务：

- 扩展 `CarboneTemplateMeta` 为完整模板资产输入结构。
- 改造 `generateTemplateWorkflowDraft()`，改为读取 `templateFieldSpecs + renderPlan + languageProfile`。
- 生成 `workflowDsl` 时固定输入输出参数。
- 生成 `activityDsl` 时固定模板引用、渲染步骤和 `renderPlanVersion`。
- 生成代码时将模板资产语义编译进最终代码或 Activity 配置。

代码改造点：

- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.service.ts`
  - `fetchCarboneTemplate()` 改为返回完整模板资产结构。
  - `generateTemplateWorkflowDraft()` 不再只依赖 `variables`。
  - 在 `sourceContext` 中记录资产版本、`renderPlanVersion`、字段数。

验收：

- 即使模板从未在 addin 中做过“工作流保存”，只要资产清单存在，也能在 portal 中生成完整工作流。
- 生成出的工作流可在断开模板数据库上下文的情况下保持稳定运行。

## 9.4 Phase 3: Addin 职责剥离

目标：

- 去除 `office-addin` 中残留的工作流生成/保存入口。

任务：

- 移除“制作草稿/验证保存”中带有工作流语义的命名和流程。
- 将 `saveTemplateWorkflow()` 从 addin 主链路中下沉为“资产构建”能力，而不是“工作流保存”能力。
- 删除或收缩 `useTemplateWorkflow.ts` 中的“生成 AI 指南后直接保存完整模板工作流”语义。
- Addin 页面改为：
  - 识别字段
  - 保存模板资产
  - 生成 AI 指南
  - 预览模板

代码改造点：

- `apps/frontend/office-addin/src/components/AIIdentifyPanel/useAIIdentifyPanel.ts`
- `apps/frontend/office-addin/src/components/useTemplateWorkflow.ts`
- `apps/frontend/office-addin/src/components/AIIdentifyPanel/DraftWorkflowSection.tsx`
- `apps/frontend/office-addin/src/components/AIIdentifyPanel/VerifySaveSection.tsx`

验收：

- Addin 中不再出现“创建工作流、保存工作流、恢复工作流草稿”等职责越界入口。

## 9.5 Phase 4: 运行时收敛

目标：

- `carbone-engine` 彻底收敛为渲染运行时。

任务：

- 将运行时渲染接口收敛为仅接收模板资产引用与渲染数据。
- Workflow Activity 调用统一的 document render runtime 接口。
- 将任何“运行时重建 binding plan”的逻辑移出渲染链路。

建议运行时请求模型：

```json
{
  "templateAssetId": "uuid",
  "format": "docx",
  "data": {},
  "outputName": "合同-输出"
}
```

验收：

- 运行时 `carbone-engine` 不再依赖模板 workflow 历史元信息决定执行语义。

---

## 10. 接口与 DTO 变更建议

### 10.1 `carbone-engine` 侧

新增：

- `TemplateAssetManifest`
- `RenderPlan`
- `BuildTemplateAssetRequest`
- `ImportTemplateAssetRequest`

调整：

- `GET /studio/templates/:id`
  - 补充返回 `templateAssetManifest`
- `POST /studio/template/save`
  - 语义调整为“构建或更新模板资产清单”

兼容期：

- 允许继续返回 `templateWorkflow.carboneBindingPlan`
- 同时返回 `templateWorkflow.renderPlan`

### 10.2 `temporal-workflow` 侧

新增或调整：

- `generateTemplateWorkflowDraft(templateId)` 内部改为读取模板资产清单。
- 可新增显式接口：
  - `POST /temporal/generate-template-draft-from-asset`

返回结果中新增：

- `templateAssetVersion`
- `renderPlanVersion`
- `templateFieldCount`
- `sourceTemplateManifestDigest`

---

## 11. 数据迁移策略

### 11.1 存量数据处理

对于已有模板，按以下顺序迁移：

1. 读取历史模板元数据。
2. 若存在 `templateConfig.templateWorkflow.templateFieldSpecs`，直接纳入资产清单。
3. 若存在 `templateConfig.templateWorkflow.carboneBindingPlan`，映射为 `renderPlan`。
4. 若只存在 `variables`，则资产清单标记为“语义不完整”，需后续重新识别或补全。

### 11.2 兼容期策略

兼容期内允许三种模板：

- 完整资产模板
- 旧版带 `templateWorkflow` 元数据模板
- 仅有基础变量信息的旧模板

处理策略：

- 完整资产模板：直接走新链路。
- 旧版 `templateWorkflow` 模板：在线转换为资产清单。
- 仅有变量模板：允许创建简化工作流，但必须给出 warning，不作为最终发布推荐路径。

---

## 12. 开发 Backlog

### P0: 设计冻结

- [ ] 冻结 `template.manifest.json` 结构。
- [ ] 冻结 `renderPlan` 结构。
- [ ] 冻结工作流生成输入输出 DTO。

### P1: 资产化实现

- [ ] 从 `template-workflow.service.ts` 抽出模板资产清单构建器。
- [ ] 新增模板资产导出接口。
- [ ] 新增模板资产导入接口。
- [ ] 模板详情接口返回完整资产清单。

### P2: 工作流生成重构

- [ ] 改造 `generateTemplateWorkflowDraft()` 读取模板资产清单。
- [ ] 将 `renderPlanVersion` 固定进生成结果。
- [ ] 将工作流输入输出参数固定化。
- [ ] 将生成代码与资产版本绑定。

### P3: Addin 收口

- [ ] 移除 addin 中“工作流草稿/保存”残留入口。
- [ ] 重命名 UI 中混淆“模板资产保存”和“工作流保存”的文案。
- [ ] 将 addin 保存动作统一为“保存模板资产”。

### P4: 运行时收敛

- [ ] 收敛 document render Activity 入参。
- [ ] 移除运行态对历史 template workflow 元数据的隐式依赖。
- [ ] 补齐渲染运行时的验收测试。

---

## 13. 风险与应对

### 风险 1：历史模板元数据不完整

影响：

- 无法自动恢复完整 `renderPlan`。

应对：

- 增加迁移状态字段：`complete / partial / legacy_only`。
- 对 `legacy_only` 模板在 portal 中提示“需重新补全模板资产”。

### 风险 2：兼容期前后端双口径并存

影响：

- addin、portal、carbone-engine 可能同时使用旧字段和新字段。

应对：

- 规定兼容窗口。
- 所有兼容逻辑集中在服务层 DTO 映射，不让 UI 感知双口径。

### 风险 3：工作流生成结果与旧运行方式不一致

影响：

- 已有模板在新生成链路下出现输入输出差异。

应对：

- 为模板工作流生成增加 golden case。
- 对关键模板做新旧结果 diff。

---

## 14. 验收标准

### 14.1 资产层验收

- 模板可以导出为独立资产包。
- 资产包导入新系统后，不依赖旧数据库即可恢复模板语义。
- 资产包中包含字段定义、语言信息和渲染计划。

### 14.2 工作流生成验收

- `portal` 中通过文档模板创建工作流时，可以直接生成完整工作流。
- 生成结果中包含固定输入参数、固定输出参数、固定 Activity 配置和固定代码。
- 生成结果可追踪对应模板资产版本。

### 14.3 运行时验收

- 运行态渲染只依赖模板资产引用和最终渲染数据。
- `carbone-engine` 不再通过历史 workflow 元数据推断执行语义。

### 14.4 职责边界验收

- `office-addin` 中不再出现工作流创建/保存职责。
- `portal` 成为工作流创建的唯一正式入口。
- `carbone-engine` 成为模板资产辅助构建与渲染服务，不再承担工作流语义中心。

---

## 15. 推荐实施顺序

建议按以下顺序落地，避免多端同时大改：

1. 先冻结模板资产结构和 `renderPlan` 契约。
2. 在 `carbone-engine` 中实现资产清单构建与导入导出。
3. 改造 `temporal-workflow` 让其消费模板资产清单生成完整工作流。
4. 在 `portal` 中切换“通过模板创建工作流”到新链路。
5. 最后再清理 `office-addin` 中残留的工作流相关入口。

这样可以保证：

- 新链路先可用。
- 老链路在兼容期内仍能工作。
- 最后再做 UI 与职责收口，风险最低。

---

## 16. 一句话结论

本次改造的核心不是“把 `carboneBindingPlan` 挪到哪里存”，而是：

**把模板语义提升为可迁移的模板资产，把工作流生成变成一次性固定化编译，把 `carbone-engine` 收敛为纯渲染运行时。**
