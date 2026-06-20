# Debug Session: approvals-loop-retry

- **Status**: [VERIFIED]
- **Issue**: ReAct mode recorder debug for approvals loop flow previously appeared to fail on detail-page observe/snapshot and to misinterpret "return to list".
- **Debug Server**: `http://127.0.0.1:7777`
- **Log File**: `.dbg/trae-debug-log-approvals-loop-retry.ndjson`

## Reproduction Steps

1. Open `http://192.168.100.143/#approvals`
2. Mark `[循环对象:当前列表]`
3. Mark `[循环开始]` and click the first pending approval row
4. Approve the current detail item
5. Return to approvals list and mark `[循环结束]`

## Hypotheses & Verification

| ID  | Hypothesis                                                                                                     | Likelihood | Effort | Evidence |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------ | -------- |
| A   | Detail-page observe chain fails because `snapshot` is unstable after row detail entry.                         | High       | Med    | Pending  |
| B   | "返回一览页面" is parsed without enough current-page candidate context, so it falls back to wrong `navigate`.  | High       | Med    | Pending  |
| C   | Recorder control tokens are persisted, but not enough structured control hints reach later parse decisions.    | Med        | Low    | Pending  |
| D   | Browser worker session enters a transient unstable state after detail actions; observe/retry would recover it. | Med        | Med    | Pending  |

## Log Evidence

- The previous debug instrumentation could not reach the host debug server from `ops-ai-orchestrator` because it posted to `http://127.0.0.1:7777/event` inside the container namespace.
- Updated `recorder-debug.service.ts` so `reportDebugEvent()` prefers `DEBUG_SERVER_URL` and otherwise uses `host.docker.internal` when running in the Docker compose environment.
- Reproduced the approvals flow with `.dbg/run_approvals_loop_retry.py`.
- Reproduction artifact: `.dbg/approvals-loop-retry-run.json`
- Key evidence from `.dbg/trae-debug-log-approvals-loop-retry.ndjson`:
  - Step 3 parse result: `点击第一条没有承认的数据` -> `click target=e88`
  - Step 4 parse result: `承认数据` -> `click target=e168` with approve locator
  - Step 5 parse result: `返回一览页面` -> `click target=e135` for `一覧に戻る`
  - All execution results in this run were successful, including the post-click observe calls.
- Final session evidence:
  - `loopDraft.target.scope=current_list`
  - `loopDraft.eachIteration.stepCount=3`
  - Final list observation shows `PRJ-2026-001` changed from `保留中` to `承認済み`

## Verification Conclusion

- Hypothesis A: not reproduced in the latest run; detail-page observe/snapshot stayed stable.
- Hypothesis B: not reproduced in the latest run; "返回一览页面" correctly mapped to `一覧に戻る`.
- Hypothesis C: supported; control tokens persisted and were sufficient for correct parse/execution in this run.
- Hypothesis D: possible contributor to the earlier transient failure, but no retry-specific repair was required once the flow was replayed with current code and fresh evidence.
- Current conclusion: the approvals loop path now executes successfully end-to-end in recorder debug for the tested scenario.
