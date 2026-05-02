# 企业级 Skill 平台稳定接口契约规范

**API Contract Spec v4.0**  
日期：2026-05-01

> 本文是 `v4` 稳定接口方案的正式 API 契约文档。  
> 目标不是枚举当前仓库里所有已存在接口，而是定义从 `v4` 开始平台必须长期稳定维护的北向接口、治理接口、南向运行时契约、统一 DTO、错误码和版本策略。  
> 本文应与 `Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md` 配合使用。

---

## 1. 文档目标

本文回答以下问题：

- 哪些 API 是 `v4` 正式外部接口
- 哪些接口属于平台治理接口
- 哪些契约属于平台南向运行时接口
- `Execution`、`Skill`、`Runtime Context`、`Tool Governance` 的最小 DTO 应如何定义
- 接口版本、响应 envelope、错误码应如何统一

---

## 2. 接口设计原则

### 2.1 外部接口优先稳定

- 面向 Portal、Office Add-in、外部业务系统、MCP 客户端的接口必须优先稳定
- 内部实现可以继续演进，但对外对象语义不可频繁漂移

### 2.2 契约稳定优先于实现稳定

- 可以替换 Planner 实现
- 可以替换 Runtime 实现
- 可以调整服务拆分方式
- 但不应破坏 `Execution / Skill / Runtime Context / Tool Governance` 的契约语义

### 2.3 北向对象统一，南向能力抽象

- 北向统一以 `Execution` 为业务容器
- 交付统一以 `Skill` 为正式对象
- 南向统一以 `Runtime Capability Contract` 为执行契约

### 2.4 所有错误必须可机器处理

- 所有正式接口错误必须带 `code`
- 所有错误码必须有稳定语义
- 不允许把关键拒绝语义仅埋在自然语言 `message` 中

### 2.5 版本冻结必须显式

- `v4` 开始，所有正式稳定接口必须声明版本策略
- 新增字段可以扩展
- 修改字段语义必须升大版本

---

## 3. 接口分层

`v4` 正式将接口划分为三层：

1. `L1 外部业务接口`
2. `L2 平台治理接口`
3. `L3 运行时契约接口`

### 3.1 `L1` 外部业务接口

面向：

- Portal
- Office Add-in
- 外部业务系统
- MCP 客户端

对象：

- `Execution`
- `Skill`
- `Published Skill Runtime Context`

### 3.2 `L2` 平台治理接口

面向：

- 平台管理员
- Skill 设计人员
- 发布与运维人员

对象：

- `ToolCatalog`
- `SkillToolBinding`
- `CapabilityRelease`
- `SkillDraft`

### 3.3 `L3` 运行时契约接口

面向：

- Browser Runtime
- Document Runtime
- Workflow Runtime
- 第三方 Runtime Adapter

对象：

- `RuntimeStepInvokeRequest`
- `RuntimeStepInvokeResult`
- `ArtifactRef`
- `SnapshotRef`

---

## 4. 正式外部 API 清单

### 4.1 `Execution API`

建议冻结为 `v1` 的外部接口：

- `POST /executions`
- `GET /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `GET /executions/{id}/events/stream`
- `POST /executions/{id}/submit-input`
- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/resume`
- `POST /executions/{id}/cancel`

### 4.2 `Skill API`

建议冻结为 `v1` 的外部接口：

- `GET /skills`
- `GET /skills/{id}`
- `POST /skills/match`

说明：

- `Skill CRUD` 虽然存在，但更适合作为治理接口，而非普通业务调用接口

### 4.3 `Capability Runtime API`

建议冻结为 `v1` 的外部接口：

- `GET /capability-releases/runtime/skills/{skillId}/context`
- `POST /capability-releases/runtime/skills/{skillId}/execute`

说明：

- 对大多数业务调用方，仍推荐优先走 `Execution API`
- `runtime execute` 更适合平台内部桥接、低层运行时调试和兼容场景

### 4.4 `Planner API`

建议冻结为 `v1` 的外部接口：

- `POST /ai/plans/generate`
- `POST /ai/recognize-params`

说明：

- `Planner API` 是“理解与建议接口”
- 它不是正式业务执行接口

---

## 5. 平台治理 API 清单

### 5.1 `Tool Governance API`

建议冻结为 `v1` 的治理接口：

- `GET /tools/catalog`
- `GET /tools/catalog/{name}`
- `PUT /tools/catalog/{name}`

### 5.2 `Skill Governance API`

建议冻结为 `v1` 的治理接口：

- `POST /skills`
- `PUT /skills/{id}`
- `DELETE /skills/{id}`
- `POST /skills/{id}/validate`
- `POST /skills/{id}/validate-tools`
- `GET /skills/{id}/tool-bindings`
- `PUT /skills/{id}/tool-bindings`
- `GET /skills/{id}/permissions`
- `POST /skills/{id}/grant`

### 5.3 `Release API`

建议冻结为 `v1` 的治理接口：

- `POST /capability-releases`
- `GET /capability-releases`
- `GET /capability-releases/{id}`
- `POST /capability-releases/{id}/build`
- `POST /capability-releases/{id}/validate/static`
- `POST /capability-releases/{id}/validate/sandbox`
- `POST /capability-releases/{id}/generate-skill-draft`
- `GET /capability-releases/{id}/skill-draft`
- `PUT /capability-releases/{id}/skill-draft`
- `POST /capability-releases/{id}/approve`
- `POST /capability-releases/{id}/publish-skill`
- `POST /capability-releases/{id}/deploy`

---

## 6. 统一响应 Envelope

### 6.1 成功响应

```json
{
  "success": true,
  "data": {}
}
```

### 6.2 失败响应

```json
{
  "success": false,
  "error": {
    "code": "TOOL_NOT_BOUND_TO_SKILL",
    "message": "工具不在当前 Skill 允许范围内",
    "details": {}
  }
}
```

### 6.3 规则

- 所有 `v4` 正式接口必须统一采用 envelope
- `success=true` 时业务对象放在 `data`
- `success=false` 时必须返回 `error.code`
- SSE 场景可以不使用完整 envelope，但事件类型和数据结构必须稳定

---

## 7. 版本策略

### 7.1 版本规则

建议采用以下规则：

- `v1`
  - 当前对外可承诺稳定的第一个正式版本
- `v1.x`
  - 只允许新增可选字段
- `v2`
  - 修改字段语义或删除字段时启用

### 7.2 兼容原则

- 新增字段不得改变已有字段含义
- 已有字段若未来不建议继续使用，应先标记 `deprecated`
- Runtime 私有字段必须进入 `details` 或 `metadata`，不得污染正式主字段

---

## 8. `Execution` 契约

### 8.1 `CreateExecutionRequest`

```ts
interface CreateExecutionRequest {
  skillId: string;
  capabilityId?: string;
  runtimeType?: 'browser' | 'document' | 'flow_runtime' | 'temporal_worker' | string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

### 8.2 `ExecutionDto`

```ts
interface ExecutionDto {
  id: string;
  skillId: string;
  status:
    | 'draft'
    | 'queued'
    | 'running'
    | 'waiting_input'
    | 'pending_approval'
    | 'human_control'
    | 'paused'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  runtimeType?: string | null;
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3' | null;
  currentStepId?: string | null;
  requiresApproval?: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'not_required' | null;
  takeoverRequired?: boolean;
  takeoverReason?: string | null;
  resultJson?: Record<string, unknown> | null;
  failureCode?: string | null;
  failureReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 8.3 `ExecutionStepDto`

```ts
interface ExecutionStepDto {
  id: string;
  executionId: string;
  stepIndex: number;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'skipped';
  action?: string | null;
  inputJson?: Record<string, unknown> | null;
  outputJson?: Record<string, unknown> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  snapshotId?: string | null;
  takeoverTriggered?: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 8.4 `ExecutionEventDto`

```ts
interface ExecutionEventDto {
  id: string;
  executionId: string;
  stepId?: string | null;
  eventType: string;
  eventSource: string;
  payloadJson?: Record<string, unknown> | null;
  createdAt: string;
}
```

### 8.5 状态写边界

从 `v4` 开始必须遵守：

- `Execution.status` 只允许 `Execution Control Plane` 修改
- `ExecutionStep.status` 只允许执行引擎修改
- Runtime 只返回执行结果，不直接写业务主状态

---

## 9. `Skill` 契约

### 9.1 `ParamsSchema`

```ts
interface ParamsSchema {
  properties: Record<string, {
    type: 'string' | 'number' | 'date' | 'boolean';
    description: string;
    required?: boolean;
    default?: string | number | boolean;
    extractionPrompt?: string;
  }>;
  required: string[];
}
```

### 9.2 `SkillConfigDto`

```ts
interface SkillConfigDto {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  paramsSchema: ParamsSchema;
  executionFlowTemplateIds: string[];
  executionFlow: Array<Record<string, unknown>>;
  tools: string[];
  effectiveTools?: string[];
  apiEndpoints?: {
    runtimeMetadata?: {
      goal?: string;
      expectedResult?: string;
      outputParams?: Record<string, unknown>;
      sourceType?: string;
      taskQueue?: string;
    };
  };
  isActive: boolean;
  configStatus?: string;
  isPublished: boolean;
  publishedReleaseId?: string | null;
}
```

### 9.3 `SkillMatchResult`

```ts
interface SkillMatchResult {
  skillId: string;
  skillName: string;
  confidence: number;
  matchedKeywords: string[];
  collectedParams: Record<string, unknown>;
  missingParams: string[];
  goal?: string;
  expectedResult?: string;
  outputParams?: Record<string, unknown>;
  matchReason?: string;
}
```

### 9.4 `Skill` 契约规则

- Skill 必须是平台统一交付对象
- Skill 可以来源于手工定义、Flow、Temporal Workflow 或其他 SourceType
- Skill 的运行时工具集合必须来自 `SkillToolBinding + CapabilitySnapshot` 的交集

---

## 10. `Tool Governance` 契约

### 10.1 `ToolCatalogItem`

```ts
interface ToolCatalogItem {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  runtimeType?: string;
  status: 'active' | 'disabled' | 'deprecated';
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  allowSkillBinding: boolean;
  promptExposure: 'hidden' | 'prompt_only' | 'runtime_only' | 'prompt_and_runtime';
  defaultRequiresConfirmation: boolean;
  defaultRequiresApproval: boolean;
  metadataJson?: Record<string, unknown>;
}
```

### 10.2 `SkillToolBinding`

```ts
interface SkillToolBinding {
  skillId: string;
  toolName: string;
  bindingSource: 'declared' | 'inferred_from_flow' | 'system_required';
}
```

### 10.3 `SkillToolValidationResult`

```ts
interface SkillToolValidationResult {
  isValid: boolean;
  declaredTools: string[];
  inferredTools: string[];
  effectiveTools: string[];
  missingTools: string[];
  disabledTools: string[];
  forbiddenSkillTools: string[];
  undeclaredFlowTools: string[];
  messages: Array<{
    code: string;
    toolName?: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
  }>;
}
```

### 10.4 治理规则

- Tool 是治理对象，不只是代码对象
- Tool 是否可见、可执行、可绑定必须通过正式字段表达
- 发布前必须执行 Tool 闭环校验

---

## 11. `Published Skill Runtime Context` 契约

### 11.1 作用

这是 Skill 进入正式运行态时，平台下发给执行层和 Planner 的统一上下文。

### 11.2 `PublishedSkillRuntimeContext`

```ts
interface PublishedSkillRuntimeContext {
  publishedSkillId: string;
  releaseId: string;
  sourceType: string;
  runtimeType: string;
  runtimeSource: 'deployment' | 'sandbox_fallback' | 'flow_runtime_fallback';
  allowedToolNames: string[];
  toolPolicies: Array<{
    name: string;
    promptExposure: 'hidden' | 'prompt_only' | 'runtime_only' | 'prompt_and_runtime';
    defaultRequiresConfirmation: boolean;
    defaultRequiresApproval: boolean;
    status: string;
  }>;
  environment?: string | null;
  deploymentId?: string | null;
}
```

### 11.3 规则

- 运行时工具边界必须以该上下文为准
- Planner 生成 Prompt 暴露范围时也必须参考该上下文
- 该结构应视为正式稳定对象，不应依赖私有实现字段

---

## 12. `Runtime Capability Contract`

### 12.1 `RuntimeStepInvokeRequest`

```ts
interface RuntimeStepInvokeRequest {
  executionId: string;
  stepId: string;
  runtimeSessionId?: string | null;
  capabilityType: string;
  action: string;
  input: Record<string, unknown>;
  policyContext?: {
    riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
    requiresApproval?: boolean;
    requiresConfirmation?: boolean;
  };
  traceContext?: {
    traceId?: string;
    userId?: string;
  };
}
```

### 12.2 `ArtifactRef`

```ts
interface ArtifactRef {
  type: 'document' | 'snapshot' | 'log' | 'report' | string;
  id?: string;
  url?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}
```

### 12.3 `RuntimeStepInvokeResult`

```ts
interface RuntimeStepInvokeResult {
  success: boolean;
  status?: string;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  snapshotId?: string;
  artifactRefs?: ArtifactRef[];
  requiresTakeover?: boolean;
  takeoverReason?: string;
  rawResult?: Record<string, unknown>;
}
```

### 12.4 Runtime 契约规则

- Runtime 不接受自由文本任务
- Runtime 不定义业务是否最终成功
- Runtime 只返回执行事实、证据、产物和异常信号

---

## 13. 错误码规范

### 13.1 命名规则

建议统一使用大写下划线风格：

- `EXECUTION_NOT_FOUND`
- `SKILL_NOT_FOUND`
- `TOOL_NOT_FOUND`
- `TOOL_NOT_BOUND_TO_SKILL`
- `TOOL_REQUIRES_APPROVAL`
- `MISSING_REQUIRED_INPUT`

### 13.2 第一批必须稳定的错误码

#### 13.2.1 Execution 域

- `EXECUTION_NOT_FOUND`
- `EXECUTION_INVALID_STATUS`
- `EXECUTION_APPROVAL_REQUIRED`
- `EXECUTION_HUMAN_CONTROL_REQUIRED`
- `EXECUTION_INPUT_REQUIRED`

#### 13.2.2 Skill 域

- `SKILL_NOT_FOUND`
- `SKILL_NOT_PUBLISHED`
- `SKILL_PERMISSION_DENIED`
- `SKILL_TOOL_VALIDATION_FAILED`

#### 13.2.3 Tool 域

- `TOOL_NOT_FOUND`
- `TOOL_DISABLED`
- `TOOL_NOT_VISIBLE`
- `TOOL_NOT_BOUND_TO_SKILL`
- `TOOL_PROMPT_ONLY`
- `TOOL_REQUIRES_APPROVAL`
- `TOOL_NOT_ALLOWED`

#### 13.2.4 Runtime 域

- `RUNTIME_SESSION_NOT_FOUND`
- `RUNTIME_UNAVAILABLE`
- `RUNTIME_STEP_EXECUTION_FAILED`
- `RUNTIME_TAKEOVER_REQUIRED`

---

## 14. 明确不对外承诺稳定的内容

以下内容不应视为平台正式对外契约：

- `ToolExecutor` 内部行为
- ReAct 思考过程和中间消息格式
- Prompt 模板
- 动态 Flow Tool 命名规则
- 某个 Runtime 的私有 HTTP 细节
- 某个服务当前是否与另一个服务合并部署

原则：

- 对外承诺对象级契约
- 不对外承诺内部编排细节

---

## 15. 最终结论

从 `v4` 开始，平台接口体系必须遵循以下顺序：

1. 业务发起统一走 `Execution API`
2. 能力交付统一收敛为 `Skill Contract`
3. 工具门控统一收敛为 `Tool Governance Contract`
4. 运行时执行统一收敛为 `Runtime Capability Contract`

如果某项新能力不能映射到上述四类契约中的至少一类，则该能力不应直接进入正式平台接口体系。
