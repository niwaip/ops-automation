# services/ → features/shared 重构迁移指南（不保留历史兼容接口）

> **目标**：彻底删除 `src/services/`，不保留任何历史路径、兼容 re-export 或过渡壳。迁移完成后，所有调用方必须直接使用新结构下的正式入口。

---

## 一、迁移原则

本次迁移采用以下强约束：

1. **不保留历史接口**
   - 删除 `src/services/` 整个目录。
   - 删除所有顶层兼容文件，如 `services/analysis-executor.ts`、`services/analysis-chat-prompt-templates.ts`。
   - 不再提供旧路径到新路径的 re-export。

2. **按职责归位，而不是按旧目录平移**
   - 真正跨 feature 且不依赖某个 feature 领域实现的服务，放入 `shared/services/`。
   - 属于 `parameter-identify` 领域的服务，统一下沉到 `features/parameter-identify/services/`。

3. **跨 feature 访问只能走正式公共入口**
   - 不允许其他 feature 直接 import `parameter-identify/services/*` 的内部文件。
   - 如确需跨 feature 访问，只允许通过 `features/parameter-identify/services/index.ts` 这一正式公共入口。

4. **迁移后不再接受“兼容期”**
   - 所有 import 在同一轮迁移内完成切换。
   - 迁移结束即删除旧文件，不设置双轨期。

---

## 二、目标结构

```text
src/
├── app/
├── api/
├── config/
├── debug/
├── host/
├── shared/
│   ├── ui/
│   ├── utils/
│   └── services/
│       └── template-source.service.ts
└── features/
    ├── document-load/
    ├── parameter-query/
    ├── parameter-identify/
    │   ├── word/
    │   ├── excel/
    │   ├── shared/
    │   └── services/
    │       ├── index.ts
    │       ├── analysis-executor/
    │       ├── analysis-pair-prompt/
    │       ├── identify/
    │       └── suggestion/
    │           ├── suggestion.service.ts
    │           ├── suggestion.service.excel.ts
    │           └── suggestion.service.shared.ts
    ├── draft/
    ├── publish/
    └── workflow/
```

### 结构决策说明

- `template-source-service.ts` 保留为真正跨 feature 的共享服务，迁入 `shared/services/`。
- `suggestion-service.*` 虽然被多个 feature 调用，但其核心职责属于参数识别链路，且依赖 `analysis-executor/`、`identify/` 等 `parameter-identify` 领域实现，因此整体下沉到 `features/parameter-identify/services/suggestion/`。
- `analysis-executor/`、`analysis-pair-prompt/`、`identify/` 均属于 `parameter-identify` 领域内部能力，一并下沉。
- `features/parameter-identify/services/index.ts` 是**正式公共入口**，不是兼容壳；它只暴露允许跨 feature 使用的稳定接口。

---

## 三、服务归属分析

### 1. `template-source-service.ts`

当前消费方：

- `document-load/shared/TemplateConfigPanel.tsx`
- `parameter-identify/shared/useAIIdentifyPanel.ts`

结论：

- 放入 `shared/services/template-source.service.ts`
- 该服务仍是共享服务，不属于单一 feature

### 2. `suggestion-service.*`

当前消费方：

- `document-load/excel/ExcelSheetPairsTab.tsx`
- `parameter-identify/excel/useExcelIdentifyWorkflow.ts`
- `parameter-identify/shared/AIIdentifyPanel.helpers.ts`
- `parameter-identify/word/identify-suggestion.helpers.ts`
- `parameter-identify/word/useWordIdentifyWorkflow.ts`
- `workflow/shared/workflow-analysis.helpers.ts`

结论：

- 不再放入 `shared/services/`
- 统一下沉到 `features/parameter-identify/services/suggestion/`
- 对外由 `features/parameter-identify/services/index.ts` 暴露正式接口

### 3. `analysis-executor/`

当前消费方：

- `parameter-identify/word/identify-recognition.execution.ts`
- `parameter-identify/word/identify-recognition.prompt.helpers.ts`
- `parameter-identify/word/identify-recognition.types.ts`
- `parameter-identify/word/identify-suggestion.helpers.ts`
- `workflow/word/word-workflow.actions.helpers.ts`（仅类型）

结论：

- 迁入 `features/parameter-identify/services/analysis-executor/`
- `workflow/word/` 不得直接引用其内部路径；若需要类型或能力，统一从 `features/parameter-identify/services/index.ts` 获取

### 4. `analysis-pair-prompt/`

结论：

- 属于 `parameter-identify` 链路内部 prompt 组装能力
- 迁入 `features/parameter-identify/services/analysis-pair-prompt/`

### 5. `identify/`

结论：

- 属于 `parameter-identify` 领域识别实现
- 迁入 `features/parameter-identify/services/identify/`

### 6. 顶层历史散文件

以下文件在迁移完成后必须删除，不保留兼容用途：

- `src/services/analysis-executor.ts`
- `src/services/analysis-chat-prompt-templates.ts`

---

## 四、正式公共入口设计

为避免“删除 `src/services/` 后又在 `features/` 内形成新的深层路径耦合”，本次迁移要求新增：

`src/features/parameter-identify/services/index.ts`

该文件只暴露对外允许使用的正式 API，例如：

```ts
export { analyzeDocumentWithAI, analyzeExcelWorkbookUnderstanding } from './suggestion/suggestion.service';
export { enrichWordSuggestionAnchors } from './identify/word/word-anchor-enricher';
export { resolveAnalysisExecutor } from './analysis-executor';
export type { AnalysisExecutorKind, StructuredAnalyzeRequest } from './analysis-executor';
```

约束：

- `parameter-identify` feature 内部可以继续按子目录引用本 feature 的服务实现。
- 其他 feature 只能 import `features/parameter-identify/services`，不能 import 其内部 `analysis-executor/*`、`identify/*`、`suggestion/*` 文件。

---

## 五、迁移步骤

> **执行前提**：确保当前分支代码已提交，建议在新分支操作；迁移过程中不保留旧路径兼容文件。

### Step 1 — 创建目标目录

```bash
mkdir -p src/shared/services
mkdir -p src/features/parameter-identify/services/suggestion
```

### Step 2 — 迁移共享服务

```bash
mv src/services/template-source-service.ts src/shared/services/template-source.service.ts
```

### Step 3 — 迁移 `parameter-identify` 领域服务

```bash
mv src/services/analysis-executor    src/features/parameter-identify/services/analysis-executor
mv src/services/analysis-pair-prompt src/features/parameter-identify/services/analysis-pair-prompt
mv src/services/identify             src/features/parameter-identify/services/identify

mv src/services/suggestion-service.ts        src/features/parameter-identify/services/suggestion/suggestion.service.ts
mv src/services/suggestion-service.excel.ts  src/features/parameter-identify/services/suggestion/suggestion.service.excel.ts
mv src/services/suggestion-service.shared.ts src/features/parameter-identify/services/suggestion/suggestion.service.shared.ts
```

### Step 4 — 新建正式公共入口

新增：

```text
src/features/parameter-identify/services/index.ts
```

职责：

- 暴露跨 feature 允许使用的公共能力
- 收敛对 `parameter-identify/services/*` 的对外访问
- 替代原 `src/services/*` 顶层旧入口

### Step 5 — 全量修正 import

#### 5-A：`suggestion-service` 消费方改为正式公共入口

旧：

```ts
import { analyzeDocumentWithAI } from '../../../services/suggestion-service';
```

新：

```ts
import { analyzeDocumentWithAI } from '../../parameter-identify/services';
```

需修改的文件：

- `src/features/document-load/excel/ExcelSheetPairsTab.tsx`
- `src/features/parameter-identify/excel/useExcelIdentifyWorkflow.ts`
- `src/features/parameter-identify/shared/AIIdentifyPanel.helpers.ts`
- `src/features/parameter-identify/word/identify-suggestion.helpers.ts`
- `src/features/parameter-identify/word/useWordIdentifyWorkflow.ts`
- `src/features/workflow/shared/workflow-analysis.helpers.ts`

> 注意：位于 `parameter-identify/` 内部的文件，也优先改为 `../services` 或 `../services/index`，不再引用旧 `src/services/`。

#### 5-B：`template-source-service` 消费方改为共享服务新路径

旧：

```ts
import { exportTemplateSource } from '../../../services/template-source-service';
```

新：

```ts
import { exportTemplateSource } from '../../../shared/services/template-source.service';
```

需修改的文件：

- `src/features/document-load/shared/TemplateConfigPanel.tsx`
- `src/features/parameter-identify/shared/useAIIdentifyPanel.ts`

#### 5-C：`parameter-identify` 内部 `analysis-executor` 消费方改为 feature 内新路径

旧：

```ts
import { resolveAnalysisExecutor } from '../../../services/analysis-executor/index';
```

新：

```ts
import { resolveAnalysisExecutor } from '../services/analysis-executor';
```

需修改的文件：

- `src/features/parameter-identify/word/identify-recognition.execution.ts`
- `src/features/parameter-identify/word/identify-recognition.prompt.helpers.ts`
- `src/features/parameter-identify/word/identify-recognition.types.ts`
- `src/features/parameter-identify/word/identify-suggestion.helpers.ts`

#### 5-D：`workflow/word/` 中的 `AnalysisExecutorKind` 改走正式公共入口

旧：

```ts
import type { AnalysisExecutorKind } from '../../../services/analysis-executor/index';
```

新：

```ts
import type { AnalysisExecutorKind } from '../../parameter-identify/services';
```

需修改的文件：

- `src/features/workflow/word/word-workflow.actions.helpers.ts`

#### 5-E：迁移后的内部相对路径同步修正

需要同步检查：

- `suggestion.service.ts` 到 `analysis-executor/`、`identify/` 的相对路径
- `analysis-executor/` 到 `analysis-pair-prompt/` 的相对路径
- `identify/excel/*` 到 `analysis-executor/`、`analysis-pair-prompt/` 的相对路径

原则：

- feature 内部允许引用本 feature 的子服务目录
- 但不再出现任何 `src/services/` 前缀路径

### Step 6 — 删除历史接口和旧目录

```bash
rm src/services/analysis-executor.ts
rm src/services/analysis-chat-prompt-templates.ts
rm -rf src/services
```

要求：

- 删除动作与 import 切换在同一轮完成
- 不保留任何 re-export 兼容文件

---

## 六、迁移后目录全景

```text
src/
├── app/
├── api/
├── config/
├── debug/
├── host/
├── shared/
│   ├── ui/
│   ├── utils/
│   └── services/
│       └── template-source.service.ts
└── features/
    ├── document-load/
    ├── parameter-query/
    ├── parameter-identify/
    │   ├── word/
    │   ├── excel/
    │   ├── shared/
    │   └── services/
    │       ├── index.ts
    │       ├── analysis-executor/
    │       ├── analysis-pair-prompt/
    │       ├── identify/
    │       └── suggestion/
    │           ├── suggestion.service.ts
    │           ├── suggestion.service.excel.ts
    │           └── suggestion.service.shared.ts
    ├── draft/
    ├── publish/
    └── workflow/
```

---

## 七、验证清单

完成迁移后，逐项检查：

- [ ] `src/services/` 已彻底删除
- [ ] `src/services/analysis-executor.ts` 已删除
- [ ] `src/services/analysis-chat-prompt-templates.ts` 已删除
- [ ] `src/shared/services/` 仅保留真正共享服务
- [ ] `src/features/parameter-identify/services/` 已包含 `index.ts`、`analysis-executor/`、`analysis-pair-prompt/`、`identify/`、`suggestion/`
- [ ] 运行 `npx tsc --noEmit` 无 TS 类型错误
- [ ] 运行 `npm run dev` 开发服务器正常启动
- [ ] 在 Word/Excel 加载项中完整测试一次识别流程
- [ ] 代码中不再出现任何 `from '.../services/...` 指向旧 `src/services/`
- [ ] 代码中不再出现任何为了兼容旧路径而新增的 re-export 壳文件

```bash
# 验证旧 services 路径引用已清零
grep -rn "/services/" src --include="*.ts" --include="*.tsx"

# 迁移完成后，结果中只应出现：
# 1. src/shared/services/*
# 2. src/features/parameter-identify/services/*
# 3. 合法的新正式入口引用
```

---

## 八、长期分层规则

```text
依赖方向：

app
  -> features
  -> shared/services

features
  -> 本 feature 内部模块
  -> 其他 feature 的正式 services 入口
  -> shared/services
  -> host / api / shared

shared/services
  -> host / api / shared
```

| 层 | 可以 import | 不可以 import |
|---|---|---|
| `app/` | 任意 | — |
| `features/*/` | 本 feature 内模块、其他 feature 的 `services` 正式入口、`shared/`、`host/`、`api/`、`config/` | 其他 feature 的内部实现文件 |
| `features/*/services/` | 本 feature 内服务实现、`shared/`、`host/`、`api/` | 其他 feature 的内部实现文件 |
| `shared/services/` | `host/`、`api/`、`shared/utils/` | 任意 `features/**` |
| `shared/ui/` | `shared/utils/` | `features/**`、`shared/services/` |
| `host/` | `api/`（仅类型） | `features/**`、`shared/services/` |

### 禁止事项

- 禁止保留 `src/services/` 作为历史目录
- 禁止新增“旧路径 -> 新路径”的兼容 re-export
- 禁止跨 feature 直接 import 对方内部 `*.helpers.ts`、`*.controller.ts`、`*.types.ts`
- 禁止在 `shared/services/` 中反向依赖 `features/**`

### 推荐做法

- 其他 feature 若需使用 `parameter-identify` 的领域服务，只能从 `features/parameter-identify/services/index.ts` 导入
- 类型如果被多个 feature 长期共享，优先评估提取到 `shared/`，避免公共入口膨胀
