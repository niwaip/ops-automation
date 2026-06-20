# Debug Session: conditional-action-timeout
- **Status**: [OPEN]
- **Issue**: `recorder-debug-1781841282424` 在条件执行时未触发真实动作，流程未按预期继续；同时需要确认 noVNC / browser runtime 长时间后断开的超时或清理设置。
- **Debug Server**: Pending
- **Log File**: `.dbg/trae-debug-log-conditional-action-timeout.ndjson`

## Reproduction Steps
1. 查看会话 `recorder-debug-1781841282424` 的 history、commands、execution 与 observation。
2. 对照 `ai-orchestrator` / `browser-worker` 日志，确认条件执行停在 parse、gate、snapshot、还是实际 click/action 之前。
3. 检查 noVNC/runtime session 的超时、orphan sweep、idle 清理等配置与代码路径。

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 条件执行命中了仅“说明/问题回答”分支，没有真正落到 execute path | High | Low | Pending |
| B | 条件执行原本生成了真实动作，但被前置 snapshot / recovery / validation 拦住，导致流程没继续 | High | Low | Pending |
| C | 条件分支在 recorder 会话里缺少可消费的 observation/candidates，退化成无动作或文本 fallback | High | Low | Pending |
| D | noVNC 断开不是前端 websocket 超时，而是 browser runtime / worker 被 idle-orphan sweep 清掉 | High | Low | Pending |
| E | noVNC 还存在额外的显式超时配置，和 orphan sweep 共同作用导致长时间断开 | Medium | Low | Pending |

## Log Evidence
- 会话 `recorder-debug-1781841282424` 中，真实动作已经生成并执行过：
  - `click e99`：点击“保留中”筛选
  - `click :nth-match([data-ai-action="detail"], 1)`：点击第一条记录进入详情页
- 会话状态显示当前已在详情页，且 observation 中存在真实动作候选：
  - `action_17 ref=e239`：承认按钮
  - `action_18 ref=e240`：却下按钮
  - 说明条件执行阶段并非“没有动作可做”，而是页面与候选本身是完整的。
- 之后用户触发 `返回一览页面` 时，`ai-orchestrator` 生成了真实动作：
  - 首先尝试 `navigate http://192.168.100.143/#approvals`
  - 失败后走 recovery，再尝试 snapshot/导航
  - 但执行结果为 `navigate error + snapshot error`，未能继续。
- `ops-browser-worker` 日志关键证据：
  - `04:00:32`：`Runtime session recorder-ui-1781841245419-niuiqi not found (404), worker can be removed`
  - 同时删除 worker `328438eb-0c43-4d0b-8639-263dcc5a19c6`
  - `04:00:33` 之后仍继续对同一 runtime 执行 `snapshot`
  - 说明后续动作失败的根因是 runtime 已被清理，而不是条件动作没有生成。
- 超时/清理配置证据：
  - `worker.service.ts` 默认启用 orphan sweep：`BROWSER_WORKER_ORPHAN_SWEEP_ENABLED=true`
  - 周期：`BROWSER_WORKER_ORPHAN_SWEEP_INTERVAL_MS=30000`（默认 30s）
  - 最小空闲年龄：`BROWSER_WORKER_ORPHAN_SWEEP_MIN_IDLE_MS=90000`（默认 90s）
  - 一旦 session-broker 查询该 runtime 返回 `404`，即判定 worker 可删除。
  - `playwright-cli.adapter.ts` 里的 CLI 级超时主要是动作/导航/进程超时：
    - `PLAYWRIGHT_CLI_ACTION_TIMEOUT_MS=60000`
    - `PLAYWRIGHT_CLI_NAVIGATION_TIMEOUT_MS=60000`
    - `PLAYWRIGHT_CLI_PROCESS_TIMEOUT_MS=120000`
  - 这些更像单次命令执行超时，不是 noVNC 持久连接保活机制。

## Verification Conclusion
- `A` Rejected：这次不是停在回答/澄清分支；真实动作已生成并实际执行过。
- `B` Confirmed：后续流程是被 `snapshot/navigate` 前后链路拦住，但根因不是动作策略，而是 runtime 失效。
- `C` Rejected：在进入详情页前后，observation/candidates 都曾是完整的；不是一开始就没有结构化上下文。
- `D` Confirmed：当前 noVNC/浏览器长时间后断开，主因是 runtime session 对应 worker 被 orphan sweep 清理。
- `E` Partially confirmed：存在 CLI 动作/导航/进程超时，但从本次证据看，真正导致“长时间后断掉”的首要因素仍是 worker orphan 回收，而不是独立 noVNC 空闲超时。
