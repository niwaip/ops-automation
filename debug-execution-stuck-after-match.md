# Debug Session: execution-stuck-after-match [OPEN]

## Problem

用户输入：
- `创建技术合同 验收期限为30天，委托方名称为广州日产通商贸易有限公司`

实际现象：
- UI 显示 `思考: 正在规划任务...`
- 随后一直停留在 `执行中`

预期现象：
- 在 skill match 之后，应创建执行单
- 若参数不足，应尽快进入 `WAITING_INPUT` 并返回执行单 ID 与补参信息

## Hypotheses

1. `ai-orchestrator` 已命中 skill，但没有把 `WAITING_INPUT` 结果正确返回给前端。
2. `control-plane` 未将 execution 状态切换为 `WAITING_INPUT`，而是卡在 `QUEUED` 或 `RUNNING`。
3. 当前输入触发了错误分支，系统直接开始执行而不是先创建等待补参的执行单。
4. 事件流聚合阶段丢失了 `waiting_input` 事件，前端只看到“执行中”。
5. 会话恢复逻辑命中了历史 execution，导致页面观察的是旧状态。

## Plan

1. 定位 `ai-orchestrator -> control-plane -> UI` 的等待输入链路。
2. 直接复现用户输入并读取 execution / event 运行时证据。
3. 基于证据决定是否需要插桩。
4. 若确认根因，再做最小修复并复验。

## Evidence

- Pending

## Status

- Session created, no business logic changed yet.
