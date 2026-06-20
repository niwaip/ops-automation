# Debug Session: first-row-selection [OPEN]

## Symptom
- `recorder-debug-1781869831275` 在一览页无法选中第一条数据，预期应能进入第一条待处理案件详情。

## Hypotheses
1. 导出的第一条详情点击被错误解析成了列表筛选按钮点击，导致没有真正命中行级详情入口。
2. loop/current_list 参数化后，第一条详情 locator 被退化成非行级 selector，运行时只能再次点到 `保留中` 标签。
3. 当前 session 的 observation/candidates 中缺少稳定的第一行详情候选，parser 只能走低置信度 fallback。
4. 登录恢复或返回一览后的页面快照还没刷新完成，导致“第一条数据”命令是在旧 observation 上解析的。
5. session `executedCommands` 与导出 `templateSteps` 的索引映射再次错位，第一条详情步骤引用了错误 recorded step。

## Plan
- 先读取 `recorder-debug-1781869831275` 的 session 详情、history、executedCommands。
- 对照导出后的 `templateSteps/loopDraft`，确认“第一条数据”对应的 locator 和 step 映射。
- 必要时只加插桩，不直接修改业务逻辑。

## Evidence
- `GET /ai/recorder-debug/recorder-debug-1781869831275` 显示一览页 observation 中存在稳定的第一行详情候选：
  - `candidateId=action_31 | row=1 | action=detail`
  - `preferredLocator = :nth-match([data-ai-action="detail"], 1)` 风格的行级 selector
- 但 history 中三次失败尝试的实际命令都不是 candidate-first，而是 text-fallback：
  - `点击第一条数据，进入详细页面` -> `locator.strategy=text`, `value=第一条数据，进入详细页面`
  - `点击第一条数据的详细按钮，进入详细页面` -> `locator.strategy=text`, `value=第一条数据的详细按钮，进入详细页面`
- 导出结果进一步证明“详情点击”根本没被录进去：
  - `templateSteps` 只有 8 步
  - `step_5 = 点击保留中`
  - `step_6 = read_value :nth-match([data-ai-field="grossMargin"], 1)`
  - 缺少“打开第一条详情”的 click step

## Analysis
- 假设 3 被证伪：候选并不缺，row=1 的 detail 候选实际存在。
- 假设 2/5 只是一层后果，不是首因：导出缺少详情 step，是因为录制阶段这一步就没有成功记录。
- 当前首因是 parser 未把“第一条数据/第一条数据的详细按钮”识别成 row-scoped click：
  - `parseCandidateScopedAction()` 的 row 正则只接受 `记录|行|项目`，不接受“数据”。
  - 同时原始 target 里还带着“进入详细页面”等尾部描述，导致 `requestedTarget` 未被清理成可匹配的 `detail/详细`。
  - 因此 parser 没有生成带 `rowHint.index=1` 的 `PendingActionIntent`，后续退回 text-fallback。

## Current Conclusion
- 根因已定位：这是 parser 口径缺失，不是当前一览页 DOM 缺少第一条详情，也不是 export/loop 再次覆盖了 locator。
- 下一步若要修复，应优先在 `parseCandidateScopedAction()` 对“第一条数据/第一条数据的详细按钮/进入详细页面”补足 row 与 detail 语义归一化，再验证 candidate-first 是否回到 `:nth-match(..., 1)`。
