# Frontend 修改后复审

> 本文保留第二轮复审证据。代码再次修改后，请以[第三轮复审](/Users/chain/Documents/MyProject/ops-automation/docs/audits/frontend-code-reaudit-round3-2026-10-06.md)为当前结论；下文行号和断言对应第二轮状态。

日期：2026-10-06（Asia/Shanghai）。基线：`613e1b70` 的当前工作区，包含用户已有未提交修改。

本轮围绕首次审计的 5 项问题检查修复和回归，并追踪停止操作的后端消费者。代码图的部分行号已落后于修改后的源码，因此图谱用于发现符号和调用链，本文证据行号均根据当前磁盘文件核对。本次仅新增复审报告与隔离脚本，并给旧报告加上历史状态提示；未修改业务代码或操作容器。

## 结论

仍有 6 项可操作问题：3 项 P1、3 项 P2。外部图片令牌泄露和已启动流的取消元数据串线已修复；HTML 新窗口、停止操作、转后台和源码加载仍不能验收通过。

| 上轮问题 | 当前状态 | 依据 |
| --- | --- | --- |
| F1：HTML 同源脚本风险 | 部分修复 | 两个 iframe 移除了 allow-same-origin，图片标题改用 DOM API；新窗口外层 script 插值可被突破，见 R1 |
| F2：外部图片获登录令牌 | 已修复 | 校验 URL origin 和 pathname，外域与协议相对 URL 不附加令牌；现有用例与独立调用均通过 |
| F3：跨会话误停止 | 部分修复 | 不再从前端直接取消其他会话的 executionId，但后端停止接口忽略 sessionId，见 R2；等待令牌阶段也有遗漏，见 R3 |
| F4：并发流元数据串线 | 部分修复 | 已启动流取消时使用各自 executionId，停止 A 后 B 的 HTTP 500 正确分类为 failed；后台目标仍串线，见 R4，运行状态展示见 R5 |
| F5：HTML 源码无限重试 | 未完成 | 新增错误状态和重试按钮，但请求因自身 loading 状态改变而被 cleanup 中止，形成新的重试循环，见 R6 |

以上“已修复”仅对应说明中的验证场景，不代表所有产物和任务链路都已通过真实浏览器与容器端到端测试。

## R1 [P1]：新窗口把生成 HTML 插入外层 script，仍可执行同源脚本

位置：[HtmlPreviewBlock.tsx:348](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:348)。

新窗口将 `JSON.stringify(repairedHtml)` 直接插入外层 `<script>` 的 JavaScript 字符串：

```typescript
frame.srcdoc = ${JSON.stringify(repairedHtml)};
```

JSON 编码不会转义 `<` 或 `</script>`。HTML 解析先于 JavaScript 字符串解析，输入中的第一个 `</script>` 会提前终止容器的脚本，后续 `<script>` 就成为容器顶层脚本，绕过内层 iframe sandbox。正常包含脚本的 HTML 也会截断外层脚本，造成预览错误。

本轮调用当前组件的“新窗口”回调，捕获生成 Blob 的 HTML，使用以下无害产物：

```html
<!DOCTYPE html><html><body>
<script>globalThis.AUDIT_ESCAPE = true;</script>
<script>globalThis.AUDIT_TOP_LEVEL = true;</script>
</body></html>
```

输出中第二个脚本被提取为独立的顶层 script，其执行设置 `AUDIT_TOP_LEVEL: true`。这证明外层生成文档包含未经隔离的脚本，而不是仅验证 iframe 权限字符串。该 Blob 由应用源创建，`noopener` 断开 opener 并不把文档移到独立源，也不能阻止其读取本源 localStorage。本次没有打开真实应用账号页面或读取真实令牌。

建议：把产物传给 sandbox 时避免将其嵌入 HTML script 文本，或将 JSON 中所有 `<` 编码为 `\\u003c` 后再嵌入。对独立窗口的完整 HTML 解析结果添加回归验证，覆盖大小写不同的 `</script>`、多个 script 和脚本内字符串。仅检查 allow-same-origin 已移除不够。

## R2 [P1]：停止接口按用户杀进程，前端 sessionId 隔离没有贯通

位置：[无匹配流时仍提交 stop](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:367)、[有匹配流时提交 stop](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:390)。

前端仍向 `/ai/chat/stop` 发送 `{ sessionId }`，但 [ChatController.stopChat](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat.controller.ts:451) 完全不使用 body.sessionId，只根据认证用户调用 `stopPersonalSandbox(userId)`。[dispatcher](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:164) 请求 `/user-sandboxes/:userId/stop-exec`；[broker](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox.controller.ts:275) 继续按 userId 查找沙箱；最终 [harness](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:336) 执行 `pkill -9 -f dsh`，没有会话或运行实例过滤。

因此，同一用户在 A 会话有个人沙箱任务执行时，停止 B 或另一个会话的请求仍可能终止 A 的进程。页面新增 isCurrentSessionStreaming 降低了某些无流会话触发入口的可见性，但不改变后端停止协议的作用范围；同一会话多个前端流的 Map 也不能让这个接口按流停止。

独立调用当前 controller 方法体，传 `{ sessionId: 'B' }`，下游只收到：

```json
[["FAKE_USER"]]
```

未执行真实 pkill。结论由 controller 动态调用及下游停止命令的当前源码共同支持。上轮隔离用例把 post 当作无副作用 mock，没有暴露这个跨服务缺口，本轮补充了消费者追踪。

建议：无目标活跃记录时先避免发送用户范围的停止命令；正式停止协议贯通经过授权的 sessionId/runId，并将运行记录映射到对应进程。若沙箱设计只允许用户级停止，前端必须把这个范围明确表达出来，不能把它作为“停止当前会话”的实现。

## R3 [P1]：等待令牌时停止，令牌返回后仍启动新任务请求

位置：[占位 abort](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:213)、[令牌返回后直接创建流](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:126)。

修复提前将 streamRecord 放入 Map，但初始化的 abort 是空函数。用户在 `ensureFreshAccessToken()` 等待期间点击停止，只会设置 isUserAborted 并执行空 abort。令牌到达后没有检查该标志，直接调用 `chatApi.stream`，把真实 abort 句柄安装到已经被用户停止的记录上。此时之前的停止请求已发送，未来才创建的新任务没有相应取消动作。

复现：令牌 Promise 保持 pending，启动 A；停止 A；释放令牌。观察到 stop 之后 stream 调用从 0 增为 1，真实流 abort 次数为 0。流正常完成时走成功分支，也不会因为 isUserAborted 被提前设置而自动阻止任务启动。

建议：令牌返回后、创建流之前检查记录的取消状态；在整个请求生命周期建立真实可取消句柄。转后台发生在等待令牌阶段时也应纳入测试，而不是只验证已获得流句柄的场景。

## R4 [P2]：转后台仍可能选择另一个会话或关联错误执行单

位置：[页面回调依赖](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/pages/ChatPage.tsx:287)、[无匹配目标时跨会话 fallback](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:411)、[执行 ID fallback](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:415)。

页面现在传入 selectedSessionId，但 `handleRunInBackgroundModeAware` 的 useCallback 依赖没有包含 selectedSessionId。在 chatMode、toast 和后台处理函数不变时切换会话，回调继续捕获旧会话 ID。A、B 都有活跃流时，点击 B 的后台按钮可能处理 A。

hook 自身也没有严格保留目标边界：显式目标 B 无匹配记录时，会选择 Map 中的第一个记录 A；目标记录尚无 executionId 时，还会使用全局 activeExecutionIdRef，可能把其他流的执行 ID 注册到后台记录上。

验证结果：

```text
BACKGROUND_CALLBACK_AFTER_SWITCH_TO_B_TARGETS A
BACKGROUND_B_ACTUALLY_BACKGROUNDS_A A
```

第一条从当前页面源码抽取回调，通过保留 useCallback 依赖缓存的模型复现旧闭包；第二条调用实际 hook，确认 A 的 abort 被调用一次，后台管理器登记 sessionId A。Lint 也报告该回调缺少 selectedSessionId 依赖。

建议：页面补全依赖或使用 selectedSessionIdRef.current；显式指定目标时禁止跨会话 fallback；executionId 必须来自目标记录。回归测试需让 A、B 的流真实存在并交错执行。

## R5 [P2]：当前会话运行状态的 useMemo 缓存落后于 Map

位置：[ChatPage.tsx:157](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/pages/ChatPage.tsx:157)、[记录增删](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:221)、[稳定的状态读取函数](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:486)。

isCurrentSessionStreaming 的 useMemo 只依赖 selectedSessionId、稳定的 isSessionStreaming 函数和全局布尔 isStreaming。Map 放在 ref 中；任意流增删并不一定改变这三个依赖。

场景：A 仍运行，全局 isStreaming 已是 true。用户选择 B，此时 B 无流，memo 缓存 false；发送 B 后全局仍是 true、所选会话和读取函数也没变，所以即使页面因消息变化重新渲染，memo 仍返回 false。B 实际运行但输入框显示可发送，停止按钮状态和历史轮询开关也会错误。反过来，B 结束而 A 仍运行时，缓存的 true 也可能持续禁用 B 的输入。

对当前页面声明使用保留 useMemo 缓存的模型，得到：

```json
{"actual":true,"displayed":false}
```

建议：把活跃会话集合、每会话计数或版本号放进 React 可响应状态，流开始和结束均更新；然后按会话派生运行状态。只移除 useMemo 可以避免重渲染时读到旧缓存，但仍需保证记录变化能触发页面更新。

## R6 [P2]：源码 fetch 被自身 effect cleanup 取消并持续重启

位置：[设置 loading 并创建请求](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:65)、[cleanup 与依赖](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:85)。

新增 effect 的依赖仍包含 isFetchingCode。第一次运行调用 setIsFetchingCode(true) 并启动 fetch；loading 状态引发下一次渲染，依赖变化触发上一次 cleanup，它立刻 abort 刚创建的请求。AbortError 被忽略，finally 又设为 false，重新满足请求条件并再次请求。它通常在响应到达前就被中断，新增错误提示和手动重试按钮无法处理这个路径。

本轮的轻量 hooks 模型与上轮不同，保留 effect 依赖、cleanup 和 useMemo/useCallback 缓存。模拟延迟响应并按 loading 变化渲染，4 个周期观察到：

```json
{"requests":4,"aborted":4}
```

没有向真实资源发出请求。此证据验证的是当前 effect 的状态转换和清理顺序，不是完整 React DOM 调度。

建议：请求 effect 仅由资源标识、tab、inline code 和显式重试标识驱动，loading/error/result 作为输出状态；资源变更或卸载时才取消旧请求，并用请求版本防止旧 finally 覆盖新请求状态。添加挂载后的真实 effects 测试，验证正常延迟响应、404、主动重试、URL 切换和卸载。

## 验证

命令均从仓库根目录执行，没有启动、停止或重启 Docker 服务。

| 检查 | 当前结果 |
| --- | --- |
| portal / user-web typecheck | 均通过 |
| portal test | 7 个文件、23 个测试通过 |
| user-web test | 18 个文件、121 个测试通过 |
| portal lint | 0 error、535 warning |
| user-web lint | 0 error、468 warning |
| portal check:user-route-policy | 通过 |
| 独立复审脚本 | 已修场景和剩余缺陷证据断言全部通过 |

新增的 [FrontendAuditFixes.test.tsx](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/components/FrontendAuditFixes.test.tsx:69) 共 6 个测试：1 个 inline sandbox 字符串检查、4 个令牌 URL 场景、1 个没有实际运行任何流的停止检查。它没有验证新窗口回调、等待令牌时停止、真实并发流、转后台、会话切换或 fetch effect。`renderToStaticMarkup` 不执行 effects，也不执行点击回调，因此无法证明 F1/F3/F4/F5 全部修复。

两次 Vitest 都有开发 HMR WebSocket `EPERM`，但测试进程正常退出 0；保留前轮的 antd 弃用与 Node localStorage 警告。没有生产构建、真实账号登录、真实沙箱执行或真实浏览器安全测试。

复现命令：

```bash
node docs/audits/scripts/frontend-reaudit-repro-2026-10-06.cjs
```

[复审脚本](/Users/chain/Documents/MyProject/ops-automation/docs/audits/scripts/frontend-reaudit-repro-2026-10-06.cjs) 现场转译当前源码；假令牌、网络、流和后台管理器均被替换。它保留 hooks 依赖比较与 cleanup 顺序，并提取页面 memo/callback 和后端 stop 方法体验证边界。新窗口证据检查生成文档的 script 文本边界并在隔离 VM 运行无害顶层标记。它不替代真实浏览器、React DOM 或后端进程级端到端验证。

修复顺序建议：先处理 R1 的脚本隔离和 R2/R3 的停止协议，再处理 R4/R5 的会话状态，最后修复 R6 的请求生命周期；对应测试应覆盖实际事件和异步状态变化。
