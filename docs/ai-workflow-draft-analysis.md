# AI 工作流草稿生成 —— 全面分析与建议

> 基于对当前代码库的深度分析，涵盖后端 ai-orchestrator、前端 chat 模块、接口协议、数据流各层次。
> 
> 生成日期：2026-07-24

---

## 一、当前工作流全貌（As-Is）

### 1.1 核心数据流

```
用户输入自然语言
    ↓
ChatController  /ai/stream
    ↓
ChatOrchestratorService
    ↓
PlannerService.matchSkillPhase
    ↓
SkillMatcherService（向量搜索 + LLM 打分）
    ↓
PlannerPlanDraftService.completePlanFromMatchPhase
    ↓
RecognizerService（参数识别 LLM 调用）
    ↓
PlanSemanticService（文档复杂度分析）
    ↓
PlanGeneratorService（构建 PlanDraftDTO）
    ↓
回到 ChatOrchestratorService
    ├── missingInputs > 0 → WAITING_INPUT 事件 → 前端渲染
    └── all inputs ready → 创建执行单 + 观察流 → 前端渲染
```

### 1.2 StreamEvent 协议（已有基础）

后端已定义 8 种事件类型（`StreamEventType`），位于 `react-engine/interfaces.ts`：

| 类型 | 用途 |
|------|------|
| `thought` | 中间推理日志 |
| `action` | 执行动作 |
| `observation` | 步骤结果 |
| **`result`** | **最终结果（含 `data.result`）** |
| `waiting_input` | 缺失参数请求 |
| `pending_approval` | 待审批 |
| `human_control` | 人工接管 |
| `error` | 错误 |
| `session_patch` | 会话元信息更新 |

`RESULT` 事件的 `data` 字段已包含（`chat-execution-stream.service.ts`）：

```ts
{
  executionId, status, result, normalizedResult,
  resultType, resultTitle, resultSummary,
  artifacts, downloadUrl, temporalLink,
  hasBusinessResult, usage
}
```

### 1.3 关键文件地图

| 文件 | 职责 |
|------|------|
| `chat/chat-orchestrator.service.ts` | 主调度层：planner → 执行单创建 → 流式观察 |
| `planner/planning/planner-plan-draft.service.ts` | 草稿构建入口，整合识别 + 语义分析 |
| `planner/plan/plan-generator.service.ts` | 组装 PlanDraftDTO 数据结构 |
| `planner/plan/plan-semantic.service.ts` | 文档类任务的复杂度分析与分组 |
| `chat/chat-execution-stream.service.ts` | 执行流观察 + 终态事件生成 |
| `chat/chat-result-normalizer.service.ts` | WorkflowResultEnvelope 归一化 |
| `chat/chat-waiting-input.service.ts` | 缺失参数消息格式化 + 参数还原 |
| `interfaces/index.ts` | 核心 DTO：PlanDraftDTO、RequiredInputDTO、PlanSemanticDTO |
| `features/chat/ChatMessage.tsx` | 前端消息渲染，含 TaskOutcomeCard 等 |
| `features/chat/lib/chatMessagePresentation.ts` | 前端展示格式化工具函数 |

---

## 二、五大维度分析

---

### 2.1 工作流需求说明（Prompt 区域划分）

#### 现状问题

- 目前的 `buildChatSystemMessage` 只有两句话（chat 模式）；Task 模式下技能召唤提示词分散在各 service 中，无结构化区域划分
- `RecognizerService` 的 Prompt 没有明确分区，AI 难以区分"全局背景"、"当前技能说明"、"待提取参数"等上下文
- 前端 `PromptDebugModal` 已经支持分区调试，但后端没有配套的结构化分区输出

#### 建议：将 Prompt 拆分为 4 个语义区域

```
┌───────────────────────────────────────────────────────────────┐
│ 区域 A: Role & Context（角色 + 全局规则）                      │
│  - 你是什么 AI，当前处于什么场景                              │
│  - 必须遵守的输出格式约束                                      │
│  - 语言偏好（中文优先等）                                      │
├───────────────────────────────────────────────────────────────┤
│ 区域 B: Skill Specification（技能规格）                        │
│  - 技能名称、目标（goal）、预期结果（expectedResult）          │
│  - 适用场景、特殊说明（guideContext / guideMarkdown）          │
│  - 技能类型（document / api / browser）                        │
├───────────────────────────────────────────────────────────────┤
│ 区域 C: Parameter Schema（参数说明）                           │
│  - 每个参数的类型、描述、extractionPrompt                      │
│  - 已收集的上下文值（context 注入，用作 few-shot）             │
│  - 必填 vs 可选的区分                                          │
├───────────────────────────────────────────────────────────────┤
│ 区域 D: User Input（用户原始输入）                             │
│  - 当前用户的消息（含上传文件提取的文本）                      │
│  - 历史对话摘要（若需要）                                      │
└───────────────────────────────────────────────────────────────┘
```

**好处**：
- 区域 B、C 可以动态替换（支持 skill-file upload 时直接替换区域 B/C）
- 前端调试时可以分区显示（`PromptDebugModal` 的 `systemPromptSectionKeys` 已有此机制）
- 不同区域可以独立缓存（Anthropic prompt caching 对稳定区域效果更好）

---

### 2.2 支持 Skill 文件上传

#### 需求

除自然语言外，允许上传 skill 配置文件（YAML/JSON），自动转换为 AI 可识别的工作流草稿。

#### 现状

- 后端 `ChatMediaService` 已支持 `files` 上传，构建 `ContentBlock`
- 前端 `ChatInput.tsx` 已有文件上传入口（`body.files`）
- 但目前文件内容只传入 LLM 作为多模态输入，没有结构化解析分支

#### 建议方案

```
文件上传检测流程：

1. ChatOrchestratorService 检查 body.files 中是否有 .yml/.yaml/.json 文件
2. 如果有：走新的 SkillFileParserService
   - 解析 YAML/JSON → SkillDraftSpec
   - 直接跳过 SkillMatcherService（已知目标技能）
   - 用文件内容的 paramsSchema 初始化 RecognizerService
3. 如果没有：走现有 matchSkillPhase 路径
```

**新增 `SkillDraftSpec` 接口（建议放在 `interfaces/index.ts`）：**

```ts
interface SkillDraftSpec {
  name: string;
  description?: string;
  goal?: string;
  expectedResult?: string;
  paramsSchema: RecognizeParamsDTO['params_schema'];
  executionFlow?: string[];
  guideMarkdown?: string;      // 可选：参数采集指引
  paramCollectionGuidance?: string;
}
```

**支持的文件格式示例（`skill-draft.yml`）：**

```yaml
name: "合同生成"
description: "根据甲乙方信息和条款生成合同文档"
goal: "生成标准采购合同"
expectedResult: "PDF 合同文档"
paramsSchema:
  properties:
    party_a:
      type: string
      description: "甲方公司全称"
    party_b:
      type: string
      description: "乙方公司全称"
    contract_amount:
      type: number
      description: "合同金额（元）"
  required: ["party_a", "party_b"]
executionFlow:
  - "document_render"
```

> **提示**：文件解析可以使用 `js-yaml` / `JSON.parse`，不需要额外 LLM 调用，延迟极低（< 5ms）。

---

### 2.3 提示词与处理逻辑优化点

#### 问题 1：参数识别 Prompt 缺乏迭代提示

当前 `recognizerService.recognizeParams` 每次都是全量参数识别，缺乏"已收集参数作为 few-shot 示例"的机制。

**建议**：在 `waiting_input_resume` 模式下，将 `already_collected` 以 example 形式注入 Prompt：

```
已经收集到的示例（格式参考）:
- company_name: "北京科技有限公司"
- contract_date: "2025-01-15"

请按相同格式提取用户补充的以下字段：
- contact_person: [待提取]
- delivery_date: [待提取]
```

#### 问题 2：fallback Plan 信息量不足

`buildFallbackPlan` 只返回一句提示语，没有给前端可渲染的结构。

**建议**：fallback 时也返回具体的技能候选列表（`topCandidates`），前端可以渲染"您是否想要执行：[技能A] [技能B]"的快速选择卡：

```ts
// 在 PlanGeneratorService.buildFallbackPlan 中增加
metadata: {
  has_visible_skills: hasVisibleSkills,
  topCandidates: matchPhase.topCandidates || [],  // 新增：候选技能列表
  ...
}
```

#### 问题 3：文档技能复杂度阈值硬编码

`plan-semantic.service.ts` 中：
- `DOCUMENT_COMPLEX_PARAM_THRESHOLD = 8`
- `DOCUMENT_COMPLEX_MISSING_THRESHOLD = 4`
- `DOCUMENT_COMPLEX_ARRAY_GROUP_THRESHOLD = 2`

靠环境变量配置，但没有在 admin 界面暴露，实际调整成本高。

**建议**：将这些阈值迁移到 admin 配置表，并允许按 skillId 覆盖。

#### 问题 4：`buildChatSystemMessage` 过于简单

```ts
// 现在：
'你是一个智能助手，请用中文友好地回答用户的问题。'

// 建议增加：角色约束 + 格式约束 + 能力边界说明 + 响应风格
```

Chat 模式的系统提示词长期被忽视，缺乏质量优化，建议按照区域 A 的结构重写。

---

### 2.4 步骤间参数传递

#### 现状架构

```
PlannerMatchPhase → PlannerPlanDraftService → PlanGeneratorService
```

当前通过 `PlannerCompletePlanInput` 传递，已经比较清晰。但以下问题值得关注：

#### 问题 1：`executionSnapshot` vs `planDraft` 的冗余

`buildExecutionSnapshot` 和 `buildExecutionPlanDraft` 都在序列化 `requiredInputs`，存在双重序列化，前者作为 `normalizedInputJson` 存储，后者作为 `planDraft` 传递。

**建议**：统一到 `executionPlanDraft`，`executionSnapshot` 作为 `executionPlanDraft.normalizedInput` 的子字段，减少数据重复。

#### 问题 2：waiting_input 参数还原的 3 条路径缺少熔断

当前 `buildWaitingInputPayload` 顺序尝试 3 条路径（都可能执行完）：
1. JSON 对象解析（纯解析，无 LLM）
2. LLM 识别（`recognizerService.recognizeParams`）
3. Planner 整体重新规划（`plannerService.generatePlan`，成本最高）

**建议**：明确短路机制，每条路径成功则立即返回，避免多余的 LLM 调用：

```ts
// 建议优化：明确短路
const parsed = tryParseJsonObject(message);
if (parsed && hasAllowedKeys(parsed, missingInputs)) {
  return expand(parsed);
}

const llmRecognized = await tryLLMRecognize(missingInputs, message);
if (llmRecognized && Object.keys(llmRecognized).length > 0) {
  return expand(llmRecognized);
}

const labelMatched = tryLabeledKeyValueParse(message, missingInputs);
if (labelMatched && Object.keys(labelMatched).length > 0) {
  return expand(labelMatched);
}

// 只有以上都失败才调用 planner（成本最高）
const planResolved = await plannerService.generatePlan(...);
```

#### 问题 3：`context: Record<string, unknown>` 松散传递

`plannerInput.request.context` 是一个开放 map，没有类型约束，IDE 无提示，容易出错。

**建议**：提取 `PlannerContextDTO` 接口（建议放在 `planner/planner.types.ts`）：

```ts
interface PlannerContextDTO {
  sessionId?: string;
  uploadedFiles?: UploadedFile[];
  history?: ConversationHistoryItem[];
  mode?: 'initial' | 'waiting_input_resume';
  targetSkillId?: string;
  missingInputs?: string[];
  alreadyCollected?: Record<string, unknown>;
  originalObjective?: string;
  skillName?: string;
}
```

---

### 2.5 最终结果在聊天窗口显示 —— 统一 RESULT 协议

> **这是最重要的核心问题。**

#### 现状问题：RESULT 事件语义混乱

| 场景 | 当前行为 | 问题 |
|------|----------|------|
| 执行成功有 result | 走 `resultNormalizerService.normalize` → 结构完整 | ✅ 正常 |
| 执行成功无 result | 只有 `content` 文字，`data.hasBusinessResult=false` | ⚠️ 前端无法区分"有结果"与"无结果" |
| 规划后立即启动（无 missing） | `data.result` 为空，只有 `data.plan` | ⚠️ plan 被误当 result 用 |
| waiting_input 创建后 | 用的是 `StreamEventType.RESULT`，`hasBusinessResult=false` | ❌ 语义错误，等待输入不应该是 RESULT |
| fallback 规划 | 没有统一的 RESULT 事件，依赖 ReAct 引擎输出 | ❌ 无法保证格式 |

#### 建议：定义统一的 `WorkflowResultContract`

所有工作流最终 `RESULT` 事件的 `data` 字段必须遵循此结构：

```ts
// 建议放在 interfaces/index.ts
interface WorkflowResultContract {
  // === 执行上下文（必填）===
  executionId?: string;
  status: 'success' | 'partial_success' | 'failed' | 'cancelled' | 'waiting_input' | 'pending';
  hasBusinessResult: boolean;

  // === 业务内容（at least one）===
  // 用于聊天窗口展示的 Markdown/纯文本（前端只读这个字段）
  chatSummary?: string;
  summaryFormat?: 'plain_text' | 'markdown';

  // 用于卡片/结构化展示
  title?: string;
  businessData?: unknown;

  // === 产物 ===
  artifacts?: WorkflowResultArtifact[];
  downloadUrl?: string;
  temporalLink?: string;

  // === 后续动作引导 ===
  nextActions?: WorkflowResultNextAction[];

  // === 调试信息（admin 可见）===
  plan?: PlanDraftDTO;
  usage?: LLMUsage;
  promptDebug?: PromptDebugPayload;
}
```

#### 落地步骤

1. **在 `ChatResultNormalizerService` 中增加 `toWorkflowResultContract()` 方法**，确保所有 normalize 后的结果都能转换为统一协议。

2. **`ChatExecutionStreamService.buildTerminalExecutionEvent` 成为唯一的 RESULT 事件出口**，所有真正完成态都经过它，不允许在其他地方直接 yield RESULT（仅 `chat-orchestrator.service.ts` 的执行单启动阶段例外，但应改用特定子类型）。

3. **前端 `ChatMessage.tsx` 只读 `data.chatSummary` 作为主展示文字**，`data.businessData` 作为卡片展示内容，消除现有的 6-7 个字段的 fallback 链：

   ```ts
   // 当前（fragile）：
   summary = chatSummary || finalAnswer || formatted_output || summary || message || result
   
   // 建议（稳定）：
   summary = data.chatSummary  // 由后端统一生成
   ```

---

## 三、Skill 文件上传集成建议

### 3.1 前端入口改造

```
ChatInput 文件上传
  ├── 图片/PDF → 现有 base64 上传路径（ChatMediaService）
  └── .yml/.yaml/.json → 新增 skillDraftFile 标记
      └── 发送时附加 body.skillDraftFileContent: string（解析后的文件内容）
```

建议在前端增加：
- 文件类型检测（`file.name.endsWith('.yml')` 等）
- YAML 格式校验提示
- 上传成功后在输入框显示"已加载技能配置：xxx"的标记 tag

### 3.2 后端解析路径

```
ChatController
    ↓
ChatOrchestratorService.handleTaskMode
    ↓ 检查 body.files 中是否存在 skill draft 文件
    ├── 是 → SkillFileParserService.parse(fileContent)
    │       ↓ → SkillDraftSpec
    │       ↓ → 直接构建 matchPhase（skillId=draft, confidence=1.0）
    │       ↓ → PlannerPlanDraftService.buildSkillPlan(spec)
    └── 否 → 现有 matchSkillPhase 路径
```

### 3.3 `SkillFileParserService` 核心逻辑

```ts
@Injectable()
export class SkillFileParserService {
  parse(content: string, mimeType?: string): SkillDraftSpec | null {
    try {
      // 支持 YAML 和 JSON
      const raw = mimeType?.includes('yaml')
        ? yaml.load(content)
        : JSON.parse(content);

      return this.validate(raw);
    } catch {
      return null;
    }
  }

  private validate(raw: unknown): SkillDraftSpec | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.name !== 'string') return null;
    if (!obj.paramsSchema) return null;
    return obj as SkillDraftSpec;
  }
}
```

---

## 四、优先级建议

| 优先级 | 内容 | 预计影响 |
|--------|------|---------|
| 🔴 P0 | 统一 `RESULT` 事件协议（`WorkflowResultContract`） | 修复现有不一致，为 chat 展示提供可靠基础 |
| 🔴 P0 | `ChatExecutionStreamService` 成为唯一 RESULT 出口 | 消除多处 `yield RESULT` 散落的问题 |
| 🟠 P1 | 提取 `PlannerContextDTO` 类型约束 | 提高代码可维护性，减少 context 传递出错 |
| 🟠 P1 | waiting_input 参数还原的明确短路机制 | 减少不必要的 LLM 调用，降低延迟和成本 |
| 🟡 P2 | Prompt 分 4 区结构化（A/B/C/D） | 提高 AI 提取准确率，便于 admin 调试 |
| 🟡 P2 | Skill 文件上传 → `SkillDraftSpec` 解析路径 | 支持新的工作流创建入口 |
| 🟢 P3 | fallback 返回候选技能列表（`topCandidates`） | 改善用户意图澄清体验 |
| 🟢 P3 | 文档技能阈值可配置化（admin 配置表） | 运营便捷性 |

---

## 五、现有值得保留的设计亮点

### 5.1 `WorkflowResultEnvelope` 结构设计优秀

`result / artifacts / presentation / delivery` 层次清晰，建议继续扩展而非重写。现有的 `ChatResultNormalizerService` 对历史格式的兼容处理（`chatSummary` / `finalAnswer` / `formatted_output` / `result`）值得文档化。

### 5.2 `PlanSemanticDTO` 的复杂度分析

`previewReady` / `finalReady` / `groupedMissing` 的分层是正确的设计，前端已能根据这些状态显示不同 UI（普通字段列表 vs 分组卡片）。

### 5.3 `PromptDebugModal` 可调试性

admin 可以看到完整的 LLM 调用链，`promptDebug.llmCalls` 记录每个阶段的 request/response，这是非常好的可观测性设计，应该推广到 Skill 文件上传路径。

### 5.4 `StreamEvent.seq + protocolVersion`

协议版本控制已经埋好（`protocolVersion: '1'`），为后续协议演进提供了基础，升级时可以通过版本号区分新旧客户端。

### 5.5 `PlannerPlanDraftService` 的分层设计

`matchPhase → completePlanFromMatchPhase → buildSkillPlan` 的分层调用链清晰，Skill 文件上传只需要在 `ChatOrchestratorService` 层增加一条分支，不需要改动 `PlannerPlanDraftService` 内部。

---

## 六、最重要的单一问题

> **⚠️ 当前最大的技术债**：同一个 `RESULT` 事件类型承担了"任务已创建等待输入"和"任务真正完成有业务结果"两种语义，导致前端 `ChatMessage.tsx` 需要通过 `hasBusinessResult` 字段二次判断，渲染逻辑复杂且容易出错。
>
> **根本解决方案**：
> - 任何带 `hasBusinessResult=false` 的 RESULT 事件，如果是等待状态，**应改用 `WAITING_INPUT`** 事件类型
> - `RESULT` 事件只表示"任务真正完成"，无论是否有可展示的业务结果
> - 前端的 `TaskOutcomeCard` 渲染判断从"检查 hasBusinessResult"简化为"检查 event.type === RESULT"

---

*文档由 AI 分析生成，基于 2026-07-24 代码快照。*
