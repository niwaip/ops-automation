# 三类能力体系与 LLM Operation 治理落地计划

状态：Implementation In Progress（独立 Runtime 目标已锁定）

日期：2026-08-03

对应设计：`three-capability-types-and-llm-operation-governance-design.md`

适用仓库：`ops-automation`

> 2026-08-23 更新：用户可规划的系统 Operation 已收敛为 `summarize_text`、`summarize_list`、`transform_text`、`extract_structured_fields`。`classify_intent_label`、`rewrite_to_markdown`、`merge_multi_source_notes` 标记为 deprecated，只保留历史精确版本供冻结计划兼容。翻译、改写、润色、合并和 Markdown 格式化统一由 `transform_text` 承担；图片能力本期不实现。

## 1. 文档目的

本文把“三类能力体系与 LLM Operation 可控治理设计”拆成可排期、可验证、可回滚的工程任务。实施目标不是新增一套孤立的 Prompt 管理功能，而是让下列链路使用同一事实源：

```text
能力登记
→ Planner 候选
→ 确定性计划冻结
→ Workflow/直接运行
→ 输入输出裁决
→ 评测与发布
→ 调用审计
```

三类能力最终在管理面清晰分栏：

| 类型          | `capabilityKind`  | 权威事实源                  | 运行时            |
| ------------- | ----------------- | --------------------------- | ----------------- |
| 内置 Skill    | `builtin_skill`   | Built-in Skill Registry     | 固定 Handler      |
| 编排型 Skill  | `published_skill` | Capability Release Registry | Temporal Workflow |
| LLM Operation | `llm_operation`   | LLM Operation Registry      | 受控模型 Runtime  |

## 2. 实施范围

### 2.1 本期必须完成

- 建立数据库化、不可变版本的 LLM Operation Registry。
- 把当前六个代码内 Operation 迁移为 Registry 初始版本。
- Planner 候选卡片从 Registry/Catalog 自动投影，删除第二份手写列表。
- 技能管理新增独立的“LLM 能力”Tab。
- 支持 Draft、校验、评测、审批、激活、版本 Diff 和回滚。
- 冻结计划绑定精确 Operation 版本和 Digest。
- Runtime 强制输入/输出 Schema、模型策略和无 Tool Call 约束。
- 模型调用从 Workflow/Activity 中剥离，迁移为控制面直接执行的独立 LLM Operation 节点。
- 建立端到端测试、审计索引和迁移回滚方案。

### 2.2 不在本期

- 通用聊天 Agent Prompt 管理。
- Prompt 市场和跨租户分享。
- 允许用户上传任意执行代码作为 LLM Operation。
- 自动把 AI 建议直接发布到生产。
- 保存或展示模型隐藏思维链。

## 3. 当前代码基线与差距

### 3.1 AI Orchestrator

| 当前文件                                                                                        | 当前职责                                      | 差距                                        |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| `apps/backend/intelligence/ai-orchestrator/src/modules/llm-operation/llm-operation.registry.ts` | 六个 Operation 的 Prompt、Schema、Parser 常量 | Prompt 更新需发版；无持久化版本、审批和评测 |
| `.../llm-operation.service.ts`                                                                  | 查常量并执行模型调用                          | 无精确 Digest 校验；无统一调用审计          |
| `.../llm-operation.controller.ts`                                                               | 查询/执行接口                                 | 缺管理、版本、评测、激活和回滚 API          |
| `.../planner/candidate-selection/capability-candidate-selector.service.ts`                      | 手写四个 Operation 候选                       | 与 Registry 六个 Operation 已漂移           |
| `.../planner/deterministic/deterministic-plan-generator.service.ts`                             | 读取常量派生输出契约                          | 仍依赖进程内常量；存在固定字段特判          |

当前 Registry 有六个 Operation：

```text
summarize_list
rewrite_to_markdown
summarize_text
extract_structured_fields
classify_intent_label
merge_multi_source_notes
```

Planner 手写候选只有前四个。P0 必须先消除这个可观测漂移。

### 3.2 Control Plane

关键路径：

- `apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/capability-contract-catalog.service.ts`
- `.../deterministic-plan-freeze.service.ts`
- `.../deterministic-plan-validator.service.ts`
- `.../deterministic-plan-scheduler.service.ts`

现状已经识别 `llm_operation`，但冻结引用仍兼容 `promptTemplateVersion`，需要升级为：

```text
operationId + operationVersion + operationDigest
```

Control Plane 不保存 Prompt 正文，只保存精确引用、契约快照、摘要和 Attestation 引用。

此外，当前 `capability-contract-catalog.service.ts` 的本地类型仍使用
`custom_skill`，而 Capability Contract V2 的标准枚举是 `published_skill`。
实施时必须在 Catalog 边界统一写出 `published_skill`；迁移窗口内只允许读取
旧值 `custom_skill` 并映射，不能继续产生新的 `custom_skill` 数据。

### 3.3 Platform 与 Temporal Workflow

关键路径：

- `apps/backend/core/platform/src/modules/temporal-workflow/fixed-activity-templates.ts`
- `.../builtin-activity.registry.ts`
- `.../temporal-workflow-codegen.service.ts`
- `.../temporal-workflow-draft*.ts`
- `apps/frontend/portal/src/features/admin/temporal/components/WorkflowEdit/`

`builtin:aiStructuredTransform` 当前直连通用模型接口。迁移期间仅为已发布 Workflow 保留兼容执行；新建 Workflow 不得承载模型调用。确定性计划在 Workflow Skill 节点之间单独编排精确 LLM Operation 引用。

### 3.4 Portal

当前入口：

```text
apps/frontend/portal/src/features/admin/skills/pages/SkillAdminPage.tsx
```

该页面已超过 2200 行。依据仓库文件复杂度规则，本功能不得继续把列表、编辑器、评测和版本历史堆入该文件，必须按职责拆分。

## 4. 目标模块结构

### 4.1 AI Orchestrator

建议结构：

```text
src/modules/llm-operation/
├── api/
│   ├── llm-operation-admin.controller.ts
│   ├── llm-operation-runtime.controller.ts
│   └── dto/
├── domain/
│   ├── llm-operation.types.ts
│   ├── operation-digest.service.ts
│   ├── operation-version-policy.service.ts
│   └── operation-errors.ts
├── registry/
│   ├── llm-operation.repository.ts
│   ├── prisma-llm-operation.repository.ts
│   ├── llm-operation-registry.service.ts
│   └── llm-operation-catalog-projector.ts
├── runtime/
│   ├── llm-operation-runtime.service.ts
│   ├── prompt-renderer.service.ts
│   ├── model-policy-resolver.service.ts
│   ├── structured-output-validator.service.ts
│   └── repair-policy.service.ts
├── evaluation/
│   ├── operation-evaluation.service.ts
│   ├── deterministic-fixture-runner.service.ts
│   ├── model-evaluation-runner.service.ts
│   └── regression-comparator.service.ts
├── audit/
│   ├── llm-operation-audit.service.ts
│   └── gen-ai-telemetry.mapper.ts
├── seed/
│   └── system-operations.seed.ts
└── llm-operation.module.ts
```

边界要求：

- Controller 不直接访问 Prisma。
- Registry 不执行模型。
- Runtime 不决定某版本是否可以激活。
- Evaluation 不修改 Production Pointer。
- Digest 计算只保留一个实现。
- Seed 文件可以含初始 Prompt，但运行时不得继续以 Seed 常量为事实源。

### 4.2 Portal

建议结构：

```text
src/features/admin/skills/
├── pages/
│   └── SkillAdminPage.tsx
├── llm-operations/
│   ├── api/llmOperationApi.ts
│   ├── components/
│   │   ├── LlmOperationList.tsx
│   │   ├── LlmOperationOverview.tsx
│   │   ├── LlmOperationVersionList.tsx
│   │   ├── LlmOperationPromptEditor.tsx
│   │   ├── LlmOperationSchemaEditor.tsx
│   │   ├── LlmOperationDiff.tsx
│   │   ├── LlmOperationEvaluationPanel.tsx
│   │   └── LlmOperationAuditPanel.tsx
│   ├── hooks/
│   │   ├── useLlmOperations.ts
│   │   └── useLlmOperationVersions.ts
│   ├── pages/LlmOperationAdminTab.tsx
│   └── types.ts
└── shared/
    └── CapabilityKindBadge.tsx
```

`SkillAdminPage.tsx` 只负责顶层 Tab 路由和共享筛选状态，不承载 Operation 业务实现。

### 4.3 Control Plane

保留现有 `plan-runtime` 模块，新增小职责组件：

```text
plan-runtime/
├── llm-operation-contract-client.service.ts
├── operation-reference-freezer.service.ts
└── operation-runtime-adapter.service.ts
```

避免继续扩大 Scheduler；Scheduler 只调 Adapter 并处理统一 `RuntimeStepResultV2`。

## 5. 数据模型与迁移

### 5.1 表设计

LLM Operation 的权威数据存放在 AI Orchestrator 所属数据库 Schema。建议表：

#### `llm_operations`

| 字段                    | 类型     | 约束                                 |
| ----------------------- | -------- | ------------------------------------ |
| `id`                    | UUID     | 主键                                 |
| `operation_key`         | String   | 唯一、不可变，如 `summarize_list`    |
| `display_name`          | String   | 非空                                 |
| `description`           | Text     | 非空                                 |
| `owner`                 | String   | 非空                                 |
| `status`                | Enum     | `active/deprecated/disabled`         |
| `source`                | Enum     | `system_seed/admin_created/imported` |
| `created_at/updated_at` | DateTime | 审计时间                             |

#### `llm_operation_versions`

| 字段                     | 类型     | 约束                                                              |
| ------------------------ | -------- | ----------------------------------------------------------------- |
| `id`                     | UUID     | 主键                                                              |
| `operation_id`           | UUID     | 外键                                                              |
| `version`                | String   | 与 `operation_id` 联合唯一                                        |
| `state`                  | Enum     | `draft/validating/candidate/approved/deprecated/retired/rejected` |
| `manifest_json`          | Json     | 规范化完整 Manifest                                               |
| `operation_digest`       | String   | 联合唯一的一部分，发布后不可变                                    |
| `change_summary`         | Text     | 必填                                                              |
| `created_by`             | String   | 必填                                                              |
| `approved_by`            | String?  | 激活生产前必填                                                    |
| `created_at/approved_at` | DateTime | 审计时间                                                          |

#### `llm_operation_activations`

| 字段           | 类型     | 约束                  |
| -------------- | -------- | --------------------- |
| `operation_id` | UUID     | 外键                  |
| `environment`  | String   | 如 `dev/staging/prod` |
| `version_id`   | UUID     | 精确版本              |
| `activated_by` | String   | 非空                  |
| `reason`       | Text     | 非空                  |
| `activated_at` | DateTime | 非空                  |

`operation_id + environment` 唯一。回滚本质是新增 Activation History 并移动 Pointer，不修改旧版本。

#### `llm_operation_activation_events`

追加保存每次激活、Canary 调整和回滚的旧/新版本、Actor、原因和时间。
`llm_operation_activations` 只是当前指针，历史事件表只追加不覆盖。

#### `llm_operation_eval_suites`

保存版本化 Fixture Bundle、评分器定义、阈值和数据分级。

#### `llm_operation_eval_runs`

保存目标版本、模型解析结果、Fixture Bundle Digest、逐 Case 结果、汇总指标、费用和执行人。

#### `llm_operation_invocations`

保存调用索引和受数据策略控制的请求/响应引用，不默认保存全部明文。

### 5.2 Prisma 迁移规则

1. 先加表和索引，不修改现有表语义。
2. Migration 只创建结构，不在迁移 SQL 中执行模型调用。
3. Seed 采用幂等 Upsert。
4. Seed 对同版本不同 Digest 必须失败，禁止静默覆盖。
5. 回填完成前保留代码 Registry 只读回退。
6. 验证数据库与 Schema 一致后再关闭 Legacy 回退。
7. 容器重启只执行标准 Migration/Seed，不运行会重写业务数据的“自动修复”。

该规则同时避免镜像重启导致数据状态漂移。

## 6. Operation Manifest 与摘要实现

### 6.1 规范化

Digest 输入必须进行确定性规范化：

- 对象键按字典序；
- 数组保持业务顺序；
- 统一换行符为 `\n`；
- 不包含数据库 ID、创建时间、审批人等非运行字段；
- 包含 Input/Output Schema、Prompt、Parser、Repair、Model Policy、Safety Policy；
- 采用 UTF-8 和稳定 JSON 序列化；
- 输出 `sha256:<hex>`。

### 6.2 版本语义

- Input/Output Schema 不兼容变化：主版本。
- 语义目标或 Parser 行为明显变化：主版本。
- 向后兼容 Prompt/模型策略优化：次版本。
- 文案、元数据或不改变行为的修正：补丁版本。
- Production 版本不可修改；任何改变都从旧版本克隆 Draft。

### 6.3 Digest 校验位置

必须在四处校验：

1. 创建/校验 Version 时计算；
2. 冻结计划时比对 Catalog Digest；
3. Runtime 执行前按精确引用重算或读取可信摘要；
4. 审计写入时记录实际执行 Digest。

## 7. API 落地

### 7.1 管理 API

建议前缀：`/ai/admin/operations`。

| 方法 | 路径                                         | 用途                                       | 权限      |
| ---- | -------------------------------------------- | ------------------------------------------ | --------- |
| GET  | `/ai/admin/operations`                       | 列表、筛选、分页                           | viewer    |
| POST | `/ai/admin/operations`                       | 创建 Operation 外壳                        | editor    |
| GET  | `/ai/admin/operations/:id`                   | 查看详情                                   | viewer    |
| GET  | `/ai/admin/operations/:id/versions`          | 版本历史                                   | viewer    |
| POST | `/ai/admin/operations/:id/versions`          | 创建 Draft                                 | editor    |
| PUT  | `/ai/admin/operations/:id/versions/:version` | 修改 Draft                                 | editor    |
| POST | `.../:version/validate`                      | 执行完整验证门禁，通过后自动进入 Candidate | evaluator |
| POST | `.../:version/evaluations`                   | 单独启动评测/回归实验，不改变版本状态      | evaluator |
| GET  | `.../:version/evaluations`                   | 评测历史                                   | viewer    |
| POST | `.../:version/approve`                       | 审批版本                                   | approver  |
| POST | `.../:version/activate`                      | 激活环境 Pointer                           | releaser  |
| POST | `/ai/admin/operations/:id/rollback`          | 回滚 Pointer                               | releaser  |
| GET  | `.../:version/diff?base=`                    | 版本 Diff                                  | viewer    |
| GET  | `/ai/admin/operations/:id/audit`             | 管理操作审计                               | auditor   |

所有写接口必须支持：

- 身份和权限校验；
- 乐观锁或 `If-Match`；
- 幂等键；
- 结构化原因字段；
- 操作审计；
- 稳定错误码。

`POST .../:version/validate` 不是状态迁移快捷键，其原子业务语义为：

1. 校验持久化 Draft 的 `operationDigest` 与 `contractDigest`，拒绝尚未保存的编辑内容；
2. 执行 Manifest/Contract Lint，包括封闭 Schema、Prompt 变量绑定、必填输入消费、必填输出指令、Tool 禁用和预算检查；
3. 选择该版本专属 Eval Suite；没有专属 Suite 时允许使用 Operation 级共享基线 Suite；
4. 对精确 Draft 版本执行正常、Schema 失败、非法 JSON、Tool Call、超预算五类确定性 Fixture；
5. 对正例执行真实模型 Eval，并保存模型策略快照、逐 Case 结果和指标；
6. 所有 Gate 通过后生成同时绑定 Operation、Version、两个 Digest 和 Eval Suite Digest 的 Attestation；
7. 只有 Attestation 成功落盘后，服务端才把 `validating` 自动推进为 `candidate`；任一步失败均写入 `validation_failed`。

管理端不再提供手工“设为候选”入口。`validation_failed` 可以修订后重新保存为 Draft，也可以在未修改 Manifest 时重新执行验证；API Key 或模型不可用时必须失败关闭，不能用伪造 Attestation 绕过。

### 7.2 Catalog API

提供内部只读投影：

```http
GET /ai/internal/operations/catalog?environment=prod
GET /ai/internal/operations/:operationId/versions/:version
```

返回字段至少包括：

```json
{
  "capabilityKind": "llm_operation",
  "operationId": "summarize_list",
  "version": "1.0.0",
  "digest": "sha256:...",
  "inputSchema": {},
  "outputSchema": {},
  "runtimeType": "llm_operation",
  "attestationId": "..."
}
```

不得返回生产 Prompt 正文给 Planner 和 Control Plane。

### 7.3 Runtime API V2

```http
POST /ai/operations/execute
```

```json
{
  "operationRef": {
    "operationId": "summarize_list",
    "version": "1.0.0",
    "digest": "sha256:..."
  },
  "input": {
    "items": []
  },
  "executionContext": {
    "executionId": "...",
    "stepId": "...",
    "nodeId": "...",
    "tenantId": "...",
    "idempotencyKey": "..."
  }
}
```

Runtime 不接受 `latest`、`active` 或只传 Operation ID。管理页面的试运行可以先解析 Draft 精确 ID，再调用内部 Preview Endpoint。

## 8. Runtime 执行实现

执行顺序固定为：

1. 读取精确 Operation Version。
2. 校验 Version 未被安全撤销且允许在调用环境执行。
3. 校验请求 Digest。
4. 校验 Input Schema。
5. 执行数据分级和策略检查。
6. 渲染 Prompt；模板变量缺失即失败。
7. 解析 Model Policy 到允许的 Provider/Model。
8. 强制关闭 Tool Call，不注册 Tool Definitions。
9. 调用模型并记录 Provider Request ID。
10. 按 Parser 策略解析结构化输出。
11. 校验 Output Schema。
12. 如策略允许，最多执行限定次数 Repair。
13. 再次校验 Output Schema。
14. 生成 `RuntimeStepResultV2`。
15. 写调用审计和 OpenTelemetry 指标。

Runtime 不要求该版本仍是“当前 Production”。已冻结计划可以继续调用已从
Production Pointer 移除但未被安全撤销的精确版本；只有安全撤销、租户策略或
显式禁用可以阻断旧计划，并必须留下审计原因。

禁止行为：

- Schema 失败后把未验证文本当成功返回；
- 按当前 Production Pointer 动态替换冻结版本；
- 模型返回 Tool Call 后继续执行；
- Repair 无限递归；
- Provider 错误被改写为业务成功；
- 把完整敏感输入输出无条件写日志。

## 9. Planner 与计划冻结改造

### 9.1 候选生成

改造 `capability-candidate-selector.service.ts`：

1. 调用统一 Catalog Provider；
2. 仅选择 `active` 且有有效 Attestation 的版本；
3. 根据 Schema 生成输入输出卡片；
4. 删除四个 Operation 的静态数组；
5. 加缓存，但缓存 Key 必须带环境和 Catalog Revision；
6. Registry 不可用时默认不允许 LLM Operation 进入新生产计划。

### 9.2 Planner 输出

Planner 只允许输出：

- `nodeId`；
- `kind=llm_operation`；
- `operationId`；
- 输入字段 Binding；
- 用户可控的非权威展示意图。

Planner 输出中的 Version、Digest、Prompt、Output Contract 一律丢弃，由控制面权威补全。

### 9.3 冻结

`deterministic-plan-freeze.service.ts` 在冻结时：

1. 根据环境解析 Activation Pointer；
2. 读取精确版本和 Contract；
3. 校验 Attestation 未过期；
4. 将 Version、Digest、Schema 引用写入冻结节点；
5. 保存 Catalog Revision；
6. 后续运行不再解析 Pointer。

旧字段 `promptTemplateVersion` 保留只读兼容，所有新计划写 `operationVersion`。

## 10. Workflow 集成与迁移

### 10.1 DSL

新增或规范化节点表达：

```yaml
- id: summarize
  uses:
    kind: llm_operation
    operationId: summarize_list
    activation: production
  with:
    items: ${{ steps.search.data.searchResults }}
```

DSL Authoring 阶段允许使用 Activation Alias；编译和发布验证时解析为精确版本，发布制品不得保留动态 Alias。

### 10.2 独立模型运行时

LLM Operation 不编译为 Temporal Activity。控制面调度器直接调用独立 Runtime V2：

```text
Deterministic Plan llm_operation Step
→ Control Plane LlmOperationRuntimeAdapter
→ LLM Operation Runtime API V2
→ RuntimeStepResultV2
```

请求必须包含精确引用、执行上下文和幂等键。调度器重试不得导致重复审计或重复计费统计，Runtime 需按幂等键复用已有成功结果或明确标识重试。Workflow DSL 与 Workflow 导出包不得包含 Prompt、模型策略或 LLM Operation 执行代码。

### 10.3 `aiStructuredTransform` 迁移

采用三阶段：

1. **兼容保留**：已发布 Workflow 继续由原 Worker 执行 `builtin:aiStructuredTransform`，并记录 `LLM_OPERATION_LEGACY_ACTIVITY_FALLBACK`。
2. **新建禁用**：Workflow 编辑器不再为新步骤提供任何模型 Activity；Operation 选择与版本管理只出现在确定性计划和 LLM 能力管理页。
3. **关闭直连**：确认历史版本仍可执行后，新发布 Worker 删除直连 `/ai/model/call` 路径；Legacy Worker 版本按迁移窗口保留。

不能批量改写已发布 Workflow 代码，否则会破坏历史版本可重放性。

## 11. 管理页面落地

### 11.1 顶层信息架构

技能管理页调整为：

```text
内置 Skill | 编排型 Skill | LLM 能力 | 全部能力
```

“全部能力”只提供统一只读检索和状态总览；创建、编辑和发布进入各自生命周期页面。

### 11.2 LLM 能力列表

至少显示：

- 名称和 Operation ID；
- 当前 Production 版本；
- Digest 短码；
- Input/Output Schema 摘要；
- Model Policy；
- 最近评测状态；
- Owner；
- 状态和最后更新时间。

### 11.3 详情与编辑

详情页 Tab：

```text
概览 | Prompt | Schema | 模型策略 | 评测 | 版本 | 审批 | 调用审计
```

编辑器约束：

- 只能编辑 Draft；
- System/User/Repair Prompt 分区；
- 展示模板变量和 Schema；
- 保存前运行变量引用检查；
- 版本 Diff 同时展示 Prompt、Schema、Policy 和 Parser；
- Production 页面只读；
- AI 优化 Prompt 只能创建新 Draft。
- Prompt/Manifest 有未保存修改时禁止提交验证，确保评测对象与持久化 Digest 完全一致；
- `validation_failed` 版本允许继续编辑，保存后回到 `draft`，不能因保存失败而创建同版本的重复 Draft；
- Prompt 变更可以保持 Contract Digest 不变，但必须产生新的 Operation Digest、重新执行完整验证并生成新 Attestation。

### 11.4 权限

| 角色      | 能力                             |
| --------- | -------------------------------- |
| Viewer    | 查看非敏感定义和评测摘要         |
| Editor    | 创建/编辑 Draft、运行开发评测    |
| Evaluator | 管理 Fixture 和提交评测结论      |
| Approver  | 审批，不得审批本人创建的生产版本 |
| Releaser  | 激活和回滚环境 Pointer           |
| Auditor   | 查询完整审计索引和脱敏样本       |

## 12. 评测和发布门禁

### 12.1 Fixture Bundle

每个 Operation 至少提供：

- 1 个有效输入；
- 1 个边界输入；
- 1 个无效输入，验证 Input Schema Gate；
- 1 个故意不合规模型输出，验证 Parser/Output Schema Gate；
- 对关键 Operation 提供旧版本回归样本。

外部模型确定性测试使用 Mock；真实模型质量测试单独运行并保存 Provider、Model 与参数。

### 12.2 激活条件

Production 激活必须满足：

```text
Manifest Lint 通过
AND Schema 编译通过
AND 确定性 Fixture 通过
AND 真实模型评测达阈值
AND 与当前生产版本对比无阻断回归
AND 审批完成
AND Attestation 有效
```

### 12.3 评测指标

通用指标：

- Schema valid rate；
- 必填字段完整率；
- Parser/Repair 成功率；
- 延迟 P50/P95；
- Token 和估算成本；
- Safety 拒绝率；
- 空输出率。

领域指标由 Operation 自己声明，例如分类准确率、摘要覆盖率或字段提取 F1。LLM Judge 只能作为证据之一，不能替代确定性 Schema Gate。

## 13. 审计与可观测性

### 13.1 调用审计最小字段

```text
invocationId
executionId / stepId / nodeId
tenantId
operationId / version / digest
inputSchemaDigest / outputSchemaDigest
modelPolicyVersion
provider / requestedModel / resolvedModel
promptRenderDigest
providerRequestId
tokenUsage / latency / estimatedCost
parseAttempts / repairAttempts
validationResult / finishReason / errorCode
startedAt / completedAt
```

### 13.2 管理审计

所有 Draft 修改、评测、审批、激活、回滚和禁用操作记录：

- Actor；
- 原版本与目标版本；
- Diff Digest；
- 原因；
- 时间；
- 请求 ID；
- 权限判定结果。

### 13.3 数据安全

- 默认记录输入输出摘要和存储引用，而非全部明文。
- 按字段级策略脱敏密钥、个人信息和业务敏感数据。
- Raw Sample 有单独权限和保留周期。
- 不记录隐藏思维链；记录可复核的输入、输出、Schema、版本和验证结果。
- Telemetry 字段尽量映射 OpenTelemetry GenAI Semantic Conventions。

## 14. 错误码

至少实现：

| 错误码                                   | 阶段            | 含义                         |
| ---------------------------------------- | --------------- | ---------------------------- |
| `LLM_OPERATION_NOT_FOUND`                | Catalog/Runtime | Operation 不存在             |
| `LLM_OPERATION_VERSION_NOT_FOUND`        | Freeze/Runtime  | 精确版本不存在               |
| `LLM_OPERATION_DIGEST_MISMATCH`          | Freeze/Runtime  | 摘要不一致                   |
| `LLM_OPERATION_NOT_ACTIVE`               | Freeze          | 无可冻结激活版本             |
| `LLM_OPERATION_ATTESTATION_INVALID`      | Freeze          | 评测凭证缺失或过期           |
| `LLM_OPERATION_INPUT_SCHEMA_VIOLATION`   | Runtime         | 输入不满足 Schema            |
| `LLM_OPERATION_PROMPT_RENDER_FAILED`     | Runtime         | 模板变量缺失或渲染失败       |
| `LLM_OPERATION_TOOL_CALL_FORBIDDEN`      | Runtime         | 模型返回了 Tool Call         |
| `LLM_OPERATION_OUTPUT_PARSE_FAILED`      | Runtime         | 输出无法解析                 |
| `LLM_OPERATION_OUTPUT_SCHEMA_VIOLATION`  | Runtime         | 输出不满足 Schema            |
| `LLM_OPERATION_REPAIR_EXHAUSTED`         | Runtime         | Repair 次数耗尽              |
| `LLM_OPERATION_MODEL_POLICY_VIOLATION`   | Runtime         | Provider/Model 不在策略中    |
| `LLM_OPERATION_EVALUATION_FAILED`        | Release         | 评测门禁失败                 |
| `LLM_OPERATION_APPROVAL_REQUIRED`        | Release         | 缺少审批                     |
| `LLM_OPERATION_LEGACY_REGISTRY_FALLBACK` | Compatibility   | 使用代码 Registry 回退       |
| `LLM_OPERATION_LEGACY_ACTIVITY_FALLBACK` | Compatibility   | 使用旧 Activity 直连兼容链路 |

## 15. 分阶段计划

### Phase 0：统一读取路径与可见性

预估：M，约 5–8 人日（Backend 4–6，Frontend 1–2，测试 1）

主要风险：Catalog 接口短时不可用影响 Planner 候选。

任务：

1. 为现有代码 Registry 增加统一只读 Catalog 投影。
2. Planner 从投影生成六个候选，删除四项手写数组。
3. 增加只读“LLM 能力”Tab，展示六个 Operation。
4. 为现有 Operation 计算可重复 Digest。
5. Catalog 新写统一使用 `published_skill`，旧 `custom_skill` 只读映射。
6. 补 Planner/Catalog/Portal 测试。

验收：

- 六个 Operation 在 Registry、Catalog、Planner 和 UI 数量一致。
- 新增 Seed Operation 只改一处即可进入非生产候选。
- Planner 无 Operation ID 手写特判。

### Phase 1：持久化版本与管理面

预估：L，约 15–22 人日（Backend 10–14，Frontend 5–7，测试 3–4）

主要风险：初始 Seed Digest 与代码行为不一致；权限边界不完整。

任务：

1. 新增 Prisma 表、Migration 和幂等 Seed。
2. 实现 Repository、Registry、版本状态机和 Activation Pointer。
3. 实现 Draft CRUD、Diff、审批、激活、回滚 API。
4. 完成 Prompt/Schema/Policy/版本页面。
5. 建立 Legacy 双读和降级事件。
6. 生产 Runtime 优先读取数据库版本。

验收：

- Prompt 更新不需重新构建服务。
- Production 版本不可原地修改。
- 回滚只移动 Pointer，历史版本内容不变。
- 容器重启不会覆盖管理员创建的数据。

### Phase 2：评测门禁与确定性冻结

预估：L，约 14–20 人日（Backend 10–14，Frontend 3–4，测试 4–6）

主要风险：真实模型非确定性导致门禁抖动；评测成本不可控。

任务：

1. Fixture Bundle、Eval Run、Comparator 和 Attestation。
2. Preview/模型评测/回归比较 UI。
3. Production 激活强制门禁。
4. Control Plane 冻结精确版本和 Digest。
5. Runtime V2 强制 Digest、Schema、Tool 禁用和 Repair 上限。
6. E2E 覆盖 Planner → Freeze → Scheduler → Runtime。

验收：

- 无有效 Attestation 的版本不能进入新生产计划。
- 冻结后切换 Production Pointer 不改变老计划。
- 伪造 Digest、Schema 或 Planner Output Contract 均被拒绝/忽略。

### Phase 3：Workflow 迁移与完整审计

预估：XL，约 20–30 人日（Backend 13–18，Frontend 5–7，测试 5–8）

主要风险：历史 Workflow 重放兼容；跨服务幂等和审计关联。

任务：

1. 控制面 Scheduler 直接调用独立 LLM Operation Runtime V2。
2. Workflow DSL/编辑器拒绝模型 Activity，确定性计划负责 Operation Contract Binding。
3. 新 Workflow 禁止使用 Legacy `aiStructuredTransform`。
4. 旧 Activity 转兼容代理并建立迁移指标。
5. 完成调用审计、OpenTelemetry 指标、Canary 和告警。
6. 达到迁移阈值后关闭新 Worker 的通用模型直连。

验收：

- 新 Workflow 不含 AI 步骤；确定性计划中的 LLM Operation 节点均有精确引用。
- 历史 Workflow 仍能按旧 Worker 版本执行。
- 一个执行单可以关联搜索 Skill、LLM Operation 和 Markdown 内置 Skill 的完整数据链。

## 16. 测试矩阵

### 16.1 单元测试

- Manifest 规范化与 Digest 稳定性。
- Schema 编译、输入/输出正负例。
- Prompt 变量缺失。
- Parser 与 Repair 次数上限。
- Model Policy allow/deny。
- Tool Call 拒绝。
- 状态机非法跃迁。
- Activation/rollback 原子性。
- RBAC 和本人审批限制。

### 16.2 API 测试

- Draft CRUD 与乐观锁冲突。
- Production Version 修改返回拒绝。
- 相同幂等键不重复创建 Eval/Activation。
- Catalog 不泄漏 Prompt 正文。
- Runtime 拒绝 Alias 和 Digest 不一致。
- 审计查询遵守租户和字段权限。

### 16.3 Planner 与 Control Plane

- 六个 Operation 均可从 Catalog 成为候选。
- 禁用/无凭证 Operation 不进入候选。
- Planner 伪造 Version/Digest/Output Contract 被忽略。
- Catalog 对旧 `custom_skill` 正确兼容读取，新投影只产生 `published_skill`。
- Freeze 解析一次 Activation Pointer。
- Pointer 更新后旧计划仍执行原版本。
- Registry 不可用时新生产计划明确失败，不静默使用未知能力。

### 16.4 Runtime

- Provider 超时与有限重试。
- 输出非法 JSON。
- JSON 合法但 Schema 非法。
- Repair 成功与耗尽。
- Provider 返回 Tool Call。
- 重复 Activity 调用幂等。
- 敏感字段不进入普通日志。

### 16.5 Workflow E2E

至少覆盖：

```text
Web Search published_skill
→ summarize_list llm_operation
→ markdown artifact builtin_skill
```

断言：

- 搜索正文而非 Artifact Metadata 被传给总结节点；
- 总结节点输出满足 Schema；
- Markdown Skill 接收总结正文；
- 最终 Artifact 可读取；
- 每条边的数据字段有 Contract 验证；
- 三个节点的版本和 Digest 可从同一执行单审计。

### 16.6 数据库与重启

- 空库 Migration + Seed。
- 已有库增量 Migration。
- Seed 重跑幂等。
- 相同版本不同 Digest 立即失败。
- 服务/镜像重启不改变 Activation Pointer、Draft 和审计记录。
- 数据库 Schema 与 Prisma Schema 差异检查为零。

### 16.7 前端

- 顶层 Tab 路由和深链接。
- 列表权限与操作按钮。
- Draft 编辑与未保存提示。
- Diff 展示 Prompt/Schema/Policy。
- Production 只读。
- 评测失败不可激活。
- 回滚确认展示准确目标 Version/Digest。

## 17. 发布、监控与回滚

### 17.1 发布顺序

```text
数据库结构
→ AI Orchestrator 兼容版本
→ Catalog/Planner 读取改造
→ Control Plane 冻结改造
→ Portal 管理面
→ Runtime 强校验
→ Temporal Adapter
→ 关闭 Legacy 路径
```

读取端先兼容新旧字段，写入端后切换，最后移除旧字段。

### 17.2 Feature Flags

建议：

- `LLM_OPERATION_DB_REGISTRY_READ`
- `LLM_OPERATION_DB_REGISTRY_WRITE`
- `LLM_OPERATION_REQUIRE_ATTESTATION`
- `LLM_OPERATION_FREEZE_V2`
- `WORKFLOW_LLM_OPERATION_ADAPTER`
- `LLM_OPERATION_DISABLE_LEGACY_MODEL_CALL`

Flag 必须按环境配置并进入配置审计，不得只存在某台容器的本地文件。

### 17.3 监控指标

- Catalog 加载失败率和缓存年龄；
- Legacy Registry/Activity 回退次数；
- Schema 校验失败率；
- Parser/Repair 率；
- 各 Operation 版本调用量、P95 延迟、Token 和费用；
- Activation 后错误率变化；
- 未知 Digest 和版本不匹配次数；
- Eval Gate 失败原因分布。

### 17.4 回滚

- Prompt/策略问题：移动 Activation Pointer 到上一版本。
- 新 Runtime 问题：关闭 Runtime V2 Flag，恢复兼容读取；不删除新表。
- Planner/Catalog 问题：短期恢复代码 Registry 投影并记录降级事件。
- Workflow Adapter 问题：新 Workflow 发布暂停，历史 Workflow 继续走版本化 Legacy Worker。
- Migration 问题：优先向前修复；禁止通过镜像启动脚本删除或重建业务表。

## 18. 风险清单

| 风险                        | 影响               | 缓解                                              |
| --------------------------- | ------------------ | ------------------------------------------------- |
| Registry 成为单点           | Planner/运行不可用 | 本地只读缓存、版本快照、明确降级策略              |
| Prompt 与 Parser 只回滚一半 | 行为不可恢复       | 版本整个 Manifest，统一 Digest                    |
| 模型 Provider 漂移          | 同版本结果变化     | 记录 resolved model；评测、Canary、允许策略化切换 |
| 真实评测波动                | 错误阻断或放行     | 固定数据集、多次采样、置信阈值、人工审批          |
| UI 再次形成巨石             | 难维护             | 新 Tab 独立目录与组件边界                         |
| 历史 Workflow 破坏          | 重放失败           | 不改历史制品，版本化 Adapter/Worker               |
| 过度日志泄密                | 合规风险           | 摘要/引用优先、字段脱敏、Raw 权限与保留周期       |
| AI 自动改 Prompt 失控       | 生产行为未经审查   | AI 只能创建 Draft，评测和人审后激活               |
| 重启 Seed 覆盖数据          | 数据不一致         | 幂等 Seed、Digest 冲突即失败、启动不做自动修复    |

## 19. 工程任务清单

### Backend — AI Orchestrator

- [x] 拆分现有 LLM Operation 模块职责。
- [x] 定义 Manifest、Version、Activation、Eval、Invocation 类型。
- [x] 实现规范化 Operation Digest 与 Contract Digest。
- [x] 新增 Prisma Schema、Migration、Repository。
- [x] 幂等导入六个系统 Operation，Digest 冲突时失败而非覆盖。
- [x] 实现 Catalog Projector。
- [x] 实现 Admin API 和独立 Runtime V2。
- [x] 实现 Schema/Prompt/Parser/Repair/Model Policy 执行链。
- [x] 文本型 Operation 使用纯文本模型传输、Runtime 协议封装；文本摘要输出预算提升至 6000，并按供应商适配关闭/低/中/高思考档位。
- [x] 实现 Eval Gate、Attestation 和调用审计。
- [x] 删除 Planner 的静态四项候选，改为 Registry 投影。
- [x] 按不可变版本和幂等键保存成功结果，控制面重试可直接回放。

### Backend — Control Plane

- [x] Catalog Client 支持 Version/Digest/Attestation。
- [x] Freeze 解析权威 Catalog 并固定精确引用，忽略 Planner 伪造的契约字段。
- [x] Validator 拒绝未知/不可信版本。
- [x] Scheduler 通过独立 Runtime V2 Adapter 执行，不创建 Activity。
- [x] Runtime V2 `data` 映射为节点业务输出并保留 Usage。
- [x] 保留旧 `promptTemplateVersion` 只读兼容，新冻结节点写 `operationVersion`。

### Backend — Platform/Temporal

- [x] Workflow DSL 明确拒绝 `kind: llm_operation` 和模型 Activity。
- [x] 新 Workflow 导入、导出和生成链不写入 Prompt/模型运行代码。
- [x] 已发布 `aiStructuredTransform` 仅按 Legacy Worker/版本兼容执行并记录降级事件。
- [x] 新 Workflow 禁用模型 Activity、Legacy 兼容边界已有回归测试。
- [ ] Artifact 链路使用业务正文而非仅元数据。

### Frontend

- [x] 从 `SkillAdminPage.tsx` 提取顶层 Tab 容器。
- [x] 新增 LLM Operation 列表和详情/版本模块。
- [x] 实现基于不可变 Draft 的 Prompt/Schema/Policy JSON 编辑与服务端 Digest 重算。
- [x] “提交验证”执行完整门禁并展示 Fixture、真实 Eval 和 Attestation 摘要；删除手工 Candidate 入口。
- [ ] 实现可视化版本 Diff。
- [ ] 实现 Fixture 管理、独立评测历史、审批、激活和回滚 UI。
- [ ] 实现调用审计页和脱敏展示。
- [x] Operation 管理只位于 LLM 能力 Tab，工作流 Authoring/校验拒绝模型 Activity。
- [ ] 新建 Workflow 隐藏 Legacy `aiStructuredTransform`。

### QA/Operations

- [x] 幂等 Seed 四个 active Operation 的共享基线 Fixture Bundle；三个 deprecated Operation 仅保留历史精确版本，并对 Digest 冲突失败关闭。
- [x] 建立三类能力冻结、权威契约和 Runtime Adapter E2E/集成测试。
- [ ] 验证 Migration/Seed/重启幂等。
- [ ] 建立 Canary 指标和告警。
- [ ] 演练 Activation 回滚和 Registry 故障。
- [ ] 输出管理员和故障处置 Runbook。

## 20. 完成定义

以下条件全部满足，才可宣告落地完成：

1. 技能管理按内置、编排、LLM 三类展示，LLM 有独立管理 Tab。
2. 四个 active Operation 只由一个 Registry 投影到 Planner 和 UI；三个 deprecated Operation 不进入候选目录。
3. 代码中的 Prompt 常量不再是生产运行事实源。
4. Production Version 不可变，并支持 Diff、审批、激活和回滚。
5. 每个新生产版本有有效评测 Attestation。
6. 新冻结计划包含精确 Operation Version 和 Digest。
7. Runtime 强制 Input/Output Schema，拒绝 Tool Call 和未知版本。
8. 新 Workflow 不允许模型步骤；LLM Operation 由控制面直接调用独立 Runtime V2。
9. 历史计划和 Workflow 在兼容窗口内仍可执行，且降级有审计事件。
10. 搜索 → 总结 → Markdown Artifact E2E 验证业务正文贯穿全链路。
11. 服务或镜像重启不会覆盖 Registry、Activation、Draft 或审计数据。
12. Portal、Planner、Control Plane、Runtime 和 Temporal 的测试矩阵全部通过。
