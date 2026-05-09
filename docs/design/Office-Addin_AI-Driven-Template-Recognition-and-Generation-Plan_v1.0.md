# Office Add-in AI 驱动模板识别与生成方案 `v1.0`

日期：2026-05-09

## 1. 背景

当前 [office-addin](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin) 已具备以下基础能力：

- Office Add-in 宿主安装与 sideload 向导。
- 前端任务窗格与 AI 识别主流程。
- 与后端 Carbone API 的识别、模板生成、预览、Skill 生成接口对接。
- Word/Excel/PowerPoint 三个 manifest 与宿主入口。

但当前实现存在明显的宿主能力不均衡问题：

- `Word` 能力最完整，具备较多文档读取、下划线识别、文本高亮、文本替换逻辑。
- `Excel` 仅具备工作表范围读取、选区读取、单元格写入等基础能力。
- `PowerPoint` 仅具备 slide/shape 文本提取与简单写入能力，上层业务链路未闭环。
- 业务组件层直接写大量 `if (officeType === ...)` 分支，宿主能力散落在多个组件中，导致维护成本高、错误边界不清晰。

本设计文档目标是给出一套可落地的 Office Add-in 升级方案，使系统能够基于 Office 官方 API，完成对 `Word / Excel / PPT` 的结构化识别、AI 辅助命名与规则补全、对象级回写、最终模板生成与保存。

## 2. 目标

### 2.1 业务目标

- 支持按规则与 AI 结合的方式识别 `Word / Excel / PPT` 文档中的可参数化区域。
- 支持生成统一的模板建议，包括：
  - 变量建议
  - 循环建议
  - formatter 建议
  - 表格/图片/形状占位符建议
- 支持在 Office 文档中预览建议、应用建议、保存模板、生成 Skill。
- 最终模板尽量基于完整的 `docx / xlsx / pptx` 文件生成，而不是基于纯文本或 JSON 摘要生成。

### 2.2 技术目标

- 使用更多 Office 官方 API 做对象级提取与回写。
- 建立统一的宿主适配层与中间文档模型。
- 将 AI 从“原始文本处理器”升级为“结构化文档增强器”。
- 将组件层和宿主 API 解耦，使前端主流程不再依赖散落的宿主分支。

## 3. 非目标

- 第一阶段不追求 PowerPoint 复杂版式自动重排。
- 第一阶段不追求 Excel 复杂公式反向建模。
- 第一阶段不追求对所有 Office 版本做完全兼容，只覆盖当前项目目标版本与必要的 Requirement Set。

## 4. 当前系统分析

### 4.1 当前能力概览

当前主要代码位于：

- [AIIdentifyPanel.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin/src/components/AIIdentifyPanel.tsx)
- [TemplateConfigPanel.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin/src/components/TemplateConfigPanel.tsx)
- [office-api.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin/src/utils/office-api.ts)
- [carbone-api.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin/src/api/carbone-api.ts)

当前端到端链路为：

1. 前端从 Office 宿主提取内容。
2. 调用后端识别接口生成建议。
3. 用户在前端查看和应用建议。
4. 前端调用模板生成、Skill 生成、预览、保存接口。

### 4.2 宿主支持现状

#### Word

- 已有较多 `Word.run` 逻辑。
- 已支持全文读取、下划线识别、段落结构、部分精确替换和高亮。
- 是当前唯一接近完整链路的宿主。

#### Excel

- 已支持：
  - `getUsedRange()`
  - 选区读取
  - 向单元格写 marker
- 尚未支持：
  - 表格结构建模
  - 命名单元格和命名区域
  - 公式区/汇总区识别
  - 对象级预览与稳定回写

#### PowerPoint

- 已支持：
  - slide 列表读取
  - shape 列表读取
  - 文本框内容提取
  - 简单文本写回
- 尚未支持：
  - 完整模板应用链路
  - 上层统一预览/应用/保存闭环
  - 稳定的 shape 锚点驱动回写

### 4.3 主要问题

- 宿主逻辑散落在组件层，缺乏统一抽象。
- `Word / Excel / PPT` 没有统一的中间表示。
- AI 接口更多基于文本，缺乏对象锚点。
- 模板生成阶段对 `Word` 之外的宿主仍然存在降级行为。
- PowerPoint 存在 API 封装与调用不一致的情况，说明宿主边界尚未收敛。

## 5. 设计原则

- 优先使用 Office 官方对象模型，而不是纯文本匹配。
- 文本搜索仅作为 fallback，不作为主回写路径。
- 统一宿主抽象，宿主差异收敛到 adapter 层。
- 统一结构化文档模型，AI 只处理结构与语义，不处理宿主细节。
- 最终模板尽量基于完整文件导出。
- Word 优先产品化，Excel 第二阶段，PPT 第三阶段。

## 6. 目标架构

### 6.1 分层结构

建议新增如下前端结构：

```text
apps/frontend/office-addin/src/
  adapters/
    types.ts
    document-ir.ts
    capabilities.ts
    index.ts
    word-adapter.ts
    excel-adapter.ts
    powerpoint-adapter.ts
  services/
    suggestion-service.ts
    template-source-service.ts
  utils/
    office-api.ts
```

分层职责如下：

- `adapters/`
  - 直接与 Office 官方 API 交互。
  - 负责宿主能力探测、结构提取、预览与应用建议、导出模板源文件。
- `services/`
  - 负责业务编排，如调用 AI 接口、调用模板保存接口、拼装请求。
- `components/`
  - 只负责 UI 展示与交互流程，不再直接编写宿主 API 逻辑。

### 6.2 HostAdapter 抽象

定义统一接口：

```ts
export interface HostAdapter {
  host: 'word' | 'excel' | 'ppt';
  getCapabilities(): Promise<HostCapabilities>;
  extractDocument(): Promise<DocumentIR>;
  extractSelection(): Promise<DocumentSelection | null>;
  previewSuggestion(suggestion: AISuggestion): Promise<void>;
  applySuggestion(suggestion: AISuggestion): Promise<void>;
  clearPreview?(): Promise<void>;
  exportTemplateSource(): Promise<TemplateSource>;
  validateEnvironment?(): Promise<{ ok: boolean; warnings: string[] }>;
}
```

### 6.3 统一中间文档模型 `DocumentIR`

新增统一结构化文档模型，用于前后端通信和对象级定位：

```ts
export interface DocumentIR {
  host: 'word' | 'excel' | 'ppt';
  metadata: {
    title?: string;
    templateTypeHint?: string;
    language?: string;
    sourceAppVersion?: string;
  };
  elements: DocumentElement[];
  anchors: Anchor[];
  stats: {
    paragraphCount?: number;
    tableCount?: number;
    rowCount?: number;
    cellCount?: number;
    slideCount?: number;
    shapeCount?: number;
  };
}
```

`DocumentElement` 包含：

- `paragraph`
- `table`
- `cell`
- `slide`
- `shape`
- `named-range`
- 后续可扩展 `image`、`chart`、`content-control`

`Anchor` 用于建议回写：

- Word：
  - `word-range`
  - `word-content-control`
- Excel：
  - `excel-range`
  - `excel-table`
  - `excel-named-range`
- PowerPoint：
  - `ppt-shape`
  - `ppt-text-range`

## 7. 宿主设计

### 7.1 WordAdapter

#### 目标

- 作为第一阶段的产品化宿主。
- 完整支持识别、预览、应用、保存、Skill 生成。

#### 重点官方 API

- `Word.run`
- `context.document.body`
- `body.paragraphs`
- `body.tables`
- `context.document.contentControls`
- `search()`
- `getSelection()`
- `getOoxml()`
- `Office.context.document.getFileAsync(Office.FileType.Compressed)`

#### 设计策略

- 识别优先基于：
  - content controls
  - 段落范围
  - 表格单元格
  - 下划线和空白规则
- 回写优先级：
  - `contentControl` 锚点
  - range anchor
  - context search
  - text search fallback
- 模板导出优先使用完整 `docx` 文件。

### 7.2 ExcelAdapter

#### 目标

- 从“读取二维数据”升级为“识别结构化工作表模板”。

#### 重点官方 API

- `Excel.run`
- `context.workbook.worksheets`
- `worksheet.getUsedRange()`
- `worksheet.tables`
- `workbook.names`
- `range.values`
- `range.text`
- `range.formulas`
- `range.numberFormat`
- `getSelectedRange()`

#### 设计策略

- 提取工作簿结构：
  - sheet
  - table
  - named range
  - used range
- 识别重点：
  - 表头
  - 数据区
  - 汇总区
  - 公式区
  - 单值参数区
- 回写优先级：
  - named range
  - table region
  - explicit cell address
  - 当前选区 fallback
- 模板导出优先使用完整 `xlsx` 文件，而不是仅传 `values`。

### 7.3 PowerPointAdapter

#### 目标

- 第一版支持基础文本框变量化与简单 slide loop。

#### 重点官方 API

- `PowerPoint.run`
- `context.presentation.slides`
- `slide.shapes`
- `shape.id`
- `shape.type`
- `shape.textFrame`
- `shape.textFrame.textRange`

#### 设计策略

- 识别对象：
  - slide
  - title shape
  - body text shape
  - image placeholder
- 回写优先级：
  - `slideId + shapeId`
  - textRange anchor
  - 文本替换 fallback
- 第一版不追求复杂版式自动重排，仅做稳定占位符回写。

## 8. AI 与规则引擎协作模式

### 8.1 规则优先

先通过规则引擎做确定性识别：

- Word：
  - 下划线规则
  - 连续空白规则
  - 章节标题规则
  - 表格头规则
- Excel：
  - 表头规则
  - 数据区规则
  - 汇总区规则
  - 命名单元格规则
- PPT：
  - 标题框规则
  - 封面页规则
  - 文本框占位规则

### 8.2 AI 增强

AI 主要负责：

- 变量命名
- formatter 建议
- 循环推断
- 模板类型推断
- 歧义消解

AI 不负责最终对象定位，所有建议必须落在 `Anchor` 上。

## 9. 后端接口设计

### 9.1 现状

当前前端已接入的核心接口包括：

- `/studio/direct-ai-identify`
- `/studio/direct-ai-identify-multistage`
- `/studio/generate`
- `/studio/generate-skill`
- `/studio/preview-with-skill`
- `/studio/save-template-full`

对应前端实现位于 [carbone-api.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin/src/api/carbone-api.ts)。

### 9.2 新增接口建议

#### 结构化识别接口

```text
POST /studio/analyze-structured-document
```

输入：

- `host`
- `templateType`
- `documentIR`
- `rules`

输出：

- `suggestions`
- `templateConfig`
- `confidence`
- `documentStats`
- `analysisSummary`

#### 基于完整文件生成模板

```text
POST /studio/generate-template-from-file
```

输入：

- `host`
- `format`
- `base64File`
- `documentIR`
- `suggestions`
- `templateConfig`

输出：

- `success`
- `templateId`
- `downloadUrl`
- `warnings`

#### 基于文件预览模板

```text
POST /studio/preview-template-from-file
```

输入：

- `templateId`
- `skill`
- `simulatedData`

输出：

- `success`
- `previewUrl`
- `generatedData`

#### 保存完整模板

```text
POST /studio/save-template-with-skill
```

输入：

- `host`
- `format`
- `base64File`
- `documentIR`
- `suggestions`
- `templateConfig`
- `skill`
- `templateName`

## 10. 前端改造范围

### 10.1 组件改造

#### `AIIdentifyPanel`

改造目标：

- 不再直接写宿主 if-else 主流程。
- 改为调用 `HostAdapter + SuggestionService`。

主要改动：

- `handleAnalyze()`
- `handleApplySingle()`
- `handlePreviewSingle()`

#### `TemplateConfigPanel`

改造目标：

- 不再自己拼装 `documentContent` 和 `format`。
- 改为调用 `adapter.exportTemplateSource()`。

主要改动：

- `handlePreview()`
- `handleGenerateTemplate()`
- `handleSkillPreview()`
- `handleFullSave()`

### 10.2 Office API 封装改造

[office-api.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/office-addin/src/utils/office-api.ts) 需要逐步从“大而全工具文件”转向：

- `office-api.ts` 仅保留共性能力
- 宿主细节迁移到各 adapter

## 11. 分阶段实施计划

### 阶段 0：现状收口

目标：

- 固定能力边界，消除“看起来支持，实际上未闭环”的情况。

任务：

- 宿主能力矩阵梳理
- UI 开关与宿主能力提示
- 清理 PPT 误走 Word 的路径

交付：

- 功能矩阵
- 错误矩阵
- 能力开关表

### 阶段 1：宿主适配层落地

目标：

- 引入 `HostAdapter`
- UI 主流程去宿主分支化

任务：

- 新增 `adapters/`
- 实现 `createHostAdapter()`
- 重构 AIIdentifyPanel 和 TemplateConfigPanel

### 阶段 2：DocumentIR 落地

目标：

- 三个宿主都能输出统一文档结构

任务：

- 定义 `DocumentIR`
- Adapter 输出结构化对象
- 调整后端接口请求模型

### 阶段 3：Word 产品化

目标：

- 完成 Word 宿主完整闭环

任务：

- content control 支持
- 段落和表格结构提取
- 精确预览和回写
- docx 文件导出

### 阶段 4：Excel 产品化

目标：

- 支持结构化工作表模板识别与生成

任务：

- table / named range / formula 区识别
- 单值字段与明细循环支持
- xlsx 文件导出

### 阶段 5：PPT 基础产品化

目标：

- 支持基础 slide/shape 参数化

任务：

- slide/shape 结构提取
- 文本框变量化
- 简单 slide loop

### 阶段 6：模板生成统一

目标：

- 三端统一生成、预览、保存协议

任务：

- 后端新接口上线
- 前端改为 `TemplateSource + DocumentIR` 模式

## 12. 周级排期建议

### 第 1 周

- 完成宿主适配层骨架
- 清理组件层宿主分支

### 第 2 周

- 完成 `DocumentIR`
- 三端结构提取初版

### 第 3-4 周

- 完成 Word 完整闭环

### 第 5-6 周

- 完成 Excel 结构化识别与保存

### 第 7-8 周

- 完成 PPT 基础闭环

### 第 9 周

- 完成统一后端模板接口与前端对接

### 第 10 周

- 做回归测试、样板模板验收、交互优化

## 13. MVP 范围

第一版建议按以下范围交付：

### Word

- 完整支持
- 作为产品主路径

### Excel

- 支持结构提取、单元格变量化、表格循环 Beta

### PPT

- 支持基础文本框识别与回写
- 不承诺复杂布局重排

## 14. 风险与应对

### 风险 1：PowerPoint 官方 API 能力弱

应对：

- 第一版只做基础文本框占位符方案
- 复杂场景延后

### 风险 2：Office Requirement Set 差异

应对：

- 所有 adapter 都提供 `getCapabilities()`
- 所有关键功能先做能力探测

### 风险 3：仍然过度依赖文本传输

应对：

- 强制引入 `DocumentIR`
- 生成模板时优先传完整文件

### 风险 4：重构期间回归风险高

应对：

- 先保持 Word 主链稳定
- Excel/PPT 逐步替换
- 使用能力开关防止未完成路径暴露

## 15. 验收标准

### 功能验收

- Word：
  - 至少 3 类文档模板稳定完成识别和保存
- Excel：
  - 至少 2 类工作表模板稳定完成识别和保存
- PPT：
  - 至少 1 类演示模板完成文本框变量化

### 技术验收

- 宿主主流程不再散落在组件层
- 所有 AI 建议都能映射到 `Anchor`
- 所有模板生成接口都支持结构化输入
- PowerPoint 不再触发 Word 专用逻辑路径

## 16. 推荐的第一步开发顺序

推荐先做一个 MVP：

1. 建立 `HostAdapter`
2. 建立 `DocumentIR`
3. 先把 Word 做成完整闭环
4. Excel 开放 Beta 能力
5. PPT 只开放已稳定的基础能力

这是当前代码基础下风险最低、收益最高、最容易尽快形成稳定版本的路径。
