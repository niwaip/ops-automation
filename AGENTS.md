# AGENTS.md

本文件用于指导 Claude Code（及其他代码 Agent）在本仓库中的 Docker 使用方式，以及日常代码组织规范。

## 目标

- 确保在 VibeKanban worktree 场景下，容器始终挂载“当前目录”的代码。
- 避免因为挂载到错误路径导致“代码修改不生效”或“运行旧版本”。
- 统一启动/测试入口，降低多人协作时的环境漂移。

## 强制规则（MUST）

- 所有 Docker 启动、测试、停止操作，默认从仓库根目录执行。
- 所有 `docker compose` 调用，优先通过 `docker/start-smart.sh` 触发。
- 必须保证 `PROJECT_ROOT` 指向当前工作目录（当前 worktree 根目录）。
- Compose 中的代码挂载路径必须使用 `${PROJECT_ROOT}`，禁止写死 `../apps/...`。

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
- 不要使用旧的 `docker/scripts/start-all.sh` 或 `docker/scripts/start-addin.sh` 作为通用入口。
- 当用户说“在 vibekanban/worktree 里开发”时，必须优先选择 `start-smart.sh`。
- 在执行启动命令前，先确认当前目录是目标 worktree 根目录。
- 修改后端代码后，不能默认认为容器内服务一定已自动生效；必须先确认目标服务是热更新模式还是 `node dist/main.js` / `npx tsc && node dist/main.js` 这类非热更新模式。
- 只要目标后端服务不是明确可靠的热更新模式，或本次修改涉及启动参数、构建产物、依赖注入、环境变量、Compose 配置、数据库连接、跨服务调用链，就必须重启对应服务容器，并检查启动日志确认新代码已加载。
- 即使服务声明为 `npm run dev`，遇到“我明明改了代码但行为还是旧的”这类现象时，也必须优先怀疑服务未热更新成功，并主动重启对应服务后再继续排查。
- 重启单个服务时，优先仍通过 `./docker/start-smart.sh` 在仓库根目录执行对应 compose 文件，例如 `./docker/start-smart.sh docker-compose.base.yml up -d platform`；执行后应检查容器日志或接口行为，确认本次改动已经生效。

## 代码组织与文件大小规范

### 目标

- 控制单文件复杂度，避免出现“上千行万能文件”。
- 保持职责单一，便于定位问题、测试、维护和后续扩展。
- 新增功能时优先复用清晰的模块边界，而不是继续堆到现有大文件中。

### 强制规则（MUST）

- 新增或重构业务代码时，必须优先保持单一职责，一个文件只承载一类明确能力。
- 当文件同时承担控制器编排、领域逻辑、数据访问、运行时适配、工具函数等多种职责时，必须拆分。
- 普通业务源码文件原则上不应超过 `800` 行；超过后必须先评估拆分。
- 普通业务源码文件超过 `1200` 行时，除非是明确的生成文件、协议常量、测试夹具或锁文件，否则必须拆分。
- 超过 `500` 行的 Service、Controller、Page、Component 文件，新增需求时优先做职责下沉，不要继续横向堆逻辑。
- 拆分时优先按“职责边界”拆分，而不是机械按行数拆分。

### 建议规则（SHOULD）

- 将复杂 Service 拆为：
  - 编排层
  - 领域服务
  - 运行时适配层
  - DTO / Mapper / 常量 / 工具函数
- 将超大 React 组件拆为：
  - 页面容器
  - 业务区块组件
  - hooks
  - API / state / utils
- 测试文件如果超过 `1500` 行，应考虑按场景拆分为多个测试文件。
- 公共工具函数超过 `300` 行时，应按主题拆分，避免“utils 巨石文件”。

### 例外情况

- 自动生成文件。
- 锁文件，如 `package-lock.json`、`pnpm-lock.yaml`。
- 大型测试数据、模板快照、fixture。
- 协议定义或常量清单文件，且已经证明拆分后反而降低可读性。

### Agent 执行要求

- 在修改已有大文件前，先判断是否应该顺手拆分职责边界。
- 当发现文件明显超出上述阈值时，优先向用户说明，并给出拆分方案或直接执行小步重构。
- 不要为了“减少文件数”而把多个职责重新合并进一个大文件。
- 新建文件时命名要体现职责，例如 `*.service.ts`、`*.mapper.ts`、`*.adapter.ts`、`*.hooks.ts`、`*.constants.ts`。
- 重构后应保证模块导出清晰、依赖方向稳定，避免循环依赖。

## 自检清单（每次执行前）

- 当前目录是否为目标 worktree 根目录。
- `docker/start-smart.sh` 是否被使用。
- Compose 文件中的 volume 是否走 `${PROJECT_ROOT}`。
- 容器内代码路径是否是本次 worktree 的最新内容。
- 当前目标后端服务是否真的已经加载了本次代码改动；如不确定，是否已经重启并验证过对应容器。
- 是否正在把新逻辑继续堆进超大文件。
- 当前改动是否保持了单一职责和清晰边界。
- 是否需要顺手把超过阈值的大文件继续拆分。

## 失败排查建议

- 症状：本地改了代码，容器内不生效  
  优先检查：`PROJECT_ROOT` 是否错误、compose volume 是否写死路径。

- 症状：后端接口行为仍像旧版本 / 明明改了代码但日志和返回值没变化  
  优先检查：目标服务是否实际运行在热更新模式；如果不是，或热更新可疑，立即重启对应容器并重新验证。

- 症状：测试结果与当前分支不一致  
  优先检查：是否绕过了 `start-smart.sh`，是否使用了历史容器与旧挂载。

## 给 Claude Code 的简短指令模板

可在任务描述中直接附加以下说明：

```text
本项目使用 VibeKanban worktree 开发。所有 Docker 启动/测试必须绑定当前目录代码。
请统一通过 ./docker/start-smart.sh 执行 compose，并确保 PROJECT_ROOT 指向当前 worktree 根目录。
请控制单文件大小，保持职责单一；超过 800 行先评估拆分，超过 1200 行的业务源码默认需要拆分。
```
