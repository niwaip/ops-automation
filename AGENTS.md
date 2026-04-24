# AGENTS.md

本文件用于指导 Claude Code（及其他代码 Agent）在本仓库中的 Docker 使用方式。

## 目标

- 确保在 VibeKanban worktree 场景下，容器始终挂载“当前目录”的代码。
- 避免因为挂载到错误路径导致“代码修改不生效”或“运行旧版本”。
- 统一启动/测试入口，降低多人协作时的环境漂移。

## 强制规则（MUST）

- 所有 Docker 启动、测试、停止操作，默认从仓库根目录执行。
- 所有 `docker compose` 调用，优先通过 `docker/start-smart.sh` 触发。
- 必须保证 `PROJECT_ROOT` 指向当前工作目录（当前 worktree 根目录）。
- Compose 中的代码挂载路径必须使用 `${PROJECT_ROOT}`，禁止写死 `../services/...`。

## 标准执行方式

### 1) 启动全栈（开发）

```bash
./docker/start-smart.sh docker-compose.base.yml up -d
```

### 2) 启动基础设施（postgres/redis）

```bash
./docker/start-smart.sh docker-compose.yml up -d
```

### 3) 启动测试环境

```bash
./docker/start-smart.sh docker-compose.test.yml up --abort-on-container-exit carbone-engine-test
```

### 4) 停止环境

```bash
./docker/start-smart.sh docker-compose.base.yml down
```

## 服务入口主机配置

- `docker/.env` 中通过 `HOST_IP` 配置对外访问主机（例如 `192.168.100.143`）。
- 如需将服务入口显式改为本机 IP，可设置以下可选变量：  
  `AUTH_SERVICE_HOST`、`AI_ORCHESTRATOR_HOST`、`SESSION_BROKER_HOST`、`CONTROL_PLANE_HOST`、`BROWSER_WORKER_HOST`、`CARBONE_ENGINE_HOST`
- 不设置上述变量时，默认使用 Docker 服务名（推荐，容器内调用更稳定）。

## Agent 操作约束

- 不要直接执行 `docker compose -f ...`，除非明确设置了当前 `PROJECT_ROOT` 且已确认路径正确。
- 不要默认使用 `docker/start.sh`、`docker/start-all.sh`、`docker/start-addin.sh` 作为通用入口。
- 当用户说“在 vibekanban/worktree 里开发”时，必须优先选择 `start-smart.sh`。
- 在执行启动命令前，先确认当前目录是目标 worktree 根目录。

## 自检清单（每次执行前）

- 当前目录是否为目标 worktree 根目录。
- `docker/start-smart.sh` 是否被使用。
- Compose 文件中的 volume 是否走 `${PROJECT_ROOT}`。
- 容器内代码路径是否是本次 worktree 的最新内容。

## 失败排查建议

- 症状：本地改了代码，容器内不生效  
  优先检查：`PROJECT_ROOT` 是否错误、compose volume 是否写死路径。

- 症状：测试结果与当前分支不一致  
  优先检查：是否绕过了 `start-smart.sh`，是否使用了历史容器与旧挂载。

## 给 Claude Code 的简短指令模板

可在任务描述中直接附加以下说明：

```text
本项目使用 VibeKanban worktree 开发。所有 Docker 启动/测试必须绑定当前目录代码。
请统一通过 ./docker/start-smart.sh 执行 compose，并确保 PROJECT_ROOT 指向当前 worktree 根目录。
```
