# Recorder Debug ownership split

当前 `execute/` 目录仍是浏览器录制调试的过渡编排层，但逻辑上已经可以拆成以下几类：

## recorder

- `recorder-debug.service.ts`
- `recorder-debug-chat-flow.service.ts`
- `recorder-debug-chat-execution.service.ts`
- `recorder-debug-chat-support.service.ts`
- `recorder-debug-execution.service.ts`
- `recorder-debug-response.service.ts`
- `recorder-debug-branch.facade.ts`

负责录制调试主链路、聊天流转、执行编排、条件分支与回复组装。

## observation

- `recorder-debug-observation.facade.ts`

负责页面观察摘要、页面类型推断、页面描述等观察语义封装。

## session

- `recorder-debug-session.facade.ts`

负责会话装载、浏览器准备、观察同步、会话刷新与 loop draft 生命周期。

## 其他保留

- `execution-reconcile.service.ts`
- `browser-execution-controller.service.ts`
- `recorder-debug.types.ts`

这些仍作为执行桥接与共享类型保留在 `execute` 根层。

## 后续方向

- `export` 已在 `../export` 独立成域。
- 高频自然语言动作决策后续可继续从 `recorder` 外移到 `browser-nl-agent`。
