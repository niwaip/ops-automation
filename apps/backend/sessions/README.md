# Backend Sessions Layer

会话层（Sessions Layer）负责统一管理浏览器会话与运行时资源的生命周期，是控制平面与物理执行层之间的桥梁。

## 典型职责

- **会话网关 (Session Broker)**：执行会话的申请、创建、续租、续期与过期销毁。
- **运行时分配 (Allocation)**：基于负载及心跳机制，实现 Worker 与 Session 的一对一绑定与路由分发。
- **并发与状态锁 (Session Lock & Recovery)**：分布式锁控制、断线重连、会话状态冻结与历史恢复。

## 依赖原则

- 允许依赖 `platform/*` 进行鉴权及策略校验，允许依赖 `shared/*`。
- 禁止直接引用具体业务逻辑服务 (`domain/*`) 或执行器内部的具体操作逻辑。
