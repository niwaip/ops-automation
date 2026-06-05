# Office Add-in Word 识别模块拆分与迁移方案 v1.1

## 1. 背景

当前 Office Add-in 中与 Word 文档识别相关的能力分散在 `apps/frontend/office-addin/src/utils/` 下，典型文件包括：

- `word-chapter-detector.ts`
- `word-section-detector.ts`
- `word-parameter-rules.ts`
- `word-section-recognition.ts`

其中：

- `word-chapter-detector.ts` 已经明确承担 Word 章节识别与章节切分职责。
- `word-section-detector.ts` 当前仅为 `word-chapter-detector.ts` 的转发壳文件。
- `word-parameter-rules.ts` 同时承担参数规则配置、标签识别、标题排除、样本文本提取、表格分析、候选组装、调试输出等多种职责，已演变为巨石文件。

这导致以下问题：

- Word 专属能力仍放在通用 `utils` 根目录，领域边界不清晰。
- 参数识别、章节识别、调试输出、样本提取等职责耦合严重。
- 硬编码词典、阈值、兜底规则分散在多个代码块中，维护成本高。
- 后续继续追加特例时，容易放大回归风险。

## 2. 目标

本次迁移设计的目标如下：

1. 将 Word 专属识别能力统一收口到 `src/utils/office/word/`。
2. 将章节识别与参数识别分离为独立模块。
3. 将参数识别内部进一步按职责拆分，降低单文件复杂度。
4. 将硬编码配置与识别流程逐步分离，为后续配置化治理做准备。
5. 保留短期兼容路径，避免一次性迁移导致调用侧大面积改动。

## 3. 非目标

本设计不包含以下内容：

- 本轮不直接重写全部识别规则。
- 本轮不承诺消除所有硬编码，只先完成模块边界重建。
- 本轮不调整后端协议或 `TemplateFieldCandidate` 数据结构。
- 本轮不统一 Excel / PowerPoint 的识别目录结构，仅处理 Word。

## 4. 当前问题拆解

### 4.1 目录层面

当前 `src/utils/` 目录同时放置：

- 通用工具
- Office 相关能力
- Word 专属识别逻辑

这使得 `word-chapter-detector.ts`、`word-parameter-rules.ts` 与 `utils/office/word/api.ts` 处于同一级，语义上不一致。

### 4.2 文件职责层面

`word-parameter-rules.ts` 当前同时包含：

- 规则 profile 管理
- 字段别名词典
- 参数标签识别
- 标题/章节排除
- 样本值提取
- prompt 片段构造
- 下划线参数识别
- 冒号参数识别
- 表格参数识别
- Document IR 采集
- compare candidate 组装
- debug 输出

这违背单一职责原则，也使得局部修改难以评估影响面。

### 4.3 兼容壳文件层面

`word-section-detector.ts` 当前仅有一行转发：

```ts
export * from './word-chapter-detector';
```

该文件不再提供独立能力，长期保留只会增加命名歧义。

## 5. 目标目录结构

建议将 Word 专属识别能力统一迁移到：

```text
apps/frontend/office-addin/src/utils/office/word/
  api.ts
  shared/
    text.ts
    heading.ts
  chapter/
    detector.ts
    debug.ts
    index.ts
  parameter/
    profiles.ts
    anchor.ts
    heading-filter.ts
    sample.ts
    prompt.ts
    paragraph.ts
    table.ts
    collect.ts
    candidates.ts
    debug.ts
    detector.ts
    index.ts
```

如 `word-section-recognition.ts` 经过确认仅服务 Word，也建议后续迁入 `office/word/` 范围内，但不强制要求在第一阶段完成。

### 5.1 共享层约束

为避免 `chapter/` 与 `parameter/` 在拆分后重新形成隐式耦合，建议补充 `shared/` 层，用于承载：

- Word 文本规范化与 lookup 工具
- 标题样式识别等跨模块复用能力
- 后续可沉淀的公共 type / constants

依赖方向要求：

- `chapter/*`、`parameter/*` 可以依赖 `shared/*`
- `chapter/*` 与 `parameter/*` 不应直接依赖对方的编排入口
- 新目录内部禁止反向 import 旧入口文件，如 `word-parameter-rules.ts`、`word-section-detector.ts`
- 旧入口文件仅承担兼容 facade / re-export 职责

## 6. 模块拆分方案

### 6.1 章节识别模块

当前来源文件：

- `apps/frontend/office-addin/src/utils/word-chapter-detector.ts`
- `apps/frontend/office-addin/src/utils/word-section-detector.ts`

目标拆分：

- `office/word/chapter/detector.ts`
  - `deriveWordSectionsFromParagraphs`
  - `deriveWordSectionsFromDocumentIr`
  - 章节标题候选构建与 Office 样式识别逻辑
- `office/word/chapter/debug.ts`
  - `buildWordDocumentStructureDebugText`
  - `buildWordChapterDetectionDebugText`
- `office/word/chapter/index.ts`
  - 统一导出章节模块对外 API

迁移原则：

- `word-chapter-detector.ts` 中的章节核心逻辑整体迁入 `chapter/detector.ts`。
- 调试文本构建逻辑从主检测文件中拆出，避免 detector 同时承担 debug 责任。
- `word-section-detector.ts` 先保留为短期兼容转发壳，最终删除。

### 6.2 参数识别模块

当前来源文件：

- `apps/frontend/office-addin/src/utils/word-parameter-rules.ts`

目标拆分如下。

#### `parameter/profiles.ts`

职责：

- 管理参数规则 profile
- 管理字段别名词典
- 管理模板类型和规则映射

建议迁移内容：

- `WordParameterRuleName`
- `WordDocumentParameterRuleProfile`
- `DEFAULT_WORD_PARAMETER_RULE_PROFILE`
- `WORD_DOCUMENT_PARAMETER_RULE_PROFILES`
- `HEADER_FIELD_SPECS`

#### `parameter/anchor.ts`

职责：

- 标签锚点识别
- 字段别名匹配
- 参数名解析

建议迁移内容：

- `normalizeAnchorCore`
- `extractWordAnchorLabelText`
- `resolveHeaderFieldSpec`
- `resolveExactHeaderFieldSpec`
- `resolveWordHeaderFieldKey`
- `getWordHeaderAliasCandidates`
- `buildWordAnchorCandidates`
- `isExplicitWordParamLabelAnchor`
- `resolveWordAnchorAliasSpec`
- `extractWordParamName`
- `extractWordParamAnchorText`

#### `parameter/heading-filter.ts`

职责：

- 判断某段文本更像标题还是参数
- 为参数识别提供排除条件

建议迁移内容：

- `isAttachmentHeading`
- `looksLikeWordSemanticSectionTitle`
- `looksLikeSectionLeadSentence`
- `looksLikeContextualWordSectionLead`
- `inspectWordHeaderTitle`
- `looksLikeWordHeaderTitle`
- `looksLikeWordOrderedTitleLine`
- `inferWordTitleBlockLanguage`
- `looksLikeWordTitleBlockParagraph`
- `collectWordTitleBlockParagraphIndexes`
- `extractStandaloneHeaderLineValue`
- `shouldSkipOrderedBridgeLabelSegment`

#### `parameter/sample.ts`

职责：

- 从样本文本中推断参数示例值
- 管理差异比对和上下文抽取

建议迁移内容：

- `normalizeWordSampleValue`
- `extractSampleValueFromMatchText`
- `extractWordTrailingUnitLabel`
- `shouldPreferWordTrailingUnitLabel`
- `extractWordUnitComponentFromSampleText`
- `extractSampleValueBetweenContext`
- `buildWordContextStopCandidates`
- `findEarliestWordStopIndex`
- `extractWordValueBetweenPrefixAndStops`
- `trimWordSampleValueBySuffixHints`
- `resolveWordSampleContext`
- `buildWordCompactTextMap`
- `buildWordLcsMatrix`
- `extractWordValueByParagraphDiff`
- `selectBestWordParagraphDiffCandidate`
- `findSampleMatchForWordParam`

#### `parameter/prompt.ts`

职责：

- 生成参数局部提示文本
- 构建 `[参数]` 占位表达

建议迁移内容：

- `isUsefulWordPromptAnchor`
- `cleanWordPromptSideText`
- `WORD_PROMPT_LEFT_CONTEXT_LIMIT`
- `WORD_PROMPT_RIGHT_CONTEXT_LIMIT`
- `trimWordPromptContext`
- `isWordPromptTerminalBoundaryChar`
- `findWordPromptBoundaryBefore`
- `findWordPromptBoundaryAfter`
- `buildWordParamPromptParts`

#### `parameter/paragraph.ts`

职责：

- 段落型参数识别
- 下划线参数识别
- 冒号参数识别

建议迁移内容：

- `extractRepeatedWordTrailingLabels`
- `endsWithWordParamLabel`
- `findWordInlineGapParam`
- `findWordTerminalGapParam`
- `splitWordParagraphLines`
- `detectWordUnderlineParams`
- `detectWordColonParams`

#### `parameter/table.ts`

职责：

- 表格形态分析
- 对照表和循环表参数提取

建议迁移内容：

- `isBlankWordTableCellText`
- `isLikelyWordTableLabel`
- `splitWordTableCellLines`
- `buildWordTableRows`
- `isLikelyWordLoopHeaderRow`
- `countWordNonEmptyCellsAcrossHeader`
- `countWordBlankCellsAcrossHeader`
- `isLikelyWordLoopDataRow`
- `isLikelyWordLoopTemplateRow`
- `isStandardWordLoopTableRows`
- `splitWordTableParamLabels`
- `findNearestWordTableLeftLabelCell`
- `pushDetectedWordTableParam`
- `pushWordLoopTemplateParams`
- `summarizeWordTableRow`
- `countWordFilledHeaderCells`
- `analyzeWordTableParams`
- `detectWordTableParams`

#### `parameter/collect.ts`

职责：

- 从 `DocumentIR` 采集段落、下划线、表格单元格
- 提供参数识别输入准备

建议迁移内容：

- `getWordDocumentElements`
- `getWordDocumentAnchors`
- `toFiniteNumber`
- `collectWordParagraphs`
- `collectWordUnderlines`
- `collectWordTableCells`
- `isParagraphLikelyInsideWordTable`

#### `parameter/candidates.ts`

职责：

- 将检测结果转换为 compare candidate
- 做候选去重和候选构造

建议迁移内容：

- `dedupeDetectedWordParams`
- `buildWordRuleCandidate`
- `buildWordCompareCandidates`
- `buildWordTableCompareCandidates`

#### `parameter/debug.ts`

职责：

- 输出参数识别调试文本

建议迁移内容：

- `truncateWordDebugText`
- `formatWordDebugBoolean`
- `formatWordDebugList`
- `buildWordParameterDetectionDebugText`

#### `parameter/detector.ts`

职责：

- 负责参数识别主编排
- 组装 profile、规则入口和子检测器

建议迁移内容：

- `detectWordParamsByRules`
- `detectWordParameterChecks`
- `getWordDocumentParameterRuleProfile`
- `hasWordCompareCandidateRule`
- `hasWordParameterCheckRule`

#### `parameter/index.ts`

职责：

- 对外导出参数识别模块 API

## 7. 兼容策略

### 7.1 章节模块兼容

短期保留：

- `src/utils/word-chapter-detector.ts`
- `src/utils/word-section-detector.ts`

做法：

- 第一阶段将这两个文件改为 re-export 新目录下的模块。
- 第二阶段统一更新调用方 import。
- 第三阶段删除旧入口文件。

建议兼容形式：

```ts
export * from './office/word/chapter';
```

### 7.2 参数模块兼容

短期保留：

- `src/utils/word-parameter-rules.ts`

做法：

- 第一阶段该文件保留为 orchestrator 或 re-export 入口。
- 子模块拆出后，旧调用方无需立即修改 import。
- 待调用方稳定迁移后，再决定是否保留单入口 facade。
- 新拆出的 `office/word/parameter/*` 模块内部不得反向依赖 `word-parameter-rules.ts`。

## 8. 建议迁移顺序

### 阶段 1：章节模块收口

目标：

- 将 Word 章节能力迁入 `office/word/chapter/`
- 保持外部行为不变

步骤：

1. 创建 `office/word/chapter/`
2. 迁移 `word-chapter-detector.ts` 为 `chapter/detector.ts`
3. 拆出 `chapter/debug.ts`
4. 创建 `chapter/index.ts`
5. 将旧 `word-chapter-detector.ts`、`word-section-detector.ts` 改为兼容导出
6. 增加章节识别基线测试或调试输出快照比对，确保迁移前后行为一致

### 阶段 2：参数配置与锚点识别拆分

目标：

- 优先抽离最稳定、最通用、最少副作用的部分

步骤：

1. 创建 `parameter/profiles.ts`
2. 创建 `parameter/anchor.ts`
3. 更新 `word-parameter-rules.ts` 或 `parameter/detector.ts` 的引用
4. 优先替换 `office/word/` 目录内部对旧路径的依赖，禁止新目录反向引用旧入口

理由：

- 这两块依赖相对清晰
- 对识别行为影响较可控
- 能率先降低顶层文件复杂度

### 阶段 3：样本值提取拆分

目标：

- 剥离最长的 fallback 链

步骤：

1. 创建 `parameter/sample.ts`
2. 迁移样本值匹配和差异比对逻辑
3. 增加针对样本值回填的回归测试

### 阶段 4：表格识别拆分

目标：

- 将表格识别与段落识别分开

步骤：

1. 创建 `parameter/table.ts`
2. 迁移表格分析、表头拆分、循环表/对照表判断逻辑
3. 保留对外 API 不变

### 阶段 5：标题过滤与调试模块拆分

目标：

- 去除参数文件中与章节识别强绑定的部分

步骤：

1. 创建 `parameter/heading-filter.ts`
2. 创建 `parameter/debug.ts`
3. 将 `word-parameter-rules.ts` 收敛为薄编排层

### 阶段 6：清理兼容壳

目标：

- 删除历史遗留入口

步骤：

1. 全仓替换旧 import
2. 删除 `word-section-detector.ts`
3. 视情况删除旧 `word-chapter-detector.ts` 与旧 `word-parameter-rules.ts` facade

## 9. 风险与应对

### 风险 1：识别行为回归

原因：

- 现有识别逻辑依赖大量启发式规则，拆分时容易遗漏某个辅助函数。

应对：

- 每个迁移阶段只拆一层职责。
- 优先保持函数签名与行为不变。
- 使用现有调试输出文本做迁移前后比对。

### 风险 2：循环依赖

原因：

- 参数锚点、标题过滤、样本提取之间存在交叉依赖。

应对：

- 将纯配置和纯文本工具放在最底层模块。
- 避免 `sample.ts` 反向依赖 `detector.ts`。
- `detector.ts` 只依赖子模块，不被子模块反向引用。

### 风险 3：调用路径分散

原因：

- 组件和工具文件可能直接 import 旧路径。

应对：

- 第一阶段保留兼容 re-export。
- 通过全局检索统一替换 import 路径。
- 待替换完成后再删旧壳文件。

## 10. 验收标准

完成迁移后，应满足以下标准：

1. Word 专属识别真实实现收口到 `src/utils/office/word/`，旧入口仅保留 facade / re-export。
2. `word-chapter-detector.ts` 与 `word-section-detector.ts` 不再承担真实实现，或已被删除。
3. `word-parameter-rules.ts` 至少完成 `profiles` 与 `anchor` 的独立拆分，且文件体积明显下降；后续目标是收敛为薄编排层。
4. `chapter/*`、`parameter/*` 与 `shared/*` 的依赖方向清晰，新目录内部不存在反向 import 旧入口文件。
5. 参数识别、章节识别、表格识别、调试输出的职责边界清晰。
6. 主要调用侧行为保持兼容，并具备至少一组迁移前后可比对的基线验证结果。

## 11. 推荐首批落地范围

建议第一批仅做最小闭环：

1. 迁移章节文件到 `office/word/chapter/`
2. 将 `word-section-detector.ts` 变为兼容导出壳
3. 从 `word-parameter-rules.ts` 中拆出：
   - `profiles.ts`
   - `anchor.ts`

这样可以在控制风险的前提下，先完成目录边界梳理和第一轮减重。

## 12. 后续演进建议

在模块边界稳定后，再进行第二阶段治理：

- 将字段别名词典配置化
- 将标题排除关键词配置化
- 将表格识别阈值集中到 constants
- 将英文合同场景特例迁入 profile 或 external config
- 为 `sample.ts` 和 `table.ts` 增补针对性测试

这样可以把当前“硬编码 + 兜底链”逐步转成“配置 + 可解释流程”。
