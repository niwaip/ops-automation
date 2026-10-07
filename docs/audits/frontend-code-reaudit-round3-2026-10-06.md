# Frontend 第三轮复审

> 本文保留第三轮复审证据。本轮发现的 5 项问题（T1 - T5）已全部完成落地修复并通过隔离复现脚本 [frontend-reaudit-round3-verify-2026-10-06.cjs](/Users/chain/Documents/MyProject/ops-automation/docs/audits/scripts/frontend-reaudit-round3-verify-2026-10-06.cjs) 与各模块单元测试全量验证。下文行号和断言对应第三轮复审初始状态。

日期：2026-10-06（Asia/Shanghai）。基线：`613e1b70` 的当前工作区，包含用户已有未提交修改。本轮围绕第二轮 6 项结论检查新修复，并追踪涉及的后端停止、沙箱排队和产物文件服务。

代码图用于发现符号和调用关系；因索引行号落后于工作区，证据行号按当前磁盘文件核对。本轮只新增报告与隔离证据脚本、更新历史报告提示，没有修改业务代码或操作容器。

## 结论

确认仍有 **5 项问题：2 项 P1、3 项 P2**。若干原问题的最小场景已经修复，但同一能力的其他入口与并发状态仍有缺口。

| 第二轮问题 | 本轮核对结果 |
| --- | --- |
| R1：script 字符串突破 sandbox | inline code 分支已修复，编码后的容器只有一个外层 script，执行后 srcdoc 与原产物一致；URL 分支仍直接导航，见 T1 |
| R2：用户范围停止误杀其他会话 | controller 已传 sessionId，前端无匹配记录时不再发 stop；后端 Map 与 Broker 的实际执行所有权仍不一致，见 T2 |
| R3：等待令牌时停止仍启动请求 | 已修复：释放令牌后 stream 调用为 0；等待令牌时转后台出现另一条任务丢失路径，见 T4 |
| R4：后台目标串线 | 页面的 selectedSessionId 依赖和无匹配会话 fallback 已修复；全局 executionId 回退仍可串线，见 T3 |
| R5：当前会话 memo 缓存落后 | 已修复：使用可响应的 streamingSessionIds，B 开始/结束时在 A 仍运行的情况下分别显示 true/false |
| R6：fetch 因 loading 改变自取消 | 已修复：延迟响应时请求没有因 loading 重渲染而 abort；404 后切换 URL 会卡住，见 T5 |

“已修复”只对应表中具体场景。没有真实浏览器、真实任务或进程级端到端验收。

## T1 [P1]：URL 产物的新窗口仍绕过 sandbox

位置：[HtmlPreviewBlock.tsx:342](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:342)。

组件收到 srcUrl 时先执行 `window.open(normalizedSrcUrl, '_blank', 'noopener,noreferrer')` 并 return，不会进入刚修复的 sandbox 容器分支。这个入口实际由 [TaskOutcomeCard](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/TaskOutcomeCard.tsx:685) 的 HTML artifact 调用。

`normalizeArtifactUrl` 把 `/renders/...` 产物转换到同源 `/api/renders/...`；[user-web 代理](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/vite.config.ts:244) 和 [portal 代理](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/vite.config.ts:331) 将其转发到文档引擎。[文档服务](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/main.ts:28) 直接用 express.static 挂载 renders，没有为这个文件服务设置 sandbox CSP 或强制下载头。HTML 在新标签页执行时仍处于应用源；noopener 隔离 opener，不隔离同源 localStorage。

当前回调的隔离调用确认打开的是：

```text
/api/renders/FAKE_UNTRUSTED.html
```

没有创建 sandbox Blob 包装。对于包含不可信脚本的同源 HTML 产物，登录令牌读取风险仍存在。这一结论适用于仓库默认的文件服务与开发代理；额外部署的安全响应头没有实际测量，不能据此声称线上攻击已经发生。

另外核对了 workspace-files 文件服务：它已经设置 attachment 和 sandbox CSP，不能把它与 renders 一概视为相同风险。本项指向缺少响应头隔离的 renders 路径。

建议：URL 与 inline code 的“新窗口”统一使用受控 sandbox 容器，或把产物放到无应用凭据的独立 origin。若依赖文件响应 CSP，应同时覆盖 renders 所有别名并验证实际响应头。增加通过 srcUrl 打开的浏览器安全用例。

## T2 [P1]：单用户 Map 不代表正在执行的任务，取消/断连仍可能误杀

位置：[按用户覆盖登记](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:357)、[停止过滤与清理](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:170)、[Broker 的断连处理](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox.controller.ts:193)。

新 Map 每个 userId 只能保存一条记录，登记发生在请求 Broker 之前。Broker 才在 [runHarness](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:278) 获取用户执行锁：A 可以仍在执行，B 已在等待锁，但 B 会提前覆盖 A 的记录。

这时停止 A 会被 Map 判为“当前记录属于 B”而拒绝；停止排队的 B 则通过过滤，调用用户范围的 stop-exec，仍由 [harness](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:336) 执行 `pkill -9 -f dsh`，可能终止真正运行的 A。

另有三个缺口：

- Map 没有记录时，带 sessionId 的 stop 仍继续调用用户范围停止，校验是 fail-open。
- stop 的 finally 无条件按 userId 删除记录；等待 stop-exec 返回期间如果 B 被登记，A 的 finally 会删除 B。
- Broker 的流连接 close 回调不检查 sessionId、runId 或是否已获得锁，直接按 userId stopSandboxExecution。取消排队请求的 HTTP 连接也可能终止 A，绕过 dispatcher 新加的过滤。

用当前源码提取的登记语句和 stop 方法体，登记 A 再登记 B，得到：

```json
{"stopRunningAAllowed":false,"stopQueuedBCallsUserWideKill":true}
```

另外断言了无记录 stop 仍调用停止、旧 stop finally 删除新 B。调用当前 Broker runHarnessStream 方法体，让 B 的 runHarness 保持 pending，再触发 close，下游收到的停止参数仍只有：

```json
[["FAKE_USER"]]
```

所有停止请求和进程执行均被 mock，没有执行真实 pkill。

建议：由真正持有执行锁的层维护 runId 到进程的所有权，排队取消只移除对应队列项；close、timeout 和显式 stop 都贯通同一个经过授权的 runId。没有可信匹配记录时应拒绝用户范围停止，清理时按记录身份比较而不是无条件删除 userId。只在 dispatcher 增加最新请求 Map 不足以实现并发隔离。

## T3 [P2]：B 转后台仍可关联 A 的 executionId

位置：[后台 executionId 回退](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:445)、[任意流更新全局 ID](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:151)。

修复用 `activeSessionIdRef.current === targetRecord.sessionId` 限制全局 fallback，但 activeSessionIdRef 记录最近启动的请求，activeExecutionIdRef 则被任意流事件覆盖，两者不是同一个记录。

复现：先启动 A，再启动 B；B 暂无 executionId；让 A 发出 execution-A；调用 handleRunInBackground('B')。B 的流被转后台，但后台管理器收到：

```json
{"sessionId":"B","executionId":"execution-A"}
```

它会轮询 A 的执行单，并将 A 的终态写到 B 的助手消息。即使 sessionId 精确匹配，也不能使这两个全局 refs 成为安全 fallback。[工作流登记](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:253) 也保留相同全局 ID 回退，应一并去除。

建议：只读取目标 streamRecord.executionId；尚无 ID 时等待执行启动，或采用带消息/轮次身份的会话轮询协议，不能借用另一条流的 ID。测试 A/B 交错事件，覆盖 B 尚无执行 ID 的场景。

## T4 [P2]：等待令牌时转后台，实际请求没有启动但仍展示运行

位置：[占位 abort 设置取消](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:229)、[转后台调用 abort](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:462)、[令牌返回后提前结束](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:127)。

未获取令牌时，记录的 abort 只会设置 isUserAborted。转后台先设 isRunInBackground，再调用这个占位 abort，同时注册后台任务并将消息标为 running。令牌返回后，startAssistantStream 因取消标志抛 AbortError；外层 catch 又因后台标志直接 return。任务既没有发到后端，也没有恢复启动，但后台条目与“正在运行”消息已经存在。

隔离用例输出：

```json
{"requests":0,"backgroundTasks":1,"shownRunning":true}
```

若后台条目走会话历史轮询，[BackgroundTaskManager](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/lib/backgroundTaskManager.ts:78) 当前只检查最后一条助手回复，并不核对轮次身份；因此还可能把旧回复作为这个未启动任务的完成结果。此后续分支本轮只核对源码，没有执行完整轮询集成测试。

建议：未启动时拒绝转后台并解释状态，或让请求继续启动后再把读流/通知管理转给后台；“停止”与“转后台”需要不同生命周期状态。只有后端确认创建了目标任务后，才能注册可轮询的后台身份并提示运行。

## T5 [P2]：源码加载 404 后切换 URL，错误被清除但新 URL 不加载

位置：[URL 变化重置状态](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:60)、[错误条件与 effect 依赖](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:67)。

loading 已从 effect 依赖中移除，自取消循环已消失。但 fetchCodeError 仍参与 effect 的条件判断，却没有进入依赖，也没有按 URL 保存。

复现：保持同一组件实例，查看 A.html 源码，返回 404。把 srcUrl 改为 B.html。在这一渲染中，重置 effect 排队清除旧错误，而加载 effect 的闭包仍看到 A 的错误和 fetchTrigger 0，因此 return。下次渲染错误已清除，但 activeTab、code、URL、fetchedCode、fetchTrigger 都没有继续变化，加载 effect 不再运行。用户看不到旧错误，也没有重试按钮，新的源码请求从未发出。

输出：

```json
{"newUrlRequests":0,"displayedError":null}
```

建议：将资源标识、结果和错误关联到同一个请求状态；新 URL 应独立触发请求，不受旧资源错误阻止。不要只通过忽略依赖告警解决生命周期问题。增加 A 失败后切换 B、手动重试后切换、tab 切换和卸载等挂载 effects 测试。

## 验证与局限

| 检查 | 结果 |
| --- | --- |
| portal / user-web typecheck | 均通过 |
| user-web test | 18 个文件、121 个测试通过 |
| portal test | 7 个文件、23 个测试通过 |
| portal lint | 0 error、535 warning |
| user-web lint | 0 error、466 warning |
| portal check:user-route-policy | 通过 |
| ai-orchestrator typecheck | 未通过：9 条 TypeScript 错误 |
| 第三轮隔离脚本 | 已修场景和剩余问题的证据断言均通过 |

新增修复测试仍为 6 个，主要是静态 iframe 权限、图片 URL 与无活跃流停止；没有覆盖本文的排队断连、交错执行事件、转后台等待令牌或错误后更换 URL。

ai-orchestrator 的错误包括 BrowserCommand 未声明、RecorderDebugObservation 缺少 pageTitle，以及 document-prober 的可能 undefined。报错位置不在本轮修改的 chat.controller / user-sandbox-dispatcher 中，但没有干净基线对照，因此不把它们归因为或排除为本次修复引入。该服务的全量类型验证不能标记为通过。

所有命令从根目录执行。两端 Vitest 仍打印开发 HMR WebSocket `EPERM`，但测试退出码为 0；这不验证开发服务启动。没有执行生产构建、真实账号访问、后端容器重启或真实沙箱任务，不能确认运行中的服务已加载用户修改。

复现命令：

```bash
node docs/audits/scripts/frontend-reaudit-round3-repro-2026-10-06.cjs
```

[第三轮证据脚本](/Users/chain/Documents/MyProject/ops-automation/docs/audits/scripts/frontend-reaudit-round3-repro-2026-10-06.cjs) 复用第二轮脚本的工具定义，跳过历史断言，再现场转译当前源码。它保留 hooks 的依赖缓存、清理顺序与状态，用假流、假令牌、假 Broker 请求验证；提取后端当前方法体和登记语句。没有网络、真实浏览器或进程终止操作。完整 React DOM 调度、浏览器源策略和真实进程所有权仍需端到端回归验证。

建议先完成 T1 产物的所有呈现入口和 T2 执行所有权协议，再处理 T3/T4 后台生命周期和 T5 资源加载状态。
