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

## 核心入口

本项目推荐唯一的智能启动入口：

- **`docker/start-smart.sh`** (包装入口，转发至 `scripts/start-smart.sh`)

该脚本根据自身位置解析当前仓库根目录，并正确挂载代码。

## 配置文件与启动模式

本项目推荐唯一的智能启动入口：`./docker/start-smart.sh`。底层开发栈统一基于 `docker-compose.base.yml`，并通过 **Compose Profiles** 按需挂载组件，告别过去全量拉起 19 个容器的臃肿模式：

### 启动模式与 Profiles

| 启动模式 | 典型命令 | 包含服务与职责 | 容器数 |
| :--- | :--- | :--- | :--- |
| **`dev`** (默认核心) | `./docker/start-smart.sh dev up -d` | 基础设施 (`postgres`, `redis`) + 核心控制 (`platform`, `session-broker`, `control-plane`, `ai-orchestrator`) + 瞬态初始化 (`workspace-deps-init`) | **6+1 个** |
| **`dev:browser`** | `./docker/start-smart.sh dev:browser up -d` | 核心栈 + 浏览器自动化 (`browser-worker`, `browser-chrome`, `browser-template`, `browser-semantics`) | 11 个 |
| **`dev:workflow`** | `./docker/start-smart.sh dev:workflow up -d` | 核心栈 + Temporal 工作流引擎 (`temporal`, `temporal-ui`, `sandbox-worker`, `temporal-worker`) | 11 个 |
| **`dev:doc`** | `./docker/start-smart.sh dev:doc up -d` | 核心栈 + 文档渲染与报表 (`carbone-engine`, `report`) | 9 个 |
| **`dev:fe`** | `./docker/start-smart.sh dev:fe up -d` | 核心栈 + 容器化前端 (`portal`, `user-web`) | 9 个 |
| **`full`** | `./docker/start-smart.sh full up -d` | 全量开发环境（激活全部 Profiles，包含以上全部 19 个服务） | 19 个 |
| **`infra`** | `./docker/start-smart.sh infra up -d` | 仅数据库与缓存 (`postgres`, `redis`) | 2 个 |
| **`addin`** | `./docker/start-smart.sh addin up -d` | Office Add-in 专用栈 (`carbone-api`, `office-addin`) | 2 个 |

> **前端开发建议**：推荐前端（`portal` / `user-web`）在宿主机直接通过 `pnpm dev:portal` 或 `pnpm dev:user-web` 运行，享受毫秒级 Vite HMR，无需在 Docker 中常驻前端。日常后端仅需运行 `./docker/start-smart.sh dev up -d` 即可。

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
- `USER_CREDENTIAL_ENCRYPTION_KEY`: 用户凭证 AES-256 密钥（64 位十六进制或 32 字节 Base64）；写入凭证的 `platform` 与执行凭证的 control-plane/dispatcher 必须使用同一个值，生产环境应显式配置并通过迁移流程轮换。

Compose 配置不再为 `PROJECT_ROOT` 提供相对路径回退；绕过统一入口时会直接失败，避免在 `docker/` 下静默创建错误挂载目录。

## 快速启动示例

```bash
# 启动默认开发环境
./docker/start-smart.sh dev up -d

# 等价写法
./docker/start-smart.sh docker-compose.base.yml up -d

# 启动独立 document-domain / carbone-engine
./docker/start-smart.sh docker-compose.carbone.yml up -d carbone-engine

# 首次启动 Office Add-in 前生成本机开发证书
./docker/office-addin/generate-certs.sh
./docker/start-smart.sh addin up -d

# 运行 document-domain 测试容器
./docker/start-smart.sh docker-compose.test.yml run --rm carbone-engine-test

# 停止特定环境
./docker/start-smart.sh dev down
```

## 校验与冒烟测试

静态校验不连接 Docker daemon，也不会创建网络：

```bash
bash ./docker/scripts/validate.sh
```

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

修改 `apps/backend/runtimes/browser-worker/src/**` 后，如果容器行为仍像旧版本，需要手动重建容器：

```bash
./docker/start-smart.sh dev up -d --force-recreate --no-deps browser-worker
```

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
