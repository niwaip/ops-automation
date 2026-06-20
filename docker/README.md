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

- **`docker/start-smart.sh`** (软链至 `scripts/start-smart.sh`)

该脚本能自动感知 VibeKanban worktree 环境，并正确挂载当前目录的代码。

## 配置文件说明 (`docker/compose/`)

| 文件                            | 用途                    | 主要服务                                                 |
| ------------------------------- | ----------------------- | -------------------------------------------------------- |
| `docker-compose.core.yml`       | V4 最小核心             | postgres, redis, auth, control-plane                     |
| `docker-compose.planner.yml`    | V4 规划层               | ai-orchestrator                                          |
| `docker-compose.runtime.yml`    | V4 运行时层             | session-broker, browser-worker, carbone-engine, temporal |
| `docker-compose.experience.yml` | V4 体验层               | portal                                                   |
| `docker-compose.base.yml`       | **统一基础配置**        | 所有服务模板 + 基础设施                                  |
| `docker-compose.yml`            | 仅基础设施              | postgres, redis                                          |
| `docker-compose.full.yml`       | 全栈开发环境            | 所有后端服务 + portal + browser-chrome                   |
| `docker-compose.carbone.yml`    | Carbone 模板服务        | carbone-engine                                           |
| `docker-compose.addin.yml`      | Carbone + Office Add-in | carbone-api, office-addin                                |
| `docker-compose.test.yml`       | 测试环境                | mock-ai-server, carbone-engine-test                      |

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
# 启动全栈开发环境
./docker/start-smart.sh docker-compose.full.yml up -d

# 启动 V4 最小核心
./docker/start-smart.sh docker-compose.core.yml up -d

# 在核心之上追加规划层
./docker/start-smart.sh docker-compose.planner.yml up -d

# 停止特定环境
./docker/start-smart.sh docker-compose.core.yml down
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
