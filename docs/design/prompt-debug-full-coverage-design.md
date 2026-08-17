# Prompt 调试台全覆盖改造设计

状态：Implementation Proposal  
日期：2026-08-10  
适用范围：ai-orchestrator · control-plane · portal  
关联文档：

- `three-capability-types-and-llm-operation-governance-design.md`
- `unified-capability-contract-and-validation-design.md`
- `deterministic-task-decomposition-design.md`

---

## 1. 背景与问题定性

### 1.1 调试台现状

`/admin/prompt-debug` 目前接收两路数据源：

1. **前端内存历史（最近 20 条）**：SSE 流事件中 `event.data.promptDebug` 字段，由 `ChatWindow` 实时写入 `chatStore.promptDebugHistory`。
2. **落库快照**：Planner 执行后将调试信息写入 `execution.normalizedInput.promptDebug`，可通过 executionId 查询。

两路数据均来自 **Planner 规划阶段**，且仅限于规划层的第一次 LLM 调用。当系统路由到 Temporal 多步执行时，调试台对整个执行过程的内部 LLM 调用完全失盲。

### 1.2 已确认的三条盲区

| 编号 | 盲区描述 | 影响 |
|------|----------|------|
| **B-1** | `buildExecutionPromptDebug` 落库时丢弃了 `llmCalls` 数组 | 通过 executionId 查询历史快照时，Timeline 看不到 LLM 调用节点 |
| **B-2** | Temporal 工作流中 `LlmOperationV2RuntimeService.executeInternal` 不发出任何 promptDebug 信号 | 多步执行的每个 LLM Operation 节点（`search_ai_news`、`summarize_list` 等）的 prompt 原文和模型响应对调试台完全不可见 |
| **B-3** | ReAct 引擎每次迭代覆盖 `state.promptDebug` 而非追加 | 多轮推理时只能看到最后一轮，之前各轮的 thought/action prompt 全部丢失 |

### 1.3 根因代码定位

**B-1 根因** — [`chat-orchestrator.service.ts:631-647`](../../apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-orchestrator.service.ts)

```ts
// 当前实现：llmCalls 被遗漏
private buildExecutionPromptDebug(promptDebug?) {
  return {
    debugSource, systemPrompt, userPrompt,
    systemPromptSectionKeys, userPromptSectionKeys,
    modelId, notes,
    // ← llmCalls 字段在此处缺失
  };
}
```

**B-2 根因** — [`llm-operation-v2-runtime.service.ts:218-396`](../../apps/backend/intelligence/ai-orchestrator/src/modules/llm-operation/runtime/llm-operation-v2-runtime.service.ts)

```ts
// 当前实现：执行 LLM 后只记录 audit，不输出 promptDebug 信号
const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
lastResponse = await this.modelService.callModel(activeModel.id, fullPrompt, 'reasoning');
// ...仅写 auditService.recordInvocation，result 中没有 promptDebug
```

**B-3 根因** — [`react-engine.service.ts:864-890`](../../apps/backend/intelligence/ai-orchestrator/src/modules/react-engine/react-engine.service.ts)

```ts
// 当前实现：每次循环整体覆盖
state.promptDebug = this.canExposePromptDebug(context)
  ? { ..., llmCalls: [{ stage: 'react-engine', label: 'ReAct 推理', ... }] }
  : undefined;
// ← 每次迭代都重置 llmCalls，只保留当前轮
```

---

## 2. 设计目标

1. **修复 B-1**：Planner 落库快照包含完整 `llmCalls`，历史查询与实时记录保持一致。
2. **修复 B-2**：LLM Operation 节点级 prompt 可在调试台"端到端 Timeline"中查看，包含 system prompt、user prompt 和模型原始回复。
3. **修复 B-3**：ReAct 多轮推理的每次 prompt 均追加到 `llmCalls`，调试台可逐轮回放推理链路。
4. **不破坏现有接口**：对外 SSE 格式、`execution.normalizedInput` 结构、`PromptDebugPayload` 类型均向后兼容。
5. **遵守调试开关约束**：所有新增记录必须受 `isPromptDebugEnabled()` 控制，非调试模式零开销。

---

## 3. 方案设计

### 3.1 修复 B-1：落库快照补充 `llmCalls`

#### 3.1.1 改动位置

文件：`apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat-orchestrator.service.ts`

方法：`buildExecutionPromptDebug`（L631–L647）

#### 3.1.2 改动内容

```diff
 private buildExecutionPromptDebug(
   promptDebug?: Record<string, unknown>
 ): Record<string, unknown> | undefined {
   if (!promptDebug) return undefined;
   return {
     debugSource: promptDebug.debugSource,
     systemPrompt: promptDebug.systemPrompt,
     userPrompt: promptDebug.userPrompt,
     systemPromptSectionKeys: promptDebug.systemPromptSectionKeys,
     userPromptSectionKeys: promptDebug.userPromptSectionKeys,
     modelId: promptDebug.modelId,
     notes: promptDebug.notes,
+    llmCalls: Array.isArray(promptDebug.llmCalls) ? promptDebug.llmCalls : undefined,
   };
 }
```

#### 3.1.3 影响分析

- `execution.normalizedInput.promptDebug.llmCalls` 此前始终为 `undefined`，改后补齐。
- 调试台 `PromptDebugPage` 使用 `buildTimelineItems` 渲染 `llmCalls`，**无需改前端**，落库快照立即可用。
- `normalizedInput` 字段为 `jsonb`，字段扩展对数据库无需迁移。
- 不影响 control-plane 的 `execution-plan-normalization.service.ts`（仅读取 `__promptDebug`，不校验内部结构）。

---

### 3.2 修复 B-2：LLM Operation 节点级 Prompt 可观测

#### 3.2.1 架构决策

LLM Operation 在 Temporal Activity 中执行，其结果通过 `control-plane` 更新 `execution.phases[].steps[].output`。调试台的"端到端 Timeline"已通过 `executionApi.getSteps()` 加载步骤数据并展示 step 级别的 input/output。

**方案选择：在 `LlmOperationV2Result` 中增加 `promptDebug` 字段，由 Temporal Activity 调用方透传到 step output。**

选择此方案而非写入 SSE 流，原因：
- Temporal Workflow 是异步执行的，SSE 连接可能已关闭。
- step output 已有固定的持久化路径，调试台查询 `getSteps()` 即可获取。
- 与现有 Timeline 渲染逻辑完美对齐，无需新增 API。

#### 3.2.2 类型扩展

文件：`apps/backend/intelligence/ai-orchestrator/src/modules/llm-operation/runtime/v2-runtime-types.ts`

```diff
 export interface LlmOperationV2Result {
   success: boolean;
   operationRef: { id: string; version: string; digest: string };
   source: 'database' | 'legacy_registry';
   data?: Record<string, unknown>;
   usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
   metadata: {
     provider: string;
     requestedModel: string;
     resolvedModel?: string;
     finishReason?: string;
     repairAttempts: number;
     latencyMs: number;
     schemaValidated: boolean;
     toolCallDetected: boolean;
     idempotentReplay?: boolean;
   };
   errorCode?: string;
   errorMessage?: string;
+  /**
+   * 调试快照（仅 promptDebugEnabled = true 时填充）。
+   * 包含 systemPrompt、userPrompt 和模型原始回复，供调试台展示。
+   */
+  promptDebug?: {
+    systemPrompt: string;
+    userPrompt: string;
+    modelId: string;
+    llmResponseText?: string;
+    repairAttempts?: number;
+  };
 }
```

#### 3.2.3 运行时记录

文件：`apps/backend/intelligence/ai-orchestrator/src/modules/llm-operation/runtime/llm-operation-v2-runtime.service.ts`

在构建 `result` 对象时（L345–L368）注入 `promptDebug`：

```diff
+  // 获取调试开关（通过构造函数注入或单例访问）
+  private readonly promptDebugSettingsService: PromptDebugSettingsService;

   private async executeInternal(...): Promise<LlmOperationV2Result> {
     // ...（保持不变）

     const result: LlmOperationV2Result = {
       success: true,
       operationRef: { id: request.operationId, version: version.version, digest: version.operationDigest },
       source: resolved.source,
       data: parsed.data,
       usage: { ... },
       metadata: { ... },
+      ...(this.promptDebugSettingsService.isPromptDebugEnabled()
+        ? {
+            promptDebug: {
+              systemPrompt,
+              userPrompt,
+              modelId: activeModel.id,
+              llmResponseText: lastRawContent,
+              repairAttempts,
+            },
+          }
+        : {}),
     };

     // ...
   }
```

**注意**：`LlmOperationV2RuntimeService` 当前没有注入 `PromptDebugSettingsService`，需在模块中补充依赖注入。

#### 3.2.4 Temporal Activity 透传

Temporal Activity 在调用 `LlmOperationV2RuntimeService.execute()` 后得到 `LlmOperationV2Result`，其中 `promptDebug` 字段需要作为 step output 的一部分存入 `control-plane`。

具体路径取决于 Activity 实现位置，总体模式为：

```ts
const result = await llmOperationRuntime.execute(request);

const stepOutput = {
  data: result.data,
  usage: result.usage,
  metadata: result.metadata,
  // 透传 promptDebug，控制面不感知此字段，只存入 step.output jsonb
  ...(result.promptDebug ? { __promptDebug: result.promptDebug } : {}),
};
```

#### 3.2.5 前端 Timeline 展示

文件：`apps/frontend/portal/src/features/admin/prompt-debug/pages/PromptDebugPage.tsx`

当前 `buildTimelineItems` 中对步骤的渲染（L515–L564）已展示 `step.input` 和 `step.output`，用户需展开"原始节点 JSON"可看到 `__promptDebug`。

**可选增强**（非阻塞型改动）：在步骤 Card 中检测 `step.output.__promptDebug` 并渲染一个"Prompt 快照"折叠区，提供更友好的视图：

```tsx
// 在 buildTimelineItems 的步骤渲染部分
const stepPromptDebug = step.output?.__promptDebug as {
  systemPrompt?: string;
  userPrompt?: string;
  llmResponseText?: string;
} | undefined;

// details 区增加：
{ label: 'System Prompt', value: stepPromptDebug?.systemPrompt || '' },
{ label: 'User Prompt', value: stepPromptDebug?.userPrompt || '' },
{ label: 'LLM 回复', value: stepPromptDebug?.llmResponseText || '' },
```

---

### 3.3 修复 B-3：ReAct 多轮推理 prompt 追加

#### 3.3.1 改动位置

文件：`apps/backend/intelligence/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`

方法：`buildPromptForIteration`（或包含 `state.promptDebug = ...` 赋值的方法，L864–L890）

#### 3.3.2 当前逻辑

每次 ReAct 迭代进入 `buildPromptForIteration` 都完整重置 `state.promptDebug`，`llmCalls` 始终只有一个元素（`label: 'ReAct 推理'`）。

#### 3.3.3 改动内容

```diff
-state.promptDebug = this.canExposePromptDebug(context)
-  ? {
-      debugSource: 'react-engine',
-      systemPrompt,
-      userPrompt,
-      systemPromptSectionKeys: ...,
-      userPromptSectionKeys: ...,
-      modelId: config.modelId,
-      llmRequestMessages: [...],
-      llmCalls: [
-        {
-          stage: 'react-engine',
-          label: 'ReAct 推理',
-          modelId: config.modelId,
-          requestMessages: [...],
-        },
-      ],
-    }
-  : undefined;

+if (this.canExposePromptDebug(context)) {
+  const prevCalls = state.promptDebug?.llmCalls ?? [];
+  const newCall: PromptDebugLLMCall = {
+    stage: 'react-engine',
+    label: `ReAct 推理 #${state.iteration + 1}`,
+    modelId: config.modelId,
+    requestMessages: [
+      { role: 'system', content: systemPrompt },
+      { role: 'user', content: userPrompt },
+    ],
+  };
+  state.promptDebug = {
+    debugSource: 'react-engine',
+    systemPrompt,
+    userPrompt,
+    systemPromptSectionKeys: systemSections.map((s) => s.key),
+    systemPromptSectionSources: systemSections.map((s) => s.source),
+    userPromptSectionKeys: userSections.map((s) => s.key),
+    userPromptSectionSources: userSections.map((s) => s.source),
+    modelId: config.modelId,
+    llmRequestMessages: [
+      { role: 'system', content: systemPrompt },
+      { role: 'user', content: userPrompt },
+    ],
+    llmCalls: [...prevCalls, newCall],
+  };
+}
```

在 LLM 调用完成后（L952–L969），`responseText` 回填最后一个 call 的逻辑无需改变，已经通过 `lastCall.responseText = response.content` 自动更新最新追加的 call。

#### 3.3.4 调试台展示效果

修复后，每次 ReAct 迭代都会在 Timeline 的 LLM Calls 区域追加一个节点：

```
● ReAct 推理 #1  [blue]  ← 展开可看第 1 轮 system/user prompt 和 thought
● ReAct 推理 #2  [blue]  ← 展开可看第 2 轮（包含 observation 拼接后的 user prompt）
● ReAct 推理 #3  [blue]  ← 最终 finish 轮
```

---

## 4. 前端调试台配套改动

### 4.1 步骤级 Prompt 展示（配合 B-2）

**文件**：`apps/frontend/portal/src/features/admin/prompt-debug/pages/PromptDebugPage.tsx`

在 `buildTimelineItems` 的步骤渲染部分（L515–L564），增加对 `step.output.__promptDebug` 的解析和展示。

改动核心：在步骤的 `details` 区中，新增 `LLM Operation Prompt` 折叠块，仅当 `step.output?.__promptDebug` 存在时显示：

```tsx
// 新增辅助函数
const extractStepPromptDebug = (output: unknown) => {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return undefined;
  const raw = (output as Record<string, unknown>).__promptDebug;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as { systemPrompt?: string; userPrompt?: string; llmResponseText?: string; modelId?: string };
};

// 在步骤 Card 的 details 中：
const stepPromptDebug = extractStepPromptDebug(step.output);
const details = renderTimelineDetails([
  { label: 'Step', value: step },
  { label: 'Input', value: step.input || {} },
  { label: 'Output', value: step.output || {} },
  { label: 'Target', value: step.target || {} },
  { label: 'Error', value: step.errorMessage || '' },
  ...(stepPromptDebug ? [
    { label: '── LLM Operation Prompt ──', value: '─'.repeat(40) },
    { label: 'System Prompt', value: stepPromptDebug.systemPrompt || '' },
    { label: 'User Prompt', value: stepPromptDebug.userPrompt || '' },
    { label: 'LLM 回复', value: stepPromptDebug.llmResponseText || '' },
  ] : []),
]);
```

### 4.2 LLM Nodes 统计卡更新

调试台顶部统计卡"LLM 节点数"（`activePromptDebug?.llmCalls?.length || 0`）在修复 B-3 后会自动反映 ReAct 轮数，无需额外改动。

### 4.3 历史记录侧边栏标注

为历史记录列表项增加"步骤数"徽标，便于用户快速判断哪条记录包含多步执行：

```tsx
// 在 List.Item 中，已有 renderTag 的地方增加：
{(item.promptDebug.llmCalls?.length ?? 0) > 1
  ? renderTag(`${item.promptDebug.llmCalls!.length} 个 LLM 节点`, 'purple')
  : null}
```

---

## 5. 数据流全景（改造后）

```
用户发送消息
│
├─ [Planner 路径]
│   ├── plannerService.completePlanFromMatchPhase()
│   │    └─ 规划 LLM 调用（含多 llmCalls）
│   ├── buildPlannerPromptDebug()         → promptDebug { llmCalls: [...] }
│   ├── SSE RESULT event.data.promptDebug → 前端 chatStore.promptDebugHistory ← 调试台"历史记录"
│   └── buildExecutionPromptDebug()       → execution.normalizedInput.promptDebug
│        ✅ 修复 B-1：现包含 llmCalls       → 调试台 executionId 查询可看 Timeline LLM 节点
│
├─ [Temporal 多步路径]
│   ├── control-plane 创建 Execution
│   ├── Temporal Workflow 调度各 Activity
│   │    └── LlmOperationV2RuntimeService.execute()
│   │         ├── 渲染 systemPrompt / userPrompt
│   │         ├── callModel()
│   │         └── result.promptDebug { systemPrompt, userPrompt, llmResponseText }
│   │              ✅ 修复 B-2：Activity 透传到 step.output.__promptDebug
│   └── control-plane 存入 execution.phases[].steps[].output
│        └── 调试台 getSteps() → Timeline 步骤展开显示 Prompt 快照
│
└─ [ReAct 路径]
    ├── 每次迭代：buildPromptForIteration()
    │    ✅ 修复 B-3：追加 llmCalls 而非覆盖
    │    └── state.promptDebug.llmCalls: [#1, #2, ..., #N]
    ├── SSE RESULT event.data.promptDebug → 前端 chatStore（含全部轮次）
    └── 调试台 Timeline 展示每轮 ReAct 推理节点
```

---

## 6. 接口契约与兼容性

### 6.1 `PromptDebugPayload` 类型（无变化）

定义于 `packages/user-core/src/types/chat.types.ts`。现有字段均向后兼容，`llmCalls` 字段本已存在，修复只是确保其被正确填充。

### 6.2 `LlmOperationV2Result` 扩展（新增可选字段）

新增 `promptDebug?: { ... }` 为可选字段，不影响现有消费方（Temporal Activity、audit service、控制面）。

### 6.3 `ExecutionStepDto.output` 字段

`output` 为 `unknown`，前端已做 `as Record<string, unknown>` 类型断言。新增 `__promptDebug` 是对 output jsonb 的扩展，control-plane 透传存储，无需 schema 迁移。

---

## 7. 实现计划

### 阶段 1（P0 · 约 1 人日）

> 目标：修复落库快照的 llmCalls 丢失问题，现有 Planner 路径立即可用。

| 任务 | 文件 | 类型 |
|------|------|------|
| `buildExecutionPromptDebug` 补充 `llmCalls` | `chat-orchestrator.service.ts` | 后端修改 |
| 单测：补充 `buildExecutionPromptDebug` 的 llmCalls 覆盖用例 | `chat-orchestrator.service.spec.ts` | 测试补充 |
| 验证：通过 executionId 查询确认历史快照中包含 LLM 节点 | 手动回归 | 验证 |

### 阶段 2（P1 · 约 2 人日）

> 目标：ReAct 多轮推理 prompt 完整记录。

| 任务 | 文件 | 类型 |
|------|------|------|
| `buildPromptForIteration` 改为追加 llmCalls | `react-engine.service.ts` | 后端修改 |
| 确认 `responseText` 回填逻辑兼容 | `react-engine.service.ts` | 后端验证 |
| 单测：多轮迭代后 `state.promptDebug.llmCalls` 长度递增 | `react-engine.service.spec.ts` | 测试补充 |
| 前端：历史记录侧边栏增加"LLM 节点数"徽标 | `PromptDebugPage.tsx` | 前端小改 |

### 阶段 3（P2 · 约 3 人日）

> 目标：LLM Operation 节点级 Prompt 可观测。

| 任务 | 文件 | 类型 |
|------|------|------|
| `v2-runtime-types.ts` 增加 `promptDebug` 字段 | `v2-runtime-types.ts` | 类型扩展 |
| `LlmOperationV2RuntimeService` 注入 `PromptDebugSettingsService` | 模块注册 + service | 后端修改 |
| `executeInternal` 构建并注入 `result.promptDebug` | `llm-operation-v2-runtime.service.ts` | 后端修改 |
| Temporal Activity 调用方透传 `result.promptDebug` 到 step output | Temporal Activity 文件（待确认） | 后端修改 |
| 前端：步骤 Timeline 中增加 LLM Operation Prompt 折叠区 | `PromptDebugPage.tsx` | 前端改动 |
| 集成验证：`查询AI新闻并总结` 任务调试台全链路回放 | 端到端测试 | 验证 |

---

## 8. 验证计划

### 8.1 阶段 1 验证

```bash
# 1. 以 admin 角色发送一条触发 Planner 路径的任务
# 2. 在调试台输入返回的 executionId
# 3. 验证 Timeline 中出现 LLM Calls 节点（数量 > 0）
# 4. 展开节点，确认 requestMessages 和 responseText 非空
```

### 8.2 阶段 2 验证

```bash
# 1. 发送需要多轮 ReAct 推理的任务（如搜索 + 归纳 + 格式化）
# 2. 观察调试台"历史记录"最新条目
# 3. 验证 Timeline 中 LLM Calls 区域有多个 "ReAct 推理 #N" 节点
# 4. 验证每个节点展开后 requestMessages 包含对应轮次的完整对话历史
```

### 8.3 阶段 3 验证

```bash
# 1. 执行「查询AI新闻并总结」任务（Temporal 多步路径）
# 2. 等待任务完成，输入 executionId 查询
# 3. 验证 Timeline 步骤中（search_ai_news、summarize_list）
#    可以展开看到 System Prompt 和 User Prompt 原文
# 4. 验证调试开关关闭后，step.output 中不包含 __promptDebug 字段
```

---

## 9. 风险与注意事项

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| `llmCalls` 追加导致 `normalizedInput` jsonb 体积增大 | 低 | 已有 20 条历史上限；单条 llmCalls 数组通常 ≤ 10 次 |
| Temporal Activity 调用方代码不在本仓库可直接修改范围 | 中 | 阶段 3 实现前需确认 Activity 代码位置和写 step output 的路径 |
| ReAct 多轮后 `llmCalls` 包含对话历史，单条记录可能超出前端渲染性能 | 低 | `maxHeight: 240` 已对内容区做高度限制；极端情况可加条目数限制 |
| `PromptDebugSettingsService` 注入到 LLM Operation 运行时可能带来循环依赖 | 低 | 使用单例模式（与 `react-engine.service.ts` 相同处理方式） |

---

## 10. 不在本设计范围内

- **用量统计**：LLM Operation 节点的 token 消耗已由 `auditService.recordInvocation` 独立管理，本设计不重复。
- **Planner 本身的 prompt 结构改造**：本设计只修复记录路径，不涉及 Planner 的 prompt 内容调整。
- **调试台 UI 全面重构**：阶段 3 前端改动仅增量扩展现有 `renderTimelineDetails`，不重写页面结构。
- **非管理员用户的调试数据访问**：调试台和 promptDebug 信号均有 `admin` 角色门控，本设计维持现状。
