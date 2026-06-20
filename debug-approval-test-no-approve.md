# Debug Session: approval-test-no-approve

Status: OPEN

## Symptoms

- 测试后的临时 Docker 容器没有关闭，CPU 占用很高。
- 生成的模板“审批案件毛利率自动承认”在测试时没有执行承认操作。

## Scope

- Browser session / runtime cleanup
- Generated template inspection
- Recorder / template execution path

## Hypotheses

1. 测试完成后 browser session 容器没有走到关闭路径，导致 `ops-browser-session-*` 持续累积。
2. 生成模板中并没有真正的承认动作步骤，只有读取、分支或 takeover。
3. 模板包含承认动作，但条件分支没有命中承认分支。
4. 模板命中了承认分支，但运行时 browser phase 异常导致点击未执行。
5. session 清理依赖的 session 查询使用了错误 ID 语义，导致 cleanup 请求失败。

## Evidence Plan

- 统计当前临时 browser session 容器数量与状态。
- 定位“审批案件毛利率自动承认”模板定义与最近测试执行记录。
- 对比模板步骤、执行轨迹、日志中的 branch / click / takeover 证据。
- 检查 session-broker / browser-worker / control-plane 的 cleanup 相关错误日志。

## Progress Log

- 初始化调试会话文件。
- 证据 1：`templates.id = dcd40ed1-b021-4550-a492-b2f57947288e` 的 `steps` 明确包含 5 个步骤，其中第 5 步是 `click`，描述为“案件粗利率大于20%，自动点击承认按钮”。
- 证据 2：真实测试 session `48d161ee-f6c3-469e-83d9-15deb09b39ea` 的 step 结果显示：
  - `step_3 read_value` 成功，读取到 `25.5%`
  - `step_4 branch` 成功，消息为“条件成立，继续执行”
  - `step_5 click` 成功，执行了 `page.locator('text=承認する (Approve)').click()`
- 证据 3：同一 session 的最终页面文本包含 `承認済み` 和 `承認完了：人工承認によりステータスが更新されました`，说明该次测试实际完成了承认。
- 证据 4：最终页面文本同时仍出现“人工介入（承認接管）が必要です”，静态代码排查发现 `tests/mock-erp/app.js` 使用 `takeoverPanel.classList.add("hidden")` 隐藏警告面板，但 `tests/mock-erp/styles.css` 只定义了 `.subview.hidden { display: none; }`，没有通用 `.hidden` 样式，导致警告文案未真正隐藏，容易误判为“没有承认成功”。
- 证据 5：`session-broker` 日志持续出现 `RuntimeSessionService.getById()` 用非 UUID 的 `recorder-...` 字符串查询 `runtime_sessions.id` 的 Prisma 异常。
- 证据 6：`browser-worker` 日志持续每 30 秒执行一次 `Orphan sweep (periodic) checking 14 worker(s)`，与上述 runtime session 查询异常一起，强烈指向 recorder/runtime worker 的孤儿清理链路失效，可能导致临时 browser worker 容器堆积并引发 CPU 飙高。
- 证据 7（埋点复现）：模板测试 session `32da95ae-b0e5-4e48-882f-1c43881af741` 的调试日志显示：
  - `template execution results ready` 中 `branchSuccess=true`、`approveStepId=step_5`、`approveSuccess=true`
  - 随后 `template session completed`
  - 然后依次出现 `releaseWorker start -> deleteWorker start -> deleteWorker container removed -> releaseWorker success`
    说明模板测试链本身可以正确关闭临时 browser worker。
- 证据 8（埋点复现）：直接请求 `/runtime-sessions/recorder-ui-debug-nonuuid-4` 返回 `500`，且调试日志记录 `isUuid=false`。
- 证据 9（运行日志）：`browser-worker` 对 `recorder-ui-debug-nonuuid-4` 的 orphan sweep 输出：
  - `Orphan sweep (periodic) checking 1 worker(s)`
  - `Runtime session lookup for recorder-ui-debug-nonuuid-4 returned status 500, keeping worker`
    说明非 UUID runtime session id 会导致 orphan sweep 保留 worker，不会清理容器。
- 证据 10（修后接口验证）：重建 `session-broker` / `browser-worker` 后，请求 `/runtime-sessions/recorder-ui-debug-postfix-1` 返回 `404 Not Found`，不再出现 Prisma 500。
- 证据 11（修后 startup sweep）：`browser-worker` 启动后日志显示：
  - `Found untracked container ops-browser-session-f5dccba0-83c0-4bb1-b826-04387b338d0c`
  - `Runtime session f5dccba0-83c0-4bb1-b826-04387b338d0c not found (404), worker can be removed`
  - `Removing untracked orphan container ...`
  - `Docker orphan sweep removed 1 untracked container(s)`
    说明服务重启后旧残留 session 容器已能被 startup Docker orphan sweep 清理。
- 证据 12（修后 periodic sweep 闭环）：手动创建绑定非 UUID runtime session `recorder-ui-debug-postfix-2` 的 worker 后，`browser-worker` 日志显示：
  - `Orphan sweep (periodic) checking 1 worker(s)`
  - `Runtime session recorder-ui-debug-postfix-2 not found (404), worker can be removed`
  - `Removing orphan worker b8893557-5292-476c-9960-17f160065ca0 ...`
  - `Orphan sweep (periodic) removed 1 worker(s)`
    且 `/workers` 返回空数组，`docker ps` 中没有残留 `ops-browser-session-*` 容器，说明非 UUID runtime session 场景的 cleanup 已恢复。
- 证据 13（修后 UI 验证）：`http://localhost/styles.css` 已对外提供通用 `.hidden` 规则；使用 Playwright 打开 `http://localhost/#approvals` 验证高毛利率案件详情页时，`takeover-alert-panel` 的 `display` 为 `none`，承认后状态为 `承認済み` 且面板仍保持隐藏，不再出现“承认成功但人工介入告警仍显示”的假象。
- 证据 14（新失败会话）：模板 `案件审批自动处理` 的最新失败会话为 `b3abc4a2-06a0-424d-bd3e-27f28c9b86d7`，状态为 `ERROR`，停在 `step_2`。
- 证据 15（step 结果）：该会话中：
  - `step_1 navigate` 成功，打开的是 `http://192.168.100.143/`
  - `step_2 click` 失败，错误为 `"#project-row-PRJ-2026-001 button" does not match any elements.`
  - `final_state` 文本显示页面仍停留在 Dashboard，而不是案件承认列表
    说明失败不是点击器退化，而是模板起始页面就错了。
- 证据 16（静态根因）：`apps/backend/orchestration/ai-orchestrator/src/modules/browser-command/recorder-debug.service.ts` 中 `findExportStartUrl()` 在没有显式 `navigate` 录制命令时，会回退到 `session.currentPageUrl?.split('#')[0]`，这会把 `http://localhost/#approvals` 截断成根路径，正好与失败会话中的 `step_1 navigate -> http://192.168.100.143/` 完全一致。
- 证据 17（修复与回归）：已将 `findExportStartUrl()` 改为保留完整 `currentPageUrl`，并新增回归测试覆盖“无 navigate 命令时仍保留 SPA hash 路由”的场景；`recorder-debug.service.spec.ts` 定向测试与 `tsc --noEmit` 已通过。

## Hypothesis Status

- H1 容器未走关闭路径：已修正。模板测试链本来就会正常关闭；残留问题来自 orphan sweep 被 500 挡住，修后 startup/periodic sweep 都能删除残留 worker。
- H2 模板里没有承认动作：已否定。模板步骤中存在承认 click，且运行证据显示已执行。
- H3 分支未命中承认：已否定。埋点显示 `branchSuccess=true`，并继续执行 `step_5`。
- H4 命中了承认但运行时没点：已否定。埋点与 Redis step 结果都显示 `approveSuccess=true`。
- H5 查询/清理语义错误导致 cleanup 失败：已修正。非 UUID runtime session id 现在直接返回 `404`，browser-worker 据此清理 worker。
- H6 导出的模板起始 URL 丢失 SPA hash，导致执行一开始就在错误页面：已确认并已修复代码。已生成的坏模板需要重新导出或重新发布后才会带上正确的 `#approvals` 起始页。
