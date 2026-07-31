# 平台内置工作流 Skill 独立化设计

状态：Implementation Proposal  
日期：2026-07-29  
适用范围：平台基础能力、内置固定工作流、确定性计划节点  
关联文档：`deterministic-task-decomposition-design.md`

## 1. 结论

平台内置工作流 Skill 应从普通 Skill 的创建、校验、审批、发布和 Release Runtime 链路中独立出来，形成一套平台自主管理的基础能力子系统：

```text
版本化内置能力包
  → Built-in Skill Registry
  → 环境部署与启用指针
  → 统一能力目录投影
  → Planner 选择
  → Control Plane 冻结精确版本
  → Runtime Adapter 执行
```

内置工作流 Skill：

- 不进入普通 Capability Release 的人工审批和发布流程。
- 不依赖 `publishedSkillId` 才能被 Planner 使用。
- 默认允许所有已认证平台用户使用。
- 继续支持按租户、角色或用户禁用和覆盖授权。
- 使用不可变版本和内容摘要管理升级、回滚与迁移。
- 通过统一能力目录与普通 Skill 一起提供给 Planner。
- 通过独立 Runtime Adapter 执行，不再伪装成普通 Published Skill。

本设计不要求一次性迁移所有现有 Skill。普通 Skill、第三方 Skill 和租户自建 Skill 保持原有 Release 与权限流程。

## 2. 当前项目事实

### 2.1 当前职责边界

根据当前仓库结构：

| 模块 | 当前职责 | 本设计中的职责 |
|---|---|---|
| Platform | SkillConfig、角色、SkillPermission、用户可用 Skill 列表 | 内置 Skill Registry、权限策略、统一目录投影 |
| Release Manager | 普通 Capability Release、发布和运行时 | 继续只负责普通 Skill，不负责内置工作流 Skill |
| AI Orchestrator | Skill Cache、候选卡片、Planner | 消费统一能力目录，不区分数据来源做规划 |
| Control Plane | 执行创建、冻结计划、节点调度、Runtime Adapter | 二次解析内置 Skill 精确版本并调度 |
| Document/Browser 等 Domain | 固定领域运行代码 | 继续承载领域实现，可被内置工作流引用 |
| Temporal/Workers | 部分 Workflow Skill 内部运行时 | 按具体内置 Skill 的 runtime binding 使用 |

### 2.2 当前需要解决的问题

当前 `markdown_artifact_writer` 同时具有以下身份：

- Platform 的默认 `SkillConfig`
- Provision 脚本补出的普通 Release
- Planner 中被名称特殊处理的 Artifact 能力
- Document Domain 中的固定运行代码

这会导致：

- 内置能力与普通发布 Skill 语义混合。
- Release 表中出现没有经过普通 Release 生命周期的记录。
- Planner 依赖名称特判。
- 版本、部署、权限和运行实现之间缺少单一事实源。
- 新增第二、第三个内置能力时会继续复制特殊逻辑。
- 导出、迁移、升级和回滚都依赖数据库现场状态。

## 3. 设计目标

### 3.1 必须达到

- 内置工作流 Skill 有独立模型、目录、数据表、服务和部署命令。
- 内置能力包可在不同环境之间导出和导入。
- 相同包重复安装结果幂等。
- 新版本不覆盖旧版本。
- 新执行绑定启用版本，已冻结执行继续使用原版本。
- 可原子升级和快速回滚。
- 默认所有已认证用户可用。
- 管理员可按组织、角色、用户进行 `allow/deny` 覆盖。
- Planner 和 Chat 不需要为具体内置 Skill 写名称特判。
- Control Plane 在冻结和执行前验证能力、版本、状态和权限。
- Runtime 只能调用注册的 handler，不接受包内任意脚本或任意 URL。

### 3.2 非目标

- 不把内置 Skill 做成开放插件市场。
- 不允许租户上传任意可执行代码成为内置 Skill。
- 不替代普通 Skill 的 Release Manager。
- 不要求所有内置工作流都迁移到 Temporal。
- 不在 Phase 1 引入分布式包仓库或复杂签名基础设施。
- 不允许 Planner 根据代码目录自动发现能力。

## 4. 外部设计参考

本节只提炼可复用原则，不直接复制外部项目的数据模型。

### 4.1 Kubernetes：声明、状态与协调分离

Kubernetes Custom Resource 将期望状态建模为版本化 API 对象，并由 Controller 负责收敛实际状态；API 还区分版本、默认值、校验和废弃策略。

本项目采用：

- `manifest.spec` 表达不可变能力定义。
- Registry/Deployment 表达环境实际状态。
- Provision/Reconciler 幂等收敛 definition、版本和部署状态。
- `apiVersion` 独立于可执行版本。

参考：

- [Kubernetes Custom Resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)
- [Kubernetes API Overview and Versioning](https://kubernetes.io/docs/reference/using-api/)
- [Kubernetes API Deprecation Policy](https://kubernetes.io/docs/reference/using-api/deprecation-policy/)

### 4.2 Argo Workflows：平台级共享工作流模板

Argo 的 `ClusterWorkflowTemplate` 将可跨 namespace 使用的共享工作流与单次 Workflow Execution 分离，调用方通过模板引用使用平台级定义。

本项目采用：

- 内置工作流是平台级定义，不复制到每个用户或每个执行单。
- 执行计划只保存稳定引用和精确版本。
- 工作流模板与执行实例分开管理。

参考：

- [Argo ClusterWorkflowTemplates](https://argoproj.github.io/argo-workflows/cluster-workflow-templates/)

### 4.3 Backstage：目录是统一投影，不一定是底层事实源

Backstage Catalog 使用版本化 descriptor 表达实体，将多种权威来源处理成统一目录视图；权限框架支持 RBAC、ABAC 和自定义策略，默认开放行为也可由策略覆盖。

本项目采用：

- 普通 Skill 和内置 Skill 保留不同事实源。
- Planner 只消费统一 `ExecutableCapabilityView`。
- 权限不要求为“默认全员可用”生成全角色授权行。
- Catalog 投影不反向成为运行时版本的事实源。

参考：

- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)
- [Backstage Entity Descriptor Format](https://backstage.io/docs/next/features/software-catalog/descriptor-format/)
- [Backstage Permission Framework](https://backstage.io/docs/permissions/overview/)

### 4.4 Temporal：新旧执行绑定不同实现版本

Temporal Worker Versioning 的核心思想是让执行绑定到 Worker Build ID，新版本接收新执行，旧执行可以继续在原版本完成。

本项目采用：

- 冻结计划保存内置 Skill 的精确 `executableVersion`。
- 升级只修改新执行使用的 active version。
- 旧版本在仍有运行中或可恢复执行时不得清理。

参考：

- [Temporal Worker Versioning Public Preview](https://temporal.io/changelog/worker-versioning-public-preview)

### 4.5 Nix、OCI 与 TUF：不可变、摘要寻址和可信更新

Nix 的纯函数部署模型强调不可变版本、并存、可复现和回滚；OCI Manifest 使用 schema version、media type 和 digest 表达可搬运制品；TUF 强调更新元数据、版本新鲜度和回滚攻击防护。

本项目采用：

- 版本记录不可变。
- 包内容计算 SHA-256 digest。
- 环境只切换 active pointer，不原地覆盖已部署定义。
- 导入时拒绝相同版本、不同 digest 的包。
- 回滚指向已验证旧版本，不重新拼装旧状态。

参考：

- [NixOS: A Purely Functional Linux Distribution](https://nixos.org/~eelco/pubs/nixos-icfp2008-submitted.pdf)
- [OCI Image Manifest Specification](https://github.com/opencontainers/image-spec/blob/main/manifest.md)
- [The Update Framework](https://theupdateframework.org/docs/overview/)
- [Survivable Key Compromise in Software Update Systems](https://theupdateframework.io/papers/survivable-key-compromise-ccs2010.pdf)

## 5. 核心领域模型

### 5.1 术语

| 术语 | 含义 |
|---|---|
| Built-in Skill | 平台代码随附、由平台团队维护的固定能力 |
| Built-in Workflow Skill | 由固定工作流定义和注册 handler 组成的 Built-in Skill |
| Bundle | 可迁移的版本化能力包 |
| Definition | Bundle 中不可变的声明式定义 |
| Registry Entry | 环境内稳定能力身份 |
| Version | 某能力的一份不可变 definition |
| Deployment | 某版本在一个环境中的部署与健康状态 |
| Activation | 将某个已部署版本设为新执行默认版本 |
| Permission Override | 对默认权限策略的显式覆盖 |
| Handler | 代码中注册的受信任运行入口 |

### 5.2 稳定身份

内置 Skill 使用名称空间稳定键：

```text
platform.<domain>.<capability>
```

示例：

```text
platform.document.markdown-artifact-writer
platform.document.pdf-converter
platform.data.csv-normalizer
platform.notification.internal-message
```

约束：

- 全局唯一。
- 创建后不可改名。
- 不复用已退役键。
- 不使用数据库 UUID 作为跨环境迁移标识。
- Registry 内部仍可使用 UUID 作为关系主键。

### 5.3 三类版本

必须区分：

| 字段 | 示例 | 说明 |
|---|---|---|
| `apiVersion` | `platform.ops/v1alpha1` | Manifest Schema 版本 |
| `definitionVersion` | `1.2.0` | 能力合同和工作流定义版本 |
| `runtimeBuild` | `document-domain@sha256:...` | 实际 handler 构建版本 |

`definitionVersion` 使用 SemVer：

- Patch：不改变输入输出合同的修复。
- Minor：向后兼容地增加可选输入或输出。
- Major：存在不兼容合同变化。

### 5.4 Bundle 目录

建议在仓库中独立管理：

```text
builtin-skills/
├── README.md
├── schemas/
│   └── builtin-workflow-skill.v1.schema.json
├── platform.document.markdown-artifact-writer/
│   ├── manifest.yaml
│   ├── workflow.json
│   ├── CHANGELOG.md
│   ├── fixtures/
│   │   ├── smoke-input.json
│   │   └── expected-output.schema.json
│   └── tests/
│       └── contract.cases.json
└── platform.document.pdf-converter/
    └── ...
```

Bundle 不包含：

- 数据库 ID。
- 环境 URL。
- API Key、Token 或密码。
- 租户 ID。
- 绝对文件路径。
- 任意可执行脚本。

运行代码仍放在对应 Domain 或 Runtime Service 中。Bundle 只通过 `handlerKey` 引用代码注册表。

## 6. Manifest 设计

### 6.1 示例

```yaml
apiVersion: platform.ops/v1alpha1
kind: BuiltinWorkflowSkill
metadata:
  key: platform.document.markdown-artifact-writer
  displayName: 内置 Markdown 文件生成
  description: 将 Markdown 内容写入受控存储并返回 ArtifactRef
  owner: platform-document
  labels:
    category: artifact
    domain: document
spec:
  definitionVersion: 1.0.0
  lifecycle: stable
  defaultAccess:
    mode: authenticated
  planner:
    enabled: true
    triggerKeywords:
      - 生成md文件
      - 输出Markdown文件
      - 保存Markdown
    matchSummary: 将 Markdown 文本保存为可下载文件
    runtimeType: artifact
    supportsArtifact: true
  contracts:
    input:
      schemaRef: inline
      schema:
        type: object
        additionalProperties: false
        required: [content]
        properties:
          content:
            type: string
            minLength: 1
            maxLength: 2097152
          fileName:
            type: string
            maxLength: 120
    output:
      schemaRef: inline
      schema:
        type: object
        required: [artifact, artifacts]
        properties:
          artifact:
            $ref: platform-contracts/artifact-ref/v1
          artifacts:
            type: array
            minItems: 1
            items:
              $ref: platform-contracts/artifact-ref/v1
  workflow:
    engine: platform-sequential
    definitionRef: workflow.json
  runtime:
    adapterRoute: builtin:workflow
    handlerKey: document.markdown-artifact-writer
    idempotency: required
    timeoutSeconds: 30
    retryPolicy:
      maximumAttempts: 2
  migration:
    minimumPlatformVersion: 4.0.0
    contractCompatibility: backward
  smokeTest:
    inputRef: fixtures/smoke-input.json
    assertions:
      - output.artifact.mimeType startsWith text/markdown
      - output.artifact.metadata.sha256 exists
```

### 6.2 Spec 与 Status 分离

Bundle 只包含 `metadata + spec`。以下环境状态不得写回 Bundle：

- 是否部署。
- 是否启用。
- 当前 active version。
- 健康状态。
- 最近 smoke test。
- 权限覆盖。
- 使用次数。

这些状态由 Registry 数据库保存并通过 API 返回。

### 6.3 轻量校验

内置 Skill 不走普通 Skill 正式审批，但 provision 时必须执行机器校验：

- Manifest Schema 可解析。
- `metadata.key` 唯一且格式合法。
- SemVer 合法。
- definition digest 与内容一致。
- `handlerKey` 已在代码注册表中存在。
- `adapterRoute` 已被 Control Plane 注册。
- 输入输出 Schema 可编译。
- Workflow 只引用白名单步骤类型。
- 不包含敏感字段、任意 URL、任意代码或绝对路径。
- 默认权限策略合法。

该校验是防止部署错误的工程校验，不是人工审批流程。

## 7. 数据模型

建议在 Platform Prisma 中新增独立表，不复用 `skill_configs` 和
`capability_releases`。

### 7.1 `builtin_skills`

```prisma
model BuiltinSkill {
  id               String   @id @default(uuid()) @db.Uuid
  capabilityKey    String   @unique @map("capability_key") @db.VarChar(255)
  displayName      String   @map("display_name") @db.VarChar(255)
  description      String?  @db.VarChar(1000)
  owner            String   @db.VarChar(255)
  category         String   @db.VarChar(100)
  defaultAccess    String   @default("authenticated") @map("default_access") @db.VarChar(32)
  lifecycle        String   @default("stable") @db.VarChar(32)
  isEnabled        Boolean  @default(false) @map("is_enabled")
  activeVersionId  String?  @map("active_version_id") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  @@index([isEnabled, category])
  @@map("builtin_skills")
}
```

### 7.2 `builtin_skill_versions`

```prisma
model BuiltinSkillVersion {
  id                String   @id @default(uuid()) @db.Uuid
  builtinSkillId    String   @map("builtin_skill_id") @db.Uuid
  definitionVersion String   @map("definition_version") @db.VarChar(64)
  apiVersion        String   @map("api_version") @db.VarChar(64)
  definitionDigest  String   @map("definition_digest") @db.VarChar(71)
  manifestJson      Json     @map("manifest_json")
  workflowJson      Json     @map("workflow_json")
  runtimeBuild      String?  @map("runtime_build") @db.VarChar(255)
  createdAt         DateTime @default(now()) @map("created_at")

  @@unique([builtinSkillId, definitionVersion])
  @@unique([builtinSkillId, definitionDigest])
  @@map("builtin_skill_versions")
}
```

版本记录禁止 update manifest/workflow/digest，只允许新增或标记废弃。

### 7.3 `builtin_skill_deployments`

保存：

- `builtinSkillVersionId`
- `environment`
- `status=provisioned/deployed/healthy/failed/retired`
- `runtimeBuild`
- `deployedAt`
- `smokeTestStatus`
- `smokeTestDigest`
- `failureCode`

唯一约束：

```text
(builtin_skill_version_id, environment)
```

### 7.4 `builtin_skill_permission_overrides`

```text
builtin_skill_id
org_id nullable
principal_type = role | user
principal_id
effect = allow | deny
reason
created_by
created_at
expires_at nullable
```

默认全员可用不生成授权行。该表只保存例外。

### 7.5 `builtin_skill_audit_events`

必须记录：

- provision
- version_created
- deploy
- smoke_passed/smoke_failed
- enable/disable
- activate_version
- rollback
- permission_override_created/deleted
- export/import
- retire

审计数据不得保存在 Bundle 中。

## 8. 权限模型

### 8.1 默认策略

默认：

```text
defaultAccess = authenticated
```

含义：

- 已认证用户默认允许使用。
- 新增用户或角色无需补写权限记录。
- 新增内置 Skill 无需向所有角色批量插入授权。
- 未认证请求仍拒绝。

### 8.2 判定顺序

按以下顺序计算：

1. 能力不存在、未部署或全局未启用：拒绝。
2. 当前组织显式禁用：拒绝。
3. 用户级 `deny`：拒绝。
4. 角色级 `deny`：拒绝。
5. 用户级 `allow`：允许。
6. 任一角色级 `allow`：允许。
7. `defaultAccess=authenticated` 且用户已认证：允许。
8. 其他情况：拒绝。

显式 deny 优先于 allow，避免管理员无法紧急封禁。

### 8.3 与现有权限系统的关系

保留现有：

- `Role`
- `UserRole`
- 管理员身份
- 权限管理 UI 的角色和用户选择能力

不复用 `SkillPermission.skillId`，因为该字段强制关联普通 Skill UUID。新增
`BuiltinSkillPermissionOverride`，由统一权限服务组合两种权限来源。

建议接口：

```ts
interface CapabilityAuthorizationService {
  authorize(input: {
    userId: string;
    orgId?: string;
    capabilityRef: CapabilityRef;
    action: 'discover' | 'execute' | 'manage';
  }): Promise<AuthorizationDecision>;
}
```

## 9. 统一能力目录

### 9.1 统一 DTO

Planner 不应继续只理解 `publishedSkillId`：

```ts
interface ExecutableCapabilityView {
  capabilityRef: {
    source: 'published_skill' | 'builtin_skill';
    id: string;
    version: string;
  };
  displayName: string;
  description?: string;
  category: string;
  runtimeType: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  runtimeHints: Record<string, unknown>;
  accessStatus: 'authorized' | 'unauthorized';
  lifecycle: 'experimental' | 'stable' | 'deprecated';
}
```

映射：

```text
普通 Skill:
  source=published_skill
  id=publishedSkillId
  version=publishedReleaseVersion

内置 Skill:
  source=builtin_skill
  id=capabilityKey
  version=definitionVersion
```

### 9.2 投影规则

内置 Skill 只有同时满足以下条件才进入 Planner 可用目录：

- Registry Entry 存在。
- `isEnabled=true`。
- Active Version 存在。
- 当前环境 Deployment 为 `healthy`。
- Manifest 中 `planner.enabled=true`。
- 当前用户 `discover + execute` 均获授权。
- handler 和 adapter route 均可解析。

### 9.3 API

新增内部 API：

```text
GET  /internal/builtin-skills
GET  /internal/builtin-skills/:capabilityKey/versions/:version
POST /internal/builtin-skills/resolve
POST /internal/builtin-skills/authorize
POST /internal/builtin-skills/reconcile
```

面向 AI Orchestrator 的现有 Skill Catalog API 可以暂时返回合并结果，但 DTO
必须升级为 `ExecutableCapabilityView`，不能给内置能力伪造 `publishedSkillId`。

## 10. 执行架构

### 10.1 计划合同

建议将 `SkillPlanNodeV1` 逐步升级为通用引用：

```ts
interface CapabilityPlanNodeV2 {
  nodeId: string;
  kind: 'capability';
  capabilityRef: {
    source: 'published_skill' | 'builtin_skill';
    id: string;
    version: string;
  };
  runtimeType: string;
  dependsOn: string[];
  inputBindings: Record<string, ValueBinding>;
  outputContract: Record<string, ValueType>;
}
```

Phase 1 兼容方案：

- 保留 `kind=skill`。
- `skillId` 临时承载 UUID 或 capability key。
- 新增 `capabilitySource`。
- 禁止通过 ID 格式猜测来源。

### 10.2 冻结前校验

AI Orchestrator 初检后，Control Plane 必须从 Platform 重新解析：

- capability source
- stable ID/key
- 精确版本
- 环境 deployment
- enabled 状态
- 当前用户 execute 权限
- input/output contract
- runtime adapter route
- handler key

将解析结果作为 `CatalogSnapshot` 写入冻结计划或独立 snapshot 字段。执行阶段不得依赖“当前 active version”替换已冻结版本。

### 10.3 Runtime Adapter

新增：

```text
apps/backend/execution-control/control-plane/src/modules/execution/adapters/
  builtin-workflow-runtime.adapter.ts
```

Route：

```text
runtimeType=builtin
capabilityType=workflow
routeKey=builtin:workflow
```

Adapter 请求：

```ts
interface BuiltinWorkflowInvokeRequest {
  capabilityKey: string;
  definitionVersion: string;
  executionId: string;
  stepId: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  traceContext: TraceContext;
}
```

Adapter 只允许调用 Registry 返回的 `handlerKey`，再由代码注册表解析：

```ts
interface BuiltinSkillHandler {
  readonly handlerKey: string;
  execute(context: BuiltinSkillContext, input: unknown): Promise<unknown>;
}
```

禁止：

- 从 Manifest 加载任意模块路径。
- 执行 Manifest 中的 JavaScript、Shell 或 SQL。
- 使用 Manifest 提供的任意内部 URL。
- Planner 直接调用 Domain Controller。

### 10.4 工作流引擎选择

Manifest 的 `workflow.engine` 可使用：

| engine | 适用范围 |
|---|---|
| `platform-sequential` | 短流程、固定步骤、由 Control Plane 顺序执行 |
| `temporal` | 长流程、需要 durable timer/signal/retry 的能力 |
| `domain-handler` | 单一固定副作用操作，如 Markdown Writer |

“内置工作流 Skill”是管理分类，不强制所有能力采用同一个执行引擎。

## 11. 升级、回滚和并存

### 11.1 安装新版本

```text
读取 Bundle
  → Schema/handler/contract 校验
  → 计算 canonical digest
  → 检查 key + version
  → 插入不可变 Version
  → 创建 Deployment
  → 执行 smoke test
  → 标记 healthy
  → 可选 activate
```

冲突规则：

- 相同 key、version、digest：幂等成功。
- 相同 key、version、不同 digest：拒绝，返回 `BUILTIN_SKILL_VERSION_CONFLICT`。
- 相同 digest、不同版本：允许但记录 warning。

### 11.2 激活

Activation 是单事务指针切换：

```text
builtin_skills.active_version_id = healthy version
```

切换后：

- 新计划使用新版本。
- 已冻结计划继续使用旧版本。
- 旧版本保持可执行，直到 reachability 为 0。

### 11.3 回滚

回滚只允许指向：

- definition 仍存在。
- deployment 为 healthy。
- handler/runtime build 可用。
- 合同仍被当前 Control Plane 支持。

回滚不删除失败版本，也不修改历史记录。

### 11.4 退役

版本只有在以下条件全部满足时才可退役：

- 不是 active version。
- 没有 queued/running/waiting 的冻结执行引用它。
- 不在回滚保留窗口内。
- 审计保留期允许。

## 12. 迁移与导入导出

### 12.1 导出格式

建议先使用 tar.gz，后续可升级为 OCI Artifact：

```text
builtin-skill-bundle.tar.gz
├── manifest.yaml
├── workflow.json
├── fixtures/
├── tests/
└── bundle-lock.json
```

`bundle-lock.json`：

```json
{
  "capabilityKey": "platform.document.markdown-artifact-writer",
  "definitionVersion": "1.0.0",
  "definitionDigest": "sha256:...",
  "files": {
    "manifest.yaml": "sha256:...",
    "workflow.json": "sha256:..."
  },
  "requiredContracts": [
    "artifact-ref/v1",
    "runtime-capability-contract/v1"
  ],
  "minimumPlatformVersion": "4.0.0"
}
```

### 12.2 环境迁移

```text
开发环境 export
  → staging import --provision
  → smoke
  → staging activate
  → export 相同 digest
  → production import
  → smoke
  → production activate
```

生产环境不得重新生成 Bundle；必须迁移 staging 已验证的相同 digest。

### 12.3 环境配置

Bundle 中只保存逻辑引用：

```text
secretRef: tavily.default
storageRef: artifact.default
serviceRef: document-domain
```

导入时由环境 binding 解析实际配置。缺少 binding 时部署失败，不得把环境值写回 Bundle。

## 13. 当前 Markdown Writer 迁移

### 13.1 目标身份

```text
capabilityKey: platform.document.markdown-artifact-writer
definitionVersion: 1.0.0
handlerKey: document.markdown-artifact-writer
engine: domain-handler
defaultAccess: authenticated
```

### 13.2 迁移步骤

1. 创建独立 Bundle 和 JSON Schema。
2. 新增 Built-in Skill 数据表和 Registry Service。
3. 注册 `document.markdown-artifact-writer` handler。
4. 新增 `builtin:workflow` Runtime Adapter。
5. 通过 provision 导入 `1.0.0`。
6. 执行写入、下载、size、SHA-256、幂等 smoke test。
7. 激活版本并投影到统一能力目录。
8. Planner 删除 `markdown_artifact_writer` 名称特判。
9. Control Plane 通过 `capabilitySource=builtin_skill` 冻结精确版本。
10. 真实三节点 E2E 通过后，停止创建伪普通 Release。
11. 保留旧数据只读观察一个迁移周期。
12. 确认无旧执行依赖后清理兼容路径。

### 13.3 兼容期

旧别名：

```text
markdown_artifact_writer
```

只允许在 Registry alias 映射中存在：

```text
markdown_artifact_writer
  → platform.document.markdown-artifact-writer
```

Planner、Control Plane 和 Runtime 业务代码不得分别写特殊判断。Alias 必须记录弃用时间，并且冻结计划统一保存 canonical key。

## 14. 推荐代码边界

```text
builtin-skills/
  schemas/
  platform.document.markdown-artifact-writer/

packages/backend-contracts/
  builtin-skill-contract/

apps/backend/core/platform/src/modules/
  builtin-skill/
    builtin-skill.module.ts
    registry/
    provisioning/
    permissions/
    catalog-projection/
    audit/

apps/backend/core/platform/src/commands/
  builtin-skill-provision.command.ts
  builtin-skill-export.command.ts
  builtin-skill-import.command.ts
  builtin-skill-activate.command.ts
  builtin-skill-rollback.command.ts

apps/backend/execution-control/control-plane/src/modules/execution/adapters/
  builtin-workflow-runtime.adapter.ts

apps/backend/capabilities/document-domain/runtime-facade/
  markdown-artifact/
```

文件复杂度要求：

- Registry、Provisioning、Permission、Projection 不合并成一个大 Service。
- 每个 handler 只承载一种固定领域能力。
- Bundle 解析与数据库收敛分离。
- Runtime Adapter 不负责权限策略或目录查询。

## 15. API 与命令

### 15.1 管理命令

```bash
pnpm builtin-skill validate <bundle-dir>
pnpm builtin-skill provision <bundle-dir> --environment full
pnpm builtin-skill smoke <capability-key>@<version>
pnpm builtin-skill activate <capability-key>@<version>
pnpm builtin-skill rollback <capability-key>@<version>
pnpm builtin-skill export <capability-key>@<version> --output <file>
pnpm builtin-skill import <file> --environment staging
```

所有命令：

- 支持 `--json`。
- 成功和失败使用稳定错误码。
- 不输出密钥、绝对存储路径或数据库连接串。
- provision/import 可重复执行。

### 15.2 管理 API

```text
GET  /api/admin/builtin-skills
GET  /api/admin/builtin-skills/:key
GET  /api/admin/builtin-skills/:key/versions
POST /api/admin/builtin-skills/:key/activate
POST /api/admin/builtin-skills/:key/rollback
POST /api/admin/builtin-skills/:key/enable
POST /api/admin/builtin-skills/:key/disable
GET  /api/admin/builtin-skills/:key/permissions
PUT  /api/admin/builtin-skills/:key/permissions
```

Provision/import 默认走部署命令，不要求开放上传任意 Bundle 的公网 API。

## 16. 错误码

```text
BUILTIN_SKILL_NOT_FOUND
BUILTIN_SKILL_VERSION_NOT_FOUND
BUILTIN_SKILL_VERSION_CONFLICT
BUILTIN_SKILL_MANIFEST_INVALID
BUILTIN_SKILL_DIGEST_MISMATCH
BUILTIN_SKILL_HANDLER_NOT_FOUND
BUILTIN_SKILL_RUNTIME_UNAVAILABLE
BUILTIN_SKILL_NOT_DEPLOYED
BUILTIN_SKILL_DISABLED
BUILTIN_SKILL_FORBIDDEN
BUILTIN_SKILL_SMOKE_FAILED
BUILTIN_SKILL_VERSION_IN_USE
BUILTIN_SKILL_PLATFORM_INCOMPATIBLE
BUILTIN_SKILL_CONTRACT_INCOMPATIBLE
```

Planner 对用户可使用统一错误码：

```text
CAPABILITY_NOT_FOUND
CAPABILITY_FORBIDDEN
CAPABILITY_VERSION_MISMATCH
```

内部错误码保留在 `details.causeCode`。

## 17. 可观测性

指标：

```text
builtin_skill_registry_total{status}
builtin_skill_provision_total{result}
builtin_skill_deployment_total{environment,status}
builtin_skill_smoke_total{capability_key,version,result}
builtin_skill_activation_total{result}
builtin_skill_runtime_total{capability_key,version,status}
builtin_skill_permission_denied_total{capability_key,scope}
builtin_skill_catalog_projection_total{result}
```

执行日志必须包含：

- `capabilityKey`
- `definitionVersion`
- `definitionDigest`
- `runtimeBuild`
- `executionId`
- `planId`
- `nodeId`
- `idempotencyKey`

不得使用 capability display name 作为日志关联主键。

## 18. 安全边界

- Bundle 来源只允许受信任代码仓库或受控部署制品。
- Phase 1 至少校验 digest；后续可增加签名和 provenance。
- Manifest 不可声明任意代码路径。
- handler 注册表由编译期代码构建。
- 所有副作用必须经过 Runtime Adapter。
- 权限在目录投影和执行前各检查一次。
- 已冻结版本不可被 active pointer 变化替换。
- 默认全员可用不等于匿名可用。
- 高风险能力可以将 `defaultAccess` 改为 `restricted`。
- 内置能力的管理、启用和权限变更仅管理员可执行。

## 19. 测试策略

### 19.1 合同测试

- Manifest Schema 正反例。
- Canonical digest 稳定性。
- SemVer 与兼容性规则。
- handler 和 adapter route 可解析。
- 输入输出 Schema 可编译。
- Bundle 不包含环境配置或敏感字段。

### 19.2 Registry 测试

- 首次 provision。
- 相同 digest 重复 provision。
- 相同版本不同 digest 冲突。
- 新版本并存。
- 原子 activation。
- rollback。
- in-use 版本禁止退役。

### 19.3 权限测试

- 普通已认证用户默认允许。
- 新增角色无需补授权行。
- 用户 deny。
- 角色 deny。
- 用户 allow。
- deny 优先。
- 组织禁用。
- 管理员管理权限。

### 19.4 运行时测试

- 冻结精确版本。
- active version 切换后旧执行不漂移。
- handler 缺失时拒绝执行。
- output contract 不匹配时父执行失败。
- 幂等键重复投递不产生重复副作用。
- Runtime 重启后可恢复。

### 19.5 迁移测试

- 同一 Bundle 在 full、test、staging 导入后 digest 一致。
- 导出后重新导入得到相同 definition。
- 环境 binding 不进入 Bundle。
- staging 验证的 digest 可以在 production 激活。
- 旧别名解析为 canonical key。

## 20. 分阶段实施

### Phase A：合同和 Registry

- 新建本设计文档和共享合同。
- 新增 Prisma 表与迁移。
- 实现 Registry、Provisioning、Permission Override。
- 实现 Bundle validate/provision/export/import。

退出条件：

- Markdown Writer Bundle 可幂等 provision。
- 默认全员权限测试通过。
- 版本与 digest 测试通过。

### Phase B：统一目录

- 新增 `ExecutableCapabilityView`。
- Platform 合并普通与内置能力投影。
- Skill Cache 和 Candidate Selector 改用统一引用。
- 移除 Planner 名称特判。

退出条件：

- Planner 可以仅凭目录卡片识别 Markdown Writer。
- 禁用或 deny 后能力不进入候选。

### Phase C：独立运行

- 新增 Built-in Workflow Runtime Adapter。
- 注册 Markdown Writer handler。
- Control Plane 增加 Catalog Snapshot 二次验证。
- 冻结精确版本。

退出条件：

- 不经过 Release Manager 执行 Markdown Writer。
- 版本升级不影响已冻结执行。

### Phase D：迁移和清理

- 停止 provision 伪普通 Release。
- 保留旧别名兼容。
- 运行真实三节点 E2E。
- 清理 Planner 和 Release Runtime 特判。
- 更新运维与回滚手册。

退出条件：

- 旧兼容路径无调用。
- 真实文件可下载且 hash 一致。
- 回滚演练通过。

## 21. Definition of Done

只有同时满足以下条件，内置工作流 Skill 独立化才算完成：

- 内置 Skill 不依赖普通 Capability Release、审批或 Published Skill。
- Bundle、Registry、Version、Deployment、Activation、Permission Override 均已实现。
- 默认所有已认证用户可用，不需要为每个角色插入授权。
- 显式 deny 和全局禁用可立即生效。
- Planner 不包含具体内置 Skill 名称特判。
- Control Plane 冻结并执行精确版本。
- 新旧版本可并存，升级和回滚不修改历史版本。
- Bundle 可跨环境导出、导入，definition digest 保持一致。
- Markdown Writer 已迁移并通过真实三节点 E2E。
- 普通 Skill 的发布、授权和执行路径无阻断性回归。
- 至少再接入一个非 Markdown 的内置工作流 Skill，证明机制可复用。

## 22. 最终建议

不要继续把平台内置能力塞进 `DEFAULT_SKILLS + skill_configs + capability_releases`。

最小正确落点是：

```text
独立 Bundle
  + 独立 Registry/Version/Deployment 表
  + 默认 authenticated 权限策略
  + Permission Override
  + 统一 Catalog Projection
  + 独立 Runtime Adapter
  + 精确版本冻结
```

这样既保留现有 Planner、Control Plane 和 Domain Runtime 的投资，也使内置能力真正成为可独立开发、迁移、升级和回滚的平台基础功能。
