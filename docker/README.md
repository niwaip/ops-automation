# Ops Automation Docker Services

Docker 体系负责整个仓库的基础设施、后端服务及测试环境的编排与管理。

## 目录结构

为了保持根目录整洁，Docker 目录采用以下标准结构：

- **`compose/`**: 存放所有 `docker-compose.yml` 配置文件。
- **`scripts/`**: 存放启动、停止及管理容器的脚本。
  - `smoke/`: 各层的冒烟测试脚本。
  - `v4/`: V4 架构分层校验及验收脚本。
  - `utils/`: 辅助开发工具脚本（如 codegen, bootstrap）。
- **`sql/`**: 数据库初始化及迁移脚本。
- **`env/`**: 环境变量模板（`.env.example`）。
- **`temporal/`**, **`browser-worker/`**, **`office-addin/`**, **`carbone-official/`**: 各特定服务的 Dockerfile 及私有配置。
- **`configs/`**: 通用 Docker 引擎配置（如 `daemon.json`）。

## 核心入口

本项目推荐唯一的智能启动入口：

- **`docker/start-smart.sh`** (包装入口，转发至 `scripts/start-smart.sh`)

该脚本能自动感知 VibeKanban worktree 环境，并正确挂载当前目录的代码。

## 配置文件说明 (`docker/compose/`)

推荐日常只关注这几份：

| 文件                       | 用途               | 主要服务                               |
| -------------------------- | ------------------ | -------------------------------------- |
| `docker-compose.base.yml`  | **默认开发栈**     | 基础设施 + 后端 + 前端 + browser chrome |
| `docker-compose.yml`       | 仅基础设施         | postgres, redis                        |
| `docker-compose.addin.yml` | Office Add-in 链路 | carbone-api, office-addin              |
| `docker-compose.test.yml`  | 测试环境           | mock-ai-server, carbone-engine-test    |
| `docker-compose.carbone.yml` | 独立 document-domain / carbone | carbone-engine                  |

以下分层文件保留为兼容/调试用途，不作为默认入口：

- `docker-compose.core.yml`
- `docker-compose.planner.yml`
- `docker-compose.runtime.yml`
- `docker-compose.experience.yml`
- `docker-compose.full.yml`

## 环境配置

### .env 文件

复制 `env/.env.example` 创建 `docker/.env` 文件：

```bash
cd docker
cp env/.env.example .env
```

主要配置项：

- `DOCKER_REGISTRY`: 镜像源（国内推荐使用 `docker.1ms.run/`，不要带 `/library/`）
- `HOST_IP`: 对外访问主机 IP（用于容器间及外部访问）
- `PROJECT_ROOT`: 代码挂载根路径（`start-smart.sh` 会自动设置）

## 快速启动示例

```bash
# 启动默认开发环境
./docker/start-smart.sh dev up -d

# 等价写法
./docker/start-smart.sh docker-compose.base.yml up -d

# 启动独立 document-domain / carbone-engine
./docker/start-smart.sh docker-compose.carbone.yml up -d carbone-engine

# 运行 document-domain 测试容器
./docker/start-smart.sh docker-compose.test.yml run --rm carbone-engine-test

# 停止特定环境
./docker/start-smart.sh dev down
```

## 校验与冒烟测试

| 脚本路径                                 | 描述                                 |
| ---------------------------------------- | ------------------------------------ |
| `docker/scripts/v4/validate-layering.sh` | 校验分层是否符合蓝图                 |
| `docker/scripts/v4/v4-acceptance.sh`     | 一键分层审计 + 全链路冒烟            |
| `docker/scripts/smoke/core-smoke.sh`     | 验证 Core 层（Auth + Control Plane） |
| `docker/scripts/smoke/planner-smoke.sh`  | 验证 Planner 层（AI 编排）           |
| `docker/scripts/smoke/addin-smoke.sh`    | 验证 Office Add-in 链路              |

_注：建议优先通过 `pnpm` 触发，如 `pnpm docker:v4:validate`。_

## 开发提示

### browser-worker 源码变更后必须重建容器

`docker-compose.full.yml` 里的 `browser-worker` 走的是 `corepack pnpm exec nest build && node dist/main.js` 路径，
**未启用 `--watch`**。修改 `apps/backend/runtimes/browser-worker/src/**` 后需要手动重建容器：

```bash
./docker/start-smart.sh docker-compose.full.yml up -d --force-recreate --no-deps browser-worker
```

_原因：`nest-cli.json` 的 `deleteOutDir: true` + `tsconfig.tsbuildinfo` 增量缓存会导致 watch 模式反复删除
`dist/` 后找不到入口文件。_

## 服务端口参考

| 服务            | 端口 | 说明              |
| --------------- | ---- | ----------------- |
| auth            | 3001 | 认证服务          |
| control-plane   | 3003 | 控制平面          |
| ai-orchestrator | 3007 | AI 编排服务       |
| browser-worker  | 3004 | 浏览器自动化      |
| portal          | 5173 | 前端入口          |
| noVNC           | 6080 | 浏览器监控界面    |
| temporal-ui     | 8088 | Temporal 任务监控 |
