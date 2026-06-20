# Debug Session: session-loop-stall
- **Status**: [OPEN]
- **Issue**: `templates -> sessions` live 闭环里，`/sessions/:id/start` 后 session 停在 `RUNNING`，`stepCount=0`，预期应至少落出执行步骤，并继续跑完整循环。
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: `.dbg/trae-debug-log-session-loop-stall.ndjson`

## Reproduction Steps
1. 在仓库根目录执行 `python3 tests/mock-erp/verify-live-export-replay.py`
2. 观察输出中的 `force_mfa` / `skip_mfa`
3. 当前实际结果：`state=RUNNING`、`stepCount=0`

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `startSession()` 实际抛错或提前返回，但 HTTP 层没有把失败暴露到脚本输出 | High | Low | Rejected |
| B | `cdpExecutor.executeSteps()` 已执行，但结果存 Redis 前被覆盖或写入了错误 key | High | Medium | Rejected |
| C | session-broker 调到的不是当前 worktree 代码，live 脚本仍命中旧服务 | Medium | Medium | Rejected |
| D | `sessions/:id/start` 是异步返回，脚本轮询窗口或条件不足，导致结果尚未来得及落盘 | Medium | Low | Rejected |
| E | 模板/loopDraft 已透传，但 browser worker 初始化或执行阶段卡住，导致 step results 为空 | Medium | Medium | Rejected |
| F | `verify-live-export-replay.py` 创建出来的是空模板，导致 `startSession()` 直接走“无步骤”分支 | High | Low | Confirmed |

## Log Evidence
- `docker logs --tail 120 ops-session-broker` 显示最新两个 session `73daada9-...`、`507f43c8-...` 只有 `Session created` / `Session started`，没有出现 `Executing N steps`。
- 查询模板 `GET http://localhost:3005/templates/6fa8cd10-a08a-4185-af6c-579679cda61c` 返回：
  - `steps_len = 0`
  - `config.executionPlan.templateSteps_len = 0`
  - `has_loopDraft = false`
- 这说明 live 脚本创建出的模板本身为空，`session-broker` 没有机会进入执行分支。

## Verification Conclusion
- 当前 live 失败的直接根因不在 `session-broker` loop runtime，而在 `verify-live-export-replay.py` 的输入模板为空。
- 下一步应修正验证脚本，确保它创建的模板至少包含真实 `templateSteps`，并在需要时显式携带 `loopDraft`。
