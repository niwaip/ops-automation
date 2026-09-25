# ADR-004: Capability 数据库 Schema 治理、唯一迁移权限与零 DDL 生产准则 (Capability Database Schema Governance & Zero-DDL Production Rule)

- **状态**: Accepted / Approved
- **日期**: 2026-09-23
- **决策者**: 核心架构团队 (Platform & Database Governance Group)
- **关联需求**: [`docs/architecture-hardening-and-governance-guide.md`](../architecture-hardening-and-governance-guide.md) §9, §11

---

## 1. 背景与问题描述 (Context)

在系统演进过程中，随着文档处理（Carbone Engine, Report）、浏览器模板（Browser Template）与语义解析（Browser Semantics）等独立能力域的增加，部分微服务在容器启动脚本中沿用了 `prisma db push`。这在生产环境中构成了严重隐患：
1. **启动时 DDL 竞态冲突**：微服务横向扩容或多副本并发拉起时，多个容器同时尝试向同一 PostgreSQL Schema 执行 DDL 变更，造成表级排他锁死锁或 Schema 校验失败；
2. **缺乏版本化迁移审计**：`prisma db push` 直接将 Prisma Schema 同步至数据库，不产生版本化迁移脚本（Migration Files），无法追踪变更历史，一旦发生破坏性变更无法追溯谁在何时引入；
3. **违反生产最小权限原则**：若要求运行态应用容器具备 DDL 权限（`ALTER TABLE`, `DROP TABLE`），一旦应用层发生注入攻击，将面临数据库元数据被篡改的致命风险；
4. **开发冷启动与生产发布混淆**：部分依赖安装脚本承担了初始化数据库的附带职责，导致构建环境与生产运行时环境边界模糊。

---

## 2. 决策内容 (Decision)

### 2.1 生产环境唯一迁移权限 (Single Migration Authority)
- **唯一定点执行**: 生产环境一切数据库变更必须且仅能由专用的发布作业（Release Job / Migrator 容器）触发，统一入口为 [`docker/scripts/run-production-schema-migrations.sh`](../../docker/scripts/run-production-schema-migrations.sh) 及 [`docker/scripts/run-production-release-job.sh`](../../docker/scripts/run-production-release-job.sh)。
- **双连接串与权限硬隔离**:
  - **迁移执行者**: 持有专用管理员权限连接串（`CONTROL_PLANE_MIGRATION_DATABASE_URL` 等），具备 DDL 权限，仅在流水线发布阶段执行；
  - **业务运行态容器**: 仅持有普通连接串（`DATABASE_URL`），数据库账号**严格仅开放 DML 权限**（`SELECT`, `INSERT`, `UPDATE`, `DELETE`），**物理剥夺一切 DDL 权限**（`CREATE`, `ALTER`, `DROP`, `TRUNCATE`）。
- **零 DDL 准则**: 应用容器启动流程严禁执行 `prisma db push` 或 `prisma migrate`。启动时如果检测到底层 Schema 与实体定义不一致，必须快速失败（Fail-Fast）并告警，禁止私自建表或改表。

### 2.2 彻底清退 `prisma db push` 与建立基线迁移
1. 对所有 Capability Schema（包括 `browser-template`、`browser-semantics`、`report`、`carbone-engine` 等）建立标准的基线迁移历史（Baseline Migrations: `prisma migrate dev` 产物）；
2. 每一个微服务独立的 Schema 必须在 [`database/schema-ownership.json`](../../database/schema-ownership.json) 中完整登记其表名与属主关系；
3. CI 门禁脚本 `pnpm run validate:schema-ownership` 与 `pnpm run validate:migration-authority` 将其纳入强制检查，任何新增未登记表或在运行时执行 DDL 的行为将直接阻断构建。

### 2.3 开发环境冷启动与构建环境解耦
- [`docker/scripts/bootstrap-workspace-deps.sh`](../../docker/scripts/bootstrap-workspace-deps.sh) 严格收敛职责，仅负责 pnpm workspace 依赖安装与编译缓存，**严禁注入任何数据库 DDL 逻辑**；
- 本地开发环境的数据库初始化，由专用的初始化脚本（`docker compose run --rm schema-init`）在启动基础设施后统一执行，实现开发环境一键冷启动（One-Click Cold Start）。

### 2.4 迁移失败应对与前滚修复原则 (Forward-Fix Strategy)
- 关系型数据库的复杂 DDL 在失败后往往无法无损自动回滚；
- 生产环境确立**前滚修复（Forward-Fix）**原则：
  1. 任何迁移执行前，Release Job 必须在事务中先校验 `_prisma_migrations` 表与迁移目标一致性；
  2. 若迁移中断，发布立即挂起，阻断业务流量切入；
  3. 研发团队评估后提交向前兼容的修复迁移脚本（Fix-forward Migration），严禁直接在生产库手动执行临时 DDL。
- 所有迁移脚本必须在预发环境完成以下三项验证：
  - **空库验证**: 从零初始化的干净数据库全量应用是否成功；
  - **存量升级**: 从上一稳定版本数据库增量应用是否成功；
  - **幂等验证**: 重复执行同一批迁移脚本是否能够安全退出。

---

## 3. 影响评估 (Consequences)

### 正向影响 (Positive)
- 彻底根除了微服务并发扩容时发生的数据库死锁与表结构错乱；
- 生产数据库符合 SOC2 / 核心金融级安全合规标准：业务 Pod 即使被入侵，攻击者也无法执行 DROP 表或篡改结构；
- 形成了清晰可追踪的 Schema 演进版本链。

### 负向影响与对策 (Negative & Mitigation)
- 研发人员在增加业务字段时不能再依赖轻量的 `db push`，必须规范生成 `migrations/` 目录：平台提供标准的 `pnpm --filter <service> db:migrate:dev` 命令与开发辅助工具降低心智负担。
