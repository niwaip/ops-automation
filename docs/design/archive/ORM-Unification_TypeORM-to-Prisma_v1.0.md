# ORM 统一设计文档：TypeORM + raw pg → Prisma

**版本：** v1.1  
**日期：** 2026-05-13  
**状态：** 设计中

---

## 背景与问题

项目目前存在三套数据访问层并存的情况：

| 服务                      | 当前方案                      | 风险                             |
| ------------------------- | ----------------------------- | -------------------------------- |
| `domain/browser-template` | TypeORM + `synchronize: true` | 无迁移记录，可静默修改生产表结构 |
| `domain/report`           | TypeORM + `synchronize: true` | 同上                             |
| `runtime/replay-engine`   | 裸 `pg.Pool` + 手写 SQL       | 无类型安全，维护成本高           |
| `core/*`（4 个服务）      | Prisma                        | —                                |

**目标：** 将三个非 Prisma 服务迁移到 Prisma，统一 ORM 工具链，建立正式迁移记录，消除 `synchronize: true` 的隐患。

**本文档范围：** 仅覆盖 ORM 层替换。4 个 Prisma 服务之间重复定义同一批表（schema 所有权问题）是独立课题，另行处理，但本次迁移前需要先形成最小 owner 清单，避免重复定义范围继续扩大。

---

## 参考模式

以 `core/platform` 为标准模板：

```
apps/backend/core/platform/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 20260429_.../migration.sql
└── src/
    └── prisma/
        ├── prisma.service.ts   ← extends PrismaClient, 实现 OnModuleInit/OnModuleDestroy
        └── prisma.module.ts    ← Global module，export PrismaService
```

`PrismaService` 固定写法（所有服务复用）：

```typescript
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

---

## 迁移前检查与基线门槛

由于 `browser-template` 和 `report` 长期依赖 `TypeORM synchronize: true`，不能默认认为线上表结构与代码认知完全一致。所有服务在进入 Prisma baseline 之前，必须先完成以下检查：

### 1. 数据库现实校验

对每个服务涉及的表执行以下步骤：

```bash
# 1) 先从真实数据库反向拉取一份 Prisma schema 草稿
npx prisma db pull

# 2) 基于草稿与手写 schema.prisma 对照字段/类型/默认值/nullable
npx prisma validate

# 3) 检查 schema 与数据库是否仍有差异
npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma
```

必须重点核对：

- 列类型是否一致，尤其是 `varchar/text/json/jsonb/timestamptz/uuid`
- 默认值是否一致，尤其是 `now()`、布尔值、JSON 默认值
- nullable / not null 是否一致
- 索引、唯一约束、外键是否在 schema 中完整表达
- PostgreSQL enum 是否已经存在且名称一致

### 2. 何时允许使用空 baseline migration

只有同时满足以下条件，才允许使用空的 `0_baseline/migration.sql` 并执行 `migrate resolve --applied`：

1. `prisma db pull` 反向结果与目标 `schema.prisma` 已人工核对；
2. `prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma` 输出为空；
3. 已确认现网不存在依赖 `synchronize` 自动生成、但 Prisma schema 未声明的索引/约束/默认值。

如果上述任一条件不满足，则不能直接空 baseline，必须先调整 `schema.prisma` 或补一条显式 migration，使 Prisma 认知与数据库现实一致后再 resolve。

### 3. 最小 schema owner 清单

虽然跨服务 schema ownership 不在本文档实施范围内，但迁移前至少需要产出一张最小清单：

| 表名               | 当前 owner 服务    | 本次是否新增 Prisma 定义 | 备注     |
| ------------------ | ------------------ | ------------------------ | -------- |
| `templates`        | `browser-template` | 是                       | 本次迁移 |
| `report_templates` | `report`           | 是                       | 本次迁移 |
| `reports`          | `report`           | 是                       | 本次迁移 |
| `step_logs`        | `replay-engine`    | 是                       | 本次迁移 |

要求：本次新增的 3 个 Prisma 服务只能为自己真实拥有的表定义 schema，不得顺手复制其他共享表定义。

---

## 服务 A：`apps/backend/domain/browser-template`

### 涉及表

`templates`（含 PostgreSQL native enum `template_status`）

### 1. 依赖变更

**移除：** `typeorm`、`@nestjs/typeorm`  
**新增：** `@prisma/client`（dep）、`prisma`（devDep）

### 2. Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TemplateStatus {
  DRAFT
  REVIEW
  PUBLISHED
  DEPRECATED
  REVOKED
  @@map("template_status")
}

model Template {
  id           String         @id @default(uuid()) @db.Uuid
  name         String         @db.VarChar(255)
  version      String         @default("1.0.0") @db.VarChar(50)
  status       TemplateStatus @default(DRAFT)
  description  String?        @db.VarChar(1000)
  paramsSchema Json           @default("{}") @map("params_schema")
  steps        Json           @default("[]")
  guards       Json           @default("[]")
  config       Json           @default("{}")
  createdBy    String         @default("system") @map("created_by") @db.VarChar(255)
  reviewedBy   String?        @map("reviewed_by") @db.VarChar(255)
  publishedAt  DateTime?      @map("published_at") @db.Timestamptz
  createdAt    DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime       @updatedAt @map("updated_at") @db.Timestamptz
  deprecatedAt DateTime?      @map("deprecated_at") @db.Timestamptz

  @@map("templates")
}
```

### 3. Baseline Migration（表已存在）

表结构已由 `docker/sql/migrations/001_init.sql` 和 TypeORM `synchronize` 管理。迁移时原则上不重建，但只有在“迁移前检查与基线门槛”全部满足后，才允许标记基线已应用：

```bash
cd apps/backend/domain/browser-template
mkdir -p prisma/migrations/0_baseline
touch prisma/migrations/0_baseline/migration.sql   # 空文件
npx prisma migrate resolve --applied "0_baseline"

# 验证：schema 与现有 DB 无 diff
npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma
```

若 diff 非空，不得继续 `resolve --applied`，必须先修正 schema 或补 migration。

### 4. 模块改动

**`app.module.ts`：**

- 移除 `TypeOrmModule.forRoot(...)`
- 导入 `PrismaModule`

**`template.module.ts`：**

- 移除 `TypeOrmModule.forFeature([TemplateEntity])`
- 导入 `PrismaModule`

### 5. TemplateService 改写

TypeORM → Prisma 调用映射：

| TypeORM                                                                           | Prisma                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `repository.findOne({ where: { id } })`                                           | `prisma.template.findUnique({ where: { id } })`                                           |
| `repository.findOne({ where: { name, version }, order: { created_at: 'DESC' } })` | `prisma.template.findFirst({ where: { name, version }, orderBy: { createdAt: 'desc' } })` |
| `repository.create({...})` + `repository.save(entity)`                            | `prisma.template.create({ data: { ...dto } })`                                            |
| `repository.save(existingEntity)` (update)                                        | `prisma.template.update({ where: { id }, data: { ...fields } })`                          |
| `repository.remove(entity)`                                                       | `prisma.template.delete({ where: { id } })`                                               |
| `createQueryBuilder().getManyAndCount()`                                          | `prisma.$transaction([findMany({...}), count({...})])`                                    |

> 注意：`create()` 时不再需要手动 `uuidv4()`，Prisma schema 的 `@default(uuid())` 自动生成主键。

### 6. 删除文件

- `src/modules/template/template.entity.ts`

---

## 服务 B：`apps/backend/domain/report`

### 涉及表

`report_templates`、`reports`（含 FK 关系）

与服务 A 同一迁移模式，差异在 schema 定义：

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model ReportTemplate {
  id                 String   @id @default(uuid()) @db.Uuid
  name               String   @db.VarChar(255)
  format             String   @db.VarChar(20)
  templateFile       String?  @map("template_file") @db.VarChar(500)
  sections           Json     @default("[]")
  globalConfig       Json?    @map("global_config")
  aiConfig           Json?    @map("ai_config")
  notificationConfig Json?    @map("notification_config")
  createdBy          String?  @map("created_by") @db.VarChar(255)
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz
  reports            Report[]

  @@map("report_templates")
}

model Report {
  id                String         @id @default(uuid()) @db.Uuid
  templateId        String         @map("template_id") @db.Uuid
  sessionId         String         @map("session_id") @db.VarChar(255)
  status            String         @default("pending") @db.VarChar(20)
  resultFile        String?        @map("result_file") @db.VarChar(500)
  aiAnalysis        Json?          @map("ai_analysis")
  validationResults Json?          @map("validation_results")
  notifications     Json?
  error             String?
  createdAt         DateTime       @default(now()) @map("created_at") @db.Timestamptz
  completedAt       DateTime?      @map("completed_at") @db.Timestamptz
  template          ReportTemplate @relation(fields: [templateId], references: [id])

  @@map("reports")
}
```

TypeORM `ManyToOne` 关系由 Prisma `@relation` 替代，但迁移时必须额外核对数据库中的外键行为：

- `ON DELETE`
- `ON UPDATE`
- 是否存在未在 Prisma schema 中声明的索引/唯一约束

如果线上 FK 行为与 Prisma 默认行为不一致，需要在 Prisma schema 中显式补齐，而不是默认认为“无行为差异”。

---

## 服务 C：`apps/backend/runtime/replay-engine`

### 涉及表

- `step_logs`（写入，保留）
- `sessions`（upsert，**删除**——代码注释已标注这是 placeholder，实际 session 状态由 session-broker 管理）

### 1. 依赖变更

**移除：** `pg`、`@types/pg`  
**新增：** `@prisma/client`（dep）、`prisma`（devDep）

### 2. Prisma Schema

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model StepLog {
  id                String    @id @db.Uuid
  sessionId         String    @map("session_id") @db.Uuid
  stepId            String    @map("step_id") @db.VarChar
  stepIndex         Int       @map("step_index")
  action            String    @db.VarChar
  locatorType       String?   @map("locator_type") @db.VarChar
  locatorValue      String?   @map("locator_value") @db.VarChar
  locatorSummary    String?   @map("locator_summary") @db.VarChar
  startedAt         DateTime  @map("started_at") @db.Timestamptz
  completedAt       DateTime? @map("completed_at") @db.Timestamptz
  durationMs        Int?      @map("duration_ms")
  result            String    @db.VarChar
  errorClass        String?   @map("error_class") @db.VarChar
  errorMessage      String?   @map("error_message") @db.VarChar
  retryCount        Int       @default(0) @map("retry_count")
  retryReason       String?   @map("retry_reason") @db.VarChar
  takeoverTriggered Boolean   @default(false) @map("takeover_triggered")
  takeoverReason    String?   @map("takeover_reason") @db.VarChar
  screenshotRef     String?   @map("screenshot_ref") @db.VarChar
  traceRef          String?   @map("trace_ref") @db.VarChar
  context           Json      @default("{}")

  @@map("step_logs")
}
```

### 3. LogService 改写

`DatabaseService` 的 SQL 方法 → Prisma 等价：

| 原方法                       | Prisma 替代                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `insertStepLog(entry)`       | `prisma.stepLog.create({ data: entry })`                                           |
| `updateStepLog(id, updates)` | `prisma.stepLog.update({ where: { id }, data: updates })`                          |
| `getStepLogs(sessionId)`     | `prisma.stepLog.findMany({ where: { sessionId }, orderBy: { stepIndex: 'asc' } })` |
| `createExecutionRecord(...)` | **直接删除**（placeholder，无需替代）                                              |

### 4. 删除 `sessions` 写入前的确认条件

文档中将 `sessions` 写入视为 placeholder 并计划删除，这个方向可以接受，但删除前必须完成以下确认：

1. 全仓 grep 确认不存在依赖 `sessions` 表写入结果的业务代码、脚本或监控；
2. 与 `session-broker` owner 侧确认 session 状态以其 API/表为唯一事实来源；
3. 验证 replay-engine 删除该写入后，不影响执行链路状态推进、排障查询和报表统计；
4. 若仍存在只读查询依赖，需要明确迁移到新来源的替代方案。

### 5. 删除文件

- `src/modules/database/database.service.ts`（或改造为薄封装后删除）

---

## 执行顺序建议

三个服务在代码实现上可并行，但不建议同时上线。建议执行/上线顺序：

1. **browser-template** — 最典型，熟悉迁移模式
2. **report** — 复杂度相当，多一个表关联
3. **replay-engine** — 改动最彻底，删除 DatabaseService

---

## 验证清单

每个服务迁移后执行：

```bash
# 1. migration 状态
npx prisma migrate status

# 2. schema 合法性
npx prisma validate

# 3. 生成 client
npx prisma generate

# 4. schema 与 DB 无 diff（结果应为空）
npx prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma

# 5. 服务启动，确认无 TypeORM / pg 相关日志
pnpm dev
```

上线前增加：

- 启动日志确认仅存在 Prisma client 初始化日志，不再出现 TypeORM `synchronize` 或 `pg.Pool` 初始化日志
- 对照数据库确认 Prisma 未隐式创建额外对象
- 对有历史数据的环境至少做一次真实 CRUD / 查询回归

功能验证：

- browser-template：模板 CRUD、状态流转（DRAFT → REVIEW → PUBLISHED → DEPRECATED）
- report：报告模板 CRUD、报告生成与状态更新
- replay-engine：step_log 写入与查询，确认 sessions 不再被写入（由 session-broker 管理）

---

## 回滚策略

本次迁移目标是“替换访问层，不主动改表结构”。因此回滚策略应优先保证业务可恢复，而不是回滚数据库：

1. 保留迁移前 tag / commit，确保可以快速切回旧实现；
2. 在 Prisma 服务灰度期内，不删除旧 DTO / 业务测试样例，便于快速回放；
3. 若上线后发现 Prisma schema 与真实表结构认知不一致：
   - 立即回退服务代码到旧版本；
   - 停止继续执行新的 Prisma migration；
   - 使用 `prisma migrate diff` 和数据库 DDL 重新对照后再发下一版；
4. 若已删除 `sessions` 写入且发现外部仍有依赖：
   - 临时恢复兼容写入或补一个显式适配层；
   - 不要直接在生产上继续扩大 schema 变更面。

---

## 共享库 Migration Owner 决策（新增）

### 现状结论

基于 `browser-template` 的真实数据库核对，已确认以下事实：

1. 当前 `ops` 库为共享数据库，而非单服务独占数据库；
2. `browser-template` 只关心 `templates` 表，但同库中还存在 `executions`、`runtime_sessions`、`report_templates`、`reports`、`execution_flow_templates` 等大量其他服务表；
3. 至少以下 Prisma 服务已经连接同一 `DATABASE_URL` 并各自维护 schema：
   - `core/platform`
   - `core/control-plane`
   - `core/session-broker`
   - `core/ai-orchestrator`
   - `domain/browser-template`（本次新增）
4. 当前库中尚不存在 `_prisma_migrations` 表，说明共享库还没有正式进入 Prisma migration 管理状态。

### 风险判定

在这种结构下，如果某个服务以“本服务自己的 `schema.prisma`”直接对共享库执行 `prisma migrate diff / dev / deploy`，Prisma 会把未出现在当前 schema 中、但实际属于其他服务的表视为“待删除对象”。

这意味着：

- `browser-template` 无法以“整库 diff 为空”作为 baseline 条件；
- `report` 与 `replay-engine` 后续也会遇到完全相同的问题；
- 如果多个服务各自向同一个 `_prisma_migrations` 写入记录，迁移历史将不可控，且很难解释“某条 migration 对应哪一组表的真实 owner”。

### 决策建议

在共享库 owner 方案明确之前，采用以下策略：

#### 策略 A：单一 Schema Owner（推荐）

- 选定 **一个** 服务作为共享数据库 schema owner；
- 只有该 owner 服务可以执行：
  - `prisma migrate dev`
  - `prisma migrate deploy`
  - `prisma migrate resolve`
- 其他服务：
  - 允许定义最小化 `schema.prisma`
  - 允许 `prisma generate`
  - 允许 `prisma validate`
  - **不允许**对共享库执行 migration 写入 `_prisma_migrations`

如果沿用当前架构，短期更适合作为 owner 的候选是：

- `core/platform`

原因：

- 该服务当前 Prisma schema 覆盖面最广；
- 已经定义了大量共享基础表；
- 由它集中维护共享库 schema，迁移语义最容易解释。

#### 策略 B：各服务独立维护同一共享库（不推荐）

不推荐原因：

- 每个服务的 schema 都是不完整的“局部视图”；
- Prisma 的 migration 机制默认面向“当前 schema 即数据库事实模型”，不适合多个局部 schema 共同驱动同一套 `_prisma_migrations`；
- 长期会导致 migration 历史、owner 边界和回滚责任都不可追踪。

### 对本次迁移的具体影响

#### `browser-template`

- 可以完成：
  - Prisma client 接入
  - `TemplateService` 改写
  - `templates` 表级别的 schema 对齐
  - 本地 `0_baseline` 占位目录准备
- 暂时 **不执行**：
  - `prisma migrate resolve --applied 0_baseline`
  - `prisma migrate deploy`

#### `report`

- 可以继续按相同模式完成代码层 Prisma 替换；
- 但 baseline 处理同样应暂停到 owner 决策完成之后。

#### `replay-engine`

- 可以先完成 ORM/SQL 访问层替换；
- 若 `step_logs` 同样位于共享库，也不应单独写入 migration 记录。

### 执行建议

推荐将本次工作拆成两阶段：

1. **阶段一：代码迁移**
   - 各服务完成 Prisma client 接入与业务代码替换；
   - 保证编译、类型检查、单测/集成验证通过；
2. **阶段二：Migration 落库**
   - 先确定共享库 schema owner；
   - 再由 owner 服务统一设计 `_prisma_migrations` 的初始化与基线策略；
   - 其他服务只消费 Prisma Client，不单独写 migration 历史。

---

## 后续工作（本次不涉及）

- **Schema 所有权整理：** 4 个 Prisma 服务（platform、control-plane、session-broker、ai-orchestrator）重复定义 `executions`、`runtime_sessions` 等表，且字段集存在分叉，需要明确每张表的唯一 schema owner，其他服务通过 API 访问。
