# 仓库目录与 Workspace 边界规范

本规范定义 Ops Automation Monorepo 的物理目录职责、包边界和可自动校验的结构约束。新增模块应先选择明确归属，禁止通过继续扩大宽泛 Workspace glob 或在基础设施目录中堆放业务实现来规避边界设计。

## 1. 根目录职责

| 目录              | 唯一职责                                 | 不应包含                       |
| ----------------- | ---------------------------------------- | ------------------------------ |
| `apps/`           | 可独立构建或部署的服务、客户端与设备应用 | 跨服务共享协议                 |
| `packages/`       | 稳定契约、SDK 和多端共享核心             | HTTP 服务入口、数据库实现      |
| `builtin-skills/` | 平台内置技能发布资产                     | 通用运行时代码                 |
| `database/`       | Schema 属主、迁移权威和数据库安全策略    | 运行时业务模块                 |
| `docker/`         | Dockerfile、Compose 和镜像装配资产       | 业务服务与 Runner 的事实源代码 |
| `tests/`          | 跨服务契约、验收、集成和端到端测试       | 单服务内部单元测试             |
| `docs/`           | 当前架构基线、规范、运行手册与归档设计   | 临时任务笔记                   |

单服务单元测试应与源码就近放置；跨服务测试才进入根级 `tests/`。

## 2. 后端平面

`apps/backend/` 只允许以下目标平面：

- `governance/`：身份、组织、审计、协同工作台与外部通道治理。
- `intelligence/`：意图理解、确定性规划和专用智能体。
- `registry-release/`：设计态资产、校验、审批、发布和回滚。
- `execution-control/`：执行状态机、审批、会话和资源调度。
- `capabilities/`：浏览器、文档等南向能力域。
- `runtimes/`：无业务编排权的 Worker、Executor 和租户 Runner。
- `platform/`：Composition Root、持久化 Adapter 和数据库权威。
- `var/`：被 Git 忽略的运行时数据。

不得重新创建 `apps/backend/core`、`apps/backend/domain` 或 `apps/backend/orchestration`。跨服务协作优先通过 `packages/backend-contracts/*`、显式 Port 或运行时协议完成。

## 3. Workspace 规则

- `pnpm-workspace.yaml` 是 Workspace 范围的唯一事实源，根 `package.json` 不再维护第二套 `workspaces`。
- 仓库内部 `@ops/*` 和 `@ops-automation/*` 依赖必须使用 `workspace:*`。
- 全仓库只允许根级 `pnpm-lock.yaml`，应用和服务目录不得维护子锁文件。
- Workspace 包名必须唯一，依赖图不得形成循环。
- 新增 Workspace 使用精确目录或单层 glob；禁止恢复 `apps/*/*/*/*` 之类的迁移期宽泛匹配。

运行 `pnpm run check:architecture` 可以验证上述约束。

## 4. 当前迁移债务

当前结构中的兼容边界：

- `@ops/document-domain` 与 `@ops/document-report` 已是平级包；`carbone-engine-compat` 仅转发历史命令。新功能直接使用实际归属包。
- Prisma Client 由安装或构建流程生成；只提交 Schema 与迁移，不提交生成后的 Client。
- 个人沙箱的源码、插件与技能资产统一放在 `apps/backend/runtimes/personal-sandbox-runner/`；`docker/user-sandbox/` 只保留镜像与入口装配文件。
- Studio 的手写前端源码放在 `document-domain/studio-web/`，`public/js/app.js` 由构建脚本拼接生成；修改源文件后运行 `pnpm --filter @ops/document-domain build:studio-web`。
