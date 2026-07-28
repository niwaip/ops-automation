# Temporal AI 工作流草稿生成 —— 全面分析与落地指南

> 分析范围：`/api/temporal/draft-sessions` 工作流草稿生成系统  
> 分析日期：2026-07-24  
> 文档版本：v2（含落地步骤与验收标准）

---

## 一、当前系统全景理解

### 1.1 系统定位（与 Chat AI 的根本区别）

这是面向**管理员**的工作流编辑器功能，目标是生成 Temporal Workflow 的 **WorkflowDSL + ActivityDSL**（代码蓝图），与用户侧 Chat 是两个完全独立的系统：

```
                      ┌─────────────────────────────────────┐
   管理员              │   /admin  WorkflowEditModal          │
   编辑工作流  ──────▶  │   draft-sessions  (本文分析对象)     │
                      │   输出: WorkflowDSL + ActivityDSL    │
                      └─────────────────────────────────────┘
                                        ↓ 保存为工作流定义
                      ┌─────────────────────────────────────┐
   终端用户             │   /chat  ChatWindow                  │
   使用工作流  ──────▶  │   输出: 执行结果 (文本/文件/数据)      │
                      └─────────────────────────────────────┘
```

> **用户诉求的核心理解**：  
> 希望 draft-sessions 生成的草稿最终结果，也能在**聊天窗口展示**（统一结果协议）。  
> 这意味着需要打通"草稿生成"与"执行结果展示"两个系统的数据模型。

---

### 1.2 当前 4 步生成流程（完整还原）

```
POST /temporal/draft-sessions
  └── TemporalWorkflowAiDraftService.generateWorkflowDraft()
        │
        ├── ① analyzeAiWorkflowDraft()
        │     输入: description + referenceUrl + referenceExcerpt + activityResources
        │     LLM调用: buildAnalyzeAiWorkflowDraftPrompt → /ai/model/call
        │     输出: AiWorkflowDraftPlan (JSON 蓝图)
        │
        ├── ② resolveAiWorkflowDraftPlan()
        │     逐步处理每个 step：
        │     - httpRequest → 实际发起 HTTP 预览（获取真实 API 响应）
        │     - structuredTransform → 基于真实响应生成 fieldMappings / textTemplate
        │     - aiStructuredTransform → AI 语义理解版配置生成
        │     stepOutputSamples: Map<stepKey, 上游输出样本>（步骤间传递）
        │
        ├── ③ repairAiWorkflowDraftPlanIfNeeded()
        │     validateAiWorkflowDraftPlan() → 收集 issues[]
        │     repairCommonDraftPlanIssues() → 规则修复（不走 LLM）
        │     LLM调用: buildRepairAiWorkflowDraftPlanPrompt（最多 2 轮）
        │
        └── ④ materializeAiWorkflowDraft()
              Plan → WorkflowDSL + ActivityDSL
              normalizeWorkflowDsl() / normalizeDraftInputParams()
              返回: AiWorkflowDraft
```

---

## 二、Prompt 区域结构分析（核心问题一）

### 2.1 当前 3 个 Prompt 的风格对比

#### 初始生成 Prompt（`buildAnalyzeAiWorkflowDraftPrompt`）
风格：**扁平数组 join，无区域结构**

```
你是一个企业级 Temporal Workflow 草稿生成器。
你的职责是...
重要边界：
1. 只能从系统给出的...
2. 只输出 Workflow 草稿 JSON...
（共 11 条规则混在一起）
（Activity 资源列表 JSON）
（期望输出格式示例 JSON，含 2 个步骤示例）
用户说明: {description}
参考 URL: {referenceUrl}
参考内容摘录: {referenceExcerpt}
```

**问题**：
- 规则、资源、示例、用户输入混在一起，AI 难以区分"约束"和"目标"
- `activityResources` 直接 JSON 序列化（builtin + 最多 40 个 custom），Token 量大但无优先级
- 用户目标在最后几行，容易被前面的长内容淹没（"primacy/recency effect"）

#### 修复 Prompt（`buildRepairAiWorkflowDraftPlanPrompt`）
风格：**有明确的 `【区域标签】`**

```
【用户目标】{description}
【参考 URL】{referenceUrl}
【当前草稿】{JSON}
【问题清单（必须逐条修复）】1. xxx 2. xxx
【可用 Activity 资源池】{JSON}
【硬性要求】1~9 条
```

评价：**结构清晰，效果好**，但与初始生成 Prompt 风格不统一。

#### Refinement Prompt（`buildAnalyzeAiWorkflowRefinementPrompt`）
风格：**有区域标签，但输出要求在末尾**

```
【当前 Workflow DSL】{JSON}
【当前 Activity DSL】{JSON}
【改进要求】{userPrompt}
【可用 Activity 资源池】{JSON}
输出要求: 1~10 条
```

**问题**：`currentWorkflowDsl` 和 `currentActivityDsl` 全量 JSON 注入，对于复杂工作流可能超过上下文窗口；用户改进需求（最重要的信号）却埋在中间。

---

### 2.2 建议的 4 区域 Prompt 结构

参考 Anthropic / OpenAI 的 Prompt Engineering 最佳实践（[Anthropic Prompt Design](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)），建议统一所有 3 个 Prompt 为以下 4 区域结构：

```
┌──────────────────────────────────────────────────────────────────┐
│ 区域 A: ROLE（角色 + 输出格式约束）                               │
│  - 你是什么专家                                                   │
│  - 你的边界（不能做什么）                                          │
│  - 输出格式强制要求（只输出 JSON，不含 markdown）                  │
├──────────────────────────────────────────────────────────────────┤
│ 区域 B: CONTEXT（约束上下文）                                     │
│  - 可用 Activity 资源池（按类型分组：builtin / custom）            │
│  - 关键规则（HTTP 拆分、参数化、structuredTransform 规则）         │
│  - 当前草稿 JSON（仅 refine/repair 时注入）                       │
├──────────────────────────────────────────────────────────────────┤
│ 区域 C: OBJECTIVE（用户目标——最重要，放在靠近末尾）               │
│  - 用户说明 description（必填）                                   │
│  - 参考 URL                                                       │
│  - 参考内容摘录                                                   │
│  - Skill 文件内容（新增支持）                                     │
│  - 改进要求（refine 时）                                          │
├──────────────────────────────────────────────────────────────────┤
│ 区域 D: OUTPUT SPEC（期望输出结构说明）                           │
│  - 输出 JSON Schema 说明                                          │
│  - 示例（精简，只展示关键字段）                                   │
└──────────────────────────────────────────────────────────────────┘
```

**为什么要把用户目标（区域 C）放在靠近末尾**：  
研究表明 LLM 对 prompt 末尾内容有更高的注意力（primacy/recency bias），将最重要的"用户目标"放在末尾，可以显著提升生成质量。

---

## 三、Skill 文件上传支持（核心问题二）

### 3.1 目前的能力边界

当前 `GenerateAiWorkflowDraftSessionDTO` 只有：
```ts
interface GenerateAiWorkflowDraftSessionDTO {
  description?: string;   // 自然语言说明
  referenceUrl?: string;  // 参考 URL
  title?: string;         // 会话标题
}
```

上传文件的支持：`ChatController` 已有 `@UploadedFile()` 和 `FileInterceptor`（在 audio transcription 接口），但 `draft-sessions` 接口目前不支持文件上传。

### 3.2 Skill 文件的两种使用场景

#### 场景 A：上传 Skill YAML/JSON → 直接转换为草稿
用户已经有一个 skill 配置文件，想把它转换成 Temporal Workflow 草稿。

```yaml
# skill-draft.yml 示例
name: "天气查询"
description: "根据城市名称查询当前天气"
goal: "查询并格式化天气信息"
executionType: "api"
paramsSchema:
  properties:
    city:
      type: string
      description: "城市名称"
      required: true
  required: ["city"]
expectedOutput: "markdown 格式的天气报告"
```

这种场景下，`description` 可以由文件内容自动推断，无需用户额外输入。

#### 场景 B：上传 Skill 文件 + 自然语言补充说明
用户上传文件后，用自然语言补充"在这个 skill 基础上加一个通知步骤"。

### 3.3 建议实现路径

```
前端 WorkflowEditModal（AI 草稿面板）
    ├── 现有：description 文本框 + referenceUrl 输入框
    └── 新增：文件上传区域（拖拽/点击）
          ├── 支持格式：.yml / .yaml / .json / .md
          └── 前端预处理：
                - YAML → js-yaml.load() → 校验基本结构
                - JSON → JSON.parse() → 校验基本结构
                - Markdown → 提取文本内容（技能说明文档）
                - 上传成功提示：「已加载技能配置：{name}」

后端处理（两种可选方案）：

方案一：文件内容作为富文本注入 description（最简实现）
  GenerateAiWorkflowDraftSessionDTO 新增字段：
    skillFileContent?: string;     // 已解析的文件内容文本
    skillFileType?: 'yaml' | 'json' | 'markdown';
  
  后端：将 skillFileContent 注入 Prompt 的区域 C（OBJECTIVE），
       与 description 合并作为用户目标。

方案二：结构化 Skill 规格注入（更精确）
  新增接口：SkillDraftSpec
    name: string;
    goal?: string;
    paramsSchema?: { properties, required };
    executionType?: 'api' | 'document' | 'browser';
    expectedOutput?: string;
  
  后端：SkillFileParserService.parse(content) → SkillDraftSpec
       → 跳过或补充 LLM 分析（已知技能意图，直接构建初始 plan）
```

**推荐方案一**（最小改动，快速落地）：  
文件内容作为结构化文本注入 Prompt，不需要新建服务，只需在 `buildAnalyzeAiWorkflowDraftPrompt` 中增加一个新的输入区域。

### 3.4 Prompt 中如何注入 Skill 文件内容

在区域 C（OBJECTIVE）中增加：

```
【技能文件内容（优先参考）】
{skillFileContent}

【用户补充说明（可覆盖文件中的设定）】
{description}
```

注意措辞：文件内容"优先参考"但用户自然语言"可覆盖"，避免文件和说明冲突时 AI 无所适从。

### 3.5 前端 Prompt 结构化引导（方案 A：分段卡片 + 快捷 Tag）

为了方便用户提供更清晰的 Prompt 输入，前端在“工作流需求说明”输入框下方集成了快捷 Prompt 结构引导标签：

```
┌────────────────────────────────────────────────────────┐
│ 工作流需求说明 *                                       │
│ [ TextArea: 描述具体业务场景...                      ] │
│ 💡 Prompt 结构引导: [+ 补充输入参数] [+ 补充期望输出/通知]  │
└────────────────────────────────────────────────────────┘
  │ 点击后展开子输入框：
  ├── [指定运行时输入参数]: 如 “服务器 IP, CPU 告警阈值(默认 90%)”
  └── [指定期望输出与动作]: 如 “生成 Markdown 报告并推送到钉钉”
```

提交表单时，系统自动将子输入项合并为结构化标记文本（`【指定运行时输入参数】` / `【指定期望输出与动作】`），精准注入到后端 Prompt 的【区域 C: OBJECTIVE】中。

---


## 四、步骤间参数传递分析（核心问题三）

### 4.1 当前传递机制

```
① → ② → ③ → ④ 之间的数据传递：

AiWorkflowDraftPlan（中间产物，步骤之间的"语言"）
    ├── 以裸字符串 description/referenceUrl 在所有私有方法间传递
    ├── stepOutputSamples: Map<string, unknown>（② 内部的步骤间输出传递）
    └── warnings: string[]（在各步骤中可变式追加，类似 mutation）
```

### 4.2 主要问题

#### 问题 A：散落的裸字符串参数（每个方法都要接收 description + referenceUrl）

当前 5 个私有方法都接收相同的参数：
```ts
analyzeAiWorkflowDraft(description, referenceUrl, referenceExcerpt, activityResources, support)
resolveAiWorkflowDraftPlan(plan, description, referenceUrl, activityResources, support)
repairAiWorkflowDraftPlanIfNeeded(plan, description, referenceUrl, referenceExcerpt, activityResources, support)
repairAiWorkflowDraftPlan(plan, issues, description, referenceUrl, referenceExcerpt, activityResources, support)
materializeAiWorkflowDraft(plan, activityResources, description, referenceUrl, support)
```

**参数顺序也不一致**（`referenceExcerpt` 在不同方法中位置不同），是潜在的调用错误源。

#### 问题 B：`warnings` 通过 mutable push 传递，不透明

```ts
(resolvedPlan.warnings as string[]).push(`分步解析未能...`);
```

直接 mutation plan 对象，在异步循环中多处 push，排查问题时难以追踪是哪一步产生的 warning。

#### 问题 C：`stepOutputSamples` 的 key 依赖步骤 id，存在重复风险

```ts
const currentStepKey = buildAiDraftStepSampleKey(step, index, pickFirstNonEmptyString);
// → step.id || `step_${index + 1}`
```

如果 AI 生成了两个相同 id 的步骤（实际发生过），后者会覆盖前者的 sample，导致 structuredTransform 配置基于错误的上游数据生成。

### 4.3 建议改进方向

#### 方案：封装 `AiDraftGenerationContext`

将散落的裸参数封装为一个不可变的上下文对象，在整个生成过程中传递：

```ts
interface AiDraftGenerationContext {
  // 用户输入（不可变）
  readonly description: string;
  readonly referenceUrl: string;
  readonly referenceExcerpt: string;
  readonly skillFileContent?: string;   // 新增：Skill 文件内容
  readonly skillFileType?: string;
  
  // 系统资源（不可变）
  readonly activityResources: AiDraftActivityResource[];
  readonly knownActivityRefs: Set<string>;
  
  // 辅助函数（不可变）
  readonly support: TemporalWorkflowAiDraftSupport;
  
  // 生成过程中累积的数据（通过返回新对象更新，不 mutation）
  readonly declaredInputKeys: Set<string>;
  readonly sampleInputs: Record<string, any>;
  readonly stepOutputSamples: Map<string, unknown>;
  readonly collectedWarnings: ReadonlyArray<string>;
}
```

**好处**：
- IDE 自动补全，不会漏传参数，不会参数顺序错误
- `collectedWarnings` 改为 immutable 追加（`[...existing, newWarning]`），每步产生的 warning 可追溯
- `stepOutputSamples` key 改用 `step_${index}` 强制用 index，避免 id 重复问题

---

## 五、最重要的问题：统一结果协议，在聊天窗口显示

### 5.1 现状：两个系统的结果协议互不兼容

```
Temporal Draft Session 的结果：
AiWorkflowDraft {
  name, description, taskQueue,
  workflowDsl: WorkflowDsl,
  activityDsl: ActivityDsl,
  warnings: string[]
}
                 ↑ 这是"代码蓝图"，不是"执行结果"

Chat 系统的结果协议（WorkflowResultEnvelope）：
{
  execution: { status, executionId, ... },
  result: { resultType, title, summary, businessData, ... },
  artifacts: [...],
  presentation: { chatSummary, summaryFormat, ... }
}
                 ↑ 这是"业务执行结果"
```

这两个体系目前完全独立，在 `temporal-workflow.types.ts` 中可以看到 `WorkflowResultEnvelope` 已经定义（L64），但 draft-sessions 流程根本没有使用它。

### 5.2 用户需求的解读：两种可能的理解

**理解 A**：工作流**执行完成后**的结果，希望在 Chat 窗口展示  
→ 这需要工作流执行结果走 `RESULT` StreamEvent，前端 ChatMessage 渲染  
→ 当前 Chat 系统已有这个能力，问题是 Temporal 工作流执行完成后如何触发 RESULT 事件

**理解 B**：AI **草稿生成完成后**的摘要，希望在 Chat 窗口展示  
→ 比如"已为您生成工作流草稿：天气查询，共 2 个步骤，点击下方按钮查看"

两种理解都需要统一的结果协议。

### 5.3 现有基础（`WorkflowResultEnvelope`）

```ts
// temporal-workflow.types.ts L64，已存在
export interface WorkflowResultEnvelope {
  execution?: WorkflowResultExecution;
  trigger?: WorkflowResultTrigger;
  result?: WorkflowResultBusinessSection;   // 核心业务结果
  artifacts?: WorkflowResultArtifact[];
  presentation?: WorkflowResultPresentation; // ← chatSummary 在这里
  delivery?: Record<string, unknown>;
}

// WorkflowResultPresentation 已有：
export interface WorkflowResultPresentation {
  chatSummary?: string;       // ← 聊天摘要
  notificationSummary?: string;
  summaryFormat?: 'plain_text' | 'markdown';
  detailText?: string;
  preferAiSummary?: boolean;
  preferStructuredView?: boolean;
}
```

**这个协议已经设计好了**，缺少的是：  
① Temporal 工作流执行后将结果填充到 `WorkflowResultEnvelope`  
② 通过 StreamEvent `RESULT` 事件推送到前端 Chat 窗口

### 5.4 统一协议的建议方案

#### 方案：`WorkflowResultContract` 作为最后一步的统一出口

建议在 `WorkflowResultEnvelope` 基础上定义一个**严格版**的 `WorkflowResultContract`，作为所有工作流最后一步必须输出的格式：

```ts
// 建议新增，作为所有工作流执行结果的统一出口协议
interface WorkflowResultContract {
  // === 必填字段（版本化） ===
  _version: '1';
  
  // === 执行上下文 ===
  executionId?: string;
  workflowId?: string;
  status: 'success' | 'partial_success' | 'failed' | 'cancelled';
  hasBusinessResult: boolean;

  // === 聊天窗口展示（前端只读这两个字段）===
  chatSummary: string;               // 必填：聊天窗口的核心文字
  summaryFormat: 'plain_text' | 'markdown';  // 必填
  
  // === 结构化业务数据（可选） ===
  title?: string;
  businessData?: unknown;
  metrics?: Record<string, unknown>;
  
  // === 产物（可选） ===
  artifacts?: WorkflowResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;
  
  // === 后续动作（可选） ===
  nextActions?: Array<{ type: string; label: string; value?: string }>;
  
  // === 调试（admin 可见）===
  warnings?: string[];
  usage?: LLMUsage;
}
```

#### 落地规则（不修改代码，仅作规范说明）

1. **所有 Temporal 工作流的最后一个步骤**（`outputParams` 指向的 step），其 Activity 执行结果必须能被映射到 `WorkflowResultContract`

2. **`ChatResultNormalizerService`（ai-orchestrator）**  
   已经有 `normalize()` 方法，已经输出 `chatSummary` / `hasBusinessResult` / `artifacts` 等字段，建议：
   - 增加 `toWorkflowResultContract()` 方法，强制输出版本化的 contract
   - 将 `_version: '1'` 作为必填字段，便于前端版本判断

3. **Chat 前端 `ChatMessage.tsx`**  
   当收到 `RESULT` 事件时，只读 `data.chatSummary` 作为主展示文字，消除当前 6-7 个字段的 fallback 链：
   ```ts
   // 当前（fragile）：
   chatSummary || finalAnswer || formatted_output || summary || message || result
   
   // 建议（稳定）：
   data._version === '1' ? data.chatSummary : legacyFallback(data)
   ```

4. **Draft Session 的草稿生成结果**  
   如果需要在 Chat 窗口展示草稿生成摘要，`createAiDraftSession` 返回后，前端在显示 WorkflowEditModal 的同时，可以向 Chat 窗口推送一条"已生成草稿"消息：
   ```ts
   {
     chatSummary: `已为您生成工作流草稿「${draft.name}」，共 ${steps.length} 个步骤。`,
     summaryFormat: 'plain_text',
     hasBusinessResult: true,
     artifacts: [{ type: 'workflow_draft', name: draft.name }],
     nextActions: [{ type: 'open_editor', label: '在编辑器中查看' }]
   }
   ```

---

## 六、提示词处理逻辑优化（核心问题四）

### 6.1 Activity 资源列表优化

**当前**：全量 JSON 序列化（builtin + 最多 40 个 custom），Token 量大

**建议**：
1. **按类型分组展示**：先 builtin（5-8 个核心 activity），再 custom（相关性降序排列）
2. **精简字段**：去掉 `config`（配置太长），只保留 `ref / name / fn / description / handler`
3. **按用户目标预筛选**：如果 description 包含"文档/合同/报告"等关键词，优先注入 `carbone` 类 activity；包含"查询/API/获取"则优先注入 `api` 类

### 6.2 Refinement 的过量 Token 消耗

**当前**：每次 refine 将完整的 `currentWorkflowDsl`（含 steps）+ `currentActivityDsl`（含 config）全量注入

**建议**：
- 对 `currentWorkflowDsl` 只注入**步骤摘要**（id + name + activityRef），不注入完整 input 配置
- 对 `currentActivityDsl` 只注入 activity 的 name 和 ref，不注入完整 config
- 完整配置通过 `【变更后需保留的步骤配置】` 标注，只在需要修改的步骤才展开

```ts
// 精简版摘要注入示例
const workflowSummary = {
  name: currentWorkflowDsl.name,
  inputParams: currentWorkflowDsl.inputParams,
  outputParams: currentWorkflowDsl.outputParams,
  steps: currentWorkflowDsl.steps.map(s => ({
    id: s.id, name: s.name, activityRef: s.activityRef
    // 不注入 input 配置
  }))
};
```

### 6.3 修复（Repair）的 2 轮上限

**当前**：最多执行 2 轮 LLM 修复（`for (let round = 0; round < 2; round += 1)`）

**问题**：2 轮之后如果仍有问题，只是将问题作为 warning 返回，前端用户看到的是一个有警告的草稿，无法知道具体哪里需要手工修复。

**建议**：在 warnings 中增加**可操作的修复提示**，而不是仅记录问题描述：
```ts
warnings: [
  'AI 草稿自动修复后仍需确认: step_2 的 activityRef builtin:xxx 不在资源池中 → 请手动选择正确的 Activity'
]
```

### 6.4 `extraPrompt` 字段的潜力未充分利用

`AiWorkflowDraftPlan.extraPrompt` 是 AI 给代码生成阶段的补充说明，目前只是存储在 `workflowDsl.extraPrompt` 中，没有被充分利用于：
- 指导 structuredTransform 的配置生成
- 在 refinement 时作为背景信息
- 在 repair 时帮助 AI 理解意图

建议在 `resolveAiWorkflowDraftPlan` 的 `buildAiDraftResolutionGoal` 中，将 `plan.extraPrompt` 作为核心信号之一（目前已经包含，但优先级不明确）。

---

## 七、综合优先级建议

| 优先级 | 改进项 | 关键收益 | 复杂度 |
|--------|--------|----------|--------|
| 🔴 P0 | 统一 `WorkflowResultContract`，定义 `chatSummary` 为必填出口字段 | 解决结果在 Chat 显示的根本问题 | 低（接口定义） |
| 🔴 P0 | 将 3 个 Prompt 统一为 4 区域结构（A/B/C/D） | 提升草稿质量一致性，减少修复轮次 | 中 |
| 🟠 P1 | `GenerateAiWorkflowDraftSessionDTO` 新增 `skillFileContent` 字段 | 支持 Skill 文件上传转化 | 低（DTO + Prompt 注入） |
| 🟠 P1 | 封装 `AiDraftGenerationContext`，替代散落的裸字符串参数 | 提升代码可维护性，消除参数顺序错误风险 | 中 |
| 🟡 P2 | Activity 资源列表按类型分组 + 按目标预筛选 | 减少 Token 消耗，提升 activity 选择准确率 | 中 |
| 🟡 P2 | Refinement Prompt 注入步骤摘要而非全量 DSL | 减少 Token 消耗，降低超出上下文窗口的风险 | 中 |
| 🟡 P2 | `stepOutputSamples` key 改用 index，防止 id 重复 | 防御性修复 | 低 |
| 🟢 P3 | warnings 增加可操作提示 | 改善 admin 排查体验 | 低 |
| 🟢 P3 | diff-based refine（小改动不走全量 4 步） | 减少延迟和 LLM 成本 | 高 |

---

## 八、关键亮点（保留）

1. **步骤 ② 的"真实 HTTP 预览"设计**：实际发起 API 调用获取真实响应，再据此生成 structuredTransform 配置，这比纯靠 AI 猜测准确得多。业界 Agentic Workflow 产品（如 Zapier AI、n8n AI 助手）也采用类似的"实时探测"策略。

2. **`repairCommonDraftPlanIssues()` 的规则修复**：先用确定性规则修复，再走 LLM，避免浪费 LLM 调用修复简单格式问题。这是正确的设计。

3. **`AiWorkflowDraftPlan.extraPrompt` 的设计**：允许 AI 在一个阶段为下一个阶段留下提示，是一种"Agent 间通信"的雏形，值得继续扩展。

4. **`WorkflowResultEnvelope` 的分层结构**：`execution / result / artifacts / presentation / delivery` 层次清晰，设计质量高，是统一结果协议的良好基础。

---

## 九、Skill 文件上传的完整数据流建议

```
前端
  └── WorkflowEditModal（AI 草稿面板）
        ├── 文件上传区域（新增）
        │     支持: .yml / .yaml / .json / .md
        │     前端预处理: js-yaml.load() / JSON.parse()
        │     展示: 「已加载技能配置: 天气查询」的 Tag
        │
        └── createAiDraftSession({ description, referenceUrl, skillFileContent })
                  ↓
后端 TemporalWorkflowController.createAiDraftSession()
                  ↓
TemporalWorkflowSessionService.createAiDraftSession()
                  ↓
support.generateAiWorkflowDraft(data)
                  ↓
TemporalWorkflowAiDraftService.generateWorkflowDraft(data, support)
                  ↓
buildAnalyzeAiWorkflowDraftPrompt({
  description,
  referenceUrl,
  referenceExcerpt,
  skillFileContent,   ← 新增注入
  activityResources
})
                  ↓
Prompt 区域 C（OBJECTIVE）：
  【技能文件内容（优先参考）】{skillFileContent}
  【用户补充说明】{description}
                  ↓
（后续 4 步流程不变）
                  ↓
AiWorkflowDraft 返回
                  ↓
持久化 + 返回前端
                  ↓
前端 syncAiDraftSessionState(session)
  → 显示草稿对话历史
  → 可选：向 Chat 窗口推送"草稿已生成"消息（WorkflowResultContract）
```

---

*文档由 AI 分析生成，基于 2026-07-24 代码快照。不包含任何代码修改。*

---

## 十、落地实施计划

本节将优先级建议拆解为可执行的开发任务，按批次（Sprint）组织，每批次独立可交付。

---

### Batch 1（P0）：统一结果协议 + Prompt 结构化

**目标**：解决最核心的两个问题，为后续批次奠定基础。  
**预计工作量**：3–5 天  
**负责模块**：`ai-orchestrator`（后端）+ `platform`（后端）+ `portal`（前端）

---

#### Task 1-A：定义 `WorkflowResultContract` 接口

**文件**：`apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.types.ts`

在现有 `WorkflowResultEnvelope`（L64）之后新增：

```ts
/**
 * 所有工作流执行结果的统一出口协议 v1
 * 前端 ChatMessage.tsx 读取此格式渲染聊天窗口结果
 */
export interface WorkflowResultContract {
  // 版本标识（必填），用于前端区分新旧协议
  _version: '1';

  // 执行上下文
  executionId?: string;
  workflowId?: string;
  status: 'success' | 'partial_success' | 'failed' | 'cancelled';
  hasBusinessResult: boolean;

  // 聊天窗口展示（必填）
  chatSummary: string;
  summaryFormat: 'plain_text' | 'markdown';

  // 结构化业务数据（可选）
  title?: string;
  businessData?: unknown;
  metrics?: Record<string, unknown>;

  // 产物（可选）
  artifacts?: WorkflowResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;

  // 后续动作引导（可选）
  nextActions?: Array<{ type: string; label: string; value?: string }>;

  // 调试信息（可选，admin 可见）
  warnings?: string[];
}
```

**注意**：只新增接口，不删除 `WorkflowResultEnvelope`（向后兼容）。

---

#### Task 1-B：`ChatResultNormalizerService` 增加 `toContract()` 方法

**文件**：`apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-result-normalizer.service.ts`

在 `normalize()` 方法之后新增：

```ts
/**
 * 将归一化结果转换为统一的 WorkflowResultContract
 * 这是所有 RESULT 事件 data 字段的唯一出口
 */
toContract(normalized: NormalizedChatExecutionResult): WorkflowResultContract {
  return {
    _version: '1',
    executionId: normalized.executionId,
    status: normalized.status ?? 'success',
    hasBusinessResult: normalized.hasBusinessResult ?? false,
    chatSummary: this.resolveChatSummary(normalized),
    summaryFormat: normalized.summaryFormat ?? 'plain_text',
    title: normalized.resultTitle,
    businessData: normalized.businessData,
    artifacts: normalized.artifacts,
    downloadUrl: normalized.downloadUrl,
    temporalLink: normalized.temporalLink,
    nextActions: normalized.nextActions,
    warnings: normalized.warnings,
  };
}

private resolveChatSummary(normalized: NormalizedChatExecutionResult): string {
  // 优先级：chatSummary > resultSummary > result > 兜底文本
  return (
    normalized.chatSummary ||
    normalized.resultSummary ||
    (typeof normalized.result === 'string' ? normalized.result : '') ||
    '任务已完成'
  );
}
```

---

#### Task 1-C：`ChatExecutionStreamService` 统一使用 `toContract()`

**文件**：`apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-execution-stream.service.ts`

找到 `buildTerminalExecutionEvent` 方法（或所有 `yield RESULT` 的位置），将 `data` 字段改为通过 `normalizerService.toContract()` 生成：

```ts
// 修改前：直接构建 data 对象（各处不一致）
data: { executionId, status, result, chatSummary, ... }

// 修改后：统一通过 toContract() 生成
data: this.normalizerService.toContract(normalizedResult)
```

---

#### Task 1-D：前端 `ChatMessage.tsx` 读取 `_version` 字段

**文件**：`apps/frontend/portal/src/features/chat/ChatMessage.tsx`

在 RESULT 事件处理逻辑中，增加版本判断：

```ts
const resultData = event.data;
const chatSummary = resultData?._version === '1'
  ? resultData.chatSummary          // 新协议：直接读取
  : legacyResolveSummary(resultData); // 旧协议：保持原有 fallback 链
```

这样可以做到新旧协议平滑共存，无需一次性迁移所有调用方。

---

#### Task 1-E：统一 3 个 Prompt 为 4 区域结构

**文件**：`apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow-draft.helpers.ts`

重构 `buildAnalyzeAiWorkflowDraftPrompt`（最大改动）和 `buildAnalyzeAiWorkflowRefinementPrompt`，使其与 `buildRepairAiWorkflowDraftPlanPrompt` 风格一致：

```ts
// 新的 Prompt 结构模板（伪代码）
function buildAnalyzeAiWorkflowDraftPrompt(args): string {
  return [
    // 区域 A: ROLE
    '【角色】',
    '你是一个企业级 Temporal Workflow 草稿生成器。',
    '边界：只能从资源池中选 activityRef；只输出 JSON，禁止 Markdown 或解释文字。',

    // 区域 B: CONTEXT
    '【可用 Activity 资源池】',
    formatActivityResources(args.activityResources),  // 精简+分组
    '',
    '【核心规则】',
    formatRules(),  // 原来的 11 条规则，精简合并

    // 仅 refine/repair 时注入：
    // '【当前草稿摘要】',
    // formatWorkflowSummary(args.currentWorkflowDsl),

    // 区域 C: OBJECTIVE（靠近末尾）
    '【用户目标】',
    args.skillFileContent ? `技能文件内容（优先参考）:\n${args.skillFileContent}` : '',
    args.description ? `用户说明: ${args.description}` : '',
    args.referenceUrl ? `参考 URL: ${args.referenceUrl}` : '',
    args.referenceExcerpt ? `参考内容摘录: ${args.referenceExcerpt}` : '',

    // 区域 D: OUTPUT SPEC
    '【输出格式】',
    '只返回以下结构的 JSON 对象（不含注释）：',
    formatOutputSchema(),  // 精简示例，只展示必填字段
  ].filter(Boolean).join('\n');
}
```

**关键变化**：
- 用户目标（区域 C）移到靠近末尾
- `skillFileContent` 作为可选注入点（Task 2-A 前置准备）
- Activity 列表改为调用 `formatActivityResources()` 辅助函数（按类型分组，去掉 `config` 字段）

---

### Batch 2（P1）：Skill 文件上传支持

**目标**：支持用户上传 YAML/JSON Skill 文件，自动生成工作流草稿。  
**前置条件**：Batch 1 完成（Task 1-E Prompt 已预留 `skillFileContent` 注入点）  
**预计工作量**：2–3 天  
**负责模块**：`platform`（后端 DTO）+ `portal`（前端 UI）

---

#### Task 2-A：后端 DTO 扩展

**文件**：`apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.types.ts`

```ts
// 修改 GenerateAiWorkflowDraftSessionDTO（L349）
export interface GenerateAiWorkflowDraftSessionDTO extends GenerateAiWorkflowDraftDTO {
  title?: string;
  skillFileContent?: string;    // 新增：前端解析后的文件文本内容
  skillFileType?: 'yaml' | 'json' | 'markdown' | 'text'; // 新增：文件类型提示
}
```

同步修改 `GenerateAiWorkflowDraftDTO`（L344）：

```ts
export interface GenerateAiWorkflowDraftDTO {
  description?: string;
  referenceUrl?: string;
  skillFileContent?: string;   // 新增
  skillFileType?: string;      // 新增
}
```

---

#### Task 2-B：后端 Prompt 注入

**文件**：`temporal-workflow-draft.helpers.ts` 中的 `buildAnalyzeAiWorkflowDraftPrompt`

在区域 C（OBJECTIVE）注入 `skillFileContent`（已在 Task 1-E 预留占位）：

```ts
// 区域 C 中的技能文件注入
...(args.skillFileContent
  ? [
      '【技能文件内容（优先参考以下结构定义来理解意图）】',
      args.skillFileType === 'yaml' ? '(YAML 格式)' : '(JSON 格式)',
      args.skillFileContent.slice(0, 4000), // 防止超长文件撑爆 context
      '',
      '【用户补充说明（可覆盖文件中的设定）】',
    ]
  : ['【用户目标】']),
args.description || '（无额外说明，请完全按技能文件内容生成）',
```

---

#### Task 2-C：前端文件上传 UI

**文件**：`apps/frontend/portal/src/features/admin/temporal/components/WorkflowEdit/` 下的 AI 草稿面板相关组件

新增文件上传区域（`antd` 的 `Upload` 或 `Dragger` 组件）：

```tsx
// 伪代码：文件上传逻辑
const handleSkillFileUpload = async (file: File) => {
  const text = await file.text();
  let parsed: unknown;
  let fileType: string;

  if (file.name.endsWith('.yml') || file.name.endsWith('.yaml')) {
    parsed = yaml.load(text);           // 需要 js-yaml 依赖
    fileType = 'yaml';
  } else if (file.name.endsWith('.json')) {
    parsed = JSON.parse(text);
    fileType = 'json';
  } else if (file.name.endsWith('.md')) {
    parsed = text;                       // Markdown 直接传文本
    fileType = 'markdown';
  } else {
    message.error('不支持的文件格式，请上传 .yml / .yaml / .json / .md');
    return false;
  }

  // 校验基本结构（至少有 name 字段）
  if (typeof parsed === 'object' && parsed !== null && !('name' in parsed)) {
    message.warning('文件中未找到 name 字段，将作为纯文本说明使用');
  }

  setSkillFileContent(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
  setSkillFileType(fileType);
  setSkillFileName(file.name);
  message.success(`已加载技能配置：${(parsed as any)?.name || file.name}`);
  return false; // 阻止 antd 自动上传
};
```

UI 展示：
- 上传成功后显示 `Tag`：「📄 已加载：{skillFileName}」，附带 ×（删除）按钮
- 当 `skillFileContent` 存在时，`description` 文本框改为可选（placeholder 改为"可选：补充说明或改动要求"）
- 当两者都为空时，"生成草稿"按钮禁用

---

#### Task 2-D：前端 `js-yaml` 依赖确认

检查 `portal` 是否已安装 `js-yaml`：

```bash
# 检查
cat apps/frontend/portal/package.json | grep js-yaml

# 若没有，安装
cd apps/frontend/portal && npm install js-yaml && npm install -D @types/js-yaml
```

---

### Batch 3（P1）：参数传递封装

**目标**：用 `AiDraftGenerationContext` 消除散落的裸参数，提升代码可维护性。  
**前置条件**：Batch 1 完成  
**预计工作量**：1–2 天（纯重构，无功能变化）  
**负责模块**：`platform`（后端）

---

#### Task 3-A：定义 `AiDraftGenerationContext` 接口

**文件**：`temporal-workflow-draft.service.ts` 顶部或新建 `temporal-workflow-draft.types.ts`

```ts
export interface AiDraftGenerationContext {
  // 用户输入（不可变）
  readonly description: string;
  readonly referenceUrl: string;
  readonly referenceExcerpt: string;
  readonly skillFileContent?: string;
  readonly skillFileType?: string;

  // 系统资源（不可变）
  readonly activityResources: AiDraftActivityResource[];
  readonly knownActivityRefs: Set<string>;

  // 辅助服务（不可变）
  readonly support: TemporalWorkflowAiDraftSupport;
}

// 生成过程中的可变状态（用返回新对象的方式更新，不直接 mutation）
export interface AiDraftGenerationState {
  readonly plan: AiWorkflowDraftPlan;
  readonly stepOutputSamples: ReadonlyMap<string, unknown>; // key 改为 step_${index}
  readonly sampleInputs: Readonly<Record<string, any>>;
  readonly declaredInputKeys: ReadonlySet<string>;
  readonly warnings: ReadonlyArray<string>;  // 不可变追加，替代 mutable push
}
```

---

#### Task 3-B：重构 5 个私有方法签名

将现有方法：
```ts
private async analyzeAiWorkflowDraft(
  description: string,
  referenceUrl: string,
  referenceExcerpt: string,
  activityResources: AiDraftActivityResource[],
  support: TemporalWorkflowAiDraftSupport
): Promise<AiWorkflowDraftPlan>
```

改为：
```ts
private async analyzeAiWorkflowDraft(
  ctx: AiDraftGenerationContext
): Promise<AiWorkflowDraftPlan>
```

其余 4 个方法类似处理。`generateWorkflowDraft` 在调用链最开始构建 `ctx` 对象一次，之后所有内部方法只接收 `ctx`。

---

#### Task 3-C：`stepOutputSamples` key 改为强制 index

```ts
// 修改前（key 依赖 step.id，有重复风险）
const currentStepKey = buildAiDraftStepSampleKey(step, index, ...);
// → step.id || `step_${index + 1}`

// 修改后（强制用 index，避免 id 重复）
const currentStepKey = `step_${index}`;
```

同步修改 `buildAiDraftStepSampleKey` 函数或直接废弃它。

---

### Batch 4（P2）：Prompt 精细化优化

**目标**：减少 Token 消耗，提升 activity 选择精度，改善 refinement 质量。  
**前置条件**：Batch 1 完成  
**预计工作量**：2–3 天  
**负责模块**：`platform`（后端）

---

#### Task 4-A：Activity 资源列表格式化辅助函数

**文件**：`temporal-workflow-draft.helpers.ts`

新增 `formatActivityResources()` 函数：

```ts
export function formatActivityResources(
  activityResources: AiDraftActivityResource[],
  options?: { keywords?: string[] }
): string {
  const builtin = activityResources.filter(a => a.ref.startsWith('builtin:'));
  const custom = activityResources.filter(a => a.ref.startsWith('custom:'));

  // 如果有关键词，对 custom 按相关性排序
  const sortedCustom = options?.keywords
    ? custom.sort((a, b) => {
        const scoreA = options.keywords!.some(kw =>
          (a.description || '').includes(kw) || a.name.includes(kw)
        ) ? 1 : 0;
        const scoreB = options.keywords!.some(kw =>
          (b.description || '').includes(kw) || b.name.includes(kw)
        ) ? 1 : 0;
        return scoreB - scoreA;
      })
    : custom;

  const format = (list: AiDraftActivityResource[]) =>
    JSON.stringify(
      list.map(a => ({
        ref: a.ref,
        name: a.name,
        fn: a.fn,
        handler: a.handler,
        description: a.description || '',
        // 不注入 config（过长）
      })),
      null, 2
    );

  return [
    '# Builtin Activities（优先使用）',
    format(builtin),
    custom.length > 0 ? '# Custom Activities（仅当明显需要时使用）' : '',
    custom.length > 0 ? format(sortedCustom.slice(0, 20)) : '', // 最多 20 个
  ].filter(Boolean).join('\n');
}
```

---

#### Task 4-B：Refinement Prompt 注入步骤摘要

**文件**：`temporal-workflow-draft.helpers.ts` 中 `buildAnalyzeAiWorkflowRefinementPrompt`

```ts
// 修改前：全量 DSL 注入
'【当前 Workflow DSL】',
JSON.stringify(currentWorkflowDsl, null, 2),  // 可能几千 token

// 修改后：精简摘要 + 完整配置按需注入
'【当前工作流摘要】',
JSON.stringify({
  name: currentWorkflowDsl.name,
  inputParams: currentWorkflowDsl.inputParams,
  outputParams: currentWorkflowDsl.outputParams,
  steps: currentWorkflowDsl.steps.map(s => ({
    id: s.id,
    name: s.name,
    activityRef: s.activityRef,
    // 不注入 input 配置，减少 token
  })),
}, null, 2),

// 用户改进要求提前（优先级最高）
'【改进要求（最重要，请重点关注）】',
userPrompt,
```

---

#### Task 4-C：Warnings 增加可操作提示

**文件**：`temporal-workflow-draft.service.ts` 中 `repairAiWorkflowDraftPlanIfNeeded`

```ts
// 修改前
warnings: [..., ...finalIssues.map(issue => `AI 草稿自动修复后仍需确认: ${issue}`)]

// 修改后：增加操作指引
warnings: [..., ...finalIssues.map(issue => {
  if (issue.includes('activityRef')) {
    return `${issue} → 请在编辑器中手动选择正确的 Activity`;
  }
  if (issue.includes('__httpRequest')) {
    return `${issue} → 请在步骤配置中补充 HTTP 请求参数`;
  }
  return `${issue} → 请在编辑器中手动检查`;
})]
```

---

## 十一、验收标准

### 11.1 Batch 1 验收（统一结果协议 + Prompt 结构化）

#### 功能验收

| 验收项 | 验收方式 | 通过标准 |
|--------|----------|----------|
| `WorkflowResultContract` 接口存在 | 代码审查 | `temporal-workflow.types.ts` 中有 `WorkflowResultContract`，含 `_version: '1'` 和 `chatSummary: string`（必填） |
| `toContract()` 方法存在 | 代码审查 | `ChatResultNormalizerService` 有 `toContract()` 方法，返回符合 `WorkflowResultContract` 的对象 |
| RESULT 事件携带 `_version` | 接口测试 | 执行任意工作流技能后，SSE 流中的 `RESULT` 事件 `data._version === '1'` |
| `chatSummary` 必填 | 接口测试 | RESULT 事件 `data.chatSummary` 为非空字符串 |
| 前端使用新协议展示 | 功能测试 | Chat 窗口中执行一个技能，结果文字与 `data.chatSummary` 一致 |
| 旧版 RESULT 事件向后兼容 | 功能测试 | 历史消息（无 `_version` 字段的 RESULT）仍能正常渲染 |
| Prompt 统一 4 区域结构 | 代码审查 | 3 个 Prompt 构建函数都使用 `【区域标签】` 格式，区域 C（用户目标）在倒数第 2 区域 |

#### 非功能验收

| 验收项 | 验收方式 | 通过标准 |
|--------|----------|----------|
| Prompt 结构化后草稿质量不下降 | A/B 对比测试 | 用同一组 5 个测试 description，新旧 Prompt 各生成一次，新版草稿 warnings 数量不多于旧版 |
| 不引入新的 TS 类型错误 | CI 检查 | `tsc --noEmit` 通过 |

---

### 11.2 Batch 2 验收（Skill 文件上传）

#### 功能验收

| 验收项 | 验收方式 | 通过标准 |
|--------|----------|----------|
| 前端支持 .yml/.yaml/.json/.md 上传 | UI 测试 | 能通过文件选择器或拖拽上传上述格式文件 |
| 上传后显示文件名 Tag | UI 测试 | 成功上传后，输入区域显示"📄 已加载：{filename}" Tag，且有删除按钮 |
| 上传 YAML Skill 文件生成草稿 | E2E 测试 | 使用示例 YAML（含 `name` + `paramsSchema`），点击"生成草稿"，草稿中的 `inputParams` 包含文件中声明的参数 |
| 上传文件 + 文字说明同时使用 | E2E 测试 | 上传文件并填写额外说明，生成的草稿同时反映文件内容和文字补充 |
| 仅上传文件（无 description）可生成草稿 | E2E 测试 | 只上传文件，不填 description，生成成功，草稿名称从文件 `name` 字段获取 |
| 无效文件格式报错友好 | UI 测试 | 上传 `.exe` 或 `.docx` 文件时，显示"不支持的文件格式"提示，不阻塞 UI |
| 文件内容过长自动截断 | 接口测试 | 上传一个超过 10KB 的 YAML 文件，后端不报错，Prompt 中截断到 4000 字符 |
| 删除已上传文件 | UI 测试 | 点击 Tag 上的 × 按钮，文件内容清除，描述文本框恢复必填状态 |

#### 接口验收

`POST /temporal/draft-sessions` 请求体支持：
```json
{
  "description": "可选补充说明",
  "skillFileContent": "name: 天气查询\nparamsSchema:\n  properties:\n    city:\n      type: string",
  "skillFileType": "yaml"
}
```

响应中 `currentDraft.workflowDsl.inputParams` 应包含 `city` 参数。

---

### 11.3 Batch 3 验收（参数传递封装）

#### 代码质量验收

| 验收项 | 验收方式 | 通过标准 |
|--------|----------|----------|
| `AiDraftGenerationContext` 接口存在 | 代码审查 | 在 `temporal-workflow-draft.service.ts` 或新建文件中定义 |
| 5 个私有方法均使用 `ctx` 参数 | 代码审查 | 无方法接收裸字符串 `description` / `referenceUrl` 参数 |
| `stepOutputSamples` key 为 `step_${index}` | 代码审查 | `buildAiDraftStepSampleKey` 不再被调用，或其实现改为只返回 `step_${index}` |
| 无 `warnings` 的 mutable push | 代码审查 | `resolvedPlan.warnings as string[]).push(` 不再出现在 service 中 |
| 重构后功能不变 | 回归测试 | Batch 1、Batch 2 的所有 E2E 测试全部通过 |

---

### 11.4 Batch 4 验收（Prompt 精细化优化）

#### 性能验收

| 验收项 | 测量方式 | 通过标准 |
|--------|----------|----------|
| Prompt Token 数量减少 | 在 admin 的 Prompt Debug 中查看 `usage.prompt_tokens` | 相同 description 下，Prompt Token 比优化前减少 ≥ 20% |
| Activity 选择准确率 | 人工评估 10 个典型 description | "HTTP 查询" 类描述首选 `builtin:httpRequest`；"文档生成" 类首选 carbone 相关 activity 的比例 ≥ 80% |
| Refinement 质量 | 人工评估 | 对同一草稿进行 3 次 refine（"加一个步骤"、"改名称"、"删除第一步"），成功率 ≥ 80% |

---

## 十二、测试用例参考

### 12.1 Skill 文件上传 E2E 测试用例

#### 用例 T-01：标准 YAML 文件上传

**输入文件** (`weather-skill.yml`)：
```yaml
name: "天气查询"
description: "根据城市名称查询并格式化天气信息"
executionType: "api"
paramsSchema:
  properties:
    city:
      type: string
      description: "城市名称，如：上海、北京"
      required: true
    format:
      type: string
      description: "输出格式"
      default: "markdown"
  required: ["city"]
expectedOutput: "markdown 格式的天气报告，含温度、湿度、风速"
```

**操作步骤**：
1. 打开 WorkflowEditModal → AI 草稿面板
2. 上传 `weather-skill.yml`
3. 点击"生成草稿"（无额外说明）
4. 等待生成完成

**预期结果**：
- 草稿名称包含"天气查询"
- `workflowDsl.inputParams` 含 `city`（required: true）和 `format`（有 defaultValue）
- 步骤中包含 `builtin:httpRequest`（调用天气 API）
- 步骤中包含 `builtin:structuredTransform` 或 `builtin:aiStructuredTransform`（格式化）

---

#### 用例 T-02：JSON 文件上传 + 补充说明

**输入文件** (`contract-skill.json`)：
```json
{
  "name": "合同生成",
  "executionType": "document",
  "paramsSchema": {
    "properties": {
      "party_a": { "type": "string", "description": "甲方公司名称" },
      "party_b": { "type": "string", "description": "乙方公司名称" },
      "amount": { "type": "number", "description": "合同金额（元）" }
    },
    "required": ["party_a", "party_b", "amount"]
  }
}
```

**额外说明**：`"在合同生成后增加一个发送邮件的步骤"`

**预期结果**：
- `workflowDsl.inputParams` 含 3 个参数（party_a / party_b / amount）
- 步骤中包含文档渲染相关 Activity
- 步骤中包含邮件发送 Activity（来自 custom 或 builtin）

---

#### 用例 T-03：多轮 Refine 测试

**前置**：用 T-01 的 YAML 文件生成草稿

**第 1 轮 refine**：`"将天气输出格式改为 JSON 而不是 markdown"`
- 预期：步骤配置中 `outputMode` 改为 `json`

**第 2 轮 refine**：`"增加一个步骤，把结果推送到企业微信"`
- 预期：新增一个步骤，activityRef 指向企业微信相关 Activity（若无则有 warning）

**第 3 轮 refine**：`"删除 format 参数，改为固定输出 JSON"`
- 预期：`workflowDsl.inputParams` 中 `format` 参数被删除或 defaultValue 固定为 `json`

---

### 12.2 统一结果协议测试用例

#### 用例 T-10：执行技能后 RESULT 事件验证

**操作步骤**：
1. 在 Chat 窗口输入："查询上海今天天气"
2. 等待任务执行完成

**SSE 事件验证（DevTools Network）**：
```json
{
  "type": "result",
  "data": {
    "_version": "1",
    "status": "success",
    "hasBusinessResult": true,
    "chatSummary": "上海今日天气：...",   // 非空字符串
    "summaryFormat": "plain_text"
  }
}
```

**UI 验证**：
- Chat 窗口展示的文字与 `data.chatSummary` 一致
- 无多余的 JSON 或原始数据暴露在消息中

---

## 十三、回归影响评估

### 高风险区域（需要重点回归）

| 改动 | 影响范围 | 回归方式 |
|------|----------|----------|
| `ChatResultNormalizerService.toContract()` | 所有工作流执行结果展示 | 执行 5 种不同类型的工作流（API/文档/浏览器/自定义/失败），验证 Chat 窗口展示正常 |
| `ChatExecutionStreamService` 统一 RESULT 出口 | RESULT / WAITING_INPUT / ERROR 等终态事件 | 执行需要"等待输入"的工作流，验证 WAITING_INPUT 事件仍然正常触发和渲染 |
| 3 个 Prompt 重构 | 所有草稿生成质量 | 用 10 个标准 description 各生成一次，与重构前对比 warnings 数量和步骤完整性 |
| `stepOutputSamples` key 改为 index | HTTP → structuredTransform 的配置生成 | 生成含 httpRequest + structuredTransform 两步的草稿，验证 structuredTransform 配置基于正确的上游响应生成 |

### 低风险区域（无需特别回归）

- `WorkflowResultContract` 接口定义（纯类型，无运行时影响）
- `AiDraftGenerationContext` 封装（纯重构，功能不变）
- Activity 资源列表格式化（只影响 Prompt 内容，不影响接口协议）

---

## 十四、文件改动清单

| 文件 | 改动类型 | Batch |
|------|----------|-------|
| `temporal-workflow.types.ts` | 新增 `WorkflowResultContract` 接口；扩展 `GenerateAiWorkflowDraftSessionDTO` | 1、2 |
| `chat-result-normalizer.service.ts` | 新增 `toContract()` 方法 | 1 |
| `chat-execution-stream.service.ts` | 统一使用 `toContract()` 生成 RESULT data | 1 |
| `ChatMessage.tsx` | 增加 `_version` 判断，读取 `chatSummary` | 1 |
| `temporal-workflow-draft.helpers.ts` | 重构 3 个 Prompt 为 4 区域结构；新增 `formatActivityResources()` | 1、4 |
| `temporal-workflow-draft.service.ts` | 封装 `AiDraftGenerationContext`；重构 5 个私有方法；`stepOutputSamples` key 改为 index | 3 |
| AI 草稿面板组件（具体文件待定） | 新增文件上传 UI | 2 |
| `portal/package.json` | 新增 `js-yaml` 依赖（若未有） | 2 |

---

*文档版本 v2，2026-07-24。由 AI 分析并生成落地计划，代码改动请开发人员在充分理解现有逻辑后实施。*

