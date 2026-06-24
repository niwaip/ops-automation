# browser-nl-agent

`browser-nl-agent` 是未来独立的自然语言浏览器智能体，用于承接高频页面观察、动作选择与局部重规划循环。

当前只保留最小落点，不启动完整服务。

本目录当前职责：

- 保留未来物理路径
- 固化最小契约
- 明确与 `browser-domain`、`browser-worker`、`control-plane` 的边界

边界原则：

- Agent 内部保留自然语言推理循环
- 浏览器模板、语义规则、录制资产仍归 `browser-domain`
- 浏览器原子执行仍归 `browser-worker`

当前逻辑视图：

- `contracts/`
  - `BrowserNlAgentSession`
  - `BrowserObservationSnapshot`
  - `BrowserAtomicAction`
  - `BrowserNlAgentTurnResult`
- `modules/perception`
  - 目标理解
  - 页面观察归一化
- `modules/action-loop`
  - 动作选择
  - 局部会话记忆
  - 高频交互循环
- `modules/runtime-bridge`
  - 与 `browser-worker` 的运行时桥接
  - 原子结果归一化

边界说明：

- `ai-orchestrator` 只负责决定是否委派给 `browser-nl-agent`
- `browser-nl-agent` 只负责被委派后的高频自然语言交互循环
- `browser-domain` 继续拥有模板、语义、录制和域内 runtime facade 等共享能力
- `control-plane` 只接收阶段状态、阻塞点、最终结果和接管信号
