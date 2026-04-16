# Ops Automation Docker Services

Docker 配置文件用于不同场景的服务部署。

## 配置文件说明

| 文件 | 用途 | 主要服务 |
|------|------|----------|
| `docker-compose.yml` | 基础设施 | postgres, redis |
| `docker-compose.full.yml` | 全栈开发环境 | 所有后端服务 + portal + browser-chrome |
| `docker-compose.carbone.yml` | Carbone 模板服务 | carbone-engine |
| `docker-compose.shared.yml` | Carbone + Office Add-in | carbone-api, office-addin |
| `docker-compose.test.yml` | 测试环境 | mock-ai-server, carbone-engine-test |

## 服务端口分配

### 后端服务 (docker-compose.full.yml)

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

### Browser Chrome (docker-compose.full.yml)

| 端口 | 说明 |
|------|------|
| 6080 | noVNC Web 界面 |
| 9222 | Chrome DevTools Protocol |
| 5901 | VNC 服务器 |
| 3011 | Codegen API |

### Carbone 服务 (docker-compose.shared.yml)

| 服务 | 端口 | 说明 |
|------|------|------|
| office-addin | 3000 (HTTPS) | Office 加载项 |
| carbone-api | 3100 (HTTP) / 3443 (HTTPS) | Carbone API |

## 快速启动

### 全栈开发环境

```bash
cd docker
docker compose -f docker-compose.full.yml up -d
```

### 仅 Carbone + Office Add-in

```bash
cd docker
docker compose -f docker-compose.shared.yml up -d
```

### 本地开发（不使用 Docker）

```bash
# 启动基础设施
cd docker
docker compose -f docker-compose.yml up -d

# 启动后端服务（本地）
./scripts/start-dev.sh
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
```