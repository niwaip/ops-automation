# Debug Session: recorder-session-check

Status: OPEN

## Symptoms

- 用户要求检查 `recorder-debug-1781707375182` 的录制内容是否正确。
- 需要确认是否存在正确的循环结构，而不是只有录制步骤或半成品 loopDraft。

## Scope

- Recorder session runtime state
- executedCommands / history / loopDraft
- export artifacts derived from the same session

## Hypotheses

1. 录制命令本身不完整，导致后续无法形成正确循环。
2. `loopDraft` 存在，但缺少 `eachIteration.stepIds` 等关键边界信息，循环不完整。
3. 录制命令正确，但最近用户消息会影响导出推断，造成循环结构被改写。
4. 会话已经包含完整循环，只是查看时只看到了线性 commands，没看到 export 后的 `templateSteps/loopDraft`。

## Evidence Plan

- 拉取 session 原始详情，检查 `history`、`executedCommands`、`loopDraft`。
- 必要时重放一次 export，检查 `templateSteps` 与 `executionPlan.loopDraft`。
- 对照运行时循环要求，判断是否属于“正确循环”。
