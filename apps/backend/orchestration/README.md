# Backend Orchestration Layer

编排层（Orchestration Layer）是系统的“大脑”，负责把复杂的 AI 智能体决策、工作流驱动与业务领域进行联调拼装，实现场景化自动化流的控制。

## 典型职责

*   **接入控制台 (Control Plane)**：路由协调分发、审计代理、MCP 外部协议对接与通知分发。
*   **AI 协调器 (AI Orchestrator)**：LLM 复杂规划、Prompt 模板加载、决策选择、异常自愈。
*   **工作流引擎 (Workflow Orchestrator)**：基于 Temporal 工作流实现的高可靠异步编排逻辑。

## 依赖原则

*   可以广泛依赖下层服务，包括 `domain/*` (业务实体数据)、`sessions/*` (会话分配)、`platform/*` (认证开关) 以及 `shared/*`。
*   不应反向把核心编排逻辑下沉到 runtime，只输出执行契约（contracts）。
