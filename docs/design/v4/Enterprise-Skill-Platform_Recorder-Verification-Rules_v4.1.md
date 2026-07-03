# 企业级 Skill 平台 Recorder Verification Rules 草案

**Recorder Verification Rules v4.1**  
日期：2026-07-03

> 本文是 [Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md) 与 [Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md) 的规则层续篇。  
> 目标是把 `RecorderVerification` 从类型草案推进为可实施的 verifier 规则集，重点覆盖 recorder-debug 首批最有价值的四类动作：`select / open detail / fill / navigate`。

---

## 1. 文档目标

本文回答以下问题：

- verifier 在 recorder 中应放在哪个阶段执行
- verifier 的统一输入、统一输出和失败原因格式是什么
- `SelectionVerifier / DetailOpenVerifier / FillVerifier / NavigationVerifier` 各自检查什么
- 每类 verifier 的优先级、短路条件和回退条件是什么
- 如何用这套规则回答“第二条记录无法选中”这类问题

---

## 2. 设计目标

verification 层的设计目标不是“生成更合理的回复”，而是：

- 把工具执行成功与目标完成明确区分
- 让 recorder-debug 输出结构化 verdict
- 为详情页展示和问题诊断提供稳定证据
- 为后续自动回放、失败恢复和策略选择提供可计算输入

---

## 3. 承接边界

### 3.1 执行层承接点

当前最适合接入 verification 的执行层入口在：

- [recorder-debug-execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-execution.service.ts)

当前该模块已具备：

- `observePage()`：可生成 observation
- `executeBrowserCommands()`：可生成原始执行结果
- `mergeObservationWithExecution()`：可把部分执行结果写回 observation
- `extractUrlFromExecution()`：可辅助 navigation 判定

说明：

- verifier 不应自己直接调用浏览器
- verifier 应消费“执行前 observation + 执行后 observation + execution 摘要 + grounding”

### 3.2 响应层承接点

当前最适合写回 verification 结果的响应层入口在：

- [recorder-debug-response.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/browser/execute/recorder-debug-response.service.ts)

建议未来承接：

- `response.outcome`
- `history[].outcome`

说明：

- verifier 的输出不应只用于接口即时返回
- 它还应进入 session history，成为后续诊断、压缩、回放和详情页展示的统一依据

---

## 4. 统一规则模型

### 4.1 Verifier 输入

```ts
export interface RecorderVerificationInput {
  intent: RecorderIntent;
  before?: ObservationState;
  after?: ObservationState;
  execution?: BrowserExecutionSummary;
  grounding?: RecorderGrounding;
  rawExecution?: BrowserExecuteResponse;
}
```

说明：

- `intent` 用于决定走哪类 verifier
- `before / after` 是主事实层
- `execution` 是工具摘要层
- `grounding` 是目标命中证据
- `rawExecution` 仅用于必要时取更细的失败信息

### 4.2 Verifier 输出

```ts
export interface RecorderVerificationResult {
  verification: RecorderVerification;
  derivedFacts?: PageFact[];
}
```

补充约束：

- `verification.verifier` 必须显式记录当前命中的 verifier 类型
- `verification.routeReason` 必须记录本次路由依据：`actionType | goal-pattern | command-family | fallback`
- `checks[].required` 与 `checks[].weight` 必须在 verifier 内明确设定，不能由 UI 或调用方临时猜测

### 4.3 统一失败原因格式

建议 failure reason 使用以下归类：

```ts
export type RecorderVerificationFailureCode =
  | 'tool_failed'
  | 'target_not_grounded'
  | 'target_not_visible'
  | 'state_not_changed'
  | 'detail_not_switched'
  | 'input_not_applied'
  | 'navigation_not_observed'
  | 'overlay_blocked'
  | 'ambiguous_target'
  | 'insufficient_evidence';
```

失败原因文本建议由：

- 统一 `code`
- 稳定 `message`
- 可选 `evidencePath`

共同组成，避免只返回一段难以复用的自然语言。

---

## 5. 执行时序

建议统一采用以下验证时序：

1. 记录 `before observation`
2. 执行动作
3. 提取 `execution summary`
4. 获取 `after observation`
5. 生成 `diff`
6. 根据 `intent.actionType` 选择 verifier
7. 产出 `verification`
8. 装配到 `RecorderOutcome`

其中第 6 步建议采用：

- 动作主 verifier
- 通用 fallback verifier

示例：

- `select` -> `SelectionVerifier`
- `click` 且目标提示包含“详情/打开/查看” -> `DetailOpenVerifier`
- `fill` -> `FillVerifier`
- `navigate` -> `NavigationVerifier`
- 不确定时 -> `GenericActionVerifier`，并将 `routeReason` 标记为 `fallback`

---

## 6. 通用检查项

以下 checks 建议作为多个 verifier 的公共基础：

- `tool_command_succeeded`
- `target_visible`
- `target_selected`
- `url_changed`
- `node_state_changed`
- `detail_panel_changed`
- `input_value_written`
- `list_count_changed`
- `blocking_overlay_detected`
- `confirmation_required`
- `intent_alignment`

### 6.1 统一短路规则

若满足以下条件，应优先短路：

1. 工具执行失败
2. grounding 完全缺失且动作必须命中目标
3. after observation 缺失且无法补采

短路输出建议：

- `success = false` 或 `unknown`
- `failureReason` 明确给出短路类型

### 6.2 Check 权重建议

首期建议所有 verifier 使用显式权重，而不是隐式优先级：

- `tool_command_succeeded`：`required=true`，`weight=3`
- `target_visible`：`required=true`，`weight=2`
- `target_selected / input_value_written / url_changed / detail_panel_changed`：`weight=3`
- `node_state_changed / list_count_changed / intent_alignment`：`weight=2`
- `blocking_overlay_detected / confirmation_required`：`weight=1`

---

## 7. SelectionVerifier

### 7.1 适用场景

适用于：

- 选择列表中的某一条
- 选中表格某一行
- 切换 cards 中某一项
- “点击第二条记录”“选择第 3 行”“切换到某个 tab”

### 7.2 输入前提

SelectionVerifier 要求至少具备以下之一：

- `grounding.chosenTarget`
- `intent.targetHint`
- `before.rows / before.regions / before.interactive.buttons`

### 7.3 核心检查项

必选检查：

1. `tool_command_succeeded`
2. `target_visible`
3. `target_selected`

增强检查：

4. `detail_panel_changed`
5. `blocking_overlay_detected`

### 7.4 判定逻辑

推荐顺序：

1. 若工具失败，直接 `false`
2. 若目标未命中，直接 `unknown` 或 `false`
3. 若目标节点或目标行出现 `selected=false -> true`，记为强阳性
4. 若详情区内容发生切换，作为辅助阳性
5. 若目标没有 selected 语义，但详情切换且列表 active 行变化，可判 `partial` 或 `true`
6. 若完全无状态变化，则为 `false`

建议权重：

- `tool_command_succeeded`：`required=true`，`weight=3`
- `target_visible`：`required=true`，`weight=2`
- `target_selected`：`weight=3`
- `detail_panel_changed`：`weight=2`
- `blocking_overlay_detected`：`weight=1`

### 7.5 强阳性证据

以下任一可作为强阳性：

- 目标节点 `aria-selected` 由 `false` 变 `true`
- 目标 row `selected` 由 `false` 变 `true`
- 区域 `active` 状态切换到目标记录对应详情

### 7.6 弱阳性证据

以下仅作为弱阳性：

- 仅工具 click 成功
- 仅文本有轻微变化
- 仅有 URL hash 变化但无目标状态变化

### 7.7 失败原因模板

- `target_not_grounded`：无法定位到用户期望选择的目标项
- `overlay_blocked`：页面上存在遮挡或覆盖层，点击可能未命中目标
- `state_not_changed`：动作执行后未观察到任何选中态或活动区域变化
- `detail_not_switched`：列表点击后详情面板未切换到对应记录

### 7.8 对“第二条记录无法选中”的回答方式

SelectionVerifier 应能输出类似结论：

- 已执行点击
- 已命中第 2 条目标
- 未观察到 `selected` 状态变化
- 详情区内容未切换
- 因此判定为 `goal=false`

---

## 8. DetailOpenVerifier

### 8.1 适用场景

适用于：

- “查看详情”
- “打开链接”
- “展开详情面板”
- “进入某条记录详情页”

### 8.2 核心检查项

必选检查：

1. `tool_command_succeeded`
2. `target_visible`

增强检查：

3. `url_changed`
4. `detail_panel_changed`
5. `blocking_overlay_detected`

### 8.3 判定逻辑

推荐顺序：

1. 若工具失败，直接 `false`
2. 若导航类详情打开，则优先看 `url_changed`
3. 若抽屉/侧边栏类详情打开，则优先看 `detail_panel_changed`
4. 若两者都无，但出现明显的详情区域内容变化，也可判定成功
5. 若按钮存在但点击后完全无变化，则判定失败

建议权重：

- `tool_command_succeeded`：`required=true`，`weight=3`
- `target_visible`：`required=true`，`weight=2`
- `url_changed`：`weight=3`
- `detail_panel_changed`：`weight=3`
- `blocking_overlay_detected`：`weight=1`

### 8.4 详情变化的最小定义

以下任一命中即可：

- 新详情标题出现
- 详情区域 `visible=false -> true`
- 页面从列表 URL 跳到详情 URL
- 详情区核心字段文本变化

### 8.5 常见失败原因

- `target_not_visible`
- `overlay_blocked`
- `detail_not_switched`
- `navigation_not_observed`

---

## 9. FillVerifier

### 9.1 适用场景

适用于：

- 在输入框填写文本
- 在搜索框输入关键字
- 在表单字段填写值

### 9.2 核心检查项

必选检查：

1. `tool_command_succeeded`
2. `target_visible`
3. `input_value_written`

增强检查：

4. `blocking_overlay_detected`
5. 后续表单校验提示变化

### 9.3 判定逻辑

推荐顺序：

1. 若工具失败，直接 `false`
2. 若目标输入项不可见或不可交互，直接 `false`
3. 若目标字段 `value` 变化为预期值，判定成功
4. 若字段值未知，但 after observation 文本或相关区域出现对应输入值，可判 `partial`
5. 若工具成功但值未写入，判定失败

建议权重：

- `tool_command_succeeded`：`required=true`，`weight=3`
- `target_visible`：`required=true`，`weight=2`
- `input_value_written`：`weight=3`
- `node_state_changed`：`weight=2`
- `blocking_overlay_detected`：`weight=1`

### 9.4 特殊情况

对于密码框或掩码字段：

- 无法直接读取明文值时，不要求精确值对比
- 可退化为：
  - 字段从空变为非空
  - 表单从“未填写”提示变为消失

### 9.5 常见失败原因

- `target_not_grounded`
- `target_not_visible`
- `input_not_applied`
- `overlay_blocked`

---

## 10. NavigationVerifier

### 10.1 适用场景

适用于：

- `goto`
- 点击后跳转页面
- 菜单切换到新页面
- 返回上一页、打开新地址

### 10.2 核心检查项

必选检查：

1. `tool_command_succeeded`
2. `url_changed`

增强检查：

3. `detail_panel_changed`
4. 页面标题变化
5. `blocking_overlay_detected`

### 10.3 判定逻辑

推荐顺序：

1. 若执行失败，直接 `false`
2. 若目标 URL 明确且 after URL 匹配，判定成功
3. 若 URL 未变化，但页面 title / region / facts 发生显著页面级变化，可判 `partial`
4. 若完全无页面级变化，则判失败

建议权重：

- `tool_command_succeeded`：`required=true`，`weight=3`
- `url_changed`：`required=true`，`weight=3`
- `detail_panel_changed`：`weight=2`
- 页面标题变化：`weight=2`
- `blocking_overlay_detected`：`weight=1`

### 10.4 URL 匹配层次

建议支持：

- 完全匹配
- pathname 匹配
- query 局部匹配
- `landedUrl` 或 stdout 中抽取 URL 匹配

### 10.5 常见失败原因

- `navigation_not_observed`
- `tool_failed`
- `insufficient_evidence`

---

## 11. GenericActionVerifier

对于不确定动作或无法被明确归类的动作，建议提供统一兜底 verifier。

### 11.1 检查项

- `tool_command_succeeded`
- 页面是否存在任意可观察状态变化

### 11.2 输出策略

- 有明确状态变化但无法归类：`partial`
- 工具成功但无任何变化：`false`
- 证据不足：`unknown`

---

## 12. Check 优先级与置信度建议

### 12.1 优先级

建议把 checks 分为三档：

- `P0`
  - `tool_command_succeeded`
  - `target_visible`
- `P1`
  - `target_selected`
  - `input_value_written`
  - `url_changed`
  - `detail_panel_changed`
- `P2`
  - `blocking_overlay_detected`
  - `list_count_changed`
  - 其他上下文增强项

### 12.2 置信度公式

首期建议固定公式：

1. 将 `passed` 映射为 score：
   - `true -> 1`
   - `'partial' -> 0.5`
   - `'unknown' -> 0.25`
   - `false -> 0`
2. 使用公式：`confidence = round(sum(score * weight) / sum(weight), 2)`
3. 若任何 `required=true` 的 check 失败：
   - `success` 不得为 `true`
   - `confidence` 封顶到 `0.49`

解释区间：

- 满足必选项且至少一个强阳性 P1：通常 `confidence >= 0.8`
- 只满足工具成功与弱页面变化：通常 `confidence 0.4 ~ 0.7`
- 工具失败或无状态变化：通常 `confidence <= 0.2`
- 证据缺失：`success = unknown`

---

## 13. 失败信息与 UI 展示建议

verification 的输出不应只有布尔值，还应能直接被 UI 消费。

建议详情页展示：

- `success`
- `confidence`
- `failureReason`
- `checks`
- `evidencePath`

适合承接的前端页面：

- [AIControls.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/recorder/components/AIControls.tsx)
- [RecorderDebugDetailPage.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/features/recorder/pages/RecorderDebugDetailPage.tsx)

---

## 14. 首批实现建议

### 14.1 首批应实现

- `SelectionVerifier`
- `DetailOpenVerifier`
- `FillVerifier`
- `NavigationVerifier`

### 14.2 首批可暂缓

- 复杂表格排序 verifier
- 导出结果 verifier
- loop 收敛条件 verifier
- 纯视觉 canvas verifier

### 14.3 推荐实现位置

建议新增目录：

- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/verify/`

建议文件：

- `recorder-verification.types.ts`
- `selection.verifier.ts`
- `detail-open.verifier.ts`
- `fill.verifier.ts`
- `navigation.verifier.ts`
- `generic-action.verifier.ts`
- `recorder-verification.facade.ts`

---

## 15. 与 outcome 的装配建议

建议最终装配为：

```ts
const outcome: RecorderOutcome = {
  kind,
  status,
  intent,
  evidence: {
    before,
    after,
    diff,
    toolExecution,
  },
  grounding,
  verification,
  summary,
  artifacts,
};
```

其中：

- `summary.userVisible` 继续用于用户可读反馈
- `verification` 用于系统裁决
- `evidence` 用于调试页和后续自动诊断

---

## 16. 最终结论

verification 层是 recorder 从“会聊天的浏览器工具”走向“可诊断、可验证、可回放的执行系统”的关键一层。

首期最值得落地的不是复杂的全能 judge，而是四类高价值 verifier：

- `SelectionVerifier`
- `DetailOpenVerifier`
- `FillVerifier`
- `NavigationVerifier`

它们已经足以覆盖当前最常见、最痛的 recorder-debug 问题，尤其是：

- 点击成功但没真正选中
- 按钮可见但详情未打开
- fill 成功但值未生效
- 导航返回成功但页面没切换

把这四类规则先落地，再逐步扩展到更多动作族，是当前项目最稳妥、收益最高的路线。
