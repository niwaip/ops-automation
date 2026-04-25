# 企业级 Skill 平台 Workflow 到 Skill 发布开发流程规范

**Workflow-to-Skill Release Process Spec v2.0**  
日期：2026-04-25

> 本文基于当前仓库中 `Temporal Workflow`、`Execution Flow Template`、`Skill`、`Sandbox`、`ai-orchestrator` 的现状，给出一套从能力配置、AI 生成代码、Sandbox 验证、注册为 Skill、部署到运行环境的完整推荐开发流程。

---

## 1. 文档目标

本文回答以下问题：

- 现有仓库中，`workflow -> codegen -> sandbox -> skill -> deploy` 的主链路应如何收敛
- 哪类能力应使用 `Execution Flow Template`，哪类能力应使用 `Temporal Workflow`
- 从产品、后端、运行时三个维度，如何把“验证通过”升级为“可发布、可追踪、可回滚”
- Portal 应如何把当前分散在多个页面的能力串成统一发布流程
- 第一阶段开发时，应该先做哪些改造，后做哪些增强

---

## 2. 核心结论

本文的核心结论如下：

- `Execution Flow Template` 应作为大多数可注册 Skill 的主设计面
- `Temporal Workflow` 应作为复杂长流程和异步编排的实现面，而不是所有 Skill 的默认载体
- “AI 生成代码”必须产出可版本化制品，不能只停留在页面临时状态
- “Sandbox 验证通过”不应直接等价于“已部署成功”
- “注册 Skill”应是一个显式发布动作，并且必须绑定一次具体的验证结果和代码快照
- 平台需要引入统一的中间发布对象，建议命名为 `CapabilityRelease`

---

## 3. 当前仓库能力映射

### 3.1 已有能力

- `TemporalWorkflowPage`
  - 支持 Workflow DSL 编辑
  - 支持 Activity DSL 选择与组合
  - 支持 AI 生成 Temporal Python 代码
  - 支持 Sandbox 流式验证
  - 支持“部署”入口

- `ExecutionFlowTemplatePage`
  - 支持步骤式流程模板定义
  - 支持参数 Schema、目标、预期结果配置
  - 支持 AI 审计
  - 支持真实执行测试
  - 支持 AI 自动修正建议

- `SkillAdminPage`
  - 支持 Skill CRUD
  - 支持绑定 `executionFlowTemplateIds`
  - 支持流式验证 Skill 能力
  - 支持应用 AI 生成的 Skill 草案
  - 支持权限下发

- `ai-orchestrator`
  - 支持 `skill_match`
  - 支持 `flow_execute`
  - 已可把 Skill 匹配结果自动跳转到流程模板执行

### 3.2 当前缺口

- `Temporal Workflow` 的“部署”目前主要是写数据库时间戳，不是真正将代码下发到 Worker
- Sandbox 验证与生产 Worker 装载并不是同一条路径
- Skill 注册仍然偏手工，没有统一的“一键发布为 Skill”接口
- 当前没有统一的“生成结果 + 验证结果 + 发布结果”的版本化制品对象
- Portal 缺少从设计到发布的统一向导

---

## 4. 推荐的目标模型

建议把当前体系收敛为以下六层对象：

### 4.1 `CapabilitySource`

表示能力的源定义，来源有两类：

- `execution_flow_template`
- `temporal_workflow`

它负责：

- 保存原始 DSL 或流程定义
- 记录业务目标和输入输出契约

它不负责：

- 保存发布版本
- 保存运行时部署状态

### 4.2 `CapabilityBuild`

表示一次 AI 生成结果。

建议字段：

- `id`
- `sourceType`
- `sourceId`
- `buildType`
- `modelId`
- `promptVersion`
- `inputSnapshot`
- `generatedCode`
- `generatedConfig`
- `buildStatus`
- `createdBy`
- `createdAt`

### 4.3 `CapabilityValidation`

表示一次验证记录。

建议字段：

- `id`
- `buildId`
- `validationType`
- `sandboxInput`
- `logs`
- `score`
- `success`
- `errorSummary`
- `validatedAt`

### 4.4 `SkillDraft`

表示待发布的 Skill 草案。

建议字段：

- `id`
- `sourceType`
- `sourceId`
- `buildId`
- `validationId`
- `name`
- `description`
- `triggerKeywords`
- `paramsSchema`
- `executionFlowTemplateIds`
- `tools`
- `draftStatus`

### 4.5 `CapabilityRelease`

表示一次正式发布动作，是最关键的中间对象。

建议字段：

- `id`
- `releaseVersion`
- `sourceType`
- `sourceId`
- `buildId`
- `validationId`
- `skillDraftId`
- `publishedSkillId`
- `deploymentTarget`
- `deploymentStatus`
- `approvalStatus`
- `rollbackOf`
- `createdAt`

### 4.6 `DeploymentRecord`

表示部署到运行环境的结果。

建议字段：

- `id`
- `releaseId`
- `runtimeType`
- `target`
- `artifactUri`
- `workerReloaded`
- `success`
- `logs`
- `deployedAt`

---

## 5. 能力分层原则

### 5.1 何时使用 `Execution Flow Template`

以下场景优先使用 `Execution Flow Template`：

- 原子能力
- 被 AI 直接调用的标准 Skill
- 单轮或短链路执行
- 以参数提取、API 调用、文档生成、工具调度为主
- 不需要 Temporal 长事务、补偿、signal、query

典型例子：

- 天气查询
- 文档参数生成
- 文档渲染
- 简单外部系统查询

### 5.2 何时使用 `Temporal Workflow`

以下场景使用 `Temporal Workflow`：

- 涉及长时间运行
- 需要可靠重试和补偿
- 需要并行步骤
- 需要 `signal` 或 `query`
- 需要明确的 worker 运行和持久化编排

典型例子：

- 多系统审批编排
- 长时间异步文件处理
- 订单式多步骤回滚流程
- 需要人工介入后恢复的复杂后台流程

### 5.3 分层规则

- `Skill` 是对外暴露的能力定义
- `Execution Flow Template` 是默认的 Skill 执行体
- `Temporal Workflow` 是复杂 Skill 的后端实现体
- `CapabilityRelease` 是发布闭环的真相源

---

## 6. 推荐的完整开发流程步骤

以下流程是推荐的统一标准流程。

### 6.1 第 0 步：选择能力类型

进入统一“能力发布向导”时，先要求用户选择：

- `模板型能力`
- `Temporal 编排型能力`

判定规则：

- 简单、短链路、AI 原子能力，走模板型
- 长链路、后台编排、可补偿流程，走 Temporal 型

输出：

- 创建一个 `CapabilitySource`

### 6.2 第 1 步：配置能力源

如果是模板型能力：

- 配置 `name`
- 配置 `description`
- 配置 `goal`
- 配置 `expectedResult`
- 配置 `paramsSchema`
- 配置步骤列表
- 配置 `executionFlowKeys`

如果是 Temporal 型能力：

- 配置 `Workflow DSL`
- 配置 `Activity DSL`
- 选择已有 Activity 或新增 Activity
- 配置 `taskQueue`
- 配置错误处理模式

要求：

- 页面必须实时做静态校验
- 每次保存都必须生成一个源定义快照

输出：

- `CapabilitySource`
- `SourceSnapshot`

### 6.3 第 2 步：AI 生成代码或补全配置

如果是模板型能力：

- 可选由 AI 补全步骤描述
- 可选由 AI 调整 `paramsSchema`
- 可选由 AI 生成更合理的 `executionFlowKeys`

如果是 Temporal 型能力：

- 由 AI 生成 Workflow Python 代码
- 如涉及 Activity 缺失，可联动生成 Activity 代码

要求：

- 生成动作必须记录 `modelId`
- 生成动作必须持久化 `prompt` 与输入快照
- 同一源定义可以产生多次 build

输出：

- `CapabilityBuild`

### 6.4 第 3 步：静态验证

先做静态验证，再做运行验证。

静态验证包含：

- DSL 格式合法性
- 必填字段完整性
- 参数 Schema 完整性
- 步骤依赖闭合
- Temporal Activity 引用是否合法
- 工具白名单是否满足

要求：

- 静态验证失败时不得进入发布阶段
- 允许用户基于错误上下文重新生成

输出：

- `CapabilityValidation(validationType=static)`

### 6.5 第 4 步：Sandbox 运行验证

Sandbox 验证是本流程的关键门槛。

模板型能力验证要求：

- 使用真实或模拟用户输入
- 触发 `flow_execute`
- 记录完整执行日志
- 记录参数提取结果
- 记录外部 API 调用结果

Temporal 型能力验证要求：

- 使用 AI 生成代码进入 Sandbox
- 执行指定入口函数
- 收集 stdout、traceback、返回结果
- 标记通过或失败

要求：

- 验证记录必须绑定到具体 `buildId`
- 验证失败时保留日志和输入样例
- 支持“基于失败上下文重新生成”

输出：

- `CapabilityValidation(validationType=sandbox)`

### 6.6 第 5 步：AI 生成 Skill 草案

当静态验证和 Sandbox 验证通过后，允许 AI 自动生成 Skill 草案。

Skill 草案至少包含：

- `name`
- `description`
- `triggerKeywords`
- `paramsSchema`
- `executionFlowTemplateIds`
- `tools`
- `apiEndpoints`

规则：

- 模板型能力优先绑定 `executionFlowTemplateIds`
- Temporal 型能力优先生成“调用入口型 Skill”，而不是直接把代码暴露为普通模板 Skill
- 草案必须可人工修改

输出：

- `SkillDraft`

### 6.7 第 6 步：人工审核与发布审批

发布前必须有一个审核节点。

审核内容：

- 生成代码是否可信
- Sandbox 结果是否稳定
- Skill 命名和关键词是否合理
- 是否需要权限限制
- 是否允许进入生产环境

审批结论：

- `approved`
- `rejected`
- `needs_changes`

要求：

- 高风险能力必须人工审批
- 普通只读能力可允许管理员直接发布

输出：

- `CapabilityRelease(approvalStatus=approved)`

### 6.8 第 7 步：正式注册为 Skill

通过审批后，执行正式发布动作。

发布动作包含：

- 创建或更新 `skill_config`
- 绑定 `executionFlowTemplateIds`
- 写入 `paramsSchema`
- 写入 `triggerKeywords`
- 写入 `tools`
- 生成 `publishedSkillId`

要求：

- 发布必须绑定具体 `validationId`
- Skill 配置必须可回溯到 `buildId`
- 发布成功后必须自动生成审计事件

输出：

- `publishedSkillId`
- `CapabilityRelease`

### 6.9 第 8 步：部署到运行环境

这一步必须区分两种能力。

#### 模板型能力

模板型能力的部署通常是：

- Skill 配置生效
- ReAct 运行时可立即通过 `skill_match -> flow_execute` 使用

因此其部署动作主要是：

- 刷新配置缓存
- 同步权限
- 做一次可用性探测

#### Temporal 型能力

Temporal 型能力的部署必须是真部署：

- 将 workflow 代码与 activity 代码产出为制品
- 下发到 `temporal-worker` 可加载目录或制品存储
- 触发 worker reload 或滚动重启
- 验证 worker 已加载新制品

要求：

- 不能只更新 `deployedAt`
- 必须保存部署日志
- 必须能识别当前运行版本

输出：

- `DeploymentRecord`

### 6.10 第 9 步：发布后验证与监控

正式发布后还需要一次 smoke test。

要求：

- 自动跑一组最小验证用例
- 记录首个成功执行样本
- 记录异常率
- 若异常超过阈值，自动回滚或下线

输出：

- `postDeployValidationResult`

### 6.11 第 10 步：回滚与再发布

若发布后失败，需要支持：

- 回滚到上一个 Skill 版本
- 回滚到上一个 Worker 制品
- 保留当前失败发布记录
- 允许在旧 build 上重新验证

要求：

- 回滚是显式动作
- 回滚后新旧版本关系必须可追踪

---

## 7. Portal 页面流程建议

建议新增统一页面：

- `Capability Studio`
- `Capability Release Center`

### 7.1 `Capability Studio`

负责：

- 选择能力类型
- 编辑源定义
- 触发 AI 生成
- 查看代码与配置 diff
- 执行静态校验和 Sandbox 校验

建议步骤条：

- `选择类型`
- `配置源定义`
- `AI 生成`
- `静态校验`
- `Sandbox 验证`
- `生成 Skill 草案`

### 7.2 `Capability Release Center`

负责：

- 审核 Skill 草案
- 绑定权限与可见范围
- 发布为 Skill
- 部署到目标环境
- 查看版本历史
- 触发回滚

建议步骤条：

- `审核`
- `发布 Skill`
- `部署`
- `发布后验证`
- `完成`

### 7.3 现有页面的保留策略

- `ExecutionFlowTemplatePage`
  - 保留为能力模板编辑器
- `TemporalWorkflowPage`
  - 保留为复杂编排编辑器
- `SkillAdminPage`
  - 收敛为“已发布 Skill 管理页”

不建议继续让用户在三个页面之间手工跳转完成整条链路。

---

## 8. 后端服务职责建议

### 8.1 `auth`

负责：

- `Execution Flow Template`
- `Skill`
- `CapabilityRelease` 元数据
- 权限与审批元数据

建议新增接口：

- `POST /capabilities/releases/build`
- `POST /capabilities/releases/:id/validate/static`
- `POST /capabilities/releases/:id/validate/sandbox`
- `POST /capabilities/releases/:id/generate-skill-draft`
- `POST /capabilities/releases/:id/publish-skill`
- `POST /capabilities/releases/:id/deploy`
- `POST /capabilities/releases/:id/rollback`

### 8.2 `ai-orchestrator`

负责：

- AI 代码生成
- AI 审计
- Skill 草案生成
- 运行时 Skill 匹配与执行

建议新增能力：

- 标准化 `build metadata`
- 记录模型、提示词版本、token 信息
- 输出结构化 `generatedSkillDraft`

### 8.3 `temporal-worker`

负责：

- Sandbox 执行
- 正式 Worker 加载与运行
- 代码制品装载
- reload 或滚动切换

建议新增能力：

- `artifact load`
- `current version inspection`
- `worker reload`
- `deployment smoke test`

### 8.4 `portal`

负责：

- 统一能力发布流程 UI
- 展示验证日志、代码 diff、发布记录、回滚入口

---

## 9. 数据模型建议

建议在第一阶段至少补以下表：

- `capability_releases`
- `capability_builds`
- `capability_validations`
- `skill_drafts`
- `deployment_records`

### 9.1 `capability_releases`

建议字段：

- `id`
- `source_type`
- `source_id`
- `current_build_id`
- `current_validation_id`
- `current_skill_draft_id`
- `published_skill_id`
- `release_version`
- `approval_status`
- `deployment_status`
- `created_by`
- `created_at`
- `updated_at`

### 9.2 `capability_builds`

建议字段：

- `id`
- `release_id`
- `build_type`
- `model_id`
- `prompt_snapshot`
- `input_snapshot`
- `generated_code`
- `generated_config`
- `build_status`
- `created_at`

### 9.3 `capability_validations`

建议字段：

- `id`
- `release_id`
- `build_id`
- `validation_type`
- `input_snapshot`
- `logs`
- `result_snapshot`
- `score`
- `success`
- `error_summary`
- `created_at`

### 9.4 `skill_drafts`

建议字段：

- `id`
- `release_id`
- `name`
- `description`
- `trigger_keywords`
- `params_schema`
- `execution_flow_template_ids`
- `tools`
- `api_endpoints`
- `status`
- `created_at`

### 9.5 `deployment_records`

建议字段：

- `id`
- `release_id`
- `environment`
- `runtime_type`
- `artifact_uri`
- `worker_version`
- `reload_strategy`
- `logs`
- `success`
- `created_at`

---

## 10. 发布与部署规则

### 10.1 发布规则

- 未完成 Sandbox 验证不得发布
- 未生成 Skill 草案不得发布
- 未审批通过的高风险能力不得发布
- 任何发布必须绑定单一 `buildId`

### 10.2 部署规则

- 模板型 Skill 部署可以只刷新配置与缓存
- Temporal 型 Skill 部署必须包含代码制品下发与 Worker reload
- 部署完成后必须执行 smoke test

### 10.3 回滚规则

- 回滚必须基于 `releaseVersion`
- 回滚动作必须记录到 `deployment_records`
- 回滚后应自动恢复上一个 `publishedSkillId` 或 `worker artifact`

---

## 11. 推荐的第一阶段开发顺序

建议按以下顺序实施。

### 阶段 A：打通统一发布元数据

目标：

- 不改变现有页面主功能
- 先补齐 `build / validation / release` 数据结构

开发项：

- 新增 `capability_builds`
- 新增 `capability_validations`
- 新增 `capability_releases`
- 让当前代码生成和验证动作写入这些表

### 阶段 B：补“发布为 Skill”接口

目标：

- 从模板或 workflow 一键产出 Skill 草案

开发项：

- `generate-skill-draft`
- `publish-skill`
- `apply draft`
- `release history`

### 阶段 C：补真部署链路

目标：

- 让 Temporal 类能力真正进入 Worker

开发项：

- 代码制品输出
- Worker 制品加载
- reload
- 版本检查
- 部署日志

### 阶段 D：补统一 Portal 向导

目标：

- 用户在单页面完成完整链路

开发项：

- `Capability Studio`
- `Release Center`
- 代码 diff 与验证日志展示
- 发布与回滚入口

### 阶段 E：补治理能力

目标：

- 提升生产可控性

开发项：

- 审批
- 风险等级
- 环境隔离
- 灰度发布
- 自动回滚

---

## 12. MVP 验收标准

第一阶段完成的验收标准建议如下：

- 用户可以从统一入口创建一个模板型能力
- 用户可以触发 AI 生成步骤或代码
- 用户可以在 Sandbox 中看到完整验证日志
- 用户可以基于验证结果生成 Skill 草案
- 用户可以一键发布 Skill，并立即在运行时匹配使用
- 对于 Temporal 型能力，用户可以触发真实部署并确认 Worker 已加载
- 用户可以查看某次发布对应的源定义、生成结果、验证记录、部署记录
- 用户可以将最近一次发布回滚到上一个成功版本

---

## 13. 不建议的实现方式

以下做法不建议采用：

- 把所有 Skill 都强制落到 `Temporal Workflow`
- 让 Sandbox 成功直接自动发布生产
- 让“部署”只更新数据库字段而不更新 Worker 制品
- 把 Skill 草案仅存在前端状态里
- 在三个独立页面之间依靠人工记忆完成整条链路

---

## 14. 最终推荐方案

推荐的目标主链路如下：

```text
Capability Source
  -> AI Build
  -> Static Validation
  -> Sandbox Validation
  -> Skill Draft
  -> Approval
  -> Publish Skill
  -> Deploy Runtime
  -> Post-Deploy Validation
  -> Audit / Rollback
```

推荐的对象分层如下：

```text
对外能力层：Skill
设计定义层：Execution Flow Template / Temporal Workflow
发布闭环层：CapabilityRelease / Build / Validation / Draft
运行时层：ai-orchestrator / flow_execute / temporal-worker
治理层：Approval / Policy / Audit / Rollback
```

推荐的第一阶段重点如下：

- 先补版本化发布对象
- 再补一键发布为 Skill
- 再补真实部署链路
- 最后收敛 Portal 页面

---

## 15. 后续文档建议

本文建议后续继续补以下文档：

- `Capability Release API Spec`
- `Capability Studio Portal UX Spec`
- `Temporal Artifact Deployment Spec`
- `Skill Draft and Approval RFC`
- `Release Audit and Rollback Spec`

这样可以把本文的流程建议进一步细化为可直接开发的接口和页面实现清单。
