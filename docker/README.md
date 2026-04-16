# Ops Automation Docker Services

Docker 配置文件用于不同场景的服务部署。

## 配置文件说明

| 文件 | 用途 | 主要服务 |
|------|------|----------|
| `docker-compose.base.yml` | **统一基础配置** | 所有服务模板 + 基础设施 |
| `docker-compose.yml` | 仅基础设施 | postgres, redis |
| `docker-compose.full.yml` | 全栈开发环境 | 所有后端服务 + portal + browser-chrome |
| `docker-compose.carbone.yml` | Carbone 模板服务 | carbone-engine |
| `docker-compose.shared.yml` | Carbone + Office Add-in | carbone-api, office-addin |
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

# 仅基础设施
./docker/start-smart.sh docker-compose.yml up -d
```

### 方式二：直接使用 docker compose

```bash
cd docker

# 全栈开发环境
docker compose -f docker-compose.full.yml up -d

# 仅基础设施
docker compose -f docker-compose.yml up -d

# 本地开发（启动后端服务）
./scripts/start-dev.sh
```

### 方式三：仅 Carbone + Office Add-in

```bash
cd docker
docker compose -f docker-compose.shared.yml up -d
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
  - ${PROJECT_ROOT:-..}/services/auth:/app
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