# 数据库全局治理中心 (Database Governance & Security Policy)

本目录为 Ops Automation 仓库的**数据库全局治理与安全访问控制中心**。

> [!NOTE]
> 本目录**不是**运行时业务代码或 npm 模块（没有 `package.json`），而是全仓库跨微服务共享 PostgreSQL 实例时的**架构约束事实源（Source of Truth）**、**表属主划分契约**与**迁移防漂移校验工具链**。

---

## 一、核心定位与解决的问题

在微服务架构演进过程中，多个后端服务（`platform`、`control-plane`、`session-broker`、`ai-orchestrator`、`experience-learning` 等）物理上共享同一个 PostgreSQL 实例。为了防止微服务之间出现**“跨服务私自连库改表”**、**“数据表归属混乱”**以及**“多分支合并引发迁移漂移”**，本目录设立了严格的架构治理规范：

1. **单一写入者原则（Single Writer Principle）**：全系统 100 多张数据表中的每一张，都必须且仅能隶属于一个明确的核心微服务。
2. **最小特权生产安全（Least Privilege Access）**：通过 PostgreSQL RBAC 角色隔离，各微服务只能操作自身所属业务表。
3. **自动化合规防漂移（Automated CI/CD Guardrails）**：通过脚本在提交代码与生产发布前自动校验 Schema 归属与历史 SQL 字节一致性。

---

## 二、目录结构说明

```text
database/
├── schema-ownership.json                  # 数据表单一属主映射事实源（全系统表归属权威）
├── security/                              # 生产安全与角色访问控制
│   ├── access-policy.json                 # 微服务账号与数据库角色的绑定策略
│   └── roles.sql                          # 生产数据库角色（NOLOGIN 逻辑组）与表级权限定义
├── scripts/                               # CI/CD 与本地开发校验脚本
│   ├── sync-prisma-schema.sh              # 同步 Platform 与 Control-Plane 的 Prisma 镜像
│   ├── validate-schema-ownership.mjs      # 校验各服务 Prisma 模型是否越权定义/缺失属主
│   ├── validate-migration-authority.mjs   # 强校验主迁移与各业务端历史 SQL 是否字节一致
│   ├── validate-migration-targets.mjs     # 校验各 Schema 迁移目标路径有效性
│   ├── validate-application-database-targets.mjs # 校验应用环境变量中的数据库连接合规性
│   └── verify-application-roles.mjs       # 校验 PostgreSQL 实际权限是否严格符合策略
└── test/                                  # 权限策略隔离测试与测试夹具
    ├── create-isolated-access-policy-database.mjs
    └── provision-access-policy-fixture.mjs
```

---

## 三、表属主划分规则 (`schema-ownership.json`)

系统中的数据表按微服务职能划分为八大治理域：

| 治理域 (Owner Key) | 负责微服务 | 代表性核心数据表 |
| :--- | :--- | :--- |
| **`governance-platform`** | `apps/backend/platform` | `users`, `workspaces`, `workspace_nodes`, `departments`, `teams`, `audit_logs` 等 |
| **`control-plane`** | `apps/backend/execution-control/control-plane` | `executions`, `execution_steps`, `execution_plans`, `skill_schedules` 等 |
| **`ai-orchestrator`** | `apps/backend/intelligence/ai-orchestrator` | `chat_sessions`, `chat_messages`, `llm_operations`, `llm_operation_eval_*` 等 |
| **`registry-release`** | `apps/backend/platform` (技能中心) | `builtin_skills`, `builtin_skill_versions`, `capability_releases`, `tool_catalogs` 等 |
| **`session-broker`** | `apps/backend/execution-control/session-broker` | `runtime_sessions` |
| **`im-gateway`** | `apps/backend/platform` (IM 模块) | `im_channel_connections` |
| **`experience-learning`** | `apps/backend/intelligence/ai-orchestrator` | `user_habits`, `user_saved_skills`, `scoped_memories`, `assistant_feedback_*` 等 |
| **`browser-semantics`** | `apps/backend/capabilities/browser-domain/semantics` | 浏览器语义规则相关表 |

- **规范要求**：业务开发中如果新增数据表，必须在所属服务的 `schema.prisma` 中定义，并同步更新 [`schema-ownership.json`](./schema-ownership.json) 中的对应 `owners` 数组。

---

## 四、生产安全角色策略 (`security/`)

在生产或多租户环境中，禁止各微服务使用超级用户（如 `postgres`）直连。

- **逻辑写入组 (NOLOGIN Roles)**：
  - `ops_governance_writer`：仅授予平台与租户管理表的 CRUD。
  - `ops_execution_writer`：仅授予控制面调度与执行表的 CRUD。
  - `ops_intelligence_writer`：仅授予会话与大模型编排表的 CRUD。
  - `ops_runtime_writer`：仅授予会话代理表的 CRUD。
  - `ops_application_reader`：全局只读角色，仅供跨库只读报表或分析使用。
- **配置绑定 (`access-policy.json`)**：
  定义了运行时各类登录账号（如 `CONTROL_PLANE_DB_LOGIN`、`AI_ORCHESTRATOR_DB_LOGIN`）实际允许继承的角色组合。

---

## 五、开发者常用治理命令

在仓库根目录下，可通过以下命令执行合规检查：

```bash
# 1. 校验全仓库 Prisma Schema 表属主契约（新增表必须声明属主）
pnpm run validate:schema-ownership

# 2. 校验主平台与 AI 编排器之间的权威迁移一致性（防止分支合并出现历史 SQL 漂移）
pnpm run validate:migration-authority

# 3. 校验迁移目标与应用数据库连接合规性
pnpm run validate:migration-targets
pnpm run validate:application-database-targets

# 4. 验证 PostgreSQL 角色权限配置（需可连接测试库）
pnpm run verify:production-db-roles
```

---

## 六、为什么保留在仓库根目录？

1. **跨微服务的最高契约地位**：数据库属主治理覆盖了 `platform`、`control-plane` 和 `ai-orchestrator`，放在任何单一微服务目录下都会造成概念倒置；而它又不属于业务 SDK，不适合放入 `packages/`。
2. **与根目录基础设施同级**：根目录下 `docker/` 管理容器与启动入口，`docs/` 管理产品与技术文档，`database/` 承载数据库资产规范与安全基线，分工明确。
3. **与 CI/CD 及启动脚本强绑定**：根目录 [`package.json`](../package.json)、[`README.md`](../README.md)、Docker 初始化与生产发布脚本均直接引用了 `database/scripts/...`，保持现有物理路径可保障各流水线稳定。
