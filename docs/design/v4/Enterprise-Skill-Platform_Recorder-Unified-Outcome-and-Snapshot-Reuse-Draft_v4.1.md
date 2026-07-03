# 企业级 Skill 平台 Recorder 统一结果与快照复用方案草案

**Recorder Unified Outcome and Snapshot Reuse Draft v4.1**  
日期：2026-07-03

> 本文定义 recorder / recorder-debug 链路从“聊天回复 + 临时 observation + 执行结果片段”升级为“统一结果协议 + 快照驱动验证 + 可复用页面状态”的设计草案。  
> 目标是在保留当前 recorder-debug 可用链路的前提下，把结果表达从“便于人类阅读”提升为“可证据化、可判定、可回放、可压缩、可复用”的统一模型。  
> 当前状态：后端已具备混合观察链路、snapshot ref 解析、session history 落盘与详情页展示骨架；但 observation 仍偏展示 DTO，结果成功判定仍主要依赖自然语言回复和工具返回，尚未形成统一 outcome 协议与通用 verification 层。

---

## 1. 文档目标

本文回答以下问题：

- 为什么 recorder 需要“统一结果层”，而不能继续只依赖 reply 文本
- 如何复用 AI 已观察到的页面快照，而不是每一步都重新从零理解页面
- 如何把 `observation / execution / reply / history` 合并为统一的 `RecorderOutcome`
- 如何为“点击成功但目标没变”“第二条记录未真正选中”这类问题提供自动判定
- 如何在不绑死单一模型路线的前提下，兼容 snapshot、结构探针、可见文本与视觉回退
- 如何按低风险方式分期落地到现有仓库

---

## 2. 背景与问题

### 2.1 当前已具备的基础

当前 recorder-debug 的后端观察入口已经是混合式的：

- 先执行 `snapshot`
- 再执行结构探针 `evaluate`
- 再读取可见文本 `get_text`
- 最后组装为 `RecorderDebugObservation`

这条链路已在：

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts`

对应实现点包括：

- `observePage()` 同时收集 snapshot、结构信息和文本
- `buildObservationFromSnapshotState()` 基于 snapshot 节点生成 `inputs / buttons / headings / links / snapshotPath`
- `createAndRecordChatResponse()` 把 `reply / observation / commands / execution / exportArtifacts` 一起记录到会话历史

前端也已经具备基础展示结构：

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
- `apps/frontend/portal/src/features/recorder/pages/RecorderDebugDetailPage.tsx`

现有 `RecorderDebugObservation` 已包含：

- `currentPageUrl`
- `title`
- `text`
- `inputs`
- `buttons`
- `headings`
- `links`
- `suggestedParameters`
- `snapshotPath`

### 2.2 当前缺口

虽然数据链路已存在，但结果层仍存在 6 个关键问题：

1. `observation` 仍主要是展示对象，不是统一事实模型
2. `reply` 仍承担了过多“结果总结”职责，导致成功与否依赖模型表述
3. `execution.success` 只能说明工具执行成功，不能说明用户目标达成
4. 缺少前后状态 diff，无法严格判断“页面是否真的发生了目标变化”
5. snapshot 目前主要用于动作 target 重写，尚未提升为结果验证与回放锚点
6. history 中每一轮记录的是“对话片段”，不是标准化的可计算结果单元

### 2.3 典型失败场景

这类缺口会直接导致以下问题难以自动判断：

- 点击“第二条记录”后工具层返回成功，但页面选中态未变化
- 详情按钮被渲染出来，但关联到了错误记录
- 输入框 fill 成功返回，但实际页面值未生效
- 跳转看似完成，但目标页面只发生了局部刷新或仍处于旧状态
- AI 说“已经观察到当前页面”，但 observation 与真实用户目标并不对齐

---

## 3. 设计原则

### 3.1 结果必须证据化

- 结果不以自然语言回复为准
- 结果必须绑定结构化证据
- 证据至少包括 `before / after / diff / toolExecution`

### 3.2 快照是状态锚点，不只是调试附件

- snapshot 不能只用于展示 `snapshotPath`
- snapshot 应作为动作 grounding、结果验证、回放定位和历史压缩的统一锚点

### 3.3 成功判定必须分层

- 工具成功不等于页面成功
- 页面成功不等于用户目标成功
- 最终结论必须由 verification 层统一裁决

### 3.4 先混合结构观察，再按需视觉回退

- 默认优先使用 snapshot ref、结构探针与页面文本
- 当结构信息不足时，再引入 screenshot grounding 或视觉模型辅助
- 不将系统绑定为纯 DOM 路线，也不强制全部转为纯视觉路线

### 3.5 保持当前 recorder-debug 主链路可兼容

- 保留现有 `/ai/recorder-debug/chat` 接口语义
- 保留现有 session history / detail page
- 先补协议和验证层，再逐步调整 UI 与导出链路

---

## 4. 外部参考与判断

本文方案综合参考以下公开方向，但不直接复制任何单一框架：

- `BrowserGym`：统一 `observation / action / history / reward` 接口，适合借鉴为 recorder 的结果协议边界  
  链接：https://github.com/ServiceNow/BrowserGym
- `WebSight`：vision-first、多代理与 episodic memory，说明结果层不能只是一段自然语言  
  链接：https://arxiv.org/html/2508.16987v1
- `BrowserAgent`：显式 memory 记录跨步骤结论，适合借鉴 outcome 压缩与阶段结论存储  
  链接：https://arxiv.org/html/2510.10666v2
- `Building Browser Agents: Architecture, Security, and Practical Solutions`：强调 hybrid vision + accessibility context、element reference system、snapshot management、state versioning  
  链接：https://arxiv.org/html/2511.19477
- `Online-Mind2Web / An Illusion of Progress?`：强调不能把“模型看起来答对了”当成任务完成，必须引入更严格 judge  
  链接：https://arxiv.org/html/2504.01382v4
- `MolmoWeb`：开放视觉 web agent 同样把 observation/action 抽象为统一接口，支持混合感知架构  
  链接：https://arxiv.org/html/2604.08516v1

结论：

- 业界已经形成共识：浏览器智能体的核心不是“更长的回复”，而是“可计算的 observation、grounding、verification 与 history”
- 对当前项目而言，最优路线不是重写一套 vision-only 系统，而是升级现有 snapshot/observation 骨架为统一结果协议

---

## 5. 目标态总览

目标态下，recorder 每轮 turn 的核心产物不再是单纯 reply，而是：

- `RecorderOutcome`

它由 6 个层面组成：

1. `intent`
2. `evidence`
3. `grounding`
4. `verification`
5. `summary`
6. `artifacts`

其中：

- `intent` 回答“本轮试图完成什么”
- `evidence` 回答“前后状态与工具证据是什么”
- `grounding` 回答“命中的页面目标是谁、如何命中的”
- `verification` 回答“是否真正完成目标”
- `summary` 回答“给人类看的简洁结果描述”
- `artifacts` 回答“可回放、可追踪的附件与快照标识”

---

## 6. 统一协议草案

### 6.1 Outcome 顶层结构

```ts
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

- `kind` 用于表达本轮产物类型：动作结果、观察回答或追问澄清
- `status` 只表达本轮结果结论，不再混入对话类型语义
- 外层 chat response 的 `status` 可继续保留旧枚举用于兼容；一旦 `outcome` 存在，前端应优先消费 `outcome.kind + outcome.status`

### 6.2 Intent

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
- `parentIntentId` 用于串联“继续刚才那个目标”“第二条”“这个按钮”等多轮延续指令
- `taskSessionId` 用于把多个 turn 聚合到同一业务任务链
- `userGoal` 保留用户原始意图
- `normalizedGoal` 用于对齐后续验证器
- `actionType` 允许同一套 verification 规则按动作族复用

### 6.3 Evidence

```ts
export interface RecorderEvidence {
  before?: ObservationState;
  after?: ObservationState;
  diff?: ObservationDiff;
  toolExecution?: BrowserExecutionSummary;
}
```

### 6.4 Grounding

```ts
export interface RecorderGrounding {
  targetCandidates?: GroundedTarget[];
  chosenTarget?: GroundedTarget;
  targetResolution?: 'snapshot-ref' | 'semantic-match' | 'relative-position' | 'vision-region' | 'manual';
}

export interface GroundedTarget {
  ref?: string;
  role?: string;
  name?: string;
  text?: string;
  contextLabel?: string;
  locator?: {
    strategy?: string;
    value?: string;
  };
  regionId?: string;
  confidence?: number;
}
```

### 6.5 Verification

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
    | 'url_changed'
    | 'node_state_changed'
    | 'target_visible'
    | 'target_selected'
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

判定约束：

- verifier 默认按 `intent.actionType` 路由；若缺失，则按 command family 和 goal pattern 推断
- `confidence` 首期使用固定加权规则：`passed=true -> 1`，`partial -> 0.5`，`unknown -> 0.25`，`false -> 0`
- 公式为：`confidence = round(sum(score * weight) / sum(weight), 2)`
- 任一 `required=true` 的 check 失败时，`success` 不得为 `true`，且 `confidence` 最高封顶到 `0.49`
- LLM 可以参与补充高层语义判断，但不能绕过结构 check 直接给出最终成功结论

### 6.6 Summary 与 Artifacts

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

## 7. ObservationState 草案

### 7.1 目标

当前 `RecorderDebugObservation` 适合作为展示对象，但不足以支撑：

- 稳定 diff
- 严格验证
- 回放重定位
- 历史压缩
- 多轮跨 turn 目标对齐

因此建议升级为 `ObservationState`：

```ts
export interface ObservationState {
  page: {
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
  };
  text: {
    visibleText?: string;
    salientTexts?: string[];
    headings?: string[];
    links?: string[];
  };
  interactive: {
    inputs: ObservedNode[];
    buttons: ObservedNode[];
    candidates?: ObservedNode[];
  };
  regions?: ObservedRegion[];
  facts?: PageFact[];
  suggestedParameters?: SuggestedParameter[];
}
```

其中：

- `snapshotId` 表示单次采样实例标识，建议由 `runtimeSessionId + snapshotVersion` 组成
- `snapshotContentHash` 用于快照去重，输入应基于规范化后的结构节点，而不是直接对原始 DOM 全量 hash
- `snapshotVersion` 是同一 runtime session 内的单调递增序号，用于表达前后关系与 ref 生命周期
- `observationFingerprint` 用于表示“语义上足够相似、可继续复用”的轻量指纹
- `salientTexts` 用于保留高价值文本，而非全文堆叠
- `regions` 用于表达“列表区 / 详情区 / 表单区 / 主操作区”
- `facts` 用于表达“当前位于登录页”“存在 2 个必填项”“检测到可选择列表”
- `capturedAt / reuseEligibility / staleReason` 用于 stale 检测，避免把旧 observation 直接复用到新页面

### 7.2 ObservedNode 草案

```ts
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
  attributes?: Record<string, string | boolean | number>;
}
```

说明：

- `diffKey` 是 before / after diff 的主键，优先级应为：`ref > role+name+contextLabel > regionId+ordinal`
- `selected / disabled / value` 是后续自动验证“是否真正选中 / 是否真正输入”的关键
- `visible` 用于区分“节点存在但不可见”和“节点确实出现在交互区域”
- `ref` 只应视为同一 `snapshotVersion` 或相邻稳定重采样内的强锚点，不应假设其跨页面刷新永久稳定
- `attributes` 允许保留 `aria-selected / aria-expanded / checked / data-state` 等重要状态

### 7.3 Region / Fact / Diff Key 补充定义

```ts
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

定义约束：

- `diffKey` 必须在 observation 生成时落盘，不能等到 diff 阶段临时猜测
- `regionId` 应在同一页面结构下保持稳定，用于列表区、详情区、表单区等区域级 diff
- `PageFact` 只保留可复用事实，不直接承载长篇自然语言总结

---

## 8. 快照复用策略

### 8.1 目标复用

对于本轮动作，优先沿用上一轮 observation 中已存在的 `ref`：

- 第 1 优先：`snapshot-ref`
- 第 2 优先：`role + name + contextLabel`
- 第 3 优先：相对位置，例如“第二条记录的详情按钮”
- 第 4 优先：视觉框选或截图定位

### 8.2 验证复用

动作执行后，不重新依赖模型复述页面，而是直接比较：

- `before.snapshotContentHash` 与 `after.snapshotContentHash`
- `before.snapshotVersion` 与 `after.snapshotVersion`
- 目标节点属性是否变化
- 区域文本是否变化
- 详情区域是否切换

### 8.3 失效检测

复用最近一次 observation 之前，必须先判断其是否仍然有效。首期建议最小规则：

- 若 `url` 或 `title` 发生变化，默认把上一轮 observation 标记为 `stale`
- 若 `snapshotVersion` 已明显前进，且无法证明目标仍在当前语义页面内，标记为 `reobserve-required`
- 若 `snapshotContentHash` 变化较大，或 `observationFingerprint` 不再匹配当前页面，禁止直接复用旧 `ref`
- 若 `capturedAt` 距当前操作超过 TTL，且本轮指令依赖相对指代（如“第二条”“刚才那个输入框”），优先重新 observe

### 8.4 分支复用

当用户说：

- “第二条”
- “这个按钮”
- “刚才那个输入框”
- “上一页那个表格”

系统不应再次全页理解，而应优先从最近一次 `ObservationState` 的：

- `candidates`
- `regions`
- `interactive`
- `facts`

中解析候选对象。

前提是：

- `reuseEligibility = fresh`
- 或至少可以通过 `observationFingerprint + regionId + diffKey` 重新确认目标仍成立

### 8.5 回放复用

导出脚本或模板步骤时，不只保存文本目标，还应保留：

- `ref`
- `role`
- `name`
- `contextLabel`
- `regionId`

回放时按以下顺序降级：

1. `ref` 直达
2. 结构匹配
3. 相对区域重定位
4. 视觉回退

---

## 9. Diff 模型草案

### 9.1 目标

通用结果层必须回答“发生了什么变化”，因此需要标准 diff。

```ts
export interface ObservationDiff {
  urlChanged?: boolean;
  titleChanged?: boolean;
  interactiveNodeChanges?: NodeStateChange[];
  salientTextChanges?: TextChange[];
  regionChanges?: RegionStateChange[];
}
```

说明：

- `ObservationDiff` 不再单独存储 `basis` 字段，避免把“字段说明”写成容易误解的字面量类型
- 节点 diff 的稳定锚点由 `NodeStateChange.diffKey` 表达
- 区域 diff 的稳定锚点由 `RegionStateChange.regionId` 表达

### 9.2 节点稳定键规则

为了保证 diff 可重复，必须显式定义“同一节点”的判断顺序：

1. `ref` 命中且 `snapshotVersion` 连续时，直接沿用
2. 若 `ref` 失效，则使用 `diffKey`
3. `diffKey` 建议按以下优先级生成：
   - `role + name + contextLabel`
   - `regionId + ordinal`
   - 明确的结构 locator
4. 若以上都不可得，则该节点不进入严格 diff，只能记录为 `unknown change`

### 9.3 首期建议支持的 diff

- `urlChanged`
- `titleChanged`
- `interactiveNodeChanges`
  - `selected`
  - `disabled`
  - `value`
  - `visible`
- `salientTextChanges`
- `regionChanges`
  - 列表区条目变化
  - 详情区标题变化
  - 表单区校验提示变化

### 9.4 对“第二条记录选中”的判定示例

如果用户目标是“选中第二条记录”，理想 verification 不应只看 click 是否成功，而要检查：

1. 目标记录节点是否被准确 grounding
2. 该记录的 `selected` 或等价属性是否从 `false` 变为 `true`
3. 详情面板内容是否切换为第二条记录对应内容
4. 是否存在覆盖层阻挡导致点击未真正生效

最终只有当以上证据满足时，才可判定为 `goal success = true`。

---

## 10. Verification 模型与判定器

### 10.1 三层成功语义

统一结果方案中，成功必须拆成三层：

1. `tool-level`
   - 命令是否成功执行
   - 是否存在浏览器报错
   - 是否命中某个可交互对象
2. `page-level`
   - 页面是否发生预期状态变化
   - URL、文本、节点属性、区域是否变化
3. `goal-level`
   - 用户要求的业务目标是否达成

### 10.2 首期通用判定器

建议首期支持以下 verifier：

- `ClickVerifier`
- `FillVerifier`
- `NavigationVerifier`
- `SelectionVerifier`
- `DetailOpenVerifier`
- `FormSubmitVerifier`
- `ObservationAnswerVerifier`

每个 verifier 都输出统一的：

- `checks`
- `success`
- `confidence`
- `failureReason`

### 10.3 Verifier 路由规则

首期建议采用“规则优先、模型补充”的路由方式：

| `intent.actionType` | 默认 verifier | 必要证据 |
| --- | --- | --- |
| `click` | `ClickVerifier` | `toolExecution` + `before/after` |
| `fill` | `FillVerifier` | 目标 input 节点 + `value` 变化 |
| `navigate` | `NavigationVerifier` | URL/title/snapshot 变化 |
| `select` | `SelectionVerifier` | 目标节点 selected 变化 + 区域变化 |
| `observe` | `ObservationAnswerVerifier` | 当前 observation + intent 对齐 |
| 未显式声明 | 按 command family / goal pattern 选择 | 至少 `toolExecution` |

补充规则：

- 若 actionType 缺失但命令族明确，例如只有 click 命令，则按 command family 路由
- 若 actionType 与命令族冲突，以用户目标和最终执行命令共同裁决，并记录 `routeReason`
- 若无法可靠路由，则回退到最保守 verifier，并把 `success` 置为 `unknown` 或 `partial`

### 10.4 Confidence 计算规则

首期不建议把 `confidence` 交给单次模型自由打分，而应采用固定公式：

1. 为每个 check 配置 `weight`
2. 将 `passed` 映射为 score：
   - `true -> 1`
   - `'partial' -> 0.5`
   - `'unknown' -> 0.25`
   - `false -> 0`
3. 计算：`confidence = round(sum(score * weight) / sum(weight), 2)`
4. 若任何 `required=true` 的 check 失败：
   - `success` 不得为 `true`
   - `confidence` 最多为 `0.49`

### 10.5 失败场景与 verifier 映射

| 失败场景 | verifier | 关键 check code |
| --- | --- | --- |
| click 成功但选中态未变化 | `SelectionVerifier` | `target_selected`, `node_state_changed` |
| 详情按钮关联错误记录 | `DetailOpenVerifier` | `detail_panel_changed`, `target_visible` |
| fill 成功但页面值未生效 | `FillVerifier` | `input_value_written`, `node_state_changed` |
| 跳转但页面仍是旧状态或仅局部刷新 | `NavigationVerifier` | `url_changed`, `title_changed` |
| AI 回答“已观察”但与目标不对齐 | `ObservationAnswerVerifier` | `target_visible`, `intent_alignment` |

### 10.6 SelectionVerifier 最小规则

`SelectionVerifier` 至少包含：

- `tool_command_succeeded`
- `target_visible`
- `target_selected`
- `detail_panel_changed`
- `blocking_overlay_detected`

这将直接用于回答“第二条记录无法选中”这类问题。

---

## 11. 与现有代码的映射关系

### 11.1 后端承接点

优先改造以下模块：

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts`
  - 负责生成 `before / after` observation
  - 负责补 `snapshotId / facts / candidates / diff`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/observe/recorder-snapshot.service.ts`
  - 负责 snapshot node 解析、ref 目标、结构化节点索引
  - 负责为 `ObservedNode` 补充更多状态字段
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-response.service.ts`
  - 负责把 `RecorderOutcome` 纳入 chat response 与 session history
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug.service.ts`
  - 负责统一 orchestrate：observe -> ground -> execute -> observe -> verify -> summarize

### 11.2 前端承接点

优先改造以下模块：

- `apps/frontend/portal/src/features/recorder/components/AIControls.tsx`
  - 当前主要消费 `reply / result / observation`
  - 首期应优先展示：
    - `outcome.summary.userVisible` 作为主结果文案
    - `outcome.kind + outcome.status` 作为状态 badge
    - `outcome.verification.success / confidence` 作为可见判定摘要
    - `outcome.verification.failureReason` 与 `summary.nextHint` 作为轻量提示
  - `verification.checks` 不建议在主控件全量展开，默认只展示失败摘要，点击后跳详情页
- `apps/frontend/portal/src/features/recorder/pages/RecorderDebugDetailPage.tsx`
  - 当前更像原始 JSON 查看器
  - 后续应拆成 5 个信息区：
    - Outcome 概览：`kind / status / verifier / confidence`
    - Evidence 面板：`before / after / diff`
    - Checks 面板：`verification.checks`，支持折叠/展开
    - Grounding 面板：目标节点、候选节点、target resolution
    - Raw 面板：保留原始 `reply / observation / execution` 作为降级查看能力

---

## 12. 接口演进草案

### 12.1 保持兼容

短期内不建议立即废弃现有字段：

- 保留 `reply`
- 保留 `observation`
- 保留 `execution`
- 保留 `commands`

同时新增：

- `outcomeVersion`
- `outcome`

示例：

```ts
export interface RecorderDebugChatResponseVNext {
  sessionId: string;
  runtimeSessionId: string;
  reply: string;
  status: 'executed' | 'answer' | 'question' | 'completed' | 'blocked' | 'failed';
  observation?: RecorderDebugObservation;
  commands?: MCPCommand[];
  execution?: BrowserCommandExecutionResponse;
  outcomeVersion?: 'v1';
  outcome?: RecorderOutcome;
}
```

兼容规则：

- 顶层 `status` 继续服务旧前端与旧详情页
- 新前端若发现 `outcomeVersion` 存在，应优先消费 `outcome.kind / outcome.status / outcome.verification`
- 老 history turn 没有 `outcome` 时，详情页降级为旧的 `reply + observation + execution` 视图

### 12.2 Session History 演进

当前 history turn 中建议追加：

- `outcome`
- `outcomeVersion`

这样旧页面仍能工作，新页面可按 outcome 渲染。

---

## 13. 分期实施建议

### 13.1 第一期：协议落地

目标：

- 引入 `RecorderOutcome`
- 给 observation 补 `snapshotId / snapshotContentHash / snapshotVersion`
- 执行前后都保留 observation
- 增加最小 diff、diffKey 与最小 verification
- 引入 verifier 路由规则与固定 confidence 公式
- 引入最小 stale 检测与 re-observe 判定

不做：

- 不强依赖视觉模型
- 不重写详情页所有 UI
- 不改动所有历史导出逻辑

### 13.2 第二期：验证器与详情页升级

目标：

- 引入 `SelectionVerifier / DetailOpenVerifier / FillVerifier`
- 详情页展示 `before / after / diff / checks`
- 常见失败可给出结构化 reason，而不只是 reply 文本
- 产出独立的 `Recorder Detail Page Outcome UI Plan`

### 13.3 第三期：快照驱动回放与视觉回退

目标：

- 导出步骤保存 grounding 元数据
- 回放优先按 ref 复用
- 在结构信息不足时引入 screenshot grounding
- 对长会话进行 snapshot compression 与 episodic memory 压缩

视觉回退触发条件建议显式化为：

- 目标节点 `ref` 全部失效，且结构匹配失败
- verifier `confidence < 0.4`
- 页面被标记为 `reobserve-required`，且当前目标依赖视觉区域理解
- 用户明确要求“看屏幕”或页面属于 canvas / captcha / 富视觉区域

---

## 14. 风险与边界

### 14.1 不应把 outcome 设计成巨型万能对象

- outcome 只保留本轮核心结果
- 大块原始调试数据仍放 artifacts 或原始 execution 中

### 14.2 不应让 verification 依赖单次 LLM 裁决

- 结构规则优先
- LLM 只在高层语义判断时做辅助
- 最终仍需可回溯到具体 check

### 14.3 不应让 ref 成为唯一真理

- 页面刷新、DOM 漂移、重新渲染后 ref 可能失效
- 必须保留结构匹配与视觉回退

---

## 15. 验收标准草案

完成首期后，至少应满足：

- recorder-debug 每轮 assistant turn 都可携带 `outcome`
- outcome 中可查看 `before / after / verification`
- observation 中存在 `snapshotId / snapshotContentHash / snapshotVersion / reuseEligibility`
- 对 `click / fill / select / navigate` 至少有一套基础验证
- diff 使用稳定 `diffKey / regionId`，不会因单次重渲染大面积误报
- “点击第二条记录”这类案例能输出：
  - 是否命中目标
  - 是否产生页面变化
  - 是否真正选中目标
  - 失败最可能原因

完成第二期后，至少应满足：

- 详情页能可视化 diff 和 checks
- 失败问题不再只依赖人工看日志
- recorder history 可以基于 outcome 做压缩与筛选

---

## 16. 建议的后续文档与 PR 拆分

本文之后建议继续拆出 4 份子文档：

1. `Recorder Outcome TypeSpec`
   - 定义所有 TypeScript/Nest DTO
2. `Recorder Verification Rules`
   - 定义各 verifier 的规则与优先级
3. `Enterprise-Skill-Platform_Recorder-Snapshot-Identity-and-Diff-Rules_v4.1.md`
   - 定义 snapshot/ref/diffKey/staleness 规则
4. `Recorder Detail Page Outcome UI Plan`
   - 定义前端详情页如何展示 outcome

对应首批 PR 建议顺序：

1. DTO 与类型草案
2. observation 扩展、snapshot identity 与 diffKey
3. outcome 生成、response 接口兼容输出与 stale 检测
4. verifier 路由规则与基础 confidence 计算
5. SelectionVerifier / DetailOpenVerifier
6. 详情页 outcome 展示

---

## 17. 最终结论

对当前项目而言，最合适的通用结果方案不是重做一套“更聪明的聊天回复”，而是：

- 以 `snapshot ref` 为动作锚点
- 以前后 `ObservationState` 为事实层
- 以 `ObservationDiff` 为变化层
- 以 `RecorderVerification` 为裁决层
- 以 `RecorderOutcome` 为统一输出层
- 以视觉回退作为结构观察不足时的兜底能力

这条路线与当前仓库已存在的 `snapshot + evaluate + get_text + session history` 骨架高度兼容，改造成本可控，也最符合近两年开源框架与论文对浏览器智能体结果层的共同方向。

---

## 18. 实现进度

本节跟踪 §13 分期实施建议在仓库中的落地情况。设计内容本身保持不变；此节仅记录"已实现 / 待实现 / 暂缓"状态与对应 commit。

### 18.1 第一期（§13.1 协议落地）— 已落地

下列能力已在仓库中存在，对应类型与生成逻辑分布在 `apps/backend/intelligence/ai-orchestrator/src/modules/browser/`：

- ✅ `RecorderOutcome` 统一协议（`kind / status / intent / evidence / grounding / verification / summary / artifacts`）— `execute/recorder-debug.types.ts`
- ✅ `RecorderDebugObservation` 扩展 `snapshotId / snapshotContentHash / snapshotVersion / observationFingerprint / reuseEligibility / staleReason / capturedAt` — 同上
- ✅ `RecorderObservationDiff`（`urlChanged / titleChanged / interactiveNodeChanges / salientTextChanges / regionChanges`）+ `diffKey / regionId` 稳定主键
- ✅ `RecorderVerification` 三层 level（`tool / page / goal`）+ verifier 路由（`actionType / goal-pattern / command-family / fallback`）+ confidence 公式
- ✅ `RecorderEvidence` 前后 observation + diff + toolExecution 摘要
- ✅ 最小 stale 检测与 `reobserve-required` 判定

> 第一期实现早于本节的引入，commit 未单独标注 "Phase 1"；以上能力可在类型文件与 `recorder-debug-outcome.service.ts` 中直接核对。

### 18.2 第二期（§13.2 验证器升级）— 已落地

- ✅ `ObservedRegion` 强类型化与 `regionId` 区域 diff 主键化 — `8554131`
- ✅ verification 三层 level 真正分层（tool / page / goal 各自承担不同 check）— `d5d9403`
- ✅ verifier 系统补全：`form-submit` verifier + 3 个 check 产出（`intent_alignment / blocking_overlay_detected / confirmation_required` 等）— `2072d04`

### 18.3 第三期（§13.3 快照驱动回放与视觉回退）— 部分落地

| # | 目标 | 状态 | Commit | 关键代码 |
|---|---|---|---|---|
| 1 | 导出步骤保存 grounding 元数据 | ✅ 已落地 | `a068950` | `export/recorder-export-assembly.service.ts`、`export/recorder-template-export.service.ts`、`export/recorder-script-export.service.ts` |
| 2 | 回放优先按 ref 复用（4 步回退链） | ✅ 已落地 | `902c777` | `execute/recorder/recorder-replay.service.ts`（`snapshot-ref → semantic-match → relative-position → visual-fallback-required`） |
| 3 | 对长会话进行 snapshot compression 与 episodic memory 压缩 | ✅ 已落地 | `ecd7785` | `execute/recorder/recorder-history-compression.service.ts`（接入 `RecorderDebugResponseService.finalizeSession`） |
| 4 | 结构信息不足时引入 screenshot grounding（视觉回退） | ⏸️ 暂缓 | — | `RecorderReplayService` 已发出 `visual-fallback-required` sentinel，但视觉模型调用 / 截图 grounding / region→ref 解析未实现 |

**第 4 项暂缓原因**（2026-07-03）：视觉回退涉及视觉模型选型、截图边界、region→ref 解析契约等设计决策，需先完成"视觉模型集成方案"讨论再落地代码。前 3 项已构成自洽的 Phase 3 交付，第 4 项以 sentinel 形式预留接入点。

### 18.4 后续接续点

若要恢复第 4 项视觉回退的实现，建议从以下入口：

1. `RecorderReplayService.resolveReplayPlan()` 返回的 `visualFallbackRequired` 计数 > 0 即触发视觉路径
2. 视觉模型选型与调用契约（建议先产出独立设计文档）
3. 截图捕获边界（全页 vs. region 裁剪）与 region→ref 解析
4. 视觉结果回填到 `BrowserCommand.locator` 的 `resolutionMode: 'visual-region'` 分支
