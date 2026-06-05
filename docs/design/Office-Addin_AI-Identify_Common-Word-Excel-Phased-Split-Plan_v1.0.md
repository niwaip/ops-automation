# Office Addin AI 参数识别模块拆分方案

版本：v1.0  
状态：Draft  
范围：`apps/frontend/office-addin`，并给出 `apps/backend/domain/carbone-engine` 的配套拆分建议  
目标：将当前 AI 参数识别相关逻辑按 `common / word / excel` 进行结构化拆分，并通过分阶段迁移降低功能回归风险

## 1. 背景

当前 Office Addin 的 AI 参数识别能力已经形成了较完整的业务链路，但模块边界不清晰，主要问题集中在以下几个方面：

1. UI 入口已经按 Word / Excel 分流，但核心状态和业务编排仍然混合。
2. 大量 host 分支逻辑散落在公共 hook 和 service 中，导致维护成本持续升高。
3. 参数识别、草稿管理、模板资产、参数应用、AI 指南生成、预览发布等职责混在少数大文件中。
4. `AISuggestion` 同时承担 API 返回模型、前端展示模型、应用模型，导致字段语义被污染。
5. Word 与 Excel 在识别模式、锚点模型、参考值来源、结果合并方式上差异很大，但当前没有形成稳定的 host 领域边界。

## 2. 当前问题概览

### 2.1 关键大文件

- `apps/frontend/office-addin/src/components/WordIdentifyPanel.tsx`
- `apps/frontend/office-addin/src/components/AIIdentifyPanel/useAIIdentifyPanel.ts`
- `apps/frontend/office-addin/src/components/AIIdentifyPanel/useParameterApply.ts`
- `apps/frontend/office-addin/src/services/suggestion-service.ts`
- `apps/backend/domain/carbone-engine/src/modules/studio/template-workflow.service.ts`

### 2.2 当前职责混合现象

#### 前端

- `AIIdentifyPanel.tsx` 已经只做入口分发。
- `useWordIdentifyPanel.ts` 和 `useExcelIdentifyPanel.ts` 只做浅层装配。
- `useAIIdentifyPanel.ts` 同时负责：
  - 识别编排
  - Excel 特殊分析流程
  - 草稿保存 / 恢复
  - 模板资产字段定义
  - AI 指南生成
  - 预览与发布
- `useParameterApply.ts` 同时负责：
  - 通用应用编排
  - Word 双语合并应用
  - Word 表格 loop 应用
  - Excel 手动参数
  - 预览辅助状态
- `suggestion-service.ts` 同时负责：
  - 通用 `DocumentIR` 序列化
  - Word 锚点增强
  - Excel heuristic 识别
  - Excel pair 分析
  - AI 回退、重试、评分、归并

#### 后端

- `template-workflow.service.ts` 同时负责：
  - 模板分析
  - compare candidate 构造
  - 文档理解摘要
  - AI 参与的理解流程
  - 字段识别结果构造
  - 模板理解结果组装

## 3. 拆分目标

### 3.1 一级目标

1. 建立清晰的 `common / word / excel` 目录与模块边界。
2. 将前端识别编排、应用编排、展示编排分别下沉到职责单一的 hook / service。
3. 将 Word 与 Excel 的差异化逻辑从公共模块中逐步剥离。
4. 保持对现有页面、缓存键、接口协议的兼容，避免大范围一次性重写。
5. 让后续“参考值识别”、“双语候选配对”、“Excel pair 分析增强”等需求可以在对应 host 域内迭代。

### 3.2 二级目标

1. 明确 `AISuggestion` 字段语义，避免 `originalText / sampleValue / anchorText` 混用。
2. 降低大文件体量，使关键业务文件尽量回落到 800 行以内。
3. 为后续测试补充、性能排查、缓存治理提供稳定切入点。

### 3.3 非目标

本次方案不要求：

1. 重写全部识别逻辑。
2. 一次性替换所有前后端接口。
3. 立即彻底拆完 `WordIdentifyPanel.tsx` 全部 UI。
4. 改变现有用户交互流程或业务结果格式。

## 4. 拆分原则

1. 先抽 `common`，再剥离 `word / excel`。
2. 先拆编排层，不先改底层算法。
3. 先建立 facade，再迁移实现，避免大面积调用方修改。
4. 优先保持接口稳定，通过适配层承接旧结构。
5. 每个阶段都必须可独立提交、可回归验证、可局部回滚。

## 5. 目标架构

## 5.1 前端目标目录

```text
apps/frontend/office-addin/src/
  components/
    AIIdentifyPanel/
      common/
        identify-panel.types.ts
        useIdentifyDraft.ts
        useTemplateAssetDraft.ts
        useSkillGuideWorkflow.ts
        usePreviewAndPublish.ts
        useAnalysisSummary.ts
      word/
        useWordIdentifyWorkflow.ts
        useWordSuggestionApply.ts
        word-suggestion-grouping.ts
        word-suggestion-anchor.ts
      excel/
        useExcelIdentifyWorkflow.ts
        useExcelSuggestionApply.ts
        excel-suggestion-grouping.ts
        excel-pair-runtime.ts
      useAIIdentifyPanel.ts
      useParameterApply.ts
      useWordIdentifyPanel.ts
      useExcelIdentifyPanel.ts

  services/
    identify/
      common/
        identify.types.ts
        document-serialize.ts
        analysis-summary.ts
        suggestion-normalizer.ts
      word/
        word-anchor-enricher.ts
        word-identify-runner.ts
      excel/
        excel-heuristic.ts
        excel-pair-analysis.ts
        excel-global-understanding.ts
        excel-suggestion-merge.ts
      index.ts
```

## 5.2 后端目标目录

```text
apps/backend/domain/carbone-engine/src/modules/studio/
  workflow/
    common/
      template-workflow.facade.ts
      template-analysis.service.ts
      template-understanding.service.ts
      template-compare.service.ts
      template-render-data.service.ts
    word/
      word-compare-candidate.service.ts
      word-understanding-summary.service.ts
    excel/
      excel-template-analysis.service.ts
```

说明：

- 后端当前并未形成完整的 Excel workflow 专属 service，因此本轮方案以前端拆分为主、后端结构治理为辅。
- 后端建议先做“编排层解耦”，不必在第一轮引入过多新 service。

## 6. 模块边界定义

### 6.1 common 负责什么

- 通用状态模型
- 通用 draft 生命周期
- 模板资产字段定义与保存
- AI 指南生成
- 参数预览与发布
- 通用分析摘要构建
- 通用 suggestion 标准化与错误结构
- host 无关的 facade / orchestrator

### 6.2 word 负责什么

- 章节与 compare candidate 编排
- 参考值提取与段落匹配
- 锚点模型补全
- 双语候选配对
- 双语 suggestion 合并应用
- Word 表格 loop / cell 定位
- Word 专属缓存与识别质量判断

### 6.3 excel 负责什么

- Sheet pair 选择与作用域控制
- Excel heuristic suggestions
- Excel global understanding
- Pair 级 AI 分析与重试
- Loop / table / columnMappings
- 按 pair 合并 suggestion
- Excel 专属应用与手动参数辅助

## 7. 核心数据模型治理

### 7.1 当前问题

当前 `AISuggestion` 中最容易引发混乱的字段是：

- `originalText`
- `details.context`
- `details.beforeBlank`
- `details.afterBlank`
- `details.columnMappings[].sampleValue`

Word compare / sample 识别链已经存在独立 `sampleValue` 概念，但统一落入 `AISuggestion` 时没有被清晰建模，导致下游容易把锚点文本当参考值继续消费。

### 7.2 目标调整

建议在前端逐步把 suggestion 模型拆分为三个层次：

1. `RawSuggestion`
   - 来自 AI 或 heuristic 的原始返回
2. `NormalizedSuggestion`
   - 标准化后的统一结构
3. `RenderableSuggestion`
   - 面板展示和应用阶段使用的结构

建议新增或明确以下字段：

- `sampleValue?: string`
- `anchorText?: string`
- `sourceKind?: 'ai' | 'heuristic' | 'manual'`
- `hostKind?: 'word' | 'excel' | 'ppt'`

兼容策略：

- 短期内保留 `originalText`
- 中期改为：
  - `originalText` 表示原始定位文本或原始内容
  - `sampleValue` 表示用于展示和生成示例值的参考值

## 8. 分阶段拆分方案

## Phase 0：冻结边界与基线

### 目标

在不改业务行为的前提下，明确模块边界、建立迁移基线。

### 工作项

1. 为现状关键链路建立清单：
   - 参数识别
   - 草稿保存 / 恢复
   - AI 指南生成
   - 预览
   - 发布
   - 参数应用
2. 标记所有 `isExcelMode`、`officeType === 'excel'`、`adapter.host === 'excel' / 'word'` 的分支位置。
3. 梳理当前缓存键和 localStorage key：
   - draft
   - compare cache
   - recognition cache
   - understanding cache
4. 形成建议字段语义说明：
   - `originalText`
   - `sampleValue`
   - `anchorText`
   - `context`

### 输出物

- 本方案文档
- host 分支点清单
- suggestion 字段语义说明

### 验收标准

- 所有后续拆分任务都能基于该清单独立排期

## Phase 1：抽取 common 类型与通用 hook

### 目标

把 `useAIIdentifyPanel.ts` 中与 host 无关的部分先拆出去，建立公共骨架。

### 优先拆分模块

- `useIdentifyDraft.ts`
- `useTemplateAssetDraft.ts`
- `useSkillGuideWorkflow.ts`
- `usePreviewAndPublish.ts`
- `identify-panel.types.ts`

### 迁移内容

从 `useAIIdentifyPanel.ts` 中抽离：

- 草稿读取与恢复
- 后端草稿发现
- 模板资产字段保存
- 模板资产术语 JSON 编辑
- AI 指南生成
- 参数生成
- 预览
- 最终保存发布

### 保留在 facade 中的内容

- `useAIIdentifyPanel()` 仍保留原入口
- 通过组合多个子 hook 对外暴露旧接口

### 风险

- 返回对象字段较多，拆分时容易遗漏
- `draftId`、`templateAssetDraftInfo`、`aiSkillGuide` 等状态存在隐式依赖

### 控制策略

- 第一阶段只做内部下沉，不改对外返回字段名称
- 新 hook 返回值全部在 facade 层重新拼装

### 验收标准

- `useAIIdentifyPanel.ts` 文件体量显著下降
- 对外 API 保持兼容
- 草稿、生成、预览、发布流程行为不变

## Phase 2：拆分 `suggestion-service.ts`

### 目标

把 `common / word / excel` 的分析逻辑从一个大 service 中分离。

### 拆分建议

#### common

- `document-serialize.ts`
- `identify.types.ts`
- `analysis-summary.ts`
- `suggestion-normalizer.ts`

#### word

- `word-anchor-enricher.ts`
- `word-identify-runner.ts`

#### excel

- `excel-heuristic.ts`
- `excel-global-understanding.ts`
- `excel-pair-analysis.ts`
- `excel-suggestion-merge.ts`

### 迁移顺序

1. 先抽无状态工具函数
2. 再抽 Excel heuristic 与 pair 分析
3. 再抽 Word anchor enrich
4. 最后保留统一 `analyzeDocumentWithAI()` facade

### 风险

- Excel 分析链是最复杂的组合路径，回归风险高
- 提示词组装、pair retry、fallback 行为容易在拆分时变形

### 验收标准

- `suggestion-service.ts` 仅保留统一入口和组装逻辑
- Excel 与 Word 逻辑不再互相 import 对方细节

## Phase 3：拆分 host 专属识别编排

### 目标

从 `useAIIdentifyPanel.ts` 中彻底移除 Word / Excel 的条件分支。

### 新结构

- `common/useCommonIdentifyWorkflow.ts`
- `word/useWordIdentifyWorkflow.ts`
- `excel/useExcelIdentifyWorkflow.ts`

### 迁移内容

#### common

- 分析开始 / 结束状态
- summary 标准化
- debug log 公共输出
- stagedSuggestions 管理

#### word

- Word 分析参数
- Word 分析结果提交策略

#### excel

- pair 级分析
- Excel 全局理解缓存复用
- Excel suggestion 合并
- Excel draft 保存前的 sheet 处理

### 风险

- `runAnalyze()` 里存在多处分支和重试逻辑
- Excel 局部 pair 分析行为必须完全一致

### 验收标准

- `useAIIdentifyPanel.ts` 中不再出现 `isExcelMode ? ... : ...` 的核心业务分叉
- facade 仅负责组装 common + host 专属 hook

## Phase 4：拆分参数应用链路

### 目标

把 `useParameterApply.ts` 从混合状态机拆成通用应用编排与 host 专属实现。

### 新结构

- `common/useSuggestionApply.ts`
- `word/useWordSuggestionApply.ts`
- `excel/useExcelSuggestionApply.ts`
- `common/suggestion-grouping.ts`

### 迁移内容

#### common

- 批量应用入口
- 统一错误展示
- 分组折叠状态
- 手动参数公共模型

#### word

- 双语 suggestion 配对
- 表格 cell / loop cell target key
- 合并应用规则

#### excel

- Excel 分组策略
- Excel 手动参数默认值
- Excel 预览能力差异

### 风险

- Word bilingual merge 是高风险点
- target key 生成规则不能改变

### 验收标准

- `useParameterApply.ts` 仅保留 facade
- Word / Excel 应用逻辑各自落在独立文件

## Phase 5：拆分 `WordIdentifyPanel.tsx` UI 巨石

### 目标

在底层逻辑稳定后，将超大 UI 文件按职责切成可维护组件。

### 组件拆分建议

- `word/WordUnderstandingSection.tsx`
- `word/WordCompareSection.tsx`
- `word/WordCandidateList.tsx`
- `word/WordRecognitionSection.tsx`
- `word/WordCacheInspector.tsx`
- `word/WordDebugSection.tsx`

### 说明

这一阶段不建议最先做，因为底层逻辑尚未拆完时，UI 组件抽离收益有限，且容易放大状态传递复杂度。

### 验收标准

- `WordIdentifyPanel.tsx` 主要保留页面编排
- 具体区块各自独立

## Phase 6：后端编排层治理

### 目标

将 `template-workflow.service.ts` 的 orchestration 职责继续下沉。

### 优先拆分

- `template-analysis.service.ts`
- `template-compare.service.ts`
- `template-understanding.service.ts`

### 优先下沉的逻辑

- `analyzeTemplate()`
- `understandTemplate()`
- `buildCompareCandidates()`
- `generateUnderstandingSummaryWithAI()`

### 原则

- 保持 controller 与 API 协议不变
- 先拆 service，后考虑是否形成 `word / excel` 后端域

### 验收标准

- `template-workflow.service.ts` 变成 facade / coordinator
- compare / understanding / analysis 不再揉在一个 service 中

## 9. 每阶段交付清单

### Phase 1 交付

- 新增 common hooks
- `useAIIdentifyPanel.ts` 瘦身
- 现有页面无感知

### Phase 2 交付

- `services/identify/` 目录成型
- `suggestion-service.ts` facade 化

### Phase 3 交付

- `useWordIdentifyWorkflow.ts`
- `useExcelIdentifyWorkflow.ts`
- 公共分析流程稳定

### Phase 4 交付

- `useWordSuggestionApply.ts`
- `useExcelSuggestionApply.ts`
- 公共 apply facade

### Phase 5 交付

- `WordIdentifyPanel.tsx` 组件化
- Word compare / recognition UI 结构清晰

### Phase 6 交付

- 后端 workflow 编排层瘦身
- compare / understanding service 边界稳定

## 10. 风险矩阵

### 高风险

1. Excel pair 分析回退与重试
2. Word bilingual suggestion merge
3. `AISuggestion` 字段语义兼容
4. 草稿与缓存键兼容性

### 中风险

1. preview / publish 状态拆分后的依赖顺序
2. hostAdapter 能力差异
3. debug log 内容与顺序变化

### 低风险

1. 纯工具函数迁移
2. 类型定义与目录移动
3. facade 组装层抽离

## 11. 测试与验证策略

### 11.1 前端回归清单

- Word 参数识别
- Word 参考值识别
- Word 双语候选配对
- Word 单条 / 批量应用
- Excel 全量分析
- Excel pair 局部分析
- Excel loop 与列映射
- draft 保存 / 恢复
- AI 指南生成
- 参数预览
- 模板发布

### 11.2 后端回归清单

- template analyze
- compare candidate 构造
- sample value 生成
- understanding summary
- render data 解析

### 11.3 每阶段最低要求

每个阶段至少保证：

1. 关键入口能编译通过
2. 最近修改文件无新增 diagnostics
3. 至少覆盖一条 Word 与一条 Excel 主链路验证

## 12. 建议执行顺序

推荐严格按以下顺序推进：

1. Phase 1：先拆 common hooks
2. Phase 2：再拆 service 层
3. Phase 3：再拆 host 专属识别编排
4. Phase 4：再拆参数应用链路
5. Phase 5：最后处理 Word 巨型 UI
6. Phase 6：并行或随后推进后端治理

不建议的顺序：

1. 直接先拆 `WordIdentifyPanel.tsx`
2. 直接重构 `AISuggestion` 全链路且同时改 UI
3. 同时改前端 facade、service、后端接口

## 13. 里程碑定义

### 里程碑 M1

- common hook 已抽出
- `useAIIdentifyPanel.ts` 不再承担全部状态管理

### 里程碑 M2

- `services/identify/` 结构成型
- Excel 分析链独立

### 里程碑 M3

- Word / Excel 识别 workflow 独立
- 公共 facade 仅保留编排

### 里程碑 M4

- apply 链路拆完
- suggestion grouping 稳定

### 里程碑 M5

- Word UI 巨石拆解完成
- 页面结构可维护

### 里程碑 M6

- 后端 workflow service facade 化
- compare / understanding / analysis 边界清晰

## 14. 推荐首批实施任务

建议从以下任务开始落地：

1. 新建 `AIIdentifyPanel/common/identify-panel.types.ts`
2. 从 `useAIIdentifyPanel.ts` 抽出 `useIdentifyDraft.ts`
3. 从 `useAIIdentifyPanel.ts` 抽出 `useSkillGuideWorkflow.ts`
4. 新建 `services/identify/excel/excel-pair-analysis.ts`
5. 将 `suggestion-service.ts` 中 Excel pair 分析迁入新文件

## 15. 结论

当前系统最合理的拆分路线，不是直接按文件大小切，而是：

1. 先建立 `common / word / excel` 稳定边界
2. 再让 facade 保持兼容
3. 然后逐层把实现下沉

核心判断如下：

- `common` 先抽，才能避免 Word / Excel 继续互相污染。
- `Excel` 分析编排应最早独立，因为其分支最多、回退链最长。
- `Word` UI 巨石应最后拆，因为它依赖前面的 hook 和 service 边界稳定。
- 后端目前更适合做 orchestration 下沉，而不是立刻全面 host 化。

该方案可以作为后续连续多次小步提交的主设计文档使用。
