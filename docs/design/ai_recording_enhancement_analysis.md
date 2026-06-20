# AI 录制能力增强分析与建议

> 基于 `AI-Page-Understanding-and-React-Semantics-Compatibility-Plan_v1.0.md`  
> 结合现有代码库实际情况  
> 日期：2026-06-16

---

## 一、现状诊断：代码库与设计文档的差距在哪

### 1.1 现有观测链（已实现）

当前录制核心入口为 [`recorder-debug.service.ts`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-debug.service.ts)，每次用户对话前会调用 `observePage()`，执行三个步骤：

```
snapshot  →  evaluate(buildStructureProbeScript)  →  get_text
```

`buildStructureProbeScript()` 是一段注入到浏览器的 JS，扫描以下元素（每类最多 6-8 个）：

| 元素类型                   | 实现方式   |
| -------------------------- | ---------- |
| inputs / textarea / select | DOM query  |
| buttons / `[role=button]`  | DOM query  |
| headings (h1-h3)           | DOM query  |
| links (a[href])            | DOM query  |
| 页面全文 text              | `get_text` |
| Accessibility snapshot     | `snapshot` |

**核心问题**：这是一个"扁平元素摘要"，**不携带任何层级关系**：

- 一个 "詳細" 按钮不知道它属于哪一行
- 一个 "25.5%" 数值不知道它是"毛利率字段"
- 多个同名按钮无法区分

### 1.2 AI 决策层现状

[`browser-command.service.ts`](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/browser-command.service.ts) 中，AI 拿到的 context 是：

```typescript
context: {
  currentPageUrl,
  backend,
  lastObservationText,          // 纯文本，无层级
  availableInputs: [...],       // 扁平数组
  availableButtons: [...],      // 扁平数组，没有行归属
}
```

AI 直接面对原始元素列表生成操作，这导致：

- 当页面有 5 个 "詳細" 按钮时，AI 只能生成 `{ tool: 'click', params: { text: '詳細' } }`
- 这个 action 在后续 Skill 执行时会触发 strict mode 多元素匹配失败

### 1.3 图像识别能力现状

**好消息**：底层接口已支持多模态，`ContentBlock` 和 `ChatMessage` 已有 `image_url` 类型定义（[interfaces/index.ts L6-L22](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/ai-orchestrator/src/interfaces/index.ts)）：

```typescript
export interface ContentBlock {
  type: 'text' | 'image_url';
  image_url?: {
    url: string; // URL 或 base64 data URI
    detail?: 'low' | 'high' | 'auto';
  };
}
export interface ChatMessage {
  content: string | ContentBlock[]; // 已支持多模态
}
```

**坏消息**：当前录制链路完全没有使用这个能力。`screenshot` 工具只用于生成 Playwright 脚本中的截图步骤（`artifacts/step-N.png`），从未把截图内容传给 AI 做分析。

---

## 二、核心建议：三层递进式增强策略

设计文档提出了理想的 6 层架构，结合代码现状，我建议分三个阶段落地，每个阶段都是独立可验证的，**不会破坏现有录制流程**：

```
Phase 1（低成本）    Phase 2（中等成本）      Phase 3（可选）
  结构化探针升级   →  候选对象层 + data-ai-*  →  视觉 fallback
  ↓                   ↓                        ↓
修复 ref 丢失问题    让 AI 面对候选而非原始元素   图像作为辅助 fallback
```

---

## 三、Phase 1：结构化探针升级（建议立刻做，改动最小）

### 3.1 让探针返回层级关系

**当前问题**：`buildStructureProbeScript()` 只返回扁平的 buttons / inputs，不知道彼此关系。

**建议改动**：在 evaluate 脚本中额外探测**行结构**和**区域结构**。不依赖 React，只依赖 DOM 语义：

```javascript
// 新增：探测表格行与其内部按钮的绑定关系
const tableRows = document.querySelectorAll('tr, [role="row"]');
const rowContextMap = [...tableRows].slice(0, 10).map((row, index) => {
  const rowText = row.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
  const rowButtons = [...row.querySelectorAll('button, [role="button"], a[href]')].map(
    (btn) => btn.textContent.trim() || btn.getAttribute('aria-label')
  );
  return { rowIndex: index, rowText, rowButtons };
});

// 新增：探测 data-ai-* 属性（为后续 Phase 2 做准备）
const aiRegions = document.querySelectorAll('[data-ai-region]');
const semanticHints = [...aiRegions].map((region) => ({
  region: region.getAttribute('data-ai-region'),
  fields: [...region.querySelectorAll('[data-ai-field]')].map((f) => ({
    field: f.getAttribute('data-ai-field'),
    text: f.textContent.trim(),
  })),
}));
```

**收益**：

- AI 能知道"第 2 行的詳細按钮"而不是"任意一个詳細按钮"
- 与现有录制流程完全兼容，只是 observation 数据更丰富

### 3.2 修复 ref 丢失问题（核心 bug fix）

当前 `buildObservationFromSnapshotState()` 提取了 ref，但在构建发给 AI 的 context 时，`availableButtons` 只保留了 text，**ref 被丢弃了**：

```typescript
// 当前（有问题的行为）
availableButtons: observation.buttons.map((item) => this.describeObservedElement(item)); // 只有文本描述，ref 丢失
```

**建议**：把 ref 保留在传给 `parseCommand` 的 context 中，并在 prompt 中告知 AI 使用 ref 而非 text 进行操作。这是**最高性价比**的改动，可以直接减少 strict mode 失败。

---

## 四、Phase 2：候选对象层 + data-ai-\* 语义标注

### 4.1 后端：Candidate Builder

在 AI 决策前，引入一个中间层将扁平元素聚合为**候选对象**（设计文档 §8.2）：

```typescript
// 建议新增文件：candidate-builder.service.ts
type BrowserActionCandidate = {
  candidateId: string; // 稳定 ID，如 "row-2-btn-detail"
  source: 'snapshot' | 'data_ai' | 'vision';
  kind: 'action' | 'field' | 'row';
  label: string; // 展示给 AI 的描述
  ref?: string; // snapshot ref（优先使用）
  rowContext?: {
    rowIndex: number;
    rowKey?: string; // data-ai-row-key 或业务主键
    rowPrimaryText: string; // 行摘要文本
  };
  preferredLocator: {
    type: 'ref' | 'css' | 'role' | 'text';
    value: string;
  };
};
```

AI 拿到的不再是原始元素列表，而是：

```
候选 #1: [行 1] 案件名"AI搭载スマート倉庫..." 的 詳細 按钮 (ref=e42, row-key=PRJ-001)
候选 #2: [行 1] 案件名"AI搭載スマート倉庫..." 的 承認する 按钮 (ref=e43, row-key=PRJ-001)
候选 #3: [行 2] 案件名"グローバルEC..." 的 詳細 按钮 (ref=e55, row-key=PRJ-002)
```

这样 AI 只需"在候选中选一个"，而不是"自由生成 locator"。

### 4.2 前端：data-ai-\* 最小属性集（先在 mock-erp 试点）

设计文档建议的最小集合完全合理，建议先在 `tests/mock-erp` 的测试页面验证，再推广到 `apps/frontend/portal`：

```html
<!-- 优先在表格行和详情页的关键字段上添加 -->
<tr data-ai-row-key="PRJ-2026-001" data-ai-row-index="0">
  <td data-ai-field="grossMargin" class="gross-margin-cell margin-high">25.5%</td>
  <td>
    <button data-ai-action="detail">詳細</button>
    <button data-ai-action="approve">承認する</button>
  </td>
</tr>
```

> [!NOTE]
> **mock-erp 已经是一个绝佳的试验场**：`tests/mock-erp/index.html` 已有 `data-testid` 属性，只需在此基础上追加 `data-ai-*` 属性，就可以在不改动主项目的情况下验证整个候选构建链路。

---

## 五、图像识别（视觉能力）如何接入

### 5.1 核心原则（与设计文档完全一致）

> 图像只做 **辅助 fallback**，不做默认主链。

当前模型（Claude/GPT-4o 系列）的图像识别已通过 `ContentBlock.image_url` 接口支持传入。建议采用以下触发策略：

```typescript
// 触发视觉 fallback 的条件（任一满足）
const shouldUseVision =
  snapshotCandidates.length === 0 || // 快照为空
  hasStrictModeError || // 多次消歧失败
  isIconOnlyPage || // icon-only 组件
  userExplicitlyRequestedScreenshot; // 用户主动要求截图分析
```

### 5.2 接入方式（最小改动）

不需要改动 AI 模型接入层（已支持多模态），只需在 `recorder-debug.service.ts` 的 `observePage()` 中增加一个可选的截图读取步骤：

```typescript
// 仅在触发条件成立时才执行截图 + 视觉分析
private async observePageWithVisionFallback(session, options) {
  const base = await this.observePage(session);

  if (!this.shouldTriggerVision(base, options)) {
    return base;  // 正常路径，不改变现有行为
  }

  // 触发 vision fallback
  const screenshotResult = await this.executeBrowserCommands(session, [
    { tool: 'screenshot', params: {} }
  ]);

  const base64Image = this.extractScreenshotBase64(screenshotResult);
  if (!base64Image) return base;

  // 使用多模态消息传给 AI（接口已支持）
  const visionCandidates = await this.analyzePageWithVision({
    imageBase64: base64Image,
    existingCandidates: base.candidates,  // 已有候选作为 context
    userIntent: options.userIntent,
  });

  return { ...base, candidates: [...base.candidates, ...visionCandidates] };
}
```

### 5.3 视觉分析的 Prompt 策略

传给 AI 的视觉分析请求应该是**结构化输出**，而不是自然语言描述：

```typescript
// 视觉分析的 prompt 示例
const visionPrompt = `
当前页面截图如下。

已知候选元素（来自 DOM 快照）：
${JSON.stringify(existingCandidates)}

请从截图中补充识别：
1. 上述候选中无法通过 DOM 识别的图标按钮（只有图标、无文字）
2. Canvas / 自绘区域中的可交互元素
3. 视觉上明显的表格行边界和对应的动作区域

返回 JSON 格式，结构与 existing candidates 一致。
注意：只返回 DOM 快照无法覆盖的补充候选，不要重复已有候选。
`;
```

**关键约束**：视觉输出仍然必须收敛为结构化候选（带 `candidateId` 和 `preferredLocator`），不能直接产生坐标点击动作。

---

## 六、与现有流程的兼容边界（最重要的约束）

| 环节                              | 当前状态                 | 增强后变化                | 是否破坏               |
| --------------------------------- | ------------------------ | ------------------------- | ---------------------- |
| 录制对话 `chat()`                 | 使用扁平 observation     | 增加候选对象层            | **不破坏**             |
| 命令解析 `parseCommand()`         | AI 自由生成 locator      | AI 从候选中选择           | **不破坏**（兼容降级） |
| 模板导出 `buildExportArtifacts()` | 使用 BrowserCommand      | 优先保留 ref/候选 locator | **正向改善**           |
| 发布后 Skill 执行                 | 使用 `templateSteps` DSL | **完全不变**              | **不影响**             |
| React 语义（data-ai-\*）          | 未使用                   | 录制时读取，不进入 DSL    | **不破坏**             |
| 视觉 fallback                     | 未使用                   | 仅条件触发，作为补充候选  | **不破坏**             |

> [!IMPORTANT]
> **最关键的边界**：`data-ai-*` 属性和视觉识别结果，**只用于录制阶段的候选构建**，不得写入 `templateSteps` 的 `locator`。发布后的 Skill 执行链仍然只消费标准 DSL 和稳定的 `ref/css/role locator`。

---

## 七、推荐实施顺序（基于现有代码最少侵入）

### 优先级 P0（本周可做，无风险）

1. **修复 ref 丢失**：在 `describeObservedElement()` 中保留 `ref`，在传给 `parseCommand` 的 context 中携带 ref 信息，prompt 中明确要求 AI 输出 ref 而非文本 locator。

2. **升级结构探针**：在 `buildStructureProbeScript()` 中增加行结构探测（tableRows + rowButtons mapping），无需改接口，只是 observation 数据更丰富。

3. **在 mock-erp 上添加 data-ai-\* 属性**：验证探针能正确读取，为 Phase 2 积累经验。

### 优先级 P1（下一阶段）

4. **候选对象 DTO**：新建 `candidate-builder.service.ts`，将 observation 转换为结构化候选，改造 `parseCommand` 接受候选列表作为输入。

5. **Prompt 重构**：让 AI 从候选列表中选择，而不是自由生成。

### 优先级 P2（条件满足后）

6. **视觉 fallback 接入**：在特定触发条件下调用截图 + 视觉分析，补充候选；利用已有 `ContentBlock.image_url` 接口，无需改模型层。

---

## 八、对当前 mock-erp 的利用建议

`tests/mock-erp` 是一个完美的测试靶场：

| 测试场景      | 目标                        | mock-erp 对应页面                  |
| ------------- | --------------------------- | ---------------------------------- |
| 同名按钮消歧  | 识别"第 2 行的詳細按钮"     | 承認管理一覧的表格行               |
| 字段值读取    | 读取"PRJ-2026-002 的毛利率" | `data-testid="gross-margin-value"` |
| 条件分支判断  | 毛利率 < 20% → 触发接管     | 红色显示的 17.8% 行                |
| 人工接管界面  | 识别接管警告并执行手动操作  | `#takeover-alert-panel`            |
| 视觉 fallback | 识别只有图标的按钮          | 可新增图标按钮做测试               |

**建议**：在 `tests/mock-erp/index.html` 的表格行上加入 `data-ai-*` 属性，然后录制一个"找到毛利率低于20%的案件并触发接管"的 Skill，验证整个增强链路。

---

## 九、总结

设计文档 v1.0 的整体方向是准确的，现有代码库已具备以下基础：

- ✅ 多模态 LLM 接口（`ContentBlock` 支持图片）
- ✅ Snapshot + evaluate + get_text 三层观测
- ✅ `templateSteps` DSL 与录制导出已解耦
- ✅ mock-erp 测试靶场可以立即使用

**最需要立刻解决的问题**：

1. 结构探针升级（增加行归属关系）
2. ref 在候选传递链中的丢失问题

**图像识别的最佳定位**：

- 基础设施已就绪，无需改底层
- 接入成本低（一个可选分支 + 一段 prompt）
- 只做 fallback，不替代主链，完全符合设计文档的核心原则
