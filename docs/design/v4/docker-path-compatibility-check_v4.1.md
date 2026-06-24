# Docker 路径兼容性检查 (v4.1)

日期：2026-06-23

> 本文件对应实施 backlog 的 `Batch D5`，用于梳理 Docker 启动脚本、Compose 与相关构建脚本中的旧后端路径引用，并记录兼容期处理方式。

## 1. 目标

- 确认 Docker 启动仍绑定当前 worktree 代码。
- 梳理当前仍写死旧 backend 路径的位置。
- 为后续路径迁移到 `apps/backend/runtimes/*` 等目标平面预留兼容入口。

## 2. 当前结论

### 2.1 `start-smart.sh`

当前状态：

- `docker/start-smart.sh` 已满足 worktree 场景要求
- 会在仓库根目录或 `.vibe-kanban/worktrees/*` 下自动设置 `PROJECT_ROOT`
- 所有 compose 调用都经由 `PROJECT_ROOT` 传入

结论：

- 当前 worktree 挂载正确性主要由 `PROJECT_ROOT` 保证
- 该脚本本轮无需结构改动

### 2.2 Compose 挂载路径

当前 compose 文件中的服务挂载，已普遍满足：

- 使用 `${PROJECT_ROOT:-..}` 作为代码挂载前缀

这意味着：

- 即使仍引用旧目录名，只要路径仍存在，容器就会绑定当前 worktree 的真实代码

### 2.3 当前仍存在的旧路径热点

主要热点包括：

- `docker/compose/docker-compose.base.yml`
- `docker/compose/docker-compose.full.yml`
- `docker/compose/docker-compose.runtime.yml`
- `docker/compose/docker-compose.core.yml`
- `docker/compose/docker-compose.planner.yml`
- `docker/scripts/start-dev.sh`
- `docker/scripts/apply-latest-db-schema.sh`
- `docker/scripts/ops-menu.sh`
- `docker/temporal/Dockerfile`
- `docker/sql/README.md`
- `docker/sql/migrations/*`

这些文件当前仍显式引用：

- `apps/backend/core/platform`
- `apps/backend/execution-control/control-plane`
- `apps/backend/intelligence/ai-orchestrator`
- `apps/backend/runtimes/browser-worker`
- `apps/backend/runtimes/replay-worker`
- `apps/backend/runtimes/sandbox-worker`
- `apps/backend/domain/*`
- `apps/backend/execution-control/session-broker`

结论：

- 当前并不存在“挂载到错误 worktree”的问题
- 当前问题是“未来改物理路径时，需要统一替换这些旧路径引用”

## 3. 本轮已做的兼容处理

### 3.1 `sandbox-worker` 路径变量化

本轮已对 `sandbox-worker` 这条迁移链增加兼容变量：

- 新增环境变量：
  - `SANDBOX_WORKER_PROJECT_PATH`
- 默认值：
  - `apps/backend/runtimes/sandbox-worker`

已接入位置：

- `docker/.env`
- `docker/env/.env.example`
- `docker/temporal/Dockerfile`
- `docker/compose/docker-compose.runtime.yml`
- `docker/compose/docker-compose.full.yml`

效果：

- 当前默认值已切到 `apps/backend/runtimes/sandbox-worker`
- 如需回滚或排查兼容问题，仍可通过环境变量临时切回旧路径

## 4. 验证结果

已通过：

- `./docker/start-smart.sh docker-compose.runtime.yml config`

验证结果显示：

- `PROJECT_ROOT` 正确指向当前仓库根目录
- `sandbox-worker` 的 build args 已正确展开
- `sandbox-worker` 的 volume 路径已正确展开

## 5. 后续建议

### 5.1 优先顺序

后续路径迁移建议按以下顺序推进：

1. `sandbox-agent -> sandbox-worker`
2. `runtime/* -> runtimes/*`
3. `orchestration/* -> intelligence / execution-control`
4. `core/platform -> governance / registry-release`

### 5.2 改动策略

建议继续采用“变量化 + 兼容默认值”的方式，而不是一次性在所有 compose 中硬切路径。

原因：

- Dockerfile、compose、脚本、SQL 文档存在多点引用
- 一次性重命名容易造成“容器启动成功但挂载旧代码/错误路径”的隐性问题

## 6. 本批次结论

`Batch D5` 的结论是：

- `start-smart.sh` 与 `${PROJECT_ROOT}` 挂载机制当前有效
- 当前风险主要是未来路径迁移时的旧路径散落引用
- `sandbox-worker` 迁移链已具备第一层路径兼容变量
- `browser-worker`、`replay-worker`、`temporal-worker` 与 `control-plane` 已完成首轮目录归位
- 后续可以继续推进 `ai-orchestrator -> intelligence/*` 与 `core/platform -> governance / registry-release` 主线
