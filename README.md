# Ops Automation Monorepo

企业级 AI 原生技能与自动化任务编排平台。

---

## 1. 核心架构与文档入口

- **最新项目全景说明书**：[`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md)  
  *涵盖 5 大物理机能平面划分、端到端业务主链、核心架构设计模式、技术栈与工程红线。*
- **项目架构重塑背景书**：[`docs/project_architecture_redesign.md`](docs/project_architecture_redesign.md)  
  *阐述架构演进动因与业务本质。*
- **全局文档中心导航**：[`docs/README.md`](docs/README.md)  
  *设计基线（`docs/design/v4/`）、框架迁移历史（`docs/design/archive/`）、运维手册等。*

---

## 2. 仓库目录结构

- `apps/backend/`:
  - `governance/`: 认证权限、组织、工作台协同、IM 网关（微信长连）、系统灾备引擎
  - `intelligence/`: AI 编排主控、意图解析、参数识别、浏览器动作智能体、代码生成智能体
  - `registry-release/`: 技能/工作流/模板注册中心、发布态门禁管理
  - `execution-control/`: 任务调度控制中心（Control Plane）、会话仲裁管理（Session Broker）
  - `capabilities/`: 浏览器能力域（录制、模板、语义、执行门面）、文档能力域
  - `runtimes/`: 浏览器执行器（Playwright）、无头浏览器集群、Temporal Worker、沙箱环境
  - `platform/`: NestJS Composition Root & 数据库权威（仅依赖注入桥接，零业务逻辑）
- `apps/frontend/`:
  - `portal/`: 企业管理控制台（React / Vite）
  - `user-web/`: 用户业务体验与交互端（React / Vite）
- `packages/`: 跨服务共享契约与核心协议（发布清单、运行时能力契约、错误码等）
- `docker/`: 容器编排、Compose 模板与运维启动脚本

---

## 3. 常用开发与运维命令

所有 Docker 操作优先通过 `./docker/start-smart.sh` 统一入口执行：

```bash
# 1. 启动轻量核心开发栈（6个后端核心服务，按需冷启只要15s）
./docker/start-smart.sh dev up -d

# 或按需启动特定功能组（例如带上浏览器自动化）
./docker/start-smart.sh dev:browser up -d

# 2. 检查当前容器运行状态
./docker/start-smart.sh dev ps

# 3. 校验 4 层分层架构
bash ./docker/scripts/v4/validate-layering.sh

# 4. 校验数据库 Schema 归属权威
node database/scripts/validate-schema-ownership.mjs

# 5. 校验 user-core 边界
pnpm run validate:user-core
```
