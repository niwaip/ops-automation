# AGENTS.md

本文件用于指导 Claude Code 及其他代码 Agent 在本仓库中的工作方式。重点是统一 Docker 入口、减少环境漂移、控制文件复杂度，并要求改动后进行最小必要验证。

## 项目重点

- 所有 Docker 启动、停止、测试操作都从仓库根目录执行。
- 所有 `docker compose` 调用优先通过 `./docker/start-smart.sh` 进入。
- `PROJECT_ROOT` 必须指向当前仓库根目录，Compose 挂载路径必须使用 `${PROJECT_ROOT}`。
- 修改代码后不要默认相信容器已自动生效，必须按服务运行模式决定是否重启并验证。

## 推荐结构

根级 `AGENTS.md` 只保留所有任务都适用的规则；更细的模块规则应放到对应子目录文档中，而不是继续把根文件写成大而全手册。

## Docker 入口

标准命令：

```bash
# 启动开发栈
./docker/start-smart.sh docker-compose.base.yml up -d

# 启动基础设施
./docker/start-smart.sh docker-compose.yml up -d

# 启动测试环境
./docker/start-smart.sh docker-compose.test.yml up --abort-on-container-exit carbone-engine-test

# 停止开发栈
./docker/start-smart.sh docker-compose.base.yml down
```

执行规则：

- 不要直接执行 `docker compose -f ...`，除非已明确确认 `PROJECT_ROOT` 和挂载路径正确。
- 不要恢复或使用已经移除的旧 Docker 启动脚本；统一入口只有 `./docker/start-smart.sh`。
- 启动前先确认当前目录就是仓库根目录。
- 如果修改涉及启动参数、构建产物、依赖注入、环境变量、Compose、数据库连接或跨服务链路，默认重启相关服务再验证。
- 重启单个服务时，仍优先使用 `./docker/start-smart.sh`，例如 `./docker/start-smart.sh docker-compose.base.yml up -d platform`。

## 服务入口配置

- `docker/.env` 通过 `HOST_IP` 配置对外访问主机。
- 如需显式指定宿主机入口，可设置：
  `AUTH_SERVICE_HOST`、`AI_ORCHESTRATOR_HOST`、`SESSION_BROKER_HOST`、`CONTROL_PLANE_HOST`、`BROWSER_WORKER_HOST`、`CARBONE_ENGINE_HOST`
- 未设置时默认使用 Docker 服务名，这通常更稳定。

## 代码组织规则

目标：

- 控制单文件复杂度，避免继续堆出巨石文件。
- 保持单一职责，便于定位、测试和维护。
- 新增功能优先复用明确模块边界，而不是继续把逻辑堆进旧文件。

强制规则：

- 一个文件只承载一类明确能力；若同时承担编排、领域、数据访问、适配、工具等多种职责，必须拆分。
- 普通业务源码文件原则上不应超过 `800` 行；超过后优先评估拆分。
- 普通业务源码文件超过 `1200` 行时，除非是生成文件、锁文件、fixture、协议常量，否则必须拆分。
- 超过 `500` 行的 Service、Controller、Page、Component 文件，新增需求时优先做职责下沉。
- 拆分时按职责边界拆，不按行数机械切块。

建议规则：

- 复杂 Service 优先拆成编排层、领域服务、运行时适配层、DTO/Mapper/常量/工具。
- 超大 React 组件优先拆成页面容器、业务区块组件、hooks、API/state/utils。
- 测试文件超过 `1500` 行时，优先按场景拆分。
- 公共工具函数超过 `300` 行时，优先按主题拆分。

命名建议：

- 新文件名应体现职责，例如 `*.service.ts`、`*.adapter.ts`、`*.mapper.ts`、`*.hooks.ts`、`*.constants.ts`。

## 验证与排查

修改后端代码时：

- 先确认目标服务是否真的支持热更新。
- 只要热更新不可靠，或行为仍像旧版本，就重启服务并检查日志或接口结果。

常见排查：

- 本地改了代码但容器不生效：先检查 `PROJECT_ROOT` 是否正确、Compose volume 是否写死路径。
- 后端接口仍像旧版本：先检查服务是否实际重载了新代码；必要时立即重启容器。
- 测试结果与当前分支不一致：先检查是否绕过了 `start-smart.sh`，是否仍在使用旧容器或旧挂载。

## Agent 工作要求

- 修改已有大文件前，先判断是否应该顺手拆分职责边界。
- 发现文件明显超阈值时，优先说明问题并给出拆分方案，或直接做小步重构。
- 不要为了“减少文件数”把多个职责重新合并进同一文件。
- 重构后保持模块导出清晰、依赖方向稳定，避免循环依赖。
- 行为变化涉及公开接口、运行方式或关键流程时，同步更新相关文档。

## 执行前自检

- 当前目录是否为仓库根目录。
- 是否通过 `./docker/start-smart.sh` 执行 Docker 相关命令。
- Compose 挂载是否走 `${PROJECT_ROOT}`。
- 当前改动是否保持单一职责和清晰边界。
- 是否需要顺手拆分超阈值大文件。
- 是否需要重启并验证相关容器才能确认改动已生效。

## 给 Agent 的简短说明模板

```text
本项目所有 Docker 启动、停止、测试统一通过 ./docker/start-smart.sh 从仓库根目录执行。
请确保 PROJECT_ROOT 指向当前仓库根目录，并检查 Compose 挂载是否使用 ${PROJECT_ROOT}。
请控制单文件大小，保持职责单一；超过 800 行先评估拆分，超过 1200 行的业务源码默认需要拆分。
修改后端代码后，不要默认认为容器会自动生效；请根据服务运行模式决定是否重启并验证。
```
