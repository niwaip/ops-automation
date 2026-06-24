# Runtimes 平面逻辑视图 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch D3`，用于统一描述 `browser-worker`、`replay-worker`、`temporal-worker`、`sandbox-worker` 的职责边界、协议边界与部署边界。

## 1. 目标

- 为当前运行时服务建立统一逻辑视图。
- 让后续 `D4/D5` 的 workspace 与 Docker 路径迁移有清晰目标。
- 阻止不同运行时语义继续混堆进同一服务。

## 2. 统一视图

目标态运行时平面如下：

```text
apps/backend/runtimes/
├── browser-worker/
├── replay-worker/
├── temporal-worker/
└── sandbox-worker/
```

当前仓库仍处于兼容期，对应物理路径如下：

```text
apps/backend/runtimes/
├── browser-worker/       -> 已完成归位
├── replay-worker/        -> 已完成归位
├── temporal-worker/      -> 已完成归位
└── sandbox-worker/       -> 当前主实现
```

另外：

- `temporal-worker/src/sandbox/*` 已完成移除
- `sandbox` 相关执行职责已从 `temporal-worker` 剥离出去

## 3. 各 worker 逻辑边界

### 3.1 `browser-worker`

核心职责：

- 浏览器实例/worker 生命周期管理
- 浏览器原子命令执行
- 页面状态读取与断言
- 冻结/恢复与 takeover 运行时配合
- 浏览器执行产物导出

当前对外接口特征：

- `/browser/init`
- `/browser/execute`
- `/browser/reset`
- `/browser/execute-step`
- `/browser/inspect-state`
- `/browser/assert-state`
- `/browser/freeze`
- `/browser/resume`
- `/browser/export-script`
- `/browser/generate-schema`
- `/browser/artifacts/:filename`
- `/workers`
- `/health`

协议边界：

- 对上游暴露“浏览器原子执行能力”
- 不负责回放策略编排
- 不负责业务 release、skill、template 逻辑
- 不负责 control-plane 生命周期裁决

部署边界：

- 独立 Nest 服务
- 当前默认端口 `3004`
- 依赖浏览器运行环境、Playwright/CDP、产物目录挂载

### 3.2 `replay-worker`

核心职责：

- 面向 session/template 的回放执行
- CDP 连接管理
- 步骤级日志与执行摘要
- retry / takeover / AI 辅助诊断

当前对外接口特征：

- `/replay/start`
- `/replay/stop`
- `/replay/:execution_id/status`
- `/replay/session/:session_id/logs`
- `/replay/session/:session_id/summary`
- `/replay/cdp/status`
- `/replay/ai/status`
- `/replay/health`

协议边界：

- 对上游暴露“回放执行与诊断能力”
- 不负责浏览器原子动作实现本体
- 不负责会话资源分配
- 不负责通用 Temporal workflow 承载

部署边界：

- 独立 Nest 服务
- 当前默认端口 `3006`
- 依赖 PostgreSQL、CDP 连接、AI Orchestrator 与 Session Broker

### 3.3 `temporal-worker`

核心职责：

- 通用 Temporal worker 启停与状态管理
- 承载 task queue 上的通用 workflow/activity 执行

当前对外接口特征：

- `/worker/start`
- `/worker/stop`
- `/worker/status`

当前状态：

- 已不再暴露 `/sandbox/*`
- 服务职责已收敛为“通用 Temporal worker”语义

协议边界：

- 只应承载通用 Temporal worker 语义
- 不应继续增长新的沙箱执行接口
- 不应承载浏览器执行与回放诊断职责

部署边界：

- 独立 Nest 服务
- 当前默认端口 `3008`
- 与 Temporal 集群强耦合

### 3.4 `sandbox-worker`

核心职责：

- 动态代码/脚本的受控隔离执行
- 流式日志回传
- Activity/Workflow 验证
- Temporal 驱动的沙箱执行 worker

当前主实现基础：

- `apps/backend/runtimes/sandbox-worker/*`
- `apps/backend/runtime/sandbox-agent/*` 已完成移除

当前对外接口特征：

- `/execute`
- `/execute/stream`
- `/validate-activity`
- `/validate-workflow`
- `/validate-workflow/stream`
- `/health`

协议边界：

- 只暴露沙箱执行与验证协议
- 不负责 planner、agent、browser-domain、control-plane 决策
- 不负责通用 Temporal worker 管理入口

部署边界：

- 当前是 Python worker + aiohttp HTTP server 的组合形态
- 当前默认 HTTP 端口 `8090`
- 依赖 Temporal、Python 执行环境与受控 sandbox runner

## 4. 当前问题与结论

当前运行时平面的主要问题不是 worker 数量不清，而是边界混杂：

1. `sandbox-worker` 仍处于部分命名兼容期
2. Docker 与文档中仍保留少量历史路径描述

结论：

- `browser-worker`、`replay-worker`、`temporal-worker` 可视为已成型运行时单元
- `sandbox-worker` 已完成物理路径归位，但仍处于兼容期
- `browser-worker` 已开始进入 `runtime/* -> runtimes/*` 的实际归位阶段
- `replay-worker` 已开始进入 `runtime/* -> runtimes/*` 的实际归位阶段
- `temporal-worker` 已开始进入 `runtime/* -> runtimes/*` 的实际归位阶段
- `sandbox` 已从 `temporal-worker` 中完全剥离，后续迁移重点转为清理历史命名与剩余路径兼容描述

## 5. 与后续批次的关系

### 对 `Batch D4`

本文件定义了 `apps/backend/runtimes/*` 的目标纳入对象：

- `browser-worker`
- `replay-worker`
- `temporal-worker`
- `sandbox-worker`

### 对 `Batch D5`

Docker 路径兼容性检查时，需要重点关注：

- 任何写死 `apps/backend/runtime/sandbox-agent/*` 的构建路径
- 任何写死 `apps/backend/runtimes/temporal-worker/*` 且混入 `sandbox/*` 的路径
- worker 端口、健康检查、挂载目录是否仍与当前 worktree 一致

当前状态：

- `docker/start-smart.sh` 继续通过 `PROJECT_ROOT` 绑定当前 worktree。
- 主要 compose 挂载路径已经切到 `execution-control/*`、`intelligence/*`、`runtimes/*` 等新平面。
- 本轮已清理 Docker 侧残留的旧 `orchestration/control-plane` 注释路径。
- 历史兼容命名如 `SANDBOX_AGENT_URL`、`sandbox-agent-task-queue` 仍保留，但实际目标已指向 `sandbox-worker`。

## 6. 本批次结论

`Batch D3` 的结果是：

- 运行时平面的四个目标 worker 已统一命名
- 各 worker 的职责边界、协议边界、部署边界已写实
- `sandbox-worker` 的兼容期定位已明确
- `D4` 与 `D5` 的兼容期路径检查已形成显式记录
