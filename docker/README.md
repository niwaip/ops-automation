# Ops Automation Docker Services

Docker 配置文件用于不同场景的服务部署。

## 配置文件说明

| 文件 | 用途 | 主要服务 |
|------|------|----------|
| `docker-compose.core.yml` | V4 最小核心 | postgres, redis, auth, control-plane |
| `docker-compose.planner.yml` | V4 规划层 | ai-orchestrator |
| `docker-compose.runtime.yml` | V4 运行时层 | session-broker, browser-worker, carbone-engine, temporal |
| `docker-compose.experience.yml` | V4 体验层 | portal |
| `docker-compose.base.yml` | **统一基础配置** | 所有服务模板 + 基础设施 |
| `docker-compose.yml` | 仅基础设施 | postgres, redis |
| `docker-compose.full.yml` | 全栈开发环境 | 所有后端服务 + portal + browser-chrome |
| `docker-compose.carbone.yml` | Carbone 模板服务 | carbone-engine |
| `docker-compose.addin.yml` | Carbone + Office Add-in | carbone-api, office-addin |
| `docker-compose.shared.yml` | 兼容别名 | 指向基础设施 compose |
| `docker-compose.test.yml` | 测试环境 | mock-ai-server, carbone-engine-test |

## 环境配置

### .env 文件

复制 `.env.example` 创建 `.env` 文件：

```bash
cd docker
cp .env.example .env
```

主要配置项：
- `DOCKER_REGISTRY`: 镜像源（国内用 `docker.1ms.run/library/`，国外用空）
- `NETWORK_NAME`: Docker 网络名称
- `POSTGRES_*`, `REDIS_*`: 数据库配置
- 各服务端口配置

## Vibe Kanban Worktree 支持

当在 Vibe Kanban 的 worktree 中工作时，使用 `start-smart.sh` 自动检测环境：

```bash
# 智能启动（自动检测 worktree）
./docker/start-smart.sh docker-compose.full.yml up -d

# V4 最小核心
./docker/start-smart.sh docker-compose.core.yml up -d

# 在核心之上挂 planner / runtime / experience
./docker/start-smart.sh docker-compose.planner.yml up -d
./docker/start-smart.sh docker-compose.runtime.yml up -d
./docker/start-smart.sh docker-compose.experience.yml up -d

# 或手动设置 PROJECT_ROOT
export PROJECT_ROOT=/path/to/worktree
docker compose -f docker-compose.full.yml up -d
```

`start-smart.sh` 会自动：
1. 检测是否在 `.vibe-kanban/worktrees/` 目录中
2. 设置正确的 `PROJECT_ROOT` 环境变量
3. 确保 Docker 挂载路径正确指向 worktree 中的服务代码

## 服务端口分配

### 后端服务

| 服务 | 端口 | 说明 |
|------|------|------|
| postgres | 5432 | PostgreSQL 数据库 |
| redis | 6379 | Redis 缓存 |
| auth | 3001 | 认证服务 |
| session-broker | 3002 | 会话管理 |
| control-plane | 3003 | 控制平面 |
| browser-worker | 3004 | 浏览器自动化 |
| template | 3005 | 模板服务 |
| replay-engine | 3006 | 重放引擎 |
| ai-orchestrator | 3007 | AI 编排服务 |
| report | 3008 | 报告服务 |
| carbone-engine | 3009 | Carbone 模板引擎 |
| portal | 5173 | 前端入口 |

### Browser Chrome

| 端口 | 说明 |
|------|------|
| 6080 | noVNC Web 界面 |
| 9222 | Chrome DevTools Protocol |
| 5900 | VNC 服务器 |
| **3011** | Codegen API |

### Carbone 服务

| 服务 | 端口 | 说明 |
|------|------|------|
| office-addin | **3000** (HTTPS) | Office 加载项 |
| carbone-api | 3100 (HTTP) / 3443 (HTTPS) | Carbone API |

## 快速启动

### 方式一：智能启动脚本（推荐）

```bash
# 全栈开发环境
./docker/start-smart.sh docker-compose.full.yml up -d

# V4 最小核心
./docker/start-smart.sh docker-compose.core.yml up -d

# 追加规划层 / 运行时层 / 体验层
./docker/start-smart.sh docker-compose.planner.yml up -d
./docker/start-smart.sh docker-compose.runtime.yml up -d
./docker/start-smart.sh docker-compose.experience.yml up -d

# 仅基础设施
./docker/start-smart.sh docker-compose.yml up -d
```

### 分层校验

```bash
# 校验 V4 core / planner / runtime / experience 分层是否仍然符合蓝图
bash ./docker/validate-layering.sh

# 审计 legacy docker-compose.full.yml 是否至少覆盖了 V4 分层组合
bash ./docker/validate-full-alignment.sh

# 一次性执行 V4 分层审计 + core/planner/runtime/full 冒烟
bash ./docker/v4-acceptance.sh

# 独立验证 Carbone + Office Add-in 链路
bash ./docker/addin-smoke.sh

# 也可通过仓库级脚本触发
pnpm docker:addin:smoke
pnpm docker:v4:validate
pnpm docker:v4:acceptance
```

### Core 冒烟

```bash
# 启动 V4 core，并验证 auth 登录 + control-plane 受保护 API
bash ./docker/core-smoke.sh
```

`core-smoke.sh` 会自动完成以下动作：
- 确保 `ops-network` 存在
- 通过 `./docker/start-smart.sh docker-compose.core.yml up -d` 启动 core 组
- 优先直接验证现有 `auth` / `control-plane` 是否可用；如果登录失败，再尝试无损的 `npm run seed`
- 使用种子账号 `admin / admin123` 登录 `auth`
- 携带 JWT 访问 `control-plane` 的 `/api/executions`

默认不会执行 `prisma db push`。只有在隔离空库中明确设置 `CORE_SMOKE_ALLOW_DB_PUSH=1` 时，脚本才会允许执行带数据变更风险的 schema push。

脚本成功后会保留 core 服务继续运行；如需停止，请执行：

```bash
./docker/start-smart.sh docker-compose.core.yml down
```

### Planner 冒烟

```bash
# 在 core 之上启动 planner，并验证 /ai/chat 的任务链路可用
bash ./docker/planner-smoke.sh
```

该脚本会：
- 确保 core 组运行（auth + control-plane）
- 启动 `ai-orchestrator`（planner 层）
- 用 `admin/admin123` 登录，携带 JWT 调用 `POST /ai/chat`（任务模式）
- 验证返回中包含有效事件，并再次确认 control-plane `/api/executions` 可访问

停止 planner：

```bash
./docker/start-smart.sh docker-compose.planner.yml down
```

### Runtime 冒烟

```bash
# 启动运行时层并做基础存活校验（容器运行状态）
bash ./docker/runtime-smoke.sh
```

该脚本会确认以下容器处于运行状态：
- `ops-session-broker`
- `ops-browser-worker`
- `ops-browser-chrome`
- `carbone-engine`
- `ops-temporal`
- `ops-temporal-ui`
- `ops-temporal-sandbox-agent`

停止 runtime：

```bash
./docker/start-smart.sh docker-compose.runtime.yml down
```

### Add-in 冒烟

```bash
# 启动 add-in 组合，并验证 carbone-api / office-addin / manifest 基本可用
bash ./docker/addin-smoke.sh
```

该脚本会：
- 通过 `./docker/start-smart.sh docker-compose.addin.yml up -d` 启动 add-in 组合
- 校验 `carbone-api` 与 `office-addin` 容器均已运行
- 验证 `carbone-api` 的 HTTP `health` 可访问
- 验证 `carbone-api` 的 HTTPS `health` 可访问
- 验证 `office-addin` 的 HTTPS `health` 可访问
- 验证 `office-addin` 的 `manifest-word.xml` 可访问

停止 add-in：

```bash
./docker/start-smart.sh docker-compose.addin.yml down
```

### Full 冒烟

```bash
# 启动 full 组合，并验证 portal + planner + control-plane + carbone 基本可用
bash ./docker/full-smoke.sh
```

该脚本会：
- 通过 `./docker/start-smart.sh docker-compose.full.yml up -d` 启动全栈
- 校验 V4 关键服务容器均已运行
- 用 `admin/admin123` 登录 `auth`
- 验证 `portal` 首页可访问
- 验证 `carbone-engine` 的 `/api` 可访问
- 携带 JWT 调用 `ai-orchestrator` 的 `POST /ai/chat`
- 验证 `control-plane` 的 `/api/executions` 可访问
- 提取任务返回的 `executionId`，轮询最终状态必须为 `succeeded`
- 验证执行单总数增长，确保这次任务真实创建了新的 execution
- 使用同一 `idempotencyKey` 重放一次请求，验证命中同一 execution，且不会再次新增 execution

`full-smoke.sh` 默认会在基底层容忍偶发外部网络抖动，不会对具体 skill、域名或协议做硬编码兼容。需要调整回归耐心时，可按需覆盖以下环境变量：

```bash
# fresh idempotencyKey 的外层尝试次数，默认 6
FULL_SMOKE_TASK_ATTEMPTS=6

# 外层 fresh-key 尝试之间的等待秒数，默认 8
FULL_SMOKE_TASK_ATTEMPT_DELAY=8

# 单个 execution 轮询最终状态的最大次数，默认 36
FULL_SMOKE_EXECUTION_POLL_ATTEMPTS=36

# execution 状态轮询间隔秒数，默认 5
FULL_SMOKE_EXECUTION_POLL_DELAY=5
```

停止 full：

```bash
./docker/start-smart.sh docker-compose.full.yml down
```
### 方式二：直接使用 docker compose

```bash
cd docker

# 仅在你已明确设置当前 worktree 的 PROJECT_ROOT 时直接使用
export PROJECT_ROOT=/path/to/current/worktree

# 全栈开发环境
docker compose -f docker-compose.full.yml up -d

# 仅基础设施
docker compose -f docker-compose.yml up -d

# 本地开发（启动后端服务）
../tools/scripts/start-dev.sh
```

### 方式三：仅 Carbone + Office Add-in

```bash
cd docker
./start-smart.sh docker-compose.addin.yml up -d
```

## 配置改善说明

### 统一镜像源

所有 compose 文件现在支持 `DOCKER_REGISTRY` 环境变量：

```bash
# 国内环境（使用镜像）
DOCKER_REGISTRY=docker.1ms.run/library/

# 国外环境（官方源）
DOCKER_REGISTRY=
```

### 统一网络配置

所有服务使用统一的 `ops-network` 网络，可通过 `NETWORK_NAME` 环境变量修改。

### 解决端口冲突

- **Office Add-in**: 3000 (HTTPS)
- **Codegen API**: 3011（从 3000 改为 3011 避免冲突）

### Volume 路径支持

使用 `${PROJECT_ROOT}` 环境变量，支持 worktree 环境：

```yaml
volumes:
  - ${PROJECT_ROOT:-..}/apps/auth:/app
```

## SSL 证书

Office Add-in 必须使用 HTTPS。

证书位置: `docker/office-addin/certs/`

**MacOS 信任证书:**
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain docker/office-addin/certs/server.crt
```

## 停止服务

```bash
docker compose down

# 清理数据
docker compose down -v

# 清理所有 volume
docker compose down -v --remove-orphans
```
