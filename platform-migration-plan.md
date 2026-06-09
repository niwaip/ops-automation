# Platform Migration Plan

## 目标

将 `apps/backend/core/platform/prisma/schema.prisma` 的当前结构直接固化为第一版基线 migration，后续所有表结构变化都通过新的增量 migration 演进，不再继续维护“分批补洞 + 兼容型 ALTER”的过渡方案。

## 已落地方案

当前仓库已改为单一 baseline 方案：

- 保留一个初始 migration：
  - `apps/backend/core/platform/prisma/migrations/20260608_init_platform_baseline/migration.sql`
- 删除此前按领域拆分的 5 个过渡 migration：
  - `20260401_bootstrap_legacy_auth_schema`
  - `20260429_add_enterprise_org_auth_models`
  - `20260608_add_skill_catalog_schema`
  - `20260609_add_template_and_chat_schema`
  - `20260610_add_execution_runtime_schema`

这份 baseline migration 由 Prisma 根据当前 `schema.prisma` 从空库生成，代表“当前平台 schema 的第一版完整快照”。

## 当前原则

### 1. 新环境

新数据库、空数据库、全新初始化环境：

- 直接执行 `prisma migrate deploy`
- 由 `20260608_init_platform_baseline` 一次性创建当前 schema 所需对象

### 2. 已有环境

已有历史表、已有 `001_init.sql`、已有运行中数据的环境：

- 不执行这份 baseline migration
- 不对现有表做 rename、补列、补约束、兼容型 ALTER
- 只将该 migration 标记为已应用，让 Prisma 的 migration 历史与当前仓库对齐

推荐操作：

```bash
npx prisma migrate resolve --applied 20260608_init_platform_baseline
```

说明：

- 这一步只写入 Prisma migration 记录
- 不会直接修改当前数据库里的业务表
- 适用于“把当前环境视为已经处于 baseline 状态”的场景

## 为什么改成单一 baseline

相比之前的分批补 migration 方案，这种方式更符合当前需求：

- 把“现在的结构”直接定义为第一版，而不是继续追补历史缺口
- 避免对已有环境执行大量 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- 避免继续把历史初始化脚本兼容逻辑混入 Prisma migration
- 新环境有一份完整、干净、可重放的建库脚本
- 后续 schema 变化只需要新增 migration，边界更清晰

## baseline 覆盖范围

这份 baseline 覆盖当前 `schema.prisma` 中的全部 Prisma 对象，包括：

- 基础身份权限域：
  - `users`
  - `roles`
  - `user_roles`
  - `UserRoleType`
- 企业组织域：
  - `organizations`
  - `departments`
  - `teams`
  - `org_memberships`
  - `team_memberships`
  - `org_role_bindings`
  - `identity_provider_configs`
  - `OrganizationType`
  - `MembershipStatus`
  - `IdentityProviderType`
- Skill / Tool / Template / Chat 域：
  - `execution_flow_templates`
  - `skill_configs`
  - `skill_permissions`
  - `tool_catalogs`
  - `skill_tool_bindings`
  - `chat_sessions`
  - `chat_messages`
- Execution Runtime 域：
  - `executions`
  - `runtime_sessions`
  - `execution_steps`
  - `execution_events`
  - `audit_logs`
- Temporal 域：
  - `activities`
  - `temporal_workflows`

## 对历史表的态度

以下历史对象暂时不纳入本次 baseline 兼容处理：

- `templates`
- `sessions`
- `step_logs`
- `ai_agents`

原因：

- 它们不属于当前 Prisma schema 的正式模型
- 当前目标是把“现状 schema”固化成第一版，而不是现在就做历史模型清理
- 如果需要迁移旧数据，应单独立项并定义明确映射规则

## 后续变更规则

从现在开始，`platform` 的表结构变更遵循以下规则：

- 不修改 `20260608_init_platform_baseline` 的语义，除非只是修复明显的基线生成错误
- 新增表、改列、加索引、改约束，都通过新的 Prisma migration 落地
- 不再新增“兼容旧环境自动补表/补列”的大杂烩 migration
- 现有运行环境如果要跟进新结构，按正常增量 migration 执行

## 执行注意事项

- 在已有环境执行任何未来 migration 前，先确认该环境已经完成 baseline 对齐
- 如果数据库不是空库，不要直接运行首版 baseline SQL
- 如果未来需要兼容历史旧表，应该独立写迁移方案，不要回头污染 baseline

## `ops-menu.sh` 设计约束

### 为什么需要补数据库菜单

当前 `docker/scripts/ops-menu.sh` 中的数据库相关动作过于简单：

- `run_migrations()` 直接执行 `platform` 的 `prisma migrate deploy`
- `initial_bootstrap()` 默认会清理卷、启动基础设施、直接跑 migration

这套流程只适合“本地空库 / 全新初始化”场景，不适合以下环境：

- 已有历史表的数据库
- 已跑过旧版 `001_init.sql` 的数据库
- 只想把当前环境标记到 baseline，而不改动现有业务表的数据库

而本方案已经明确区分两类环境：

- 空库：执行 `migrate deploy`
- 已有库：执行 `migrate resolve --applied`

因此 `ops-menu.sh` 必须把这两类路径显式拆开，避免误操作。

### 总体原则

`ops-menu.sh` 应只承担“运维入口编排”和“状态检查”职责，不承担以下职责：

- 不继续维护历史兼容型大杂烩 SQL
- 不在一个菜单项里混合空库初始化与已有库对齐
- 不把 `platform` baseline、其他服务 schema、历史修复 SQL 混为一个动作

换句话说，菜单设计必须与 baseline 规则一致，而不是覆盖 baseline 规则。

## `ops-menu.sh` 目标菜单结构

建议新增独立的 `Database Menu`，至少包含以下动作。

### 1. Database Status Check

用途：

- 检查数据库是否为空库、半初始化、还是已对齐
- 检查 `_prisma_migrations` 是否存在
- 检查关键平台表和关键列是否存在

建议检查项：

- `_prisma_migrations`
- `users`
- `roles`
- `executions`
- `runtime_sessions`
- `execution_steps`
- `execution_events`
- `audit_logs`

补充检查项：

- `executions.current_phase_key`
- `executions.current_phase_status`
- 其他后续新增但容易遗漏的增量列

### 2. Bootstrap Fresh Database

用途：

- 仅用于空数据库、本地重建环境、全新初始化环境

建议流程：

1. 停止所有 compose，并按需清理 volumes
2. 启动基础设施：`postgres`、`redis`
3. 执行 `platform` baseline：`prisma migrate deploy`
4. 执行管理员初始化
5. 启动 core / peripheral 服务
6. 执行数据库状态检查

执行约束：

- 进入该流程前，应明确提示“仅限空库”
- 如果检测到已有业务表，应中止并提示改走“已有库对齐”

### 3. Align Existing Database To Baseline

用途：

- 仅用于已有历史表、已有运行中数据、需要把 migration 历史与仓库对齐的环境

建议执行命令：

```bash
npx prisma migrate resolve --applied 20260608_init_platform_baseline
```

执行约束：

- 不运行 baseline SQL
- 不修改现有业务表
- 只补写 `_prisma_migrations` 记录

### 4. Run Incremental Migrations

用途：

- 用于 baseline 对齐之后的日常增量演进

建议行为：

- 执行 `platform` 的 `prisma migrate deploy`
- 后续如果其他服务也进入正式 Prisma migration 流程，应按服务逐个执行

执行约束：

- 进入该流程前，应先确认环境已经完成 baseline 对齐
- 不应把“首次 baseline 初始化”和“增量迁移”合并成一个动作

### 5. Database Doctor

用途：

- 用于发现“代码已升级，但数据库结构未对齐”的问题

应覆盖的典型问题：

- `browser-template` 相关的 `templates` 表 / enum 不一致
- `control-plane` 相关的 `executions.current_phase_key` 缺列
- `_prisma_migrations` 已记录，但表结构实际未对齐

建议输出：

- 缺失的表
- 缺失的列
- 缺失的 enum / index
- 推荐执行动作

### 6. Service Schema Repair

用途：

- 仅处理明确范围、可控风险的单服务修复动作

约束：

- 不作为默认初始化入口
- 不应该自动执行历史共享 SQL
- 必须给出风险提示

典型适用场景：

- `browser-template` 手工修复 `templates` 表
- 针对单服务的紧急结构纠偏

## `ops-menu.sh` 与当前函数的对应改造

### 保留但需要重命名/收敛的部分

当前：

- `run_migrations()`
- `initial_bootstrap()`
- `restart_all()`

建议调整为更明确的语义：

- `run_platform_baseline_deploy()`
- `resolve_platform_baseline_existing_db()`
- `run_platform_incremental_migrations()`
- `bootstrap_fresh_database()`
- `database_status_check()`
- `database_doctor()`

### 当前 `initial_bootstrap()` 的问题

当前实现默认执行：

1. 删除 volumes
2. 启动 infra
3. 直接执行 `run_migrations()`
4. 初始化 admin
5. 启动所有服务

这相当于把“空库初始化”写死成默认路径，但没有：

- 空库检测
- 已有库保护
- baseline 对齐分支
- 增量迁移分支

因此它应该被改造成 `bootstrap_fresh_database()`，并明确标注“仅限空库 / 本地重建环境”。

## 菜单交互建议

建议在主菜单中新增一级入口：

```text
8. Database menu
```

Database menu 建议包含：

```text
1. Database status check
2. Bootstrap fresh database
3. Align existing database to platform baseline
4. Run incremental migrations
5. Database doctor
6. Service schema repair
0. Back
```

## 与 baseline 规则的对齐方式

这套菜单设计必须严格遵循以下映射关系：

- 新环境 / 空库
  - `Bootstrap fresh database`
  - 内部使用 `prisma migrate deploy`

- 已有环境 / 历史库
  - `Align existing database to platform baseline`
  - 内部使用 `prisma migrate resolve --applied 20260608_init_platform_baseline`

- baseline 之后的日常演进
  - `Run incremental migrations`
  - 内部使用标准增量 migration

这三条路径不能混用。

## 不建议继续保留的做法

- 不建议继续只保留一个模糊的 `run_migrations()`
- 不建议把“空库初始化”和“已有库对齐”合并在一个入口
- 不建议继续依赖 `001_init.sql` 作为通用初始化手段
- 不建议在菜单中加入“无脑补表 / 补列”的自动修复项

## 推荐实施顺序

1. 先更新 `ops-menu.sh` 菜单结构和函数命名
2. 先落地 `Database Status Check`
3. 再落地 `Bootstrap Fresh Database`
4. 再落地 `Align Existing Database To Baseline`
5. 最后补 `Database Doctor` 与单服务修复入口

## 建议的下一步

1. 在一个全新空库上验证 `prisma migrate deploy` 可以完整建出当前 schema
2. 在一个已有环境上验证 `prisma migrate resolve --applied 20260608_init_platform_baseline` 不会改动现有表
3. 为 `ops-menu.sh` 增加 `Database Menu`，并拆分空库初始化、已有库对齐、增量迁移三条路径
4. 先实现 `Database Status Check`，让误操作前可以先看到环境状态
5. 后续任何 schema 变更都直接新增新的 migration
