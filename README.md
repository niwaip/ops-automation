# Ops Automation Monorepo

企业级 AI 原生技能与自动化任务编排平台。

---

## 1. 核心架构与文档入口

- **最新项目全景说明书**：[`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md)  
  _涵盖 5 大物理机能平面划分、端到端业务主链、核心架构设计模式、技术栈与工程红线。_
- **项目架构重塑背景书**：[`docs/project_architecture_redesign.md`](docs/project_architecture_redesign.md)  
  _阐述架构演进动因与业务本质。_
- **全局文档中心导航**：[`docs/README.md`](docs/README.md)  
  _设计基线（`docs/design/v4/`）、框架迁移历史（`docs/design/archive/`）、运维手册等。_

---

## 2. 仓库目录结构

- [`apps/`](apps/README.md): 业务应用与服务平面（含后端 7 大机能平面、Web 前台/后台、Office 插件与硬件终端）
  - `apps/backend/`: 后端微服务（`governance/`, `intelligence/`, `registry-release/`, `execution-control/`, `capabilities/`, `runtimes/`, `platform/`）
  - `apps/frontend/`: Web 应用（`portal/` 管理控制台、`user-web/` 用户交互端、`shared/` 通用组件）
  - `apps/office-addin/`: Word、Excel、PowerPoint Office.js 协同插件
  - `apps/ai-passport-agent/`: ESP32-C3 随身语音硬件终端固件
  - `apps/desktop/`、`apps/mobile/`、`apps/social-platform/`: 基于 `@ops/user-core` 的多端宿主脚手架
- [`packages/`](packages/README.md): 跨端共享契约与核心协议包（14 个跨服务协议包、能力 SDK 与多端状态机 `user-core`）
- [`builtin-skills/`](builtin-skills/README.md): 平台内置技能资产（14 个系统技能、工作流定义与契约清单）
- [`database/`](database/README.md): 全局数据库治理中心（95 表单一属主映射、RBAC 安全角色与迁移一致性校验）
- [`docker/`](docker/README.md): 统一容器编排、分层镜像构建与环境管理中心（入口: `./docker/start-smart.sh`）
- [`scripts/`](scripts/README.md): 仓库工程质量门禁与工具中心（架构无环、1600 行红线、副作用状态机与迁移工具）
- [`tests/`](tests/README.md): 跨服务测试中心（文档提取比对基线、E2E 集成测试、PostgreSQL 50 并发压测与 Mock 服务）
- [`docs/`](docs/README.md): 当前架构基线、设计文档、ADR 决策与运行维护手册

---

## 3. 常用开发与运维命令

所有 Docker 操作优先通过 `./docker/start-smart.sh` 统一入口执行：

```bash
# 1. 启动轻量核心开发栈（当前共 10 个服务，含基础设施、核心控制、文档引擎与前端）
./docker/start-smart.sh dev up -d

# 或按需启动特定功能组（例如带上浏览器自动化）
./docker/start-smart.sh dev:browser up -d

# 2. 检查当前容器运行状态
./docker/start-smart.sh dev ps

# 3. 校验 4 层分层架构
bash ./docker/scripts/v4/validate-layering.sh

# 4. 校验 Workspace 包边界、依赖协议与循环依赖
pnpm run check:architecture

# 5. 校验数据库 Schema 归属权威
node database/scripts/validate-schema-ownership.mjs

# 6. 校验 user-core 边界
pnpm run validate:user-core
```
