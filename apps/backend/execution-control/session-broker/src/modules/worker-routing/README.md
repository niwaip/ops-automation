# worker-routing

该目录是 `session-broker` 的逻辑分组入口，用于承接“会话如何路由到具体 runtime worker”的适配职责。

当前暂由既有的 `execution/cdp.executor.ts` 提供实现，但未来语义应收敛为：

- `session`：会话状态与对外生命周期
- `runtime-session`：运行时会话实例
- `allocation`：资源/worker 分配
- `lock`：租约与并发控制
- `freeze`：冻结与恢复控制
- `worker-routing`：把 session/runtime-session 路由到具体 worker 的适配层

约束：

- 这里只能放 runtime 适配与路由，不承担执行编排、审批、接管决策。
- 不应继续向该分组堆叠新的 control-plane 逻辑。
