# Backend Runtime Layer

运行时层（Runtime Layer）包含所有的物理执行器与 Worker，负责在底层硬件/环境上执行具体动作，对上层策略与业务实现细节完全无感知。

## 典型职责

- **浏览器执行器 (Browser Worker)**：操控 Chrome 容器、无头 Playwright 操作、录制与重放的执行基建。
- **回放运行时 (Replay Worker)**：CDP 通信底层接管、步骤级回放驱动与诊断。
- **沙箱执行器 (Sandbox Agent)**：支持多语言的安全隔离 Python / Docker 沙箱，执行未受信任的代码片段。

## 依赖原则

- **单向依赖**：仅允许依赖上层的接口契约（contracts）与 `shared/*`，不能反向 import 业务域的实现逻辑。
- 运行时环境应当与源码保持绝对的数据隔离，所有的磁盘读写只允许落入全局 `/app/var` 目录下。
