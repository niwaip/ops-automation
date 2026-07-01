# agent-catalog

当前目录代表未来 `registry-release/agent-catalog` 的统一逻辑视图。

本目录用于承接专项 Agent 的注册、能力画像与作用域策略，
把 `Agent Profile` 从单个智能体实现里抽离为统一的注册侧对象模型。

## 该目录负责

- Agent Profile 目录与注册记录
- Agent 能力矩阵、可用 runtime 范围与资源可见性
- Agent 的租户/平台作用域策略
- 未来专项 Agent 准入与目录治理的统一入口

## 该目录不负责

- Planner 的执行期推理循环
- Sandbox、Browser Worker、Temporal Worker 的原子执行
- Release 编译与发布门禁
- 单个专项 Agent 的内部业务实现

## 当前迁移状态

- 当前先落对象模型与稳定源码出口，不在本批次引入独立服务进程。
- 共享 `Agent Profile` 契约继续由 `@ops/backend-agent-profile` 承担。
- 新的 Agent 准入模型、能力矩阵与作用域策略，应优先落到本包。
- 包根入口 `src/index.ts` 与 `package.json` 的 `.` export 已在后续 Phase E 删除；当前仅保留 `agent-profile` 稳定子路径入口。

## 当前逻辑分层

- `agent-profile`
  - Agent 注册记录、作用域策略、能力矩阵与规范化辅助

## 与 Intelligence 的关系

- `intelligence/*`
  - 负责主 Planner 与专项 Agent 的实际实现
- `agent-catalog`
  - 负责这些 Agent 在平台注册侧的画像、准入与目录模型
