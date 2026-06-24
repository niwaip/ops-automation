# Session Broker

`session-broker` 只负责执行控制平面中的资源协调与会话承载，不负责执行状态编排本体。

当前逻辑视图：

- `session`
  - 对外会话生命周期
  - 会话创建、启动、继续、接管相关状态落点
- `runtime-session`
  - 运行时会话实例
  - 会话与实际 worker/browser runtime 的实例绑定
- `allocation`
  - worker / runtime 资源分配
- `lock`
  - 租约、并发控制、互斥
- `freeze`
  - 冻结与恢复控制
- `worker-routing`
  - 面向具体 runtime worker 的适配层
  - 当前由 `execution/cdp.executor.ts` 承接

边界约束：

- `control-plane` 负责执行生命周期推进、审批、接管与人工控制。
- `session-broker` 只负责“会话是否存在、占用什么资源、路由到哪个 runtime”。
- 新增需求应优先落入上述分组，避免继续堆入单个大 service。
