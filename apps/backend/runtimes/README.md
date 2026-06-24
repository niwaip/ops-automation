# runtimes

`apps/backend/runtimes` 是执行运行时平面的统一入口目录。

这里承接真正执行动作的 worker / executor，而不是控制面的生命周期编排。

## 平面边界

- `execution-control/control-plane`
  - 负责执行生命周期推进、审批、接管、输入补全与南向分发
- `execution-control/session-broker`
  - 负责会话、资源分配、租约、冻结与 runtime 路由
- `runtimes/*`
  - 负责实际执行、回放、浏览器原子动作、工作流 Activity 执行、动态代码沙箱执行

新增运行时能力应优先判断：

- 如果是“状态推进、人工控制、审批”问题，进入 `control-plane`
- 如果是“会话、资源、租约、路由”问题，进入 `session-broker`
- 如果是“真正执行某类运行时动作”问题，进入 `runtimes/*`

## 当前统一视图

- `browser-worker/`
  - 职责：浏览器原子执行、浏览器会话承载、录制网关
  - 协议边界：HTTP + WebSocket
  - 部署边界：可独立扩容；与浏览器实例和录制链路强相关
- `replay-worker/`
  - 职责：CDP 驱动回放、重试、日志、接管辅助
  - 协议边界：HTTP
  - 部署边界：可独立部署；偏回放与调试链路
- `temporal-worker/`
  - 职责：Temporal Workflow / Activity 执行
  - 协议边界：Temporal worker protocol + 本地 HTTP 管理入口
  - 部署边界：与 Temporal 基础设施绑定；不再承载动态代码沙箱职责
- `sandbox-worker/`
  - 职责：动态代码沙箱执行、Activity / Workflow 校验
  - 协议边界：HTTP
  - 部署边界：可独立部署；资源隔离与沙箱安全策略应独立演进

## 路径规划

```text
apps/backend/runtimes/
├── browser-worker/
├── replay-worker/
├── temporal-worker/
├── sandbox-worker/
└── README.md
```

## 当前迁移原则

- 新增 worker 默认进入 `apps/backend/runtimes/*`，不要再回写历史 `runtime/*` 路径。
- `temporal-worker` 与 `sandbox-worker` 必须保持职责分离，避免再次混合“工作流执行”和“动态代码沙箱执行”。
- 运行时之间共享协议时，优先通过 `packages/backend-contracts/*` 收口，不要继续扩散深层相对路径引用。
- Docker / Compose 启动仍需统一通过仓库根目录的 `./docker/start-smart.sh`，并确保挂载当前 worktree。
