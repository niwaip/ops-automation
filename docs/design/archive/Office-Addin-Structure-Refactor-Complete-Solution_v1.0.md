# Office Add-in 结构治理与真实流程拆分完整解决方案

版本：v1.1  
状态：Completed  
范围：`apps/office-addin`  
目标：在不破坏现有 Word / Excel 主流程的前提下，完成 Office Add-in 的结构治理、边界收口与首批真实落地。

## 1. 当前判断

当前结构已经完成了第一轮 `app / host / api / features / debug / shared / services` 的顶层收口，但仍有三类关键问题需要继续处理：

1. `services/` 中同时混有真实领域服务、历史兼容入口与旧命名残留。
2. 宿主层、分析执行层和 workflow 编排层仍有多个偏大的聚合文件。
3. 部分 UI 区块已经迁入 `features/`，但仍存在错放到错误 feature 的情况。

## 2. 正式结论

### 2.1 `services/` 层的正式定位

`services/` 不是旧目录遗留，而是顶层领域服务层，负责：

- 跨 feature 复用的业务编排
- 纯领域逻辑
- 不适合归入 `api/`、`host/`、`shared/` 的服务能力

但当前 `services/` 存在边界污染，主要体现在两类内容混住：

1. **兼容壳 / 旧入口**
   - `services/analysis-executor.ts`
   - `services/document-load/template-source.service.ts`
   - `services/parameter-identify/document-identify.service.ts`
2. **真实领域服务**
   - `services/analysis-executor/*`
   - `services/identify/*`
   - `services/suggestion-service.ts`

正式结论：

- 保留 `services/` 顶层，不做删除。
- 清理“兼容壳”和“真实实现”混住的问题。
- 对外逐步收口为更少、更稳定的入口，避免 `features/*` 同时依赖多个旧服务路径。

### 2.2 当前偏大文件的正式判断

以下文件仍是当前结构治理的重点对象：

- `host/office/word/word-read.api.ts`
- `services/analysis-executor/chat-analysis-suggestion.helpers.ts`
- `services/suggestion-service.ts`
- `features/workflow/word/useWordWorkflowPanelController.tsx`

正式结论：

- `word-read.api.ts` 是宿主读取能力聚合点，后续应继续按“文档读取 / 下划线检测 / 调试能力 / 文件获取策略”拆分。
- `chat-analysis-suggestion.helpers.ts` 已承担较多 prompt/context 组装职责，后续应继续下沉到更细的 Excel/Word 辅助模块。
- `suggestion-service.ts` 目前更像跨宿主总编排器，优先级高于一般 helper 文件。
- `useWordWorkflowPanelController.tsx` 虽已比旧 panel 明显收敛，但仍应继续抽 presenter/action/cache 相关子能力。

### 2.3 错层 UI 的正式结论

当前确认存在明确错层：

- `features/parameter-identify/shared/DraftWorkflowSection.tsx`
- `features/parameter-identify/shared/VerifySaveSection.tsx`

它们的职责分别对应：

- `DraftWorkflowSection` -> `draft`
- `VerifySaveSection` -> `publish`

此外：

- `features/document-load/shared/TemplateConfigPanel.tsx` 当前同时承担“上传示例文件”和“模板资产管理”两类职责，不能只做目录平移，必须先拆能力。

正式结论：

- `DraftWorkflowSection` 必须收口到 `features/draft/shared`
- `VerifySaveSection` 必须收口到 `features/publish/shared`
- `TemplateConfigPanel` 不直接整块搬迁，而是先拆成 upload-only 与 asset-workflow 两类能力

## 3. 目标结构补充约束

```text
src/
  app/
  host/
  api/
  services/             # 领域服务层；允许被 feature 调用，禁止承载页面/UI
  features/
    document-load/
    parameter-query/
    parameter-identify/
    draft/
    publish/
    workflow/
  debug/
  shared/
  config/
```

新增约束：

- `features/parameter-identify/` 不再承载 draft / publish 语义组件
- `draft/` 只承载模板资产准备、验证、暂存相关流程
- `publish/` 只承载生成参数、预览、保存、发布相关流程
- `services/` 中的兼容入口必须逐步收敛到 facade 或删除

## 4. 分阶段落地顺序

### Phase A：先做边界收口

1. 将 `DraftWorkflowSection` 迁入 `features/draft/shared`
2. 将 `VerifySaveSection` 迁入 `features/publish/shared`
3. 原 `parameter-identify/shared` 保留兼容 re-export
4. 更新直接消费方改用新路径

### Phase B：清理 `services/` 兼容壳

1. 盘点 `analysis-executor.ts`、`document-load/template-source.service.ts`、`parameter-identify/document-identify.service.ts`
2. 将调用方统一收口到真实入口
3. 最后删除不再被引用的旧入口

### Phase C：继续拆大文件

1. 拆 `host/office/word/word-read.api.ts`
2. 拆 `services/analysis-executor/chat-analysis-suggestion.helpers.ts`
3. 收口 `services/suggestion-service.ts`
4. 继续压缩 `features/workflow/word/useWordWorkflowPanelController.tsx`

## 5. 首批落地范围

本轮先落以下内容：

1. 文档正式化
2. 错层 section 迁移到 `draft/shared` 与 `publish/shared`
3. 保留兼容导出，避免一次性改爆引用

## 6. 本轮已完成

截至当前代码状态，已经完成以下收口：

1. `DraftWorkflowSection` 的真实归属已收口到 `features/draft/shared`
2. `VerifySaveSection` 的真实归属已收口到 `features/publish/shared`
3. `parameter-identify/shared` 中这两个旧路径已降级为兼容 re-export
4. `services/analysis-executor.ts`、`services/document-load/template-source.service.ts`、`services/parameter-identify/document-identify.service.ts`、`services/parameter-identify/analysis-executor.service.ts` 已删除
5. 调用方已切换到 `services/analysis-executor/index` 与 `services/suggestion-service` 等真实入口
6. `WordLoadSection` 的参考示例文件上传能力已抽离为独立的 `SampleDocumentUploadPanel`
7. `TemplateConfigPanel` 已收口为纯模板资产工作流面板，不再承载 `upload-only` 分支

## 7. 验收标准

满足以下条件即可认为本轮首批落地完成：

1. 设计文档明确记录 `services/`、大文件、错层 UI 的正式结论
2. `parameter-identify/shared` 不再承载 `DraftWorkflowSection` 与 `VerifySaveSection` 的真实实现
3. `draft/shared` 与 `publish/shared` 成为这两个 section 的真实归属位置
4. 现有调用链在保留兼容导出的前提下可继续工作

## 8. 当前验收结论

基于当前代码状态，本轮“首批落地范围”已经完成并满足验收标准。

已确认事项：

1. `DraftWorkflowSection` 与 `VerifySaveSection` 的真实实现已迁入 `features/draft/shared` 与 `features/publish/shared`
2. `features/parameter-identify/shared` 中对应旧文件仅保留兼容 re-export
3. `services/analysis-executor.ts`、`services/document-load/template-source.service.ts`、`services/parameter-identify/document-identify.service.ts`、`services/parameter-identify/analysis-executor.service.ts` 已删除
4. 直接调用链已收口到 `services/analysis-executor/index`、`services/suggestion-service` 等真实入口
5. `WordLoadSection` 已通过 `SampleDocumentUploadPanel` 承载 upload-only 能力
6. `TemplateConfigPanel` 已收口为模板资产工作流面板，不再承载 upload-only 分支

## 9. 下一阶段

首批落地完成后，后续工作进入下一轮结构治理，重点是 Phase C 的大文件继续拆分：

1. 拆 `host/office/word/word-read.api.ts`
2. 拆 `services/analysis-executor/chat-analysis-suggestion.helpers.ts`
3. 收口 `services/suggestion-service.ts`
4. 继续压缩 `features/workflow/word/useWordWorkflowPanelController.tsx`

## 10. Phase C 进度更新

截至当前代码状态，Phase C 已完成第一轮拆分与收口：

1. `host/office/word/word-read.api.ts` 已降级为 facade，读取能力已按 `debug / file / structure / underline` 拆到独立模块
2. `services/analysis-executor/chat-analysis-suggestion.helpers.ts` 已降级为 re-export facade，文档上下文构建与 suggestion 归一化已拆到独立 helper
3. `services/suggestion-service.ts` 已收口为稳定门面，请求构造与 Excel 专属编排已下沉到独立模块
4. `features/workflow/word/useWordWorkflowPanelController.tsx` 已抽离 `load/query/debug` props 组装逻辑，controller 更聚焦于 hook / state / controller 编排

本轮判断：

- Phase C 的四个目标文件都已完成首轮职责下沉
- 后续如继续推进，应进入更细粒度的二轮拆分，而不是回到原文件继续堆逻辑

## 11. Phase C 二轮完成更新

截至当前代码状态，文档中唯一仍需继续压缩的 `features/workflow/word/useWordWorkflowPanelController.tsx` 已完成二轮拆分：

1. controller 内的交互控制器装配已抽离到 `features/workflow/word/word-workflow.controller-actions.ts`
2. `stepStatus / followup / load/query/debug` 视图 props 组装已抽离到 `features/workflow/word/word-workflow.controller-view.tsx`
3. `useWordWorkflowPanelController.tsx` 已进一步收敛为 hook 状态组合与依赖绑定层，文件体积已压到 `496` 行
4. 文档第 9 节中 Phase C 的最后一个待继续压缩项已完成

当前结论：

- 以本设计文档定义的 Phase C 范围来看，四个目标文件均已完成首轮收口与二轮必要压缩
- 如继续推进下一轮结构治理，新的重点不应再回到 `word-read.api.ts`、`chat-analysis-suggestion.helpers.ts`、`suggestion-service.ts`、`useWordWorkflowPanelController.tsx`
- 后续应改为评估新的大文件候选，例如 `features/parameter-identify/word/identify-recognition.controller.ts`

## 12. 下一轮治理进度更新

截至当前代码状态，`features/parameter-identify/word/identify-recognition.controller.ts` 已完成第一轮二次压缩：

1. 共享类型已抽离到 `features/parameter-identify/word/identify-recognition.types.ts`
2. 章节级批次识别与最终结果提交已抽离到 `features/parameter-identify/word/identify-recognition.execution.ts`
3. `identify-recognition.controller.ts` 已收敛为理解缓存校验、识别流程编排与状态收口层，文件体积已由 `667` 行压到 `153` 行
4. 新增执行文件 `identify-recognition.execution.ts` 当前为 `409` 行，仍处于可接受阈值内

当前判断：

- `identify-recognition.controller.ts` 已不再是大文件治理阻塞点
- 后续如继续细拆，应优先评估 `identify-recognition.execution.ts` 是否需要再按“单章节执行 / 结果提交”进一步拆分
- 本轮继续推进时，应优先处理编译现存问题，而不是回退本次结构拆分

## 13. 编译收口完成更新

截至当前代码状态，`apps/office-addin` 范围内与本轮结构治理相关的编译收口已完成：

1. `features/publish/shared/PublishTemplateSection.tsx` 已修复 `AISuggestion` 引用路径与生成数据分组的类型推断问题
2. `features/parameter-query/word/index.ts` 已改为显式导出 `query-frontend-compare.helpers`，避免 `CompareUnderlineRangeLike` 重复导出冲突
3. `services/analysis-executor/chat-analysis-suggestion-normalizer.helpers.ts` 已清理未使用导入
4. `apps/office-addin` 当前已通过 `npm exec tsc --noEmit`

当前结论：

- 本轮结构治理从“边界收口 + 二轮拆分”推进到了“编译收口完成”
- 以当前代码状态看，`apps/office-addin` 已达到可继续进入下一轮治理的稳定基线

## 14. 收尾清理完成更新

截至当前代码状态，本轮结构治理相关的收尾清理也已完成：

1. `services/document-load/` 与 `services/parameter-identify/` 两个空目录已删除
2. `services/analysis-chat-prompt-templates.ts` 已迁入 `services/analysis-executor/chat-analysis-prompt-templates.ts`
3. `services/analysis-executor/chat-analysis-prompt.helpers.ts` 已切换到新路径，不再依赖顶层 `services/` 下的歧义文件
4. `features/parameter-identify/shared/DraftWorkflowSection.tsx` 与 `features/parameter-identify/shared/VerifySaveSection.tsx` 两个兼容 shell 已删除
5. `features/parameter-identify/shared/index.ts` 已移除对这两个 shell 的 re-export，`draft/shared` 与 `publish/shared` 成为唯一真实出口
6. 清理完成后，`apps/office-addin` 仍通过 `npm exec tsc --noEmit`

最终结论：

- 本文档定义范围内的结构治理、二轮拆分、编译收口与收尾清理均已完成
- 当前代码状态下，本轮任务已真正闭环，不再存在文档范围内的剩余阻塞项
