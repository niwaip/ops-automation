# 企业级技能平台 Browser Semantics 服务 Schema 与模块蓝图

**Browser Semantics Service Schema and Module Blueprint v4.0**  
日期：2026-06-21

> 本文将 `browser-semantics` 作为独立 domain 服务进行细化，重点定义其 `Prisma schema`、DTO、模块边界、API 清单与首期落地骨架。  
> 目标是让后续代码落地可以直接从服务骨架开始，而不是再重新设计表结构、接口对象和模块划分。

---

## 1. 文档目标

本文回答以下问题：

- `browser-semantics` 服务首期应该有哪些数据库表
- 每个模块分别管理哪些对象和动作
- 首期 API DTO 应如何定义
- `ai-orchestrator` 应如何以运行时接口读取规则和回写命中日志
- 哪些能力属于 P0，哪些能力可以后置

---

## 2. 服务定位

`browser-semantics` 是一个放在 `apps/backend/domain/` 下的独立服务，负责：

- 浏览器业务语义规则资产管理
- 规则版本状态管理
- 规则发布与回退审计
- 规则命中日志管理
- 回放样本与回放执行管理
- 面向 `ai-orchestrator` 的轻量运行时规则读取接口

它不负责：

- 浏览器页面观察
- 候选提取
- AI planner 推理
- 浏览器动作执行
- session 生命周期

---

## 3. 首期模块清单

### 3.1 推荐模块结构

```text
apps/backend/domain/browser-semantics/
  prisma/
    schema.prisma
    migrations/
  src/
    config/
      service-endpoints.ts
    modules/
      rule-set/
        semantic-rule-set.controller.ts
        semantic-rule-set.dto.ts
        semantic-rule-set.module.ts
        semantic-rule-set.service.ts
      release/
        semantic-rule-release.controller.ts
        semantic-rule-release.dto.ts
        semantic-rule-release.module.ts
        semantic-rule-release.service.ts
      hit-log/
        semantic-rule-hit-log.controller.ts
        semantic-rule-hit-log.dto.ts
        semantic-rule-hit-log.module.ts
        semantic-rule-hit-log.service.ts
      replay/
        semantic-rule-replay.controller.ts
        semantic-rule-replay.dto.ts
        semantic-rule-replay.module.ts
        semantic-rule-replay.service.ts
      runtime/
        semantic-rule-runtime.controller.ts
        semantic-rule-runtime.dto.ts
        semantic-rule-runtime.module.ts
        semantic-rule-runtime.service.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    types/
      semantic-rule.types.ts
    app.module.ts
    main.ts
  test/
  package.json
  tsconfig.json
```

### 3.2 P0 与后置模块

P0 必须有：

- `rule-set`
- `release`
- `hit-log`
- `runtime`

P1 可补：

- `replay`

P2 可补：

- 独立 `targeting` 模块
- 独立统计报表模块

首期为了控制复杂度，可以把 `targeting` 先归到 `release` 模块内管理。

---

## 4. Prisma Schema 设计

### 4.1 枚举建议

```prisma
enum SemanticRuleSetStatus {
  DRAFT
  VALIDATING
  CANARY
  ACTIVE
  ARCHIVED
  ROLLED_BACK
}

enum SemanticRuleType {
  INTENT_ALIAS
  FIELD_ALIAS
  REGION_ALIAS
  ENTITY_ALIAS
  ROW_REFERENCE
  READ_INTENT
  LOGIN_PHRASE
}

enum SemanticRuleReleaseMode {
  MANUAL
  SCHEDULED
  ROLLBACK
}

enum SemanticRuleReplayRunScope {
  PRE_PUBLISH
  CANARY_CHECK
  REGRESSION
  ROLLBACK_CHECK
}
```

### 4.2 表结构总览

首期建议至少有 7 张核心表：

- `semantic_rule_domains`
- `semantic_rule_sets`
- `semantic_rules`
- `semantic_rule_releases`
- `semantic_rule_targetings`
- `semantic_rule_hit_logs`
- `semantic_rule_replay_cases`
- `semantic_rule_replay_runs`

说明：

- 如果要进一步规范化，也可以把 `replay run` 明细拆成 `semantic_rule_replay_run_items`
- 但首期可先把 run 结果存成 JSON 摘要，控制复杂度

### 4.3 Prisma 草案

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SemanticRuleSetStatus {
  DRAFT
  VALIDATING
  CANARY
  ACTIVE
  ARCHIVED
  ROLLED_BACK
}

enum SemanticRuleType {
  INTENT_ALIAS
  FIELD_ALIAS
  REGION_ALIAS
  ENTITY_ALIAS
  ROW_REFERENCE
  READ_INTENT
  LOGIN_PHRASE
}

enum SemanticRuleReleaseMode {
  MANUAL
  SCHEDULED
  ROLLBACK
}

enum SemanticRuleReplayRunScope {
  PRE_PUBLISH
  CANARY_CHECK
  REGRESSION
  ROLLBACK_CHECK
}

model SemanticRuleDomain {
  id          String            @id @default(uuid()) @db.Uuid
  code        String            @unique @db.VarChar(100)
  name        String            @db.VarChar(255)
  description String?           @db.VarChar(1000)
  enabled     Boolean           @default(true)
  createdAt   DateTime          @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt   DateTime          @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  ruleSets    SemanticRuleSet[]
  replayCases SemanticRuleReplayCase[]
  replayRuns  SemanticRuleReplayRun[]

  @@map("semantic_rule_domains")
}

model SemanticRuleSet {
  id                String                   @id @default(uuid()) @db.Uuid
  domainId          String                   @map("domain_id") @db.Uuid
  key               String                   @db.VarChar(120)
  name              String                   @db.VarChar(255)
  version           String                   @db.VarChar(50)
  status            SemanticRuleSetStatus
  description       String?                  @db.VarChar(1000)
  basedOnRuleSetId  String?                  @map("based_on_rule_set_id") @db.Uuid
  changeSummary     String?                  @map("change_summary") @db.VarChar(1000)
  createdBy         String                   @map("created_by") @db.VarChar(255)
  createdAt         DateTime                 @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt         DateTime                 @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  activatedAt       DateTime?                @map("activated_at") @db.Timestamp(6)
  archivedAt        DateTime?                @map("archived_at") @db.Timestamp(6)
  domain            SemanticRuleDomain       @relation(fields: [domainId], references: [id])
  rules             SemanticRule[]
  releases          SemanticRuleRelease[]
  targetings        SemanticRuleTargeting[]
  hitLogs           SemanticRuleHitLog[]

  @@unique([domainId, key, version])
  @@index([domainId, status])
  @@map("semantic_rule_sets")
}

model SemanticRule {
  id               String             @id @default(uuid()) @db.Uuid
  ruleSetId        String             @map("rule_set_id") @db.Uuid
  type             SemanticRuleType
  name             String             @db.VarChar(255)
  enabled          Boolean            @default(true)
  priority         Int
  stopOnMatch      Boolean            @default(false) @map("stop_on_match")
  flags            String?            @db.VarChar(50)
  patterns         Json
  outputs          Json
  examples         Json?
  negativeExamples Json?              @map("negative_examples")
  tags             Json?
  note             String?            @db.VarChar(1000)
  createdAt        DateTime           @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt        DateTime           @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  ruleSet          SemanticRuleSet    @relation(fields: [ruleSetId], references: [id])

  @@index([ruleSetId, type, priority])
  @@map("semantic_rules")
}

model SemanticRuleRelease {
  id                    String                  @id @default(uuid()) @db.Uuid
  ruleSetId             String                  @map("rule_set_id") @db.Uuid
  releaseMode           SemanticRuleReleaseMode @map("release_mode")
  fromStatus            String                  @map("from_status") @db.VarChar(50)
  toStatus              String                  @map("to_status") @db.VarChar(50)
  releasedBy            String                  @map("released_by") @db.VarChar(255)
  releaseNote           String?                 @map("release_note") @db.VarChar(1000)
  triggeredAt           DateTime                @default(now()) @map("triggered_at") @db.Timestamp(6)
  effectiveAt           DateTime?               @map("effective_at") @db.Timestamp(6)
  previousActiveRuleSetId String?               @map("previous_active_rule_set_id") @db.Uuid
  ruleSet               SemanticRuleSet         @relation(fields: [ruleSetId], references: [id])

  @@index([ruleSetId, triggeredAt])
  @@map("semantic_rule_releases")
}

model SemanticRuleTargeting {
  id          String           @id @default(uuid()) @db.Uuid
  ruleSetId   String           @map("rule_set_id") @db.Uuid
  environments Json?
  tenantIds   Json?            @map("tenant_ids")
  userIds     Json?            @map("user_ids")
  skillIds    Json?            @map("skill_ids")
  domains     Json?
  pageTypes   Json?            @map("page_types")
  sampleRate  Float?           @map("sample_rate")
  enabled     Boolean          @default(true)
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt   DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  ruleSet     SemanticRuleSet  @relation(fields: [ruleSetId], references: [id])

  @@index([ruleSetId, enabled])
  @@map("semantic_rule_targetings")
}

model SemanticRuleHitLog {
  id                    String            @id @default(uuid()) @db.Uuid
  domainId              String            @map("domain_id") @db.Uuid
  ruleSetId             String?           @map("rule_set_id") @db.Uuid
  matchedRuleIds        Json              @map("matched_rule_ids")
  inputText             String            @map("input_text") @db.Text
  normalizedInput       String?           @map("normalized_input") @db.Text
  pageUrl               String?           @map("page_url") @db.Text
  pageTitle             String?           @map("page_title") @db.VarChar(500)
  pageType              String?           @map("page_type") @db.VarChar(120)
  observationSummary    String?           @map("observation_summary") @db.Text
  availableCandidateIds Json?             @map("available_candidate_ids")
  normalizedSemantic    Json?             @map("normalized_semantic")
  parserOutput          Json?             @map("parser_output")
  usedAiFallback        Boolean           @default(false) @map("used_ai_fallback")
  finalExecutionSuccess Boolean?          @map("final_execution_success")
  failureReason         String?           @map("failure_reason") @db.VarChar(1000)
  traceId               String?           @map("trace_id") @db.VarChar(255)
  createdAt             DateTime          @default(now()) @map("created_at") @db.Timestamp(6)
  domain                SemanticRuleDomain @relation(fields: [domainId], references: [id])
  ruleSet               SemanticRuleSet?   @relation(fields: [ruleSetId], references: [id])

  @@index([domainId, createdAt])
  @@index([ruleSetId, createdAt])
  @@index([traceId])
  @@map("semantic_rule_hit_logs")
}

model SemanticRuleReplayCase {
  id                   String              @id @default(uuid()) @db.Uuid
  domainId             String              @map("domain_id") @db.Uuid
  caseKey              String              @map("case_key") @db.VarChar(120)
  title                String              @db.VarChar(255)
  pageType             String              @map("page_type") @db.VarChar(120)
  fixtureVersion       String              @map("fixture_version") @db.VarChar(50)
  inputText            String              @map("input_text") @db.Text
  precondition         Json
  observationFixtureRef String?            @map("observation_fixture_ref") @db.VarChar(500)
  expectedSemantic     Json                @map("expected_semantic")
  expectedParserOutput Json?               @map("expected_parser_output")
  expectedExecution    Json?               @map("expected_execution")
  tags                 Json?
  enabled              Boolean             @default(true)
  createdAt            DateTime            @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt            DateTime            @default(now()) @updatedAt @map("updated_at") @db.Timestamp(6)
  domain               SemanticRuleDomain  @relation(fields: [domainId], references: [id])

  @@unique([domainId, caseKey])
  @@index([domainId, enabled])
  @@map("semantic_rule_replay_cases")
}

model SemanticRuleReplayRun {
  id           String                    @id @default(uuid()) @db.Uuid
  domainId     String                    @map("domain_id") @db.Uuid
  ruleSetId    String                    @map("rule_set_id") @db.Uuid
  runScope     SemanticRuleReplayRunScope @map("run_scope")
  totalCases   Int                       @map("total_cases")
  passedCases  Int                       @map("passed_cases")
  failedCases  Int                       @map("failed_cases")
  metrics      Json
  startedAt    DateTime                  @default(now()) @map("started_at") @db.Timestamp(6)
  completedAt  DateTime?                 @map("completed_at") @db.Timestamp(6)
  triggeredBy  String                    @map("triggered_by") @db.VarChar(255)
  reportRef    String?                   @map("report_ref") @db.VarChar(500)
  domain       SemanticRuleDomain        @relation(fields: [domainId], references: [id])

  @@index([domainId, startedAt])
  @@index([ruleSetId, startedAt])
  @@map("semantic_rule_replay_runs")
}
```

### 4.4 首期建表建议

P0 首期可以先只建：

- `semantic_rule_domains`
- `semantic_rule_sets`
- `semantic_rules`
- `semantic_rule_releases`
- `semantic_rule_targetings`
- `semantic_rule_hit_logs`

P1 再补：

- `semantic_rule_replay_cases`
- `semantic_rule_replay_runs`

这样可以先完成：

- 规则版本治理
- 运行时读取
- 命中日志
- 发布回退

---

## 5. 类型定义建议

### 5.1 公共类型文件

建议统一放在：

- `src/types/semantic-rule.types.ts`

建议至少导出：

```ts
export type SemanticRuleSetStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'CANARY'
  | 'ACTIVE'
  | 'ARCHIVED'
  | 'ROLLED_BACK';

export type SemanticRuleType =
  | 'INTENT_ALIAS'
  | 'FIELD_ALIAS'
  | 'REGION_ALIAS'
  | 'ENTITY_ALIAS'
  | 'ROW_REFERENCE'
  | 'READ_INTENT'
  | 'LOGIN_PHRASE';

export interface SemanticRuleDTO {
  id: string;
  type: SemanticRuleType;
  name: string;
  enabled: boolean;
  priority: number;
  stop_on_match: boolean;
  flags?: string;
  patterns: string[];
  outputs: Record<string, unknown>;
  examples?: string[];
  negative_examples?: string[];
  tags?: string[];
  note?: string;
}

export interface SemanticRuleSetDTO {
  id: string;
  domain_id: string;
  key: string;
  name: string;
  version: string;
  status: SemanticRuleSetStatus;
  description?: string;
  based_on_rule_set_id?: string;
  change_summary?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  activated_at?: string;
  archived_at?: string;
  rules?: SemanticRuleDTO[];
}
```

### 5.2 命名建议

- DB 层可以用 Prisma camelCase
- 对外 DTO 统一用 snake_case
- 这样可以与现有不少 domain 服务 DTO 风格保持一致

---

## 6. DTO 设计

### 6.1 `rule-set` DTO

建议文件：

- `src/modules/rule-set/semantic-rule-set.dto.ts`

建议对象：

```ts
export class CreateSemanticRuleDto {
  type!: SemanticRuleType;
  name!: string;
  enabled?: boolean;
  priority!: number;
  stop_on_match?: boolean;
  flags?: string;
  patterns!: string[];
  outputs!: Record<string, unknown>;
  examples?: string[];
  negative_examples?: string[];
  tags?: string[];
  note?: string;
}

export class CreateSemanticRuleSetDto {
  key!: string;
  name!: string;
  version?: string;
  description?: string;
  based_on_rule_set_id?: string;
  change_summary?: string;
  created_by!: string;
  rules!: CreateSemanticRuleDto[];
}

export class UpdateSemanticRuleSetDto {
  name?: string;
  description?: string;
  change_summary?: string;
  rules?: CreateSemanticRuleDto[];
}

export class ListSemanticRuleSetsQueryDto {
  domain_code?: string;
  status?: SemanticRuleSetStatus;
  key?: string;
  page?: number;
  limit?: number;
}
```

### 6.2 `release` DTO

建议文件：

- `src/modules/release/semantic-rule-release.dto.ts`

```ts
export class PromoteSemanticRuleSetToCanaryDto {
  release_note?: string;
  targeting?: {
    environments?: string[];
    tenant_ids?: string[];
    user_ids?: string[];
    skill_ids?: string[];
    domains?: string[];
    page_types?: string[];
    sample_rate?: number;
  };
}

export class PromoteSemanticRuleSetToActiveDto {
  release_note?: string;
}

export class RollbackSemanticRuleSetDto {
  target_rule_set_id!: string;
  reason!: string;
}
```

### 6.3 `hit-log` DTO

建议文件：

- `src/modules/hit-log/semantic-rule-hit-log.dto.ts`

```ts
export class CreateSemanticRuleHitLogDto {
  domain_code!: string;
  rule_set_id?: string;
  matched_rule_ids!: string[];
  input_text!: string;
  normalized_input?: string;
  page_url?: string;
  page_title?: string;
  page_type?: string;
  observation_summary?: string;
  available_candidate_ids?: string[];
  normalized_semantic?: Record<string, unknown>;
  parser_output?: Record<string, unknown>;
  used_ai_fallback!: boolean;
  final_execution_success?: boolean;
  failure_reason?: string;
  trace_id?: string;
}

export class ListSemanticRuleHitLogsQueryDto {
  domain_code?: string;
  rule_set_id?: string;
  page_type?: string;
  trace_id?: string;
  used_ai_fallback?: boolean;
  final_execution_success?: boolean;
  page?: number;
  limit?: number;
}
```

### 6.4 `replay` DTO

建议文件：

- `src/modules/replay/semantic-rule-replay.dto.ts`

```ts
export class CreateSemanticRuleReplayCaseDto {
  domain_code!: string;
  case_key!: string;
  title!: string;
  page_type!: string;
  fixture_version!: string;
  input_text!: string;
  precondition!: Record<string, unknown>;
  observation_fixture_ref?: string;
  expected_semantic!: Record<string, unknown>;
  expected_parser_output?: Record<string, unknown>;
  expected_execution?: Record<string, unknown>;
  tags?: string[];
}

export class RunSemanticRuleReplayDto {
  run_scope!: 'PRE_PUBLISH' | 'CANARY_CHECK' | 'REGRESSION' | 'ROLLBACK_CHECK';
  case_selectors?: {
    tags?: string[];
    page_types?: string[];
    case_keys?: string[];
  };
  triggered_by!: string;
}
```

### 6.5 `runtime` DTO

建议文件：

- `src/modules/runtime/semantic-rule-runtime.dto.ts`

```ts
export class ResolveRuntimeSemanticRuleSetQueryDto {
  domain_code!: string;
  environment?: string;
  tenant_id?: string;
  user_id?: string;
  skill_id?: string;
  host?: string;
  page_type?: string;
}

export class ResolvedRuntimeSemanticRuleSetDto {
  rule_set_id!: string;
  version!: string;
  status!: 'CANARY' | 'ACTIVE';
  rules!: SemanticRuleDTO[];
}
```

---

## 7. API 清单建议

### 7.1 治理接口

建议提供：

- `GET /semantic-rule-domains`
- `GET /semantic-rule-domains/{domainCode}/rule-sets`
- `POST /semantic-rule-domains/{domainCode}/rule-sets`
- `GET /semantic-rule-sets/{id}`
- `PUT /semantic-rule-sets/{id}`
- `POST /semantic-rule-sets/{id}/validate`
- `POST /semantic-rule-sets/{id}/promote/canary`
- `POST /semantic-rule-sets/{id}/promote/active`
- `POST /semantic-rule-sets/{id}/rollback`
- `POST /semantic-rule-sets/{id}/archive`
- `GET /semantic-rule-sets/{id}/releases`

### 7.2 运行接口

建议提供：

- `GET /runtime/semantic-rules/resolve`
- `POST /runtime/semantic-rules/hit-logs`

### 7.3 回放接口

P1 再提供：

- `GET /semantic-rule-replay-cases`
- `POST /semantic-rule-replay-cases`
- `POST /semantic-rule-sets/{id}/validate/replay`
- `GET /semantic-rule-replay-runs/{id}`

---

## 8. 模块职责细化

### 8.1 `semantic-rule-set.service.ts`

负责：

- 创建规则集
- 复制既有版本生成新 draft
- 更新 draft 规则内容
- 列表、详情查询
- 基础校验

不负责：

- promote / rollback
- 命中日志写入

### 8.2 `semantic-rule-release.service.ts`

负责：

- 状态机流转
- promote 到 `CANARY`
- promote 到 `ACTIVE`
- rollback
- archive
- 写发布审计记录

### 8.3 `semantic-rule-hit-log.service.ts`

负责：

- 写入命中日志
- 提供基础查询
- 提供规则误伤分析所需的过滤能力

### 8.4 `semantic-rule-runtime.service.ts`

负责：

- 按运行时上下文解析当前应命中的规则版本
- 返回 active 或 canary 版本
- 不暴露治理字段，只返回运行时需要的最小数据

### 8.5 `semantic-rule-replay.service.ts`

负责：

- 样本管理
- 回放任务执行
- 回放报告摘要输出

---

## 9. AppModule 组装建议

```ts
@Module({
  imports: [PrismaModule],
  controllers: [
    SemanticRuleSetController,
    SemanticRuleReleaseController,
    SemanticRuleHitLogController,
    SemanticRuleReplayController,
    SemanticRuleRuntimeController,
  ],
  providers: [
    SemanticRuleSetService,
    SemanticRuleReleaseService,
    SemanticRuleHitLogService,
    SemanticRuleReplayService,
    SemanticRuleRuntimeService,
  ],
})
export class AppModule {}
```

P0 可以先不暴露 `ReplayController`，但 service 接口命名最好提前占位。

---

## 10. 与 `ai-orchestrator` 的接入建议

### 10.1 新增 client

建议在 `ai-orchestrator` 新增：

- `src/client/browser-semantics.client.ts`

负责：

- 调用 `/runtime/semantic-rules/resolve`
- 调用 `/runtime/semantic-rules/hit-logs`

### 10.2 接入时机

在 `BrowserCommandService` 中建议按以下顺序接入：

1. 获取运行时规则集
2. 做业务语义归一化
3. 继续走结构化候选定位
4. 必要时再进入 AI fallback
5. 最终回写 hit log

### 10.3 首期不要做的事

- 不要让 `ai-orchestrator` 直接写 `browser-semantics` 数据库
- 不要把回放逻辑塞回 `ai-orchestrator`
- 不要让 `browser-semantics` 反向调用 `ModelModule`

---

## 11. 首期开发顺序

### Phase A：服务骨架

- 建立 `browser-semantics` 服务目录
- 建立 Prisma schema
- 建立 `rule-set / release / runtime / hit-log` 模块骨架

### Phase B：最小运行闭环

- 提供 `resolve` 接口
- 提供 `hit-logs` 接口
- 由 `ai-orchestrator` 接入读取与回写

### Phase C：治理闭环

- 提供创建版本、编辑 draft、promote、rollback
- 补发布审计与 targeting

### Phase D：回放闭环

- 增加 replay case
- 增加 replay run
- 增加回放门禁

---

## 12. 验收标准

首期服务骨架完成后，应满足：

- `browser-semantics` 可独立启动
- 可创建 `browser_recorder` 规则域与最小规则集
- `ai-orchestrator` 可通过 runtime API 读取 active/canary 规则
- `ai-orchestrator` 可回写 hit log
- 回退不需要修改 `browser-command.service.ts` 代码

---

## 13. 与其他文档的关系

- 分层改造方案：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Domain-Extraction-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Domain-Extraction-Plan_v4.0.md)
- 数据与发布回退：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md)
- 实施 Backlog：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md)

本文解决的是“服务本身怎么建”；它不替代评测站矩阵文档，也不替代总的迁移 Backlog。

---

## 14. 一句话总结

> `browser-semantics` 的首期落地不需要一开始就做成“大而全平台”，而应先落成一个小而清晰的 domain 服务：有规则集表、有发布状态机、有运行时读取接口、有命中日志回写接口，然后再逐步补回放、报表和运营能力。
