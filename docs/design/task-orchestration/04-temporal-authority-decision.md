# Temporal 顶层执行权评估

> 状态：ADR Accepted（2026-08-24）  
> 决策：P0–P2 保持 Control Plane 为 Frozen Plan 顶层权威；Temporal 仅作为精确 Capability Runtime，不在本阶段接管顶层 DAG。

## 决策背景

系统已经具有冻结 Plan Hash、Step Lease、Outbox、审批、等待输入、SSE 事件和版本保留语义。
直接把顶层权威迁入 Temporal 会同时存在两份状态机，并迫使审批、Result Ref、调度和恢复协议一次性重写，
不符合企业工作流对灰度、回滚和历史执行复现的要求。

## 当前边界

- Control Plane：Execution、Frozen Plan、审批、Ready Set、Lease、Outbox 和最终结果的唯一权威。
- Temporal：只执行被冻结节点明确指定的 Workflow Type/Version；返回标准 Runtime Result。
- Runtime Adapter：隐藏 Temporal/HTTP/Browser 等运行时差异，不反向修改 Frozen Plan。
- Temporal Retry 不得替代业务幂等；副作用仍使用 Execution/Step Idempotency Key。

## 重新评估门槛

只有同时满足以下条件才启动顶层迁移 PoC：

1. Dispatcher 恢复或 Lease 维护成本连续两个季度成为主要故障来源。
2. 已定义 Execution/Step/Event 与 Temporal History 的双向、版本化映射。
3. 审批、等待输入、取消和人工接管可通过 Signal/Update 重放，且 Golden Test 等价。
4. 旧 Frozen Plan 可在原 Control Plane 路径继续恢复至少一个保留周期。
5. Shadow 运行不少于 1,000 个无副作用执行，状态与结果等价率不低于 99.9%。
6. 回滚不依赖修改已启动 Workflow History。

## PoC 验收（未来）

- 同一计划分别由 Control Plane 和 Temporal Shadow 执行，节点顺序、输入投影、合同结果一致。
- Worker 升级、宕机、Signal 重放和 Continue-As-New 不产生 Non-Determinism。
- Temporal 不可用时新执行 fail closed；既有 Control Plane 执行仍可恢复。
- 迁移后数据库仍保留可查询的 Execution Read Model，而不是要求业务系统读取 Temporal 内部历史。
