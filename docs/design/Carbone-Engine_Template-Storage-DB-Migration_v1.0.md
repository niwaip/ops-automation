# Carbone Engine 模板存储数据库化设计

**版本：** v1.1  
**日期：** 2026-05-13  
**状态：** 设计中

---

## 背景

### 当前问题

carbone-engine 当前用纯文件系统存储所有模板元数据：

```
templates/
  <uuid>.docx          ← 模板二进制文件
  <uuid>.json          ← 元数据（相当于数据库行）
  skill_<uuid>.json    ← AI Skill 配置
outputs/
  <uuid>.docx          ← 渲染输出文件
  <uuid>.json          ← 输出元数据
```

这套方案在开发阶段可以运行，但存在以下缺陷：

| 问题 | 影响 |
|---|---|
| `GET /templates` 是全目录扫描 | 模板多了之后 API 响应慢，且无法分页/过滤 |
| 元数据写入是全量覆盖（read → merge → write） | 并发修改会丢数据 |
| 输出文件无限积累，无清理机制 | 磁盘占满 |
| 所有 Studio API 无认证 | 任何人可上传、渲染、删除 |
| 多副本部署共享文件系统难 | 无法水平扩展 |
| 模板无版本历史 | 覆盖无法回滚 |

### 本文范围

**本次只解决元数据持久化问题**，将 `.json` sidecar 文件迁移到 PostgreSQL。

二进制文件（`.docx`/`.xlsx`/`.pptx`）**保持磁盘存储**，路径记录在 DB 中。对象存储（MinIO/S3）作为后续升级，不在本次范围内。

---

## 设计前提

### 共享库 migration owner 约束

`carbone-engine` 当前使用与其他后端服务相同的 PostgreSQL 实例，因此本设计必须遵守共享库的 Prisma 治理规则：

- `carbone-engine` **可以**：
  - 接入 Prisma Client
  - 定义最小化的本服务 schema 视图
  - 完成代码层读写替换
  - 准备 migration 草案
- `carbone-engine` **不可以**：
  - 独立对共享库执行 `prisma migrate dev`
  - 独立执行 `prisma migrate deploy`
  - 独立写入 `_prisma_migrations`

正式建表 SQL / migration 应由共享库 schema owner 统一维护。若沿用当前项目的治理方向，更合适的 owner 仍应是 `core/platform`。

因此，本文中的 Prisma schema 主要用于：

1. 明确 `carbone-engine` 的表结构需求；
2. 支持 Prisma Client 生成与代码实现；
3. 作为 owner 服务后续统一落 migration 的输入草案。

---

## 数据模型设计

### 现有数据的完整字段梳理

通过分析现有代码，模板的生命周期如下：

```
POST /generate           → 创建模板（基础字段）
POST /templates/:id/markings  → 追加 markings
POST /templates/:id/config    → 追加 templateConfig
POST /templates/:id/ai-verify → 追加 verifyResult，创建 marked template
POST /generate-skill          → 创建 skill，更新 skillId
POST /save-template-full      → 合并保存
POST /templates/:id/rename    → 更新 fileName
```

每一步都是读取整个 JSON → 内存合并 → 全量写回。数据库化后每一步变为精准的字段更新。

### 实体关系

```
templates ─────────────────── skills
   │                             │
   │ (original_id self-join)     │ (template_id FK, unique)
   │                             │
   └── templates                 │
       [marked templates]        │
                                 │
render_outputs ──────────────────┘
   (template_id, marked_template_id, skill_id FK)
```

三个独立实体：
- **templates** — 原始模板 + marked 模板（自关联）
- **skills** — AI Skill 配置（绑定到模板）
- **render_outputs** — 每次渲染的输出记录

### 关系建模约束

为避免出现双事实来源，本设计采用以下约束：

- `Skill` 以 `templateId` 作为唯一归属键，表示“一个 skill 属于哪个原始模板”；
- `Template` **不再**保留 `skillId` 冗余字段，skill 关系通过 `Skill.templateId` 反查；
- marked template 与原始模板只保留 `originalId` 这一条自关联链路；
- `markedTemplateId` 不再放在 `Template` 上，若某次渲染使用了 marked 模板，只记录在 `RenderOutput.markedTemplateId`；
- 若后续业务明确“一份原始模板最多存在一个 marked 副本”，再额外给 `originalId` 增加唯一约束；在本版设计中先按“一对多 marked 副本”建模，更贴近历史数据迁移现实。

---

## Prisma Schema

```prisma
// apps/backend/domain/carbone-engine/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TemplateFormat {
  docx
  xlsx
  pptx
  html
}

enum TemplateType {
  template        // 用户上传的原始模板
  marked_template // AI verify 后注入 Carbone 标记的副本
}

// ─────────────────────────────────────────────
// 核心实体：模板（原始 + marked 副本）
// ─────────────────────────────────────────────
model Template {
  id               String         @id @default(uuid()) @db.Uuid

  // 模板类型与来源
  type             TemplateType   @default(template)
  originalId       String?        @map("original_id") @db.Uuid  // marked template 指向原始

  // 文件信息
  fileName         String         @map("file_name") @db.VarChar(500)
  filePath         String         @map("file_path") @db.VarChar(1000) // 磁盘绝对路径
  format           TemplateFormat
  size             Int?           // bytes

  // AI 识别结果（从 suggestions 派生，冗余存储提升查询性能）
  variables        String[]       // ["d.partyA.name", "d.amount", ...]
  loops            Json           @default("[]") // [{ arrayPath: "d.items" }]

  // 用户标注（markings endpoint 写入）
  markings         Json?          // MarkingEntry[]
  ignoredElements  Json?          @map("ignored_elements") // number[]
  elementGroups    Json?          @map("element_groups")   // Record<string, number[]>
  ignoredGroups    Json?          @map("ignored_groups")   // string[]
  markingsSavedAt  DateTime?      @map("markings_saved_at") @db.Timestamptz

  // AI 分析配置（config endpoint 写入）
  templateConfig   Json?          @map("template_config")
  configSavedAt    DateTime?      @map("config_saved_at") @db.Timestamptz

  // AI 原始 suggestions（generate/save-template-full 写入）
  suggestions      Json?

  // AI Verify 结果
  verifyResult     Json?          @map("verify_result")

  createdAt        DateTime       @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime       @updatedAt @map("updated_at") @db.Timestamptz

  // 关系
  original         Template?      @relation("OriginalToMarked", fields: [originalId], references: [id])
  markedCopies     Template[]     @relation("OriginalToMarked")
  skill            Skill?
  renderOutputs    RenderOutput[]

  @@index([type])
  @@index([originalId])
  @@map("carbone_templates")
}

// ─────────────────────────────────────────────
// AI Skill 配置
// ─────────────────────────────────────────────
model Skill {
  id             String     @id @default(uuid()) @db.Uuid
  templateId     String     @unique @map("template_id") @db.Uuid

  parameters     Json       @default("[]") // SkillParameter[]
  dataExample    Json?      @map("data_example")

  createdAt      DateTime   @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime   @updatedAt @map("updated_at") @db.Timestamptz

  template       Template   @relation(fields: [templateId], references: [id])
  renderOutputs  RenderOutput[]

  @@index([templateId])
  @@map("carbone_skills")
}

// ─────────────────────────────────────────────
// 渲染输出记录
// ─────────────────────────────────────────────
model RenderOutput {
  id                 String         @id @default(uuid()) @db.Uuid
  templateId         String?        @map("template_id") @db.Uuid
  markedTemplateId   String?        @map("marked_template_id") @db.Uuid
  skillId            String?        @map("skill_id") @db.Uuid

  // 文件信息
  fileName           String         @map("file_name") @db.VarChar(500)
  filePath           String         @map("file_path") @db.VarChar(1000)
  format             TemplateFormat
  size               Int?

  // 渲染上下文
  params             Json?
  sampleData         Json?          @map("sample_data")
  simulatedData      Json?          @map("simulated_data")
  debugLogs          Json?          @map("debug_logs")

  renderedAt         DateTime       @default(now()) @map("rendered_at") @db.Timestamptz

  // 自动清理支持
  expiresAt          DateTime?      @map("expires_at") @db.Timestamptz

  template           Template?      @relation(fields: [templateId], references: [id])
  markedTemplate     Template?      @relation("MarkedTemplateOutput", fields: [markedTemplateId], references: [id])
  skill              Skill?         @relation(fields: [skillId], references: [id])

  @@index([templateId])
  @@index([markedTemplateId])
  @@index([skillId])
  @@index([expiresAt])
  @@map("carbone_render_outputs")
}
```

> 注：实际 Prisma relation 命名在落代码时需再做一次语法校准，尤其是 `Template.renderOutputs` 与 `RenderOutput.markedTemplate` 同时指向 `Template` 时，应显式命名两组 relation，避免生成 client 时歧义。本节重点是约束关系方向，而不是固定 relation 名称细节。

---

## 数据访问层设计

### PrismaService（复用已有模式）

```typescript
// src/prisma/prisma.service.ts
// 与 platform/control-plane 完全相同的写法
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'] });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

### TemplateRepository（封装查询逻辑）

```typescript
// src/modules/studio/template.repository.ts
@Injectable()
export class TemplateRepository {
  constructor(private prisma: PrismaService) {}

  // 替换 getTemplateMeta(id)
  async findById(id: string) {
    return this.prisma.template.findUnique({ where: { id }, include: { skill: true } });
  }

  // 替换 GET /templates 的全目录扫描
  async list(opts?: { format?: TemplateFormat; type?: TemplateType; limit?: number; offset?: number }) {
    return this.prisma.template.findMany({
      where: {
        type: opts?.type ?? TemplateType.template, // 默认只返回原始模板
        ...(opts?.format && { format: opts.format }),
      },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 50,
      skip: opts?.offset ?? 0,
    });
  }

  // 精准字段更新（替换全量覆盖写入）
  async updateMarkings(id: string, data: { markings: any; ignoredElements: any; elementGroups: any; ignoredGroups: any }) {
    return this.prisma.template.update({
      where: { id },
      data: { ...data, markingsSavedAt: new Date() },
    });
  }

  async updateConfig(id: string, templateConfig: any) {
    return this.prisma.template.update({
      where: { id },
      data: { templateConfig, configSavedAt: new Date() },
    });
  }

  async updateVerifyResult(id: string, verifyResult: any) {
    return this.prisma.template.update({
      where: { id },
      data: { verifyResult },
    });
  }

  async upsertSkill(templateId: string, data: { parameters: any; dataExample?: any }) {
    return this.prisma.skill.upsert({
      where: { templateId },
      update: data,
      create: { templateId, ...data },
    });
  }
}
```

### 输出文件清理（新增能力）

```typescript
// src/modules/studio/output-cleanup.service.ts
@Injectable()
export class OutputCleanupService {
  constructor(private prisma: PrismaService) {}

  // 定时任务：删除超过 7 天的输出文件
  @Cron('0 3 * * *') // 每天凌晨 3 点
  async cleanExpiredOutputs() {
    const expired = await this.prisma.renderOutput.findMany({
      where: { expiresAt: { lt: new Date() } },
    });
    for (const output of expired) {
      await fs.unlink(output.filePath).catch(() => {});
    }
    await this.prisma.renderOutput.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
```

---

## 迁移策略

### 原则

- **不破坏现有 API 接口**：所有响应结构保持不变
- **分阶段执行**：先完成 Prisma 接入与双写，再切换读路径，最后清理文件 sidecar
- **可回滚**：迁移期间文件不删除，数据库写失败时仍可读文件
- **单一事实来源逐步切换**：双写只是过渡手段，最终以数据库为元数据唯一事实来源

### 阶段 0：schema 草案与 owner 落库

```bash
cd apps/backend/domain/carbone-engine

# 安装依赖
pnpm add @prisma/client
pnpm add -D prisma

# 本服务只维护 schema 草案并生成 client
npx prisma validate
npx prisma generate
```

随后由共享库 schema owner：

1. 将 `carbone_templates` / `carbone_skills` / `carbone_render_outputs` 合并进 owner schema；
2. 统一生成 migration；
3. 统一执行 `prisma migrate deploy`。

> 注意：虽然本设计中的表名加了 `carbone_` 前缀避免业务表冲突，但这并不改变“共享库只能有一个 migration writer”的治理要求。

### 第一阶段：双写过渡

在切换读路径之前，先对所有写操作**同时写文件和数据库**。但双写必须明确一致性规则，不能只做“写两份”。

双写期的统一规则：

1. **读路径仍默认读文件**，数据库只用于校验和回填，不直接对外提供模板详情；
2. **写顺序固定为：先文件，后数据库**，保证文件仍是过渡期唯一事实来源；
3. 若文件写成功、数据库写失败：
   - API 仍成功返回；
   - 记录结构化错误日志；
   - 将失败模板 ID 写入补偿队列或待修复表；
4. 若文件写失败，则整个请求失败，不允许只写数据库；
5. 双写期必须提供补偿脚本，能按模板 ID 重新把文件元数据回灌到数据库；
6. 只有当补偿队列清空、抽样对账稳定后，才允许进入读切换阶段。

```typescript
// studio.controller.ts 过渡期写法（以 /generate 为例）
async generate(file: Express.Multer.File, body: any) {
  const id = uuidv4();
  const filePath = path.join(this.templatesDir, `${id}.${format}`);

  // 1. 写文件（原有逻辑不变）
  await fs.writeFile(filePath, file.buffer);
  await fs.writeFile(metaPath, JSON.stringify(meta));

  // 2. 同时写 DB（新增，失败仅记录补偿任务）
  await this.templateRepo.create({ id, fileName, filePath, format, ... }).catch(err => {
    this.logger.warn('DB write failed, filesystem remains source of truth', err);
    await this.repairQueue.enqueueTemplateMetaBackfill(id);
  });

  return meta;
}
```

### 第二阶段：读路径切换

待双写稳定后，将 `getTemplateMeta(id)` 替换为 `templateRepo.findById(id)`。

切换前必须同时满足：

- owner migration 已在目标环境执行完成；
- 存量模板已完成一次全量迁移；
- 双写失败补偿队列为空；
- 以模板 ID 为粒度抽样对比文件 JSON 与 DB 记录，关键字段一致；
- `GET /studio/templates` 与 `GET /studio/templates/:id` 的响应快照对比通过。

```typescript
// 切换前
const meta = await this.getTemplateMeta(id); // 读 JSON 文件

// 切换后
const meta = await this.templateRepo.findById(id); // 读数据库
if (!meta) throw new NotFoundException(`Template ${id} not found`);
```

`GET /templates` 从全目录扫描变为数据库查询，同时可以加上分页参数（后向兼容）。

切换后规则：

1. DB 成为元数据唯一事实来源；
2. 文件 sidecar 不再参与正常读路径；
3. sidecar 仅作为短期回滚兜底保留一段观察期，观察期结束后再清理。

### 第三阶段：存量数据迁移脚本

```typescript
// scripts/migrate-templates-to-db.ts
// 一次性脚本：读取所有现有 .json 文件，写入数据库

async function migrateExistingTemplates() {
  const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json') && !f.startsWith('skill_'));

  for (const file of files) {
    const id = path.basename(file, '.json');
    const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf-8'));
    const filePath = path.join(TEMPLATES_DIR, `${id}.${raw.format}`);

    // 跳过已存在的
    const exists = await prisma.template.findUnique({ where: { id } });
    if (exists) continue;

    await prisma.template.create({
      data: {
        id,
        fileName: raw.fileName ?? `template_${id}.${raw.format}`,
        filePath,
        format: raw.format,
        size: raw.size,
        variables: extractVariables(raw),      // 从 suggestions 派生
        loops: raw.templateConfig?.tableLoops ?? [],
        markings: raw.markings,
        ignoredElements: raw.ignoredElements,
        elementGroups: raw.elementGroups,
        ignoredGroups: raw.ignoredGroups,
        markingsSavedAt: raw.savedAt ? new Date(raw.savedAt) : null,
        templateConfig: raw.templateConfig,
        configSavedAt: raw.configSavedAt ? new Date(raw.configSavedAt) : null,
        suggestions: raw.suggestions,
        verifyResult: raw.verifyResult,
        type: raw.type === 'marked_template' ? 'marked_template' : 'template',
        originalId: raw.originalTemplateId ?? null,
        createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
      },
    });

    if (raw.skillParameters || raw.dataExample) {
      await prisma.skill.upsert({
        where: { templateId: id },
        update: {
          parameters: raw.skillParameters ?? [],
          dataExample: raw.dataExample ?? null,
        },
        create: {
          templateId: id,
          parameters: raw.skillParameters ?? [],
          dataExample: raw.dataExample ?? null,
        },
      });
    }
  }
  console.log(`Migrated ${files.length} templates`);
}
```

### 第四阶段：sidecar 清理

在数据库读路径稳定后，再单独执行 sidecar 清理，不与读切换同批上线：

1. 先停止新 `.json` sidecar 的生成；
2. 保留只读回滚窗口；
3. 观察期结束后批量删除历史 `templates/*.json` 与 `outputs/*.json`；
4. 删除前输出一份审计清单，确保可以按模板 ID 回溯。

---

## 文件存储路径策略

### 当前阶段（本次实现）

文件仍然存储在挂载的 Docker volume 上，数据库只存路径：

```
filePath = "/app/templates/<uuid>.docx"  ← 容器内绝对路径
```

查询时通过路径读文件，与当前逻辑一致。

### 后续可升级为对象存储

当需要多副本部署时，将 `filePath` 替换为对象存储的 key：

```
filePath = "templates/<uuid>.docx"  ← MinIO/S3 对象 key
```

文件读写层抽象为 `StorageService`：

```typescript
interface StorageService {
  put(key: string, buffer: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string): Promise<string>;
}
// 实现一：LocalStorageService（当前阶段）
// 实现二：MinioStorageService（后续升级）
```

`StorageService` 抽象不属于本次必做项。本次允许继续直接使用 `fs.readFile` / `fs.writeFile`，但实现时应尽量把文件访问集中到少数 helper / service 中，避免未来迁移到 `StorageService` 时需要全量散点重构。

---

## 实现工作量估算

| 工作项 | 预估 |
|---|---|
| 添加 Prisma 依赖 + schema 草案 | 0.5 天 |
| owner 服务统一落 migration | 0.5 天 |
| PrismaService + TemplateRepository | 0.5 天 |
| 双写过渡（所有写端点） | 1 天 |
| 读路径切换（findById + list） | 0.5 天 |
| 存量数据迁移脚本 | 0.5 天 |
| OutputCleanupService（定时清理） | 0.5 天 |
| sidecar 清理与观察期收尾 | 0.5 天 |
| **合计** | **~4.5 天** |

---

## 验证清单

```bash
# 1. 迁移后模板列表正常
GET /studio/templates
# → 返回与迁移前相同的模板列表，顺序按 createdAt desc

# 2. 新建模板写入 DB
POST /studio/generate  (上传一个 DOCX)
# → DB: SELECT * FROM carbone_templates WHERE id = '<newId>'
# → 文件仍然在磁盘（双写期）

# 3. markings 更新为精准写入
POST /studio/templates/:id/markings
# → DB: updated_at 更新，其他字段不变

# 4. 存量脚本幂等
# 跑两次脚本，结果相同，无重复记录

# 5. 输出清理
# 手动将某条 carbone_render_outputs.expires_at 设为过去时间
# 触发 cleanup cron
# → 文件已删除，DB 记录已删除

# 6. API 响应结构不变
# 对比迁移前后的 GET /studio/templates/:id 响应，字段完全一致
```

---

## 后续工作（不在本次范围）

1. **Studio API 认证** — 在完成 DB 化后，加 JWT 中间件是独立任务，但前提是有了 DB 才能做用户-模板的所有权绑定
2. **模板版本历史** — DB 化后可以加 `template_versions` 表，在每次 save-template-full 时保存快照
3. **MinIO/S3 对象存储** — 通过 StorageService 抽象层平滑切换
4. **模板搜索** — DB 化后可加 `fileName` 全文索引或 vector 检索
