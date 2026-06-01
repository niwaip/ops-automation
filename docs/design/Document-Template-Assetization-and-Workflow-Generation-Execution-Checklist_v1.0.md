# 文档模板资产化与工作流固定生成执行清单 `v1.0`

日期：2026-05-27

> 说明
>
> - 本文是 [Document-Template-Assetization-and-Workflow-Generation-Implementation-Plan_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/Document-Template-Assetization-and-Workflow-Generation-Implementation-Plan_v1.0.md) 的执行版清单。
> - 目标是把方案下沉到“按服务、按文件、按阶段、按验收项”可直接开工的粒度。
> - 默认优先级顺序为：先冻结契约，再资产化，再改工作流生成，最后清理 Addin 残留入口。

---

## 1. 执行总览

本次改造分为四条并行但有先后依赖的工作流：

- **A. 契约冻结**：冻结模板资产清单、`renderPlan`、工作流生成输入输出 DTO。
- **B. 资产化改造**：让模板语义从 `templateWorkflow` 历史元数据升级为可导入导出的模板资产。
- **C. 工作流生成重构**：让 `portal` 的“通过模版创建工作流”读取模板资产并生成完整固定化工作流。
- **D. Addin 职责收口**：移除 `office-addin` 中残留的工作流生成/保存入口，只保留模板资产构建相关能力。

推荐实施顺序：

1. 先做 A
2. 再做 B
3. 再做 C
4. 最后做 D

---

## 2. 服务拆分清单

## 2.1 `apps/backend/domain/carbone-engine`

### 目标

- 负责模板资产构建、导入导出、渲染。
- 不再作为工作流语义中心。

### 必做项

- [ ] 提供模板资产清单生成能力。
- [ ] 提供模板资产导入导出能力。
- [ ] 保持渲染接口稳定。
- [ ] 兼容旧 `templateWorkflow.carboneBindingPlan`，但对外口径收敛为 `renderPlan`。

### 重点文件

- `apps/backend/domain/carbone-engine/src/modules/studio/template-workflow.service.ts`
- `apps/backend/domain/carbone-engine/src/modules/studio/studio.controller.ts`

## 2.2 `apps/backend/core/platform`

### 目标

- 负责从模板资产生成完整工作流草稿。
- 负责将模板语义固定进 `workflowDsl`、`activityDsl` 和生成代码。

### 必做项

- [ ] `generateTemplateWorkflowDraft()` 改为读取模板资产而不是只读基础模板元信息。
- [ ] 生成结果中显式记录 `templateAssetVersion`、`renderPlanVersion`、字段数、来源信息。
- [ ] 将文档模板工作流生成变成确定性编译，不依赖运行时补语义。

### 重点文件

- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.service.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.controller.ts`

## 2.3 `apps/frontend/portal`

### 目标

- 成为“创建工作流”的唯一正式入口。
- 从模板资产生成工作流，不感知旧 `templateWorkflow` 历史细节。

### 必做项

- [ ] “通过模版创建工作流”入口切到新模板资产链路。
- [ ] 编辑弹窗展示模板资产来源、资产版本、渲染计划版本。
- [ ] 若模板资产不完整，给出明确阻断或 warning。

### 重点文件

- `apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx`
- `apps/frontend/portal/src/features/admin/temporal/components/WorkflowEditModal.tsx`
- `apps/frontend/portal/src/api/temporal.ts`

## 2.4 `apps/frontend/office-addin`

### 目标

- 只负责模板参数识别、模板生成、AI 指南生成和模板资产保存。
- 清除残留的工作流相关语义。

### 必做项

- [ ] 移除或降级“工作流草稿 / 最终保存模板”的工作流语义。
- [ ] 将 `saveTemplateWorkflow()` 重新定义为“保存模板资产清单”。
- [ ] 将 `saveTemplateFull()` 重新定义为“保存模板资产及可选 AI 指南”，而不是“保存工作流”。

### 重点文件

- `apps/frontend/office-addin/src/components/AIIdentifyPanel/useAIIdentifyPanel.ts`
- `apps/frontend/office-addin/src/components/useTemplateWorkflow.ts`
- `apps/frontend/office-addin/src/components/AIIdentifyPanel/DraftWorkflowSection.tsx`
- `apps/frontend/office-addin/src/components/AIIdentifyPanel/VerifySaveSection.tsx`
- `apps/frontend/office-addin/src/components/TemplateConfigPanel.tsx`
- `apps/frontend/office-addin/src/api/carbone-api.ts`

---

## 3. 现状入口与处理策略

## 3.1 Addin 残留入口

### 入口 1：`useAIIdentifyPanel.ts`

当前行为：

- 调 `saveTemplateWorkflow()` 保存字段定义和 `carboneBindingPlan`
- 调 `saveTemplateFull()` 做最终模板保存
- UI 上仍有“暂存草稿 / 恢复草稿 / 保存模板”等带工作流感知的流程

处理策略：

- 保留“字段识别、AI 指南、模板预览、模板资产保存”
- 去掉“工作流草稿”表述
- 所有草稿语义改为“模板资产暂存”

### 入口 2：`useTemplateWorkflow.ts`

当前行为：

- `TemplateConfigPanel` 仍引用 `useTemplateWorkflow()`
- 内含 `generateSkill()`、`saveTemplateFull()`、预览、快速生成等完整旧链路

处理策略：

- 判断是否仍被实际页面使用
- 若仍在用，收敛为纯模板资产工具 hook
- 若已是旧链路残留，安排删除

### 入口 3：`DraftWorkflowSection.tsx`

当前行为：

- 展示“制作草稿”
- 包含“生成指南 / 验证模板 / 暂存草稿 / 恢复最新草稿 / 清除”

处理策略：

- 重命名为“模板资产准备”
- 把 `draftId` 改名为模板资产草稿 ID
- UI 文案彻底移除工作流概念

### 入口 4：`VerifySaveSection.tsx`

当前行为：

- 展示“验证保存”
- 包含 AI 数据生成、预览、保存模板

处理策略：

- 保留“AI 数据生成”和“模板预览”
- 将“最终保存”语义改为“发布模板资产”
- 取消用户对“保存即工作流可用”的误解

## 3.2 Portal 工作流入口

### 入口 1：`TemporalPage.tsx`

当前行为：

- `handleCreateFromTemplate()` 打开“通过模版创建工作流”

处理策略：

- 保持页面入口不变
- 内部切换到新模板资产链路

### 入口 2：`WorkflowEditModal.tsx`

当前行为：

- 调 `temporalWorkflowApi.generateTemplateDraft(template.id)`
- 再将草稿应用到编辑器

处理策略：

- 继续保留交互方式
- 但后端返回从“模板基础元信息推断草稿”升级为“基于模板资产生成固定化草稿”

---

## 4. 阶段执行清单

## 4.1 Phase 0: 契约冻结

### 后端 DTO 清单

- [ ] 定义 `TemplateAssetManifest`
- [ ] 定义 `RenderPlan`
- [ ] 定义 `TemplateAssetExportPayload`
- [ ] 定义 `TemplateAssetImportPayload`
- [ ] 定义 `GenerateTemplateWorkflowDraftFromAssetResult`

### 命名冻结

- [ ] 对外统一使用 `renderPlan`
- [ ] 兼容期允许内部保留 `carboneBindingPlan`
- [ ] UI 和接口文案中不再使用“工作流保存模板”这类混合说法

### 验收标准

- `carbone-engine`、`platform`、`portal`、`office-addin` 使用同一份结构定义
- 不再新增任何只存在于单端的临时字段

## 4.2 Phase 1: `carbone-engine` 资产化改造

### `template-workflow.service.ts`

改造目标：

- 把现有编译逻辑从“存 workflow 元数据”调整为“构建模板资产清单”

执行项：

- [ ] 从 `compileAndPersistTemplate()` 中抽出 `buildRenderPlan()`
- [ ] 保留旧逻辑兼容，但新增 `buildTemplateAssetManifest()`
- [ ] 在服务层增加“由 `templateFieldSpecs + languageProfile` 构建 `renderPlan`”的统一入口
- [ ] 增加 manifest 版本号和生成来源字段

### `studio.controller.ts`

改造目标：

- 暴露模板资产构建、读取、导入、导出能力

执行项：

- [ ] `GET /studio/templates/:id` 增加 `templateAssetManifest`
- [ ] `POST /studio/template/save` 返回资产清单摘要
- [ ] 新增模板资产导出接口
- [ ] 新增模板资产导入接口
- [ ] `readWorkflowConfig()` 改造成兼容读取旧 `templateWorkflow` 与新 `templateAssetManifest`

### 文件存储

执行项：

- [ ] 设计模板资产清单文件存储位置
- [ ] 资产导出包中包含模板二进制、manifest、可选 skill guide
- [ ] 资产导入时避免依赖 DB 主键历史关系

### 测试

- [ ] 增加“从旧 `templateWorkflow` 元数据转换为新 manifest”的单测
- [ ] 增加导入导出回环测试

### 验收标准

- 模板资产导出后可独立保留
- 删除 DB 记录后，仅依赖资产包仍可恢复模板语义

## 4.3 Phase 2: `platform` 工作流生成重构

### `temporal-workflow.service.ts`

改造目标：

- `generateTemplateWorkflowDraft()` 从“读模板元信息”升级为“读模板资产”

执行项：

- [ ] 扩展 `CarboneTemplateMeta` 结构，接入 `templateAssetManifest`
- [ ] `fetchCarboneTemplate()` 返回完整模板资产信息
- [ ] `generateTemplateWorkflowDraft()` 读取 `templateFieldSpecs`
- [ ] `generateTemplateWorkflowDraft()` 读取 `renderPlan`
- [ ] 依据 `renderPlan` 和字段定义固定输入输出参数
- [ ] 生成结果中写入 `templateAssetVersion`
- [ ] 生成结果中写入 `renderPlanVersion`
- [ ] `sourceContext` 中增加资产来源摘要

### `temporal-workflow.controller.ts`

执行项：

- [ ] 维持现有 `generate-template-draft` 接口不变，先做内部升级
- [ ] 如有必要新增 `generate-template-draft-from-asset`，再由前端逐步切换

### 代码生成

执行项：

- [ ] 文档渲染 Activity 配置中固定模板资产引用
- [ ] 文档渲染 Activity 配置中固定 `renderPlanVersion`
- [ ] 生成代码中不再依赖运行时从模板中心补字段绑定

### 测试

- [ ] 增加“完整模板资产 -> 工作流草稿”单测
- [ ] 增加“仅旧 `templateWorkflow` 元数据 -> 自动兼容生成草稿”单测
- [ ] 增加“只有 `variables` 无完整资产 -> 返回 warning”的单测

### 验收标准

- `portal` 中点击“通过模版创建工作流”，即使该模板没走过旧 addin 工作流保存，也能产出完整工作流
- 生成的工作流在运行时不需要动态回查模板绑定语义

## 4.4 Phase 3: `portal` 页面切换

### `TemporalPage.tsx`

执行项：

- [ ] 保持入口按钮不变
- [ ] 若模板资产状态不完整，在选择阶段给出标识

### `WorkflowEditModal.tsx`

执行项：

- [ ] 展示模板资产来源摘要
- [ ] 展示 `renderPlanVersion`
- [ ] 展示模板字段数
- [ ] 对旧模板的兼容 warning 做显式提示

### `api/temporal.ts`

执行项：

- [ ] 更新 `TemplateWorkflowDraft` 类型
- [ ] 补充模板资产相关字段

### 验收标准

- 用户可以在 UI 中看到当前工作流是基于哪个模板资产版本生成的
- 工作流创建页面不再依赖 addin 先手动保存 workflow 语义

## 4.5 Phase 4: `office-addin` 职责收口

### `carbone-api.ts`

执行项：

- [ ] 重新命名或重新注释 `saveTemplateWorkflow()`
- [ ] 将其语义收敛为“保存模板资产清单”
- [ ] 将 `saveTemplateFull()` 语义收敛为“保存模板资产及可选指南”

### `useAIIdentifyPanel.ts`

执行项：

- [ ] 清理“工作流草稿”命名
- [ ] `draftId` 语义改为模板资产草稿 ID
- [ ] 将字段定义保存与工作流概念解绑

### `useTemplateWorkflow.ts`

执行项：

- [ ] 确认是否仍有必要保留
- [ ] 若保留，则改为模板资产辅助 hook
- [ ] 若无必要，则标记删除

### `DraftWorkflowSection.tsx`

执行项：

- [ ] 改名为“模板资产准备”
- [ ] 调整按钮文案
- [ ] 移除“工作流”字样

### `VerifySaveSection.tsx`

执行项：

- [ ] 保留 AI 数据生成和预览
- [ ] “保存模板”改为“保存模板资产”或“发布模板资产”

### `TemplateConfigPanel.tsx`

执行项：

- [ ] 确认旧 hook 链路是否仍在用
- [ ] 若仍使用，则一并改造文案与行为

### 验收标准

- Addin 中不再出现“创建工作流 / 保存工作流 / 恢复工作流草稿”等职责越界入口

---

## 5. 文件级改造表

| 服务 | 文件 | 当前职责 | 目标职责 | 动作 |
|---|---|---|---|---|
| `carbone-engine` | `template-workflow.service.ts` | 编译并持久化 `carboneBindingPlan` | 构建模板资产清单与 `renderPlan` | 重构 |
| `carbone-engine` | `studio.controller.ts` | 模板详情、保存、读取旧 `templateWorkflow` | 输出模板资产、导入导出、兼容旧结构 | 重构 |
| `platform` | `temporal-workflow.service.ts` | 基于模板基础元信息生成草稿 | 基于模板资产生成固定化草稿 | 重构 |
| `platform` | `temporal-workflow.controller.ts` | 暴露草稿生成接口 | 保持接口稳定并接入新生成链路 | 小改 |
| `portal` | `TemporalPage.tsx` | 工作流创建入口 | 保持入口，补资产状态感知 | 小改 |
| `portal` | `WorkflowEditModal.tsx` | 加载模板草稿、编辑工作流 | 展示资产来源与版本信息 | 重构 |
| `portal` | `api/temporal.ts` | 模板草稿 DTO | 扩展资产相关字段 | 小改 |
| `office-addin` | `useAIIdentifyPanel.ts` | 模板识别 + 残留工作流保存 | 模板资产识别与保存 | 重构 |
| `office-addin` | `useTemplateWorkflow.ts` | 旧模板工作流工具流 | 模板资产工具流或删除 | 重构/删除 |
| `office-addin` | `DraftWorkflowSection.tsx` | 工作流草稿 UI | 模板资产准备 UI | 重构 |
| `office-addin` | `VerifySaveSection.tsx` | 验证保存 UI | 模板资产验证与发布 UI | 重构 |
| `office-addin` | `TemplateConfigPanel.tsx` | 旧模板工作流配置页 | 模板资产辅助配置页 | 重构 |
| `office-addin` | `carbone-api.ts` | 模板和 workflow 混合 API | 模板资产 API | 重构 |

---

## 6. 每阶段 Definition of Done

## 6.1 Phase 0 DoD

- [ ] 有明确 `TemplateAssetManifest` 结构
- [ ] 有明确 `RenderPlan` 结构
- [ ] 有明确兼容策略

## 6.2 Phase 1 DoD

- [ ] 模板可以导出为资产包
- [ ] 模板可以从资产包导入
- [ ] `GET /studio/templates/:id` 可以返回资产清单

## 6.3 Phase 2 DoD

- [ ] 工作流草稿生成读取资产清单
- [ ] 生成结果写明资产版本与渲染计划版本
- [ ] 运行时无需回查历史模板 workflow 元数据

## 6.4 Phase 3 DoD

- [ ] `portal` 创建工作流页面可展示模板资产来源信息
- [ ] 模板资产不完整时 UI 有明确 warning

## 6.5 Phase 4 DoD

- [ ] Addin 中无残留工作流入口
- [ ] Addin 中“保存”全部指向模板资产语义
- [ ] 用户不会误解 Addin 为工作流创建入口

---

## 7. 风险前置检查

在正式编码前先完成以下检查：

- [ ] 是否存在依赖 `templateConfig.templateWorkflow.carboneBindingPlan` 的隐藏代码路径
- [ ] 是否存在直接读取 `template.variables` 作为唯一工作流输入契约的地方
- [ ] 是否存在导入导出时会丢失模板二进制文件的路径
- [ ] 是否存在 UI 文案会继续暗示“Addin 保存后工作流就算完成”的位置

---

## 8. 建议任务拆分方式

推荐按以下顺序建任务：

### Epic 1：模板资产契约与导入导出

- Story 1.1 定义 `TemplateAssetManifest`
- Story 1.2 实现模板资产导出
- Story 1.3 实现模板资产导入
- Story 1.4 完成旧模板元数据兼容读取

### Epic 2：文档模板工作流生成重构

- Story 2.1 扩展 `fetchCarboneTemplate()` 返回完整资产
- Story 2.2 改造 `generateTemplateWorkflowDraft()`
- Story 2.3 固定化渲染 Activity 配置
- Story 2.4 扩展返回 DTO 与 UI 展示

### Epic 3：Addin 职责收口

- Story 3.1 收敛 API 语义
- Story 3.2 收敛 `useAIIdentifyPanel.ts`
- Story 3.3 处理 `useTemplateWorkflow.ts`
- Story 3.4 更新 Addin UI 文案和按钮行为

---

## 9. 一句话执行策略

先把模板语义收口成可迁移资产，再让工作流生成只读资产做一次性固定化编译，最后清理 Addin 中所有残留的工作流职责。
