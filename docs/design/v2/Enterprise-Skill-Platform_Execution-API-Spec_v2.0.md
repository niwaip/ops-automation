# 企业级 Skill 平台 Execution API 详细规范

**Execution API Spec v2.0**  
日期：2026-04-19

> 本文补充 `Service API and Ownership Contract` 与 `MVP Implementation Blueprint`，专门定义第一阶段 Execution 主链路所需的 API、DTO、错误码、状态变更约束和响应格式。

---

## 1. 文档目标

本文聚焦以下问题：

- 第一阶段哪些 API 是正式对外接口，哪些是内部接口
- 每个接口的请求体、响应体、状态码和错误语义是什么
- 状态变更由谁触发，如何避免多服务同时写主状态
- Portal、skill-control-plane、skill-orchestrator、runtime-manager、browser-runtime 之间如何协作

本文默认覆盖的 MVP 主链路为：

`POST /executions -> 创建 RuntimeSession -> 启动 Execution -> step 执行 -> human_control -> resume -> succeeded/failed`

---

## 2. 设计原则

### 2.1 API 分层

- Portal 只调用外部 API
- 外部 API 由 `skill-control-plane` 暴露
- 内部服务协作优先使用同步 API
- 事件归档用于审计和后续演进，不作为 MVP 主依赖

### 2.2 单一主状态写入口

- `Execution.status` 只允许 `skill-control-plane` 修改
- `RuntimeSession.state` 只允许 `runtime-manager` 修改
- `ExecutionStep.status` 只允许 `execution-engine` 或第一阶段承担其职责的执行器模块修改

### 2.3 最小一致性策略

- 先保证“写主状态时有单一入口”
- 再通过 `execution_events` 保存状态变化痕迹
- 不要求第一阶段引入分布式事务

---

## 3. API 角色划分

### 3.1 外部 API

对调用方可见：

- Portal
- Office Add-in
- 未来 MCP 适配层

由 `skill-control-plane` 提供：

- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/resume`
- `POST /executions/{id}/cancel`

### 3.2 内部 API

#### `skill-control-plane -> skill-orchestrator`

- `POST /internal/executions/start`
- `POST /internal/executions/{id}/resume`
- `POST /internal/executions/{id}/fail`
- `GET /internal/executions/{id}`

#### `skill-control-plane -> runtime-manager`

- `POST /runtime-sessions`
- `GET /runtime-sessions/{id}`
- `POST /runtime-sessions/{id}/freeze`
- `POST /runtime-sessions/{id}/resume`
- `POST /runtime-sessions/{id}/close`

#### `skill-orchestrator -> browser-runtime`

- `POST /browser-sessions/{id}/steps/execute`
- `GET /browser-sessions/{id}/connection`
- `GET /browser-sessions/{id}/last-snapshot`

---

## 4. 统一响应格式

### 4.1 成功响应

```json
{
  "success": true,
  "data": {}
}
```

### 4.2 失败响应

```json
{
  "success": false,
  "error": {
    "code": "EXECUTION_NOT_FOUND",
    "message": "Execution not found",
    "details": {}
  }
}
```

### 4.3 响应规范

- 外部 API 必须统一使用 envelope
- 内部 API 第一阶段可沿用轻量响应，但建议逐步收敛到统一结构
- 所有错误必须带 `code`

---

## 5. 领域对象字段规范

### 5.1 `ExecutionDto`

```ts
interface ExecutionDto {
  id: string;
  createdBy: string;
  skillId: string;
  skillVersion: string;
  status:
    | 'queued'
    | 'running'
    | 'pending_approval'
    | 'human_control'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  runtimeType: 'browser';
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  input: Record<string, unknown>;
  normalizedInput: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  failureReason?: string | null;
  failureCode?: string | null;
  runtimeSessionId?: string | null;
  currentStepId?: string | null;
  requiresApproval: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | null;
  takeoverRequired: boolean;
  takeoverReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 `ExecutionStepDto`

```ts
interface ExecutionStepDto {
  id: string;
  executionId: string;
  stepIndex: number;
  name: string;
  type: 'browser_action' | 'assertion' | 'input_collection' | 'system';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  action?: string | null;
  target?: Record<string, unknown> | null;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  assertion?: Record<string, unknown> | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  retryCount: number;
  snapshotId?: string | null;
  takeoverTriggered: boolean;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 5.3 `RuntimeSessionDto`

```ts
interface RuntimeSessionDto {
  id: string;
  executionId: string;
  runtimeType: 'browser';
  state: 'allocating' | 'ready' | 'busy' | 'frozen' | 'closed' | 'error';
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  workerId?: string | null;
  profileId?: string | null;
  connectionInfo: {
    novncUrl?: string;
    wsEndpoint?: string;
    debuggerUrl?: string;
  };
  capabilities: string[];
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | null;
  freezeReason?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}
```

---

## 6. 外部 API 详细规范

## 6.1 `POST /executions`

用途：

- 创建一次正式 Execution

请求体：

```json
{
  "skillId": "skill-123",
  "skillVersion": "v1",
  "runtimeType": "browser",
  "input": {
    "url": "https://example.com",
    "formData": {
      "name": "alice"
    }
  },
  "idempotencyKey": "optional-request-key"
}
```

字段约束：

- `skillId` 必填
- `skillVersion` 第一阶段可选，缺省时由 control-plane 决定使用 published 或默认版本
- `runtimeType` 第一阶段只允许 `browser`
- `input` 必填，允许 JSON 对象
- `idempotencyKey` 推荐支持，防止 Portal 重复提交

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "execution-123",
    "status": "queued",
    "runtimeType": "browser"
  }
}
```

状态码：

- `201 Created`
- `400 Bad Request`
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict`

错误码建议：

- `SKILL_NOT_FOUND`
- `SKILL_NOT_PUBLISHED`
- `INVALID_RUNTIME_TYPE`
- `INPUT_VALIDATION_FAILED`
- `EXECUTION_DUPLICATED`
- `PERMISSION_DENIED`

状态更新规则：

- 创建成功后，`Execution.status=queued`
- 若策略要求审批且前置审批未完成，可直接创建为 `pending_approval`

## 6.2 `GET /executions/{id}`

用途：

- 查询 Execution 主状态

成功响应：

```json
{
  "success": true,
  "data": {
    "id": "execution-123",
    "status": "running",
    "runtimeSessionId": "runtime-123",
    "currentStepId": "step-2"
  }
}
```

状态码：

- `200 OK`
- `404 Not Found`

错误码建议：

- `EXECUTION_NOT_FOUND`
- `PERMISSION_DENIED`

## 6.3 `GET /executions/{id}/steps`

用途：

- 查询 step 列表

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "id": "step-1",
      "stepIndex": 0,
      "name": "Open target page",
      "status": "succeeded"
    },
    {
      "id": "step-2",
      "stepIndex": 1,
      "name": "Submit form",
      "status": "running"
    }
  ]
}
```

## 6.4 `POST /executions/{id}/takeover`

用途：

- 显式请求进入人工接管

请求体：

```json
{
  "reason": "Captcha detected"
}
```

状态码：

- `200 OK`
- `404 Not Found`
- `409 Conflict`

错误码建议：

- `EXECUTION_NOT_FOUND`
- `EXECUTION_NOT_RUNNING`
- `TAKEOVER_NOT_ALLOWED`
- `RUNTIME_SESSION_NOT_FOUND`

状态更新规则：

- `runtime-manager` 将 `RuntimeSession.state` 更新为 `frozen`
- `skill-control-plane` 将 `Execution.status` 更新为 `human_control`

## 6.5 `POST /executions/{id}/resume`

用途：

- 从人工接管恢复执行

请求体：

```json
{
  "stepId": "step-2",
  "comment": "captcha solved"
}
```

错误码建议：

- `EXECUTION_NOT_FOUND`
- `EXECUTION_NOT_IN_HUMAN_CONTROL`
- `RUNTIME_SESSION_NOT_FROZEN`
- `STEP_NOT_FOUND`

状态更新规则：

- `runtime-manager` 将 `RuntimeSession.state` 更新为 `busy`
- `skill-control-plane` 将 `Execution.status` 更新为 `running`
- `skill-orchestrator` 从指定 step 或下一待执行 step 继续

## 6.6 `POST /executions/{id}/cancel`

用途：

- 主动取消当前执行

请求体：

```json
{
  "reason": "User cancelled"
}
```

状态更新规则：

- `Execution.status=cancelled`
- 关联 RuntimeSession 若未释放，则进入 `closed`

---

## 7. 内部 API 详细规范

## 7.1 `POST /internal/executions/start`

调用方：

- `skill-control-plane`

用途：

- 启动已创建的 Execution

请求体：

```json
{
  "executionId": "execution-123",
  "skillId": "skill-123",
  "skillVersion": "v1",
  "runtimeSessionId": "runtime-123",
  "input": {
    "url": "https://example.com"
  }
}
```

返回：

```json
{
  "success": true,
  "data": {
    "executionId": "execution-123",
    "status": "running",
    "stepCount": 2
  }
}
```

语义：

- build plan
- 初始化 step 列表
- 推动第一个 step 执行

## 7.2 `POST /internal/executions/{id}/resume`

用途：

- orchestrator 从指定 step 恢复

请求体：

```json
{
  "stepId": "step-2"
}
```

## 7.3 `POST /runtime-sessions`

调用方：

- `skill-control-plane`

用途：

- 创建 RuntimeSession 并分配 browser worker

请求体：

```json
{
  "executionId": "execution-123",
  "runtimeType": "browser",
  "profileId": "profile-abc",
  "capabilities": [
    "browser.navigate",
    "browser.click",
    "browser.type"
  ]
}
```

返回：

```json
{
  "success": true,
  "data": {
    "id": "runtime-123",
    "state": "ready",
    "controlMode": "AGENT_RUNNING",
    "connectionInfo": {
      "novncUrl": "http://localhost:6080/vnc.html"
    }
  }
}
```

## 7.4 `POST /runtime-sessions/{id}/freeze`

用途：

- 冻结 RuntimeSession

请求体：

```json
{
  "reason": "Captcha detected"
}
```

状态规则：

- `RuntimeSession.state: busy -> frozen`
- `RuntimeSession.controlMode: AGENT_RUNNING -> HUMAN_CONTROL`

## 7.5 `POST /runtime-sessions/{id}/resume`

用途：

- 恢复 RuntimeSession

请求体：

```json
{
  "stepId": "step-2"
}
```

状态规则：

- `RuntimeSession.state: frozen -> busy`
- `RuntimeSession.controlMode: HUMAN_CONTROL -> AGENT_RUNNING`

## 7.6 `POST /browser-sessions/{id}/steps/execute`

用途：

- 执行一个浏览器 step

请求体：

```json
{
  "executionId": "execution-123",
  "runtimeSessionId": "runtime-123",
  "stepId": "step-2",
  "action": "click",
  "target": {
    "locator": "#submit-btn",
    "locatorType": "css"
  },
  "args": {},
  "assertion": {
    "type": "visible",
    "timeoutMs": 5000
  }
}
```

返回：

```json
{
  "success": true,
  "data": {
    "success": true,
    "snapshotId": "snapshot-2",
    "pageSummary": "Submit button clicked"
  }
}
```

失败且要求接管时：

```json
{
  "success": true,
  "data": {
    "success": false,
    "errorCode": "CAPTCHA_DETECTED",
    "errorMessage": "Manual interaction required",
    "shouldTakeover": true,
    "takeoverReason": "Captcha detected"
  }
}
```

---

## 8. DTO 约束规范

### 8.1 `CreateExecutionDto`

```ts
interface CreateExecutionDto {
  skillId: string;
  skillVersion?: string;
  runtimeType?: 'browser';
  input: Record<string, unknown>;
  idempotencyKey?: string;
}
```

### 8.2 `TakeoverExecutionDto`

```ts
interface TakeoverExecutionDto {
  reason: string;
  requestedBy?: string;
}
```

### 8.3 `ResumeExecutionDto`

```ts
interface ResumeExecutionDto {
  stepId?: string;
  comment?: string;
  resumedBy?: string;
}
```

### 8.4 `CreateRuntimeSessionDto`

```ts
interface CreateRuntimeSessionDto {
  executionId: string;
  runtimeType: 'browser';
  profileId?: string;
  capabilities?: string[];
}
```

### 8.5 `ExecuteBrowserStepDto`

```ts
interface ExecuteBrowserStepDto {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  action:
    | 'goto'
    | 'click'
    | 'type'
    | 'select'
    | 'wait'
    | 'extract_text'
    | 'upload_file'
    | 'press_key'
    | 'snapshot';
  target?: {
    locator?: string;
    locatorType?: 'css' | 'xpath' | 'text' | 'role';
    text?: string;
  };
  args?: Record<string, unknown>;
  assertion?: {
    type: 'visible' | 'text_contains' | 'url_contains' | 'element_exists';
    expected?: string;
    timeoutMs?: number;
  };
}
```

---

## 9. 错误码规范

### 9.1 通用错误码

- `INVALID_REQUEST`
- `PERMISSION_DENIED`
- `RESOURCE_NOT_FOUND`
- `INTERNAL_ERROR`

### 9.2 Execution 相关错误码

- `EXECUTION_NOT_FOUND`
- `EXECUTION_NOT_RUNNING`
- `EXECUTION_NOT_IN_HUMAN_CONTROL`
- `EXECUTION_ALREADY_FINISHED`
- `EXECUTION_DUPLICATED`

### 9.3 Skill 相关错误码

- `SKILL_NOT_FOUND`
- `SKILL_NOT_PUBLISHED`
- `SKILL_VERSION_NOT_FOUND`

### 9.4 Runtime 相关错误码

- `RUNTIME_SESSION_NOT_FOUND`
- `RUNTIME_ALLOCATION_FAILED`
- `RUNTIME_SESSION_NOT_FROZEN`
- `RUNTIME_SESSION_INVALID_STATE`
- `PROFILE_LOCK_CONFLICT`

### 9.5 Step 相关错误码

- `STEP_NOT_FOUND`
- `STEP_EXECUTION_FAILED`
- `ASSERTION_FAILED`
- `CAPTCHA_DETECTED`
- `TARGET_NOT_FOUND`

---

## 10. 状态变更约束

### 10.1 `Execution`

允许：

- `queued -> running`
- `queued -> pending_approval`
- `running -> human_control`
- `human_control -> running`
- `running -> succeeded`
- `running -> failed`
- `queued/running/human_control -> cancelled`

默认不允许：

- `succeeded -> running`
- `failed -> running`
- `cancelled -> running`

### 10.2 `RuntimeSession`

允许：

- `allocating -> ready`
- `ready -> busy`
- `busy -> frozen`
- `frozen -> busy`
- `busy/ready/frozen -> closed`
- `allocating/busy -> error`

---

## 11. 幂等与重试建议

### 11.1 外部 API

- `POST /executions` 推荐支持 `idempotencyKey`
- `POST /executions/{id}/resume` 在 Execution 不处于 `human_control` 时不得重复推进状态

### 11.2 内部 API

- `POST /runtime-sessions/{id}/freeze` 应具备幂等行为
- `POST /runtime-sessions/{id}/resume` 应具备幂等行为
- browser step 执行若非幂等动作，不得无脑自动重试

---

## 12. 审计与事件上报

每次调用以下动作时，建议同步写入 `execution_events`：

- 创建 Execution
- Runtime 分配成功或失败
- step 开始 / 成功 / 失败
- 进入 `human_control`
- 执行 resume
- 执行取消
- 执行成功 / 失败

推荐 `event_source`：

- `control_plane`
- `orchestrator`
- `runtime_manager`
- `browser_runtime`
- `portal`
- `human`

---

## 13. Portal 对接要求

Portal 第一阶段只需要依赖以下接口：

- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/resume`
- `POST /executions/{id}/cancel`

Portal 不应：

- 直接调用 Runtime 内部接口
- 自己拼状态机
- 绕过 control-plane 写 Execution 状态

---

## 14. 与现有文档关系

- 领域边界：见 `Enterprise-Skill-Platform_Service-API-and-Ownership-Contract_v2.0.md`
- 主链路蓝图：见 `archive/Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md`
- 状态机定义：见 `Enterprise-Skill-Platform_Execution-Lifecycle-RFC_v2.0.md`

本文定位是“接口实施规范”，用于在正式开发前冻结 MVP API 合同。
