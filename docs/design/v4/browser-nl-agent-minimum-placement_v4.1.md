# browser-nl-agent 最小落点设计 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch E2`，用于明确未来 `browser-nl-agent` 与 `browser-domain`、`browser-worker`、`control-plane` 的边界，避免再次回流到 `ai-orchestrator/modules/browser`。

## 1. 目标

- 为未来自然语言浏览器智能体预留独立落点。
- 明确什么属于 Agent 内部高频循环。
- 明确什么应复用 `browser-domain` 共享能力。
- 明确什么必须下沉到 `browser-worker` 的原子执行。

## 2. 目标路径

当前最小落点定义为：

```text
apps/backend/intelligence/browser-nl-agent/
├── README.md
└── src/
    └── contracts/
        └── browser-nl-agent.types.ts
```

本批次当前状态：

- 已具备最小服务骨架：
  - `README.md`
  - `package.json`
  - `src/app.module.ts`
  - `src/index.ts`
  - `src/modules/perception`
  - `src/modules/action-loop`
  - `src/modules/runtime-bridge`
- 本批次重点仍然是固定最小落点与三层边界，不是启动完整独立部署链路

## 3. 三层边界

### 3.1 属于 Agent 内部高频循环

这些能力应保留在 `browser-nl-agent` 自身：

- 自然语言目标理解
- 多轮页面观察后的动作选择
- 局部 ReAct / reasoning loop
- 基于上下文的短期记忆与动作修正
- 对失败步骤进行局部重规划

结论：

- 这些逻辑不应继续堆入 `ai-orchestrator/modules/browser/intent/*`

### 3.2 属于 Browser Domain 共享能力

这些能力应抽象为可复用共享能力，而不是只服务于某一个 Agent：

- 浏览器模板与录制资产
- 浏览器语义规则与页面规则集
- 页面观察模型
- 导出脚本/模板的领域映射
- 浏览器域内部的 runtime facade

结论：

- `browser-nl-agent` 可以消费这些共享能力
- 但不应把领域资产所有权拿到 Agent 服务内部

### 3.3 属于 Runtime 原子执行

这些能力应继续落在 `browser-worker`：

- 初始化浏览器会话
- 执行原子命令
- 获取页面状态
- 页面断言
- 冻结/恢复浏览器控制
- 截图、产物导出、原子结果回传

结论：

- `browser-nl-agent` 不应直接内嵌 Playwright/CDP 执行器
- 与浏览器运行时的交互应通过 runtime bridge 完成

## 4. 与现有模块的关系

### 与 `ai-orchestrator`

- `ai-orchestrator` 负责决定是否委派给 `browser-nl-agent`
- `browser-nl-agent` 负责被委派后的高频交互循环
- 未来不应把自然语言浏览器动作主循环继续放在 `ai-orchestrator/modules/browser`

### 与 `browser-domain`

- `browser-domain` 提供模板、语义、录制、runtime facade 等共享能力
- `browser-nl-agent` 只消费共享能力，不拥有其设计时资产

### 与 `control-plane`

- `control-plane` 只接收阶段状态、阻塞点、最终结果和接管信号
- `browser-nl-agent` 不负责审批策略与人工接管制度本身
- 后续接入控制面时，应优先复用共享合同包 `@ops/backend-agent-execution-protocol`
- 不在本批次直接耦合控制面私有请求/响应 DTO

## 5. 最小契约建议

建议保留以下最小对象：

- `BrowserNlAgentSession`
- `BrowserObservationSnapshot`
- `BrowserAtomicAction`
- `BrowserNlAgentTurnResult`

它们分别对应：

- Agent 自身会话与短期上下文
- 每轮推理依赖的页面观察快照
- 发给 `browser-worker` 的原子动作描述
- 每轮执行后的结构化结果与状态回报

## 6. 本批次结论

`Batch E2` 的结论是：

- `browser-nl-agent` 的目标路径已明确，且已具备最小服务骨架
- Agent 内部高频循环、Browser Domain 共享能力、Runtime 原子执行三层边界已明确
- 与 `control-plane` 的未来接入应走共享 `agent-execution-protocol`
- 共享协议与本地领域契约的字段归属，已在 `specialized-agent-execution-protocol-boundary_v4.1.md` 中进一步明确
- 共享协议的实例载荷示例，已在 `specialized-agent-execution-protocol-examples_v4.1.md` 中进一步明确
- 后续新增自然语言浏览器能力时，不应再默认落到 `ai-orchestrator/modules/browser`
