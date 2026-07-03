# 企业级 Skill 平台 Recorder Outcome TypeSpec 草案

**Recorder Outcome TypeSpec v4.1**  
日期：2026-07-03

> 本文是 [Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md) 的类型层续篇。  
> 目标是把统一结果方案收敛为更接近后端 DTO、前端响应消费与 session history 落盘的 TypeScript 接口草案，便于后续直接拆分 PR。

---

## 1. 文档目标

本文回答以下问题：

- 当前 recorder-debug 后端类型基线是什么
- `RecorderOutcome` 应如何接入现有 `RecorderDebugObservation / RecorderDebugTurn / RecorderDebugChatResponse`
- 哪些字段属于新增，哪些字段保持兼容
- `ObservationState / Diff / Verification` 在类型层应如何建模
- 首批 PR 的类型改造范围应该落到哪些 DTO

---

## 2. 当前类型基线

当前 recorder-debug 的核心类型集中在：

- [recorder-debug.types.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug.types.ts)

已存在的关键 DTO：

- `RecorderDebugObservation`
- `RecorderDebugTurn`
- `RecorderDebugSession`
- `RecorderDebugChatRequest`
- `RecorderDebugChatResponse`

### 2.1 当前 Observation 基线

后端当前 `RecorderDebugObservation` 已经不只是前端展示的简化版本，现状包含：

- `currentPageUrl`
- `title`
- `text`
- `inputs`
- `buttons`
- `rows`
- `regions`
- `pageSemantics`
- `candidates`
- `candidateTrace`
- `headings`
- `links`
- `suggestedParameters`
- `snapshotPath`

这说明：

- 后端观察层已经具备升级为 `ObservationState` 的基础
- 真正缺少的不是数据入口，而是标准化的类型边界和结果裁决层

### 2.2 当前 Response 基线

当前 `RecorderDebugChatResponse` 包含：

- `sessionId`
- `runtimeSessionId`
- `reply`
- `status`
- `browserReady`
- `currentPageUrl`
- `observation`
- `commands`
- `execution`
- `exportArtifacts`
- `loopDraft`
- `loopState`

当前它仍是“聊天响应 + 调试信息”的组合对象，尚未显式承载 outcome。

### 2.3 当前 History 基线

当前 `RecorderDebugTurn` 包含：

- `role`
- `content`
- `timestamp`
- `commands`
- `execution`
- `observation`
- `exportArtifacts`
- `loopDraft`
- `loopState`

当前 turn 已可保存绝大部分原始证据，但仍未把“本轮的统一结果结论”沉淀为独立字段。

---

## 3. 类型设计原则

### 3.1 先增量兼容，不直接替换老字段

- 首期不删除 `reply`
- 首期不删除 `observation`
- 首期不删除 `execution`
- 首期新增 `outcome`

### 3.2 类型分层要清楚

- `ObservationState` 表达页面事实
- `ObservationDiff` 表达状态变化
- `RecorderGrounding` 表达目标命中过程
- `RecorderVerification` 表达裁决
- `RecorderOutcome` 表达本轮统一结论

### 3.3 大对象与摘要对象分离

- 原始 `execution.results / steps` 仍留在原字段
- `outcome.evidence.toolExecution` 只放归纳摘要
- 避免把所有原始数据塞进 outcome

---

## 4. 目标类型总览

推荐新增 4 个类型分组：

1. Outcome
2. Observation
3. Diff / Verification
4. History / Response VNext

建议未来拆分目录：

- `execute/types/recorder-outcome.types.ts`
- `observe/types/observation-state.types.ts`
- `execute/types/verification.types.ts`

在首期未拆目录前，也可先收敛到 `recorder-debug.types.ts`。

---

## 5. Outcome 类型草案

### 5.1 顶层类型

```ts
export type RecorderOutcomeVersion = 'v1';

export type RecorderOutcomeKind = 'action' | 'answer' | 'question';

export type RecorderOutcomeStatus =
  | 'succeeded'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'unknown';

export interface RecorderOutcome {
  kind: RecorderOutcomeKind;
  status: RecorderOutcomeStatus;
  intent: RecorderIntent;
  evidence: RecorderEvidence;
  grounding?: RecorderGrounding;
  verification: RecorderVerification;
  summary: RecorderSummary;
  artifacts?: RecorderArtifacts;
}
```

说明：

- `RecorderOutcomeVersion` 建议挂在 response / history turn 上，而不是直接塞进 `RecorderOutcome`
- `kind` 用于表达本轮产物类型
- `status` 只表达本轮结果结论，不再混入“answer / question”这类对话语义

### 5.2 Intent

```ts
export interface RecorderIntent {
  intentId?: string;
  parentIntentId?: string;
  taskSessionId?: string;
  userGoal: string;
  normalizedGoal?: string;
  actionType?:
    | 'observe'
    | 'navigate'
    | 'click'
    | 'fill'
    | 'select'
    | 'extract'
    | 'loop'
    | 'export';
  targetHint?: string;
}
```

说明：

- `intentId` 标识当前 turn 的意图节点
- `parentIntentId` 用于串联多轮延续型指令
- `taskSessionId` 用于把多个 turn 聚合为同一业务任务

### 5.3 Evidence

```ts
export interface RecorderEvidence {
  before?: ObservationState;
  after?: ObservationState;
  diff?: ObservationDiff;
  toolExecution?: BrowserExecutionSummary;
}
```

### 5.4 Grounding

```ts
export interface RecorderGrounding {
  targetCandidates?: GroundedTarget[];
  chosenTarget?: GroundedTarget;
  targetResolution?:
    | 'snapshot-ref'
    | 'semantic-match'
    | 'relative-position'
    | 'vision-region'
    | 'manual';
}

export interface GroundedTarget {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  contextLabel?: string;
  regionId?: string;
  locator?: {
    strategy?: string;
    value?: string;
  };
  confidence?: number;
}
```

### 5.5 Verification

```ts
export type RecorderVerifierType =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'select'
  | 'detail-open'
  | 'form-submit'
  | 'observation-answer';

export interface RecorderVerification {
  verifier: RecorderVerifierType;
  routeReason: 'actionType' | 'goal-pattern' | 'command-family' | 'fallback';
  level: 'tool' | 'page' | 'goal';
  success: boolean | 'partial' | 'unknown';
  confidence: number;
  checks: VerificationCheck[];
  failureReason?: string;
}

export interface VerificationCheck {
  code:
    | 'tool_command_succeeded'
    | 'node_state_changed'
    | 'target_visible'
    | 'target_selected'
    | 'url_changed'
    | 'detail_panel_changed'
    | 'input_value_written'
    | 'list_count_changed'
    | 'blocking_overlay_detected'
    | 'confirmation_required'
    | 'intent_alignment';
  passed: boolean | 'partial' | 'unknown';
  message: string;
  required?: boolean;
  weight?: number;
  evidencePath?: string;
}
```

说明：

- `verifier` 与 `routeReason` 用于把“为什么走这套验证器”变成稳定可回溯信息
- `required` 与 `weight` 用于支持固定公式的 `confidence` 计算
- 首期不建议让 `confidence` 由单次 LLM 自由打分

### 5.6 Summary 与 Artifacts

```ts
export interface RecorderSummary {
  userVisible: string;
  compact: string;
  nextHint?: string;
}

export interface RecorderArtifacts {
  snapshotIdBefore?: string;
  snapshotIdAfter?: string;
  snapshotPathBefore?: string;
  snapshotPathAfter?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
}
```

---

## 6. Observation 类型草案

### 6.1 ObservationState

建议在现有 `RecorderDebugObservation` 基础上做标准化，而不是平行再造完全独立对象。

```ts
export interface ObservationState {
  page: ObservationPageState;
  text: ObservationTextState;
  interactive: ObservationInteractiveState;
  rows?: ObservationRow[];
  regions?: ObservedRegion[];
  facts?: PageFact[];
  semantics?: Record<string, unknown>;
  candidates?: ObservedCandidate[];
  candidateTrace?: ObservationCandidateTrace[];
  suggestedParameters?: SuggestedParameter[];
}
```

### 6.2 页面状态

```ts
export interface ObservationPageState {
  url?: string;
  title?: string;
  snapshotId?: string;
  snapshotVersion?: number;
  snapshotContentHash?: string;
  observationFingerprint?: string;
  snapshotPath?: string;
  capturedAt?: string;
  reuseEligibility?: 'fresh' | 'stale' | 'reobserve-required';
  staleReason?: string;
}
```

说明：

- `snapshotId` 表示采样实例标识，建议由 `runtimeSessionId + snapshotVersion` 组成
- `snapshotContentHash` 用于快照去重
- `observationFingerprint` 用于判断语义上是否可复用
- `reuseEligibility / staleReason` 用于 stale detection

### 6.3 文本状态

```ts
export interface ObservationTextState {
  visibleText?: string;
  salientTexts?: string[];
  headings?: string[];
  links?: string[];
}
```

### 6.4 交互节点状态

```ts
export interface ObservationInteractiveState {
  inputs: ObservedNode[];
  buttons: ObservedNode[];
  candidates?: ObservedNode[];
}

export interface ObservedNode {
  ref?: string;
  diffKey?: string;
  role?: string;
  name?: string;
  text?: string;
  contextLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  visible?: boolean;
  value?: string;
  regionId?: string;
  ordinal?: number;
  attributes?: Record<string, string | number | boolean>;
}
```

说明：

- `diffKey` 是 before / after diff 的稳定键，优先级建议为：`ref > role+name+contextLabel > regionId+ordinal`
- `ordinal` 用于同一区域下的相对位置补充匹配

### 6.5 行、区域与事实

```ts
export interface ObservationRow {
  rowKey?: string;
  index?: number;
  text?: string;
  selected?: boolean;
  regionId?: string;
  entityType?: string;
  entityId?: string;
  fields?: Record<string, string | number | boolean | null>;
}

export interface ObservedRegion {
  regionId: string;
  label: 'list' | 'detail' | 'form' | 'main-action' | string;
  nodeRefs?: string[];
  text?: string;
  entryCount?: number;
  visible?: boolean;
}

export interface PageFact {
  type: 'location' | 'form-field-count' | 'selectable-list' | 'modal-open' | 'error-state' | string;
  value?: string | number | boolean;
  confidence?: number;
  source?: 'structure' | 'text' | 'visual';
}
```

说明：

- `ObservedRegion` 首期聚焦稳定的区域标识与摘要信息，不强制承载复杂 UI 语义
- `PageFact` 面向可复用事实，而不是自然语言报告

### 6.6 候选与 trace

这部分与当前 `candidates / candidateTrace` 直接相关，应保持兼容思想。

```ts
export interface ObservedCandidate {
  candidateId: string;
  kind: string;
  label: string;
  ref?: string;
  role?: string;
  regionId?: string;
  confidence?: number;
}

export interface ObservationCandidateTrace {
  candidateId: string;
  source: string;
  kind: string;
  reasons: string[];
  summary: string;
}

export interface SuggestedParameter {
  name: string;
  label: string;
  required: boolean;
  reason: string;
}
```

---

## 7. Diff 类型草案

```ts
export interface ObservationDiff {
  urlChanged?: boolean;
  titleChanged?: boolean;
  interactiveNodeChanges?: NodeStateChange[];
  salientTextChanges?: TextChange[];
  regionChanges?: RegionStateChange[];
}

export interface NodeStateChange {
  diffKey: string;
  refBefore?: string;
  refAfter?: string;
  fieldsChanged: Array<'selected' | 'disabled' | 'value' | 'visible' | 'text'>;
  before?: Partial<ObservedNode>;
  after?: Partial<ObservedNode>;
}

export interface TextChange {
  key: string;
  before?: string;
  after?: string;
}

export interface RegionStateChange {
  regionId: string;
  changeType: 'content' | 'visibility' | 'entry-count';
  before?: string | number | boolean;
  after?: string | number | boolean;
}
```

说明：

- `ObservationDiff` 首期不建议同时引入过多 page/text wrapper，直接面向 verifier 需要的变化事实
- `ObservationDiff` 不再保留 `basis` 这类说明性字段，避免把字段选择规则误写成字面量类型
- `diffKey` 与 `regionId` 是 diff 的基础锚点，必须在 observation 生成阶段就落盘

---

## 8. 工具执行摘要类型

当前 `BrowserExecuteResponse` 足够表达原始执行结果，但不适合作为 outcome 的摘要证据。

建议新增：

```ts
export interface BrowserExecutionSummary {
  success?: boolean;
  commandCount?: number;
  executedTools?: string[];
  failedTool?: string;
  message?: string;
  riskLevel?: string;
}
```

说明：

- `BrowserExecuteResponse` 保留原始调试细节
- `BrowserExecutionSummary` 用于给 verification 和 UI 做轻量消费

---

## 9. 历史与响应类型演进

### 9.1 Turn VNext

建议为现有 `RecorderDebugTurn` 增量增加：

```ts
export interface RecorderDebugTurnVNext extends RecorderDebugTurn {
  outcome?: RecorderOutcome;
  outcomeVersion?: RecorderOutcomeVersion;
}
```

### 9.2 Response VNext

建议为现有 `RecorderDebugChatResponse` 增量增加：

```ts
export interface RecorderDebugChatResponseVNext extends RecorderDebugChatResponse {
  outcomeVersion?: RecorderOutcomeVersion;
  outcome?: RecorderOutcome;
}
```

### 9.3 Session VNext

建议为现有 `RecorderDebugSession` 增量增加：

```ts
export interface RecorderDebugSessionVNext extends RecorderDebugSession {
  lastOutcome?: RecorderOutcome;
  history: RecorderDebugTurnVNext[];
}
```

---

## 10. 与当前类型的映射关系

### 10.1 RecorderDebugObservation -> ObservationState

建议映射方式：

- `currentPageUrl` -> `page.url`
- `title` -> `page.title`
- `snapshotPath` -> `page.snapshotPath`
- 结构化 snapshot 结果 -> `page.snapshotId / snapshotContentHash / snapshotVersion`
- 快照复用判定 -> `page.observationFingerprint / reuseEligibility / staleReason`
- `text` -> `text.visibleText`
- `headings` -> `text.headings`
- `links` -> `text.links`
- `inputs` -> `interactive.inputs`
- `buttons` -> `interactive.buttons`
- `rows` -> `rows`
- `regions` -> `regions`
- `pageSemantics` -> `semantics`
- `candidates` -> `candidates`
- `candidateTrace` -> `candidateTrace`
- `suggestedParameters` -> `suggestedParameters`

首期建议：

- 后端内部仍可继续生成 `RecorderDebugObservation`
- 在 response 装配阶段再映射为 `ObservationState`
- 待稳定后再决定是否把 `RecorderDebugObservation` 重命名为 `ObservationState`

### 10.2 BrowserExecuteResponse -> BrowserExecutionSummary

建议从原始执行结果抽取：

- `success`
- `executedCommands.length`
- `results[].command`
- 首个失败工具
- `message`

### 10.3 reply/status -> outcome

建议：

- `reply` 继续保留，作为面向用户的自然语言层
- `response.status` 继续表达旧接口语义：`executed / answer / question / completed / blocked / failed`
- `outcome.kind` 表达本轮产物类型：`action / answer / question`
- `outcome.status` 表达本轮结果结论：`succeeded / partial / blocked / failed / unknown`
- 首期新前端若发现 `outcomeVersion`，应优先消费 `outcome.kind / outcome.status / outcome.verification`
- 旧前端继续按 `reply + response.status` 工作，不要求一次性切换

---

## 11. 版本兼容策略

### 11.1 首期兼容原则

- 接口新增字段，不删除旧字段
- 历史 turn 可不带 `outcome`
- 前端遇到没有 `outcome` 的旧会话，继续按现有逻辑渲染
- 新前端遇到 `outcomeVersion` 不匹配时，应回退到旧字段渲染

### 11.2 版本字段

建议对 response 与 history turn 增加显式版本：

```ts
type RecorderOutcomeVersion = 'v1';
```

原因：

- 后续 verifier 与 diff 模型很可能继续扩充
- 显式版本可避免历史会话与新 UI 之间的解释歧义

---

## 12. 首批 PR 的类型改造范围

### 12.1 PR-1：类型定义与兼容输出

建议改动：

- [recorder-debug.types.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug.types.ts)
- [recorder-debug-response.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-response.service.ts)

目标：

- 新增 `RecorderOutcome` 相关类型
- `RecorderDebugChatResponse` 增加 `outcomeVersion?`
- `RecorderDebugChatResponse` 增加 `outcome?`
- `RecorderDebugTurn` 增加 `outcomeVersion?`
- `RecorderDebugTurn` 增加 `outcome?`

### 12.2 PR-2：ObservationState 补强

建议改动：

- [recorder-debug-execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts)
- [recorder-snapshot.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-snapshot.service.ts)

目标：

- 补 `snapshotId / snapshotContentHash / snapshotVersion`
- 补 `observationFingerprint / reuseEligibility / staleReason`
- 补 `selected / disabled / value / visible / diffKey`
- 规范 `rows / regions / facts`

### 12.3 PR-3：Diff 与最小 Verification

建议改动：

- 新增 verifier 相关类型文件
- 在 response 生成前组装 `outcome.evidence.diff`
- 固化 `routeReason / required / weight`
- 增加最小 `SelectionVerifier / FillVerifier / NavigationVerifier`

---

## 13. 前端消费建议

虽然本文聚焦 TypeSpec，但前端建议同步遵守以下原则：

- `AIControls` 首期优先消费 `outcome.summary.userVisible`、`outcome.kind + outcome.status`、`outcome.verification`
- `RecorderDebugDetailPage` 优先消费 `outcome.evidence / grounding / checks`
- UI 不应直接依赖 `reply` 去判断是否成功

对应文件：

- [AIControls.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/recorder/components/AIControls.tsx)
- [RecorderDebugDetailPage.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/recorder/pages/RecorderDebugDetailPage.tsx)

---

## 14. 最终建议

从类型层看，当前 recorder-debug 最适合采用的演进方式是：

- 保留现有 `RecorderDebugObservation / Response / Turn`
- 增量引入 `RecorderOutcome`
- 把 `ObservationState / Diff / Verification` 作为 outcome 的内部结构层
- 在接口和历史层都保留 `outcomeVersion`

这样可以在不破坏现有 recorder-debug 工作流的前提下，逐步把系统从“聊天驱动调试信息”迁移到“证据化结果协议”。
