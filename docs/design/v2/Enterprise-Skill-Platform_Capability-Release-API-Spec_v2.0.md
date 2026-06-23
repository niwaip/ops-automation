# 企业级 Skill 平台 Capability Release API 详细规范

**Capability Release API Spec v2.0**  
日期：2026-04-25

> 本文补充 `Workflow-to-Skill Release Process Spec`，专门定义从能力源到 Skill 发布闭环所需的 API、DTO、错误码、状态流转约束和服务分工。

---

## 1. 文档目标

本文聚焦以下问题：

- `CapabilityRelease` 应提供哪些外部 API 和内部 API
- `build -> validate -> draft -> publish -> deploy -> rollback` 各阶段的请求响应如何定义
- 哪些状态允许重试，哪些状态必须阻断
- `portal`、`auth`、`ai-orchestrator`、`temporal-worker` 的接口边界如何划分
- 如何保证“一次发布动作”始终绑定到确定的源定义、生成产物和验证结果

---

## 2. 设计原则

### 2.1 发布闭环必须以 `releaseId` 为主键

- Portal 后续所有动作都应围绕 `releaseId`
- 不允许前端只凭页面临时状态直接发起发布或部署
- 每次 `build`、`validation`、`draft`、`deploy` 都必须可追溯到 `releaseId`

### 2.2 单一发布主状态写入口

- `release.status` 只允许 `auth` 写入
- `deployment.status` 只允许部署协调器写入
- `skill publish result` 只允许 `auth.skill` 模块写入
- `build result` 和 `validation result` 只能由对应流程持久化

### 2.3 验证通过不等于已发布

- `validation.success = true` 仅表示具备进入发布阶段的资格
- `published` 与 `deployed` 必须作为独立状态
- `temporal_workflow` 类型必须完成真实部署才算“上线可用”

### 2.4 API 必须按层分开

- Portal 只调外部 API
- `auth` 暴露统一编排外部 API
- `auth` 再调 `ai-orchestrator` 和 `temporal-worker` 的内部 API

---

## 3. 参与服务与职责

### 3.1 `portal`

负责：

- 创建 release
- 编辑源定义
- 发起 build
- 发起静态校验和 sandbox 校验
- 查看日志与 diff
- 审核并发布 Skill
- 触发部署和回滚

### 3.2 `auth`

负责：

- 保存 `release/build/validation/draft`
- 统一暴露发布编排 API
- 调用 `skill.service` 执行正式 Skill 发布
- 持久化审计记录和发布事件

### 3.3 `ai-orchestrator`

负责：

- 代码生成
- 配置增强
- Skill Draft 生成
- AI 审计

### 3.4 `temporal-worker`

负责：

- sandbox 执行
- Temporal 制品装载
- worker reload
- 部署后 smoke test

---

## 4. 外部 API 总览

建议新增统一外部前缀：

```text
/capability-releases
```

建议外部 API 清单如下：

- `POST /capability-releases`
- `GET /capability-releases`
- `GET /capability-releases/{id}`
- `PUT /capability-releases/{id}/source`
- `POST /capability-releases/{id}/build`
- `GET /capability-releases/{id}/builds`
- `POST /capability-releases/{id}/validate/static`
- `POST /capability-releases/{id}/validate/sandbox`
- `GET /capability-releases/{id}/validations`
- `POST /capability-releases/{id}/generate-skill-draft`
- `GET /capability-releases/{id}/skill-draft`
- `PUT /capability-releases/{id}/skill-draft`
- `POST /capability-releases/{id}/approve`
- `POST /capability-releases/{id}/publish-skill`
- `POST /capability-releases/{id}/deploy`
- `GET /capability-releases/{id}/deployments`
- `POST /capability-releases/{id}/rollback`

---

## 5. 统一响应格式

### 5.1 成功响应

```json
{
  "success": true,
  "data": {}
}
```

### 5.2 失败响应

```json
{
  "success": false,
  "error": {
    "code": "RELEASE_NOT_FOUND",
    "message": "Release not found",
    "details": {}
  }
}
```

### 5.3 约束

- 外部 API 统一使用 envelope
- 所有错误必须返回 `code`
- 所有写操作返回最新对象快照或最新状态摘要

---

## 6. 核心 DTO 规范

### 6.1 `CapabilityReleaseDto`

```ts
interface CapabilityReleaseDto {
  id: string;
  sourceType: 'execution_flow_template' | 'temporal_workflow';
  sourceId?: string | null;
  sourceStatus: 'draft' | 'ready' | 'archived';
  releaseVersion: number;
  status:
    | 'draft'
    | 'building'
    | 'build_failed'
    | 'validating'
    | 'validation_failed'
    | 'draft_ready'
    | 'pending_approval'
    | 'approved'
    | 'published'
    | 'deploying'
    | 'deployed'
    | 'deploy_failed'
    | 'rolled_back';
  currentBuildId?: string | null;
  latestSuccessfulBuildId?: string | null;
  latestValidationId?: string | null;
  latestSuccessfulValidationId?: string | null;
  skillDraftId?: string | null;
  publishedSkillId?: string | null;
  approvalStatus: 'not_required' | 'pending' | 'approved' | 'rejected';
  deploymentStatus: 'not_started' | 'ready' | 'deploying' | 'deployed' | 'failed' | 'rolled_back';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

### 6.2 `CapabilityBuildDto`

```ts
interface CapabilityBuildDto {
  id: string;
  releaseId: string;
  buildType:
    | 'config_enhancement'
    | 'codegen_activity'
    | 'codegen_workflow'
    | 'skill_draft_generation';
  modelId: string;
  promptVersion: string;
  inputSnapshot: Record<string, unknown>;
  generatedCode?: string | null;
  generatedConfig?: Record<string, unknown> | null;
  diffSummary?: string | null;
  status: 'running' | 'succeeded' | 'failed';
  errorSummary?: string | null;
  createdAt: string;
}
```

### 6.3 `CapabilityValidationDto`

```ts
interface CapabilityValidationDto {
  id: string;
  releaseId: string;
  buildId: string;
  validationType: 'static' | 'sandbox' | 'post_deploy_smoke';
  inputSnapshot?: Record<string, unknown> | null;
  logs: string[];
  score: number;
  success: boolean;
  resultSnapshot?: Record<string, unknown> | null;
  errorSummary?: string | null;
  createdAt: string;
}
```

### 6.4 `SkillDraftDto`

```ts
interface SkillDraftDto {
  id: string;
  releaseId: string;
  sourceType: 'execution_flow_template' | 'temporal_workflow';
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: Record<string, unknown>;
  executionFlowTemplateIds: string[];
  tools: string[];
  apiEndpoints?: Record<string, unknown> | null;
  status: 'draft' | 'reviewed' | 'published';
  generatedFromBuildId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 6.5 `DeploymentRecordDto`

```ts
interface DeploymentRecordDto {
  id: string;
  releaseId: string;
  environment: 'dev' | 'test' | 'staging' | 'prod';
  runtimeType: 'flow_runtime' | 'temporal_worker';
  artifactUri?: string | null;
  workerVersion?: string | null;
  reloadStrategy?: 'hot_reload' | 'rolling_restart' | 'full_restart' | null;
  status: 'running' | 'succeeded' | 'failed' | 'rolled_back';
  success: boolean;
  logs: string[];
  smokeValidationId?: string | null;
  createdAt: string;
}
```

---

## 7. 状态机约束

### 7.1 Release 状态流转

- `draft -> building`
- `building -> draft`
- `building -> build_failed`
- `draft -> validating`
- `build_failed -> building`
- `validating -> draft_ready`
- `validating -> validation_failed`
- `validation_failed -> building`
- `validation_failed -> validating`
- `draft_ready -> pending_approval`
- `draft_ready -> approved`
- `pending_approval -> approved`
- `pending_approval -> draft`
- `approved -> published`
- `published -> deploying`
- `deploying -> deployed`
- `deploying -> deploy_failed`
- `deployed -> rolled_back`

### 7.2 阻断规则

- `build_failed` 状态下禁止发布 Skill
- `validation_failed` 状态下禁止部署
- `pending_approval` 状态下禁止发布和部署
- `deploying` 状态下禁止再次部署
- `rolled_back` 状态下只允许重新构建或重新发布

---

## 8. 外部 API 详细定义

## 8.1 `POST /capability-releases`

用途：

- 创建一次新的发布流程

请求体：

```json
{
  "sourceType": "execution_flow_template",
  "sourcePayload": {
    "name": "天气查询流程",
    "description": "查询天气并格式化结果"
  }
}
```

响应：

```json
{
  "success": true,
  "data": {
    "release": {
      "id": "rel_123",
      "sourceType": "execution_flow_template",
      "status": "draft",
      "releaseVersion": 1
    }
  }
}
```

错误码：

- `INVALID_SOURCE_TYPE`
- `SOURCE_PAYLOAD_INVALID`

## 8.2 `PUT /capability-releases/{id}/source`

用途：

- 更新源定义

请求体：

```json
{
  "sourcePayload": {
    "goal": "根据城市查询天气",
    "expectedResult": "结构化天气摘要",
    "paramsSchema": {
      "properties": {
        "city": { "type": "string" }
      },
      "required": ["city"]
    }
  }
}
```

响应：

- 返回更新后的 `release` 和 `sourceSnapshotVersion`

错误码：

- `RELEASE_NOT_FOUND`
- `RELEASE_STATE_CONFLICT`
- `SOURCE_VALIDATION_ERROR`

## 8.3 `POST /capability-releases/{id}/build`

用途：

- 基于当前源定义触发 AI 生成

请求体：

```json
{
  "buildType": "codegen_workflow",
  "modelId": "default",
  "errorContext": "上次 sandbox 报错 traceback ..."
}
```

响应：

```json
{
  "success": true,
  "data": {
    "build": {
      "id": "build_123",
      "status": "succeeded",
      "generatedCode": "from temporalio import workflow ..."
    },
    "release": {
      "id": "rel_123",
      "status": "draft",
      "currentBuildId": "build_123"
    }
  }
}
```

错误码：

- `RELEASE_NOT_FOUND`
- `BUILD_TYPE_INVALID`
- `MODEL_NOT_AVAILABLE`
- `BUILD_FAILED`

## 8.4 `GET /capability-releases/{id}/builds`

用途：

- 查看构建历史

响应：

- 返回按时间倒序排列的 `builds[]`

## 8.5 `POST /capability-releases/{id}/validate/static`

用途：

- 对当前源定义或指定 build 做静态校验

请求体：

```json
{
  "buildId": "build_123"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "validation": {
      "id": "val_static_1",
      "validationType": "static",
      "score": 92,
      "success": true,
      "logs": ["[Static] paramsSchema complete", "[Static] step dependencies resolved"]
    }
  }
}
```

错误码：

- `BUILD_NOT_FOUND`
- `STATIC_VALIDATION_FAILED`

## 8.6 `POST /capability-releases/{id}/validate/sandbox`

用途：

- 对指定 build 做 sandbox 执行验证

请求体：

```json
{
  "buildId": "build_123",
  "input": {
    "city": "北京"
  },
  "testUserInput": "请查询北京天气"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "validation": {
      "id": "val_sandbox_1",
      "validationType": "sandbox",
      "score": 100,
      "success": true,
      "logs": ["[Sandbox] connected", "[Sandbox] execution succeeded"],
      "resultSnapshot": {
        "answer": "北京天气查询结果 ..."
      }
    },
    "release": {
      "id": "rel_123",
      "status": "draft_ready",
      "latestSuccessfulValidationId": "val_sandbox_1"
    }
  }
}
```

错误码：

- `BUILD_NOT_FOUND`
- `SANDBOX_TIMEOUT`
- `SANDBOX_EXECUTION_FAILED`
- `SANDBOX_SERVICE_UNAVAILABLE`

## 8.7 `GET /capability-releases/{id}/validations`

用途：

- 查看验证历史

响应：

- 返回 `validations[]`

## 8.8 `POST /capability-releases/{id}/generate-skill-draft`

用途：

- 根据最近一次成功验证生成 Skill 草案

请求体：

```json
{
  "validationId": "val_sandbox_1",
  "modelId": "default"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "skillDraft": {
      "id": "draft_123",
      "name": "天气查询",
      "description": "查询指定城市天气",
      "triggerKeywords": ["天气", "天气预报"],
      "tools": ["skill_match", "flow_execute"],
      "executionFlowTemplateIds": ["tpl_123"],
      "status": "draft"
    },
    "release": {
      "id": "rel_123",
      "status": "draft_ready",
      "skillDraftId": "draft_123"
    }
  }
}
```

错误码：

- `VALIDATION_NOT_FOUND`
- `VALIDATION_NOT_PASSED`
- `SKILL_DRAFT_GENERATION_FAILED`

## 8.9 `GET /capability-releases/{id}/skill-draft`

用途：

- 获取当前 Skill 草案

## 8.10 `PUT /capability-releases/{id}/skill-draft`

用途：

- 人工修改 Skill 草案

请求体：

```json
{
  "name": "天气查询",
  "description": "查询天气并返回结构化摘要",
  "triggerKeywords": ["天气", "查询天气", "天气预报"]
}
```

错误码：

- `SKILL_DRAFT_NOT_FOUND`
- `SKILL_DRAFT_INVALID`

## 8.11 `POST /capability-releases/{id}/approve`

用途：

- 提交审核结论

请求体：

```json
{
  "decision": "approved",
  "comment": "通过 sandbox 验证，可以发布"
}
```

错误码：

- `RELEASE_NOT_FOUND`
- `RELEASE_NOT_APPROVABLE`
- `APPROVAL_PERMISSION_DENIED`

## 8.12 `POST /capability-releases/{id}/publish-skill`

用途：

- 基于当前 Skill 草案发布正式 Skill

请求体：

```json
{
  "draftId": "draft_123"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "skill": {
      "id": "skill_123",
      "name": "天气查询"
    },
    "release": {
      "id": "rel_123",
      "status": "published",
      "publishedSkillId": "skill_123"
    }
  }
}
```

错误码：

- `SKILL_DRAFT_NOT_FOUND`
- `APPROVAL_REQUIRED`
- `SKILL_PUBLISH_FAILED`

## 8.13 `POST /capability-releases/{id}/deploy`

用途：

- 将本次 release 部署到指定环境

请求体：

```json
{
  "environment": "staging",
  "strategy": "rolling_restart"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "deployment": {
      "id": "dep_123",
      "status": "running"
    },
    "release": {
      "id": "rel_123",
      "status": "deploying",
      "deploymentStatus": "deploying"
    }
  }
}
```

错误码：

- `RELEASE_NOT_FOUND`
- `RELEASE_NOT_PUBLISHED`
- `DEPLOYMENT_NOT_ALLOWED`
- `DEPLOYMENT_FAILED`

## 8.14 `GET /capability-releases/{id}/deployments`

用途：

- 查看部署历史和日志摘要

## 8.15 `POST /capability-releases/{id}/rollback`

用途：

- 将当前 release 回滚到上一个成功版本

请求体：

```json
{
  "targetReleaseId": "rel_122",
  "reason": "staging smoke test failed"
}
```

错误码：

- `ROLLBACK_TARGET_NOT_FOUND`
- `ROLLBACK_NOT_ALLOWED`
- `ROLLBACK_FAILED`

---

## 9. Streaming API 建议

对于长时操作，建议提供 SSE 版本。

建议接口：

- `POST /capability-releases/{id}/build/stream`
- `POST /capability-releases/{id}/validate/sandbox/stream`
- `POST /capability-releases/{id}/deploy/stream`

统一事件格式：

```json
{
  "type": "stage|log|result|error|done",
  "content": "message",
  "data": {}
}
```

约束：

- `stage` 用于阶段切换
- `log` 用于原始日志流
- `result` 用于结构化中间结果
- `error` 用于终止性异常
- `done` 用于最终完成事件

---

## 10. 内部 API 建议

## 10.1 `auth -> ai-orchestrator`

建议新增：

- `POST /internal/capability-builds/codegen`
- `POST /internal/capability-builds/config-enhance`
- `POST /internal/capability-builds/skill-draft`

请求字段建议：

- `releaseId`
- `sourceType`
- `sourceSnapshot`
- `buildType`
- `modelId`
- `errorContext`

## 10.2 `auth -> temporal-worker`

建议新增：

- `POST /internal/sandbox/validate`
- `POST /internal/temporal-artifacts/deploy`
- `POST /internal/temporal-artifacts/reload`
- `POST /internal/temporal-artifacts/smoke-test`

## 10.3 `auth -> skill.service`

建议新增内部服务方法：

- `publishSkillFromDraft(releaseId, draftId)`
- `rollbackPublishedSkill(releaseId, targetReleaseId)`

---

## 11. 权限模型

建议最少角色权限如下：

- `admin`
  - 可创建 release
  - 可 build
  - 可 validate
  - 可 approve
  - 可 publish
  - 可 deploy
  - 可 rollback

- `designer`
  - 可创建 release
  - 可修改 source
  - 可 build
  - 可 validate
  - 不可 publish 到生产

- `reviewer`
  - 可查看 release
  - 可 approve/reject

- `operator`
  - 可 deploy
  - 可 rollback

---

## 12. 审计事件建议

建议以下动作必须写审计事件：

- release 创建
- source 更新
- build 发起
- build 成功或失败
- static validate 成功或失败
- sandbox validate 成功或失败
- skill draft 生成
- draft 修改
- approve / reject
- skill publish
- deploy
- rollback

建议事件字段：

- `eventType`
- `releaseId`
- `actorId`
- `sourceType`
- `sourceId`
- `buildId`
- `validationId`
- `deploymentId`
- `summary`
- `details`
- `createdAt`

---

## 13. 错误码建议

建议统一错误码如下：

- `RELEASE_NOT_FOUND`
- `RELEASE_STATE_CONFLICT`
- `SOURCE_VALIDATION_ERROR`
- `BUILD_TYPE_INVALID`
- `BUILD_FAILED`
- `BUILD_NOT_FOUND`
- `STATIC_VALIDATION_FAILED`
- `SANDBOX_TIMEOUT`
- `SANDBOX_EXECUTION_FAILED`
- `SANDBOX_SERVICE_UNAVAILABLE`
- `VALIDATION_NOT_FOUND`
- `VALIDATION_NOT_PASSED`
- `SKILL_DRAFT_NOT_FOUND`
- `SKILL_DRAFT_INVALID`
- `SKILL_DRAFT_GENERATION_FAILED`
- `APPROVAL_REQUIRED`
- `APPROVAL_PERMISSION_DENIED`
- `SKILL_PUBLISH_FAILED`
- `DEPLOYMENT_NOT_ALLOWED`
- `DEPLOYMENT_FAILED`
- `ROLLBACK_TARGET_NOT_FOUND`
- `ROLLBACK_NOT_ALLOWED`
- `ROLLBACK_FAILED`

---

## 14. 第一阶段落地建议

第一阶段建议先实现以下最小接口集合：

- `POST /capability-releases`
- `PUT /capability-releases/{id}/source`
- `POST /capability-releases/{id}/build`
- `POST /capability-releases/{id}/validate/static`
- `POST /capability-releases/{id}/validate/sandbox`
- `POST /capability-releases/{id}/generate-skill-draft`
- `PUT /capability-releases/{id}/skill-draft`
- `POST /capability-releases/{id}/publish-skill`
- `POST /capability-releases/{id}/deploy`

第二阶段再补：

- `approve`
- `rollback`
- 全量审计视图
- 更多环境和灰度策略

---

## 15. 推荐实现路径

推荐实现顺序如下：

```text
release metadata
  -> build API
  -> validation API
  -> skill draft API
  -> publish API
  -> deploy API
  -> rollback API
```

在代码层面建议优先把：

- `TemporalWorkflowService`
- `ExecutionFlowTemplateService`
- `SkillService`

上层收敛到新的 `CapabilityReleaseService`，由它统一管理发布流程，而不是继续让三个模块通过页面手工拼接完成业务闭环。
