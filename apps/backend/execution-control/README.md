# Execution-Control Plane

`apps/backend/execution-control` 是执行生命周期推进、审批接管、运行时调度与会话资源协调的目标平面根目录。

## 当前负责

- Execution 生命周期推进
- 审批、接管、输入提交与输入补全
- 南向 runtime 调度
- 会话、租约、锁、资源分配与路由

## 当前子平面

- `control-plane`
  - 执行生命周期、审批接管、输入补全与 runtime 分发
- `session-broker`
  - 会话状态、资源分配、租约锁、冻结控制与 runtime-session 协调

## 当前迁移原则

- 新的执行控制逻辑应优先按 `execution-control/*` 归属设计。
- 不把 Skill / Workflow / Template 编辑、Release 编译发布或能力域内部设计时逻辑回流到本平面。
- 控制面优先保持稳定，域内细节应持续南向下沉到 `capabilities/*` 或 `runtimes/*`。
