# 企业级 Skill 平台 Agent OS Execution API 规范

**Execution API Spec v3.0**  
日期：2026-04-26

> 本文定义 `Planner-only Agent OS` 下的 Execution API、DTO、状态写入边界和服务协作方式。目标是让 `Execution` 成为统一业务真相源，同时避免 Planner、Runtime、Portal 多方混写主状态。

---

## 1. 文档目标

本文回答以下问题：

- `v3` 下哪些 API 是正式外部接口
- 哪些接口属于内部协作接口
- `Execution`、`ExecutionStep`、`RuntimeSession` 的 DTO 应长什么样
- 主状态由谁写、谁不能写

---

## 2. 设计原则

### 2.1 单一主状态写入口

- `Execution.status` 只允许 `Execution Control Plane` 修改
- `RuntimeSession.state` 只允许 `Runtime Manager` 修改
- `ExecutionStep.status` 只允许 `Execution Engine` 修改

### 2.2 Planner 不直接改主状态

- Planner 只返回 `PlanDraft`
- Planner 不直接写 `Execution.status`
- Planner 不直接写 `ExecutionStep.status`

### 2.3 Runtime 不直接定义业务结果

- Runtime 只回传执行结果和资源状态
- 最终是否成功由 `Execution + Verification` 判定

### 2.4 外部接口优先稳定

- Portal、Chat UI、Office Add-in 只调用外部 API
- 内部服务可逐步演进，但外部 API 尽量稳定

---

## 3. 角色划分

### 3.1 外部调用方

- Portal
- Chat UI
- Office Add-in
- 未来 MCP 适配层

### 3.2 核心服务

- `Execution Control Plane`
- `Planner Service`
- `Runtime Manager`
- `Browser Runtime`
- `Policy Service`
- `Evaluation Service`

---

## 4. 外部 API 清单

建议由 `Execution Control Plane` 对外暴露：

- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `GET /executions/{id}/artifacts`
- `POST /executions/{id}/submit-input`
- `POST /executions/{id}/resume`
- `POST /executions/{id}/cancel`
- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/release-human-control`

---

## 5. 内部 API 清单

### 5.1 `Execution Control Plane -> Planner Service`

- `POST /internal/plans:generate`
- `POST /internal/plans:verify`
- `POST /internal/failures:classify`

### 5.2 `Execution Control Plane -> Runtime Manager`

- `POST /internal/runtime-sessions`
- `GET /internal/runtime-sessions/{id}`
- `POST /internal/runtime-sessions/{id}:freeze`
- `POST /internal/runtime-sessions/{id}:resume`
- `POST /internal/runtime-sessions/{id}:close`

### 5.3 `Execution Engine -> Runtime`

- `POST /internal/runtime/browser/steps:execute`
- `POST /internal/runtime/api/steps:execute`
- `POST /internal/runtime/document/steps:execute`
- `POST /internal/runtime/code/steps:execute`

### 5.4 `Execution Control Plane -> Policy Service`

- `POST /internal/policy:precheck`
- `POST /internal/policy:step-check`
- `POST /internal/policy:postcheck`

### 5.5 `Execution Control Plane -> Evaluation Service`

- `POST /internal/evaluations:enqueue`

---

## 6. 统一响应格式

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
    "code": "EXECUTION_NOT_FOUND",
    "message": "Execution not found",
    "details": {}
  }
}
```

### 6.3 规范

- 外部 API 必须统一使用 envelope
- 内部 API 建议逐步收敛为统一 envelope
- 所有错误必须带 `code`

---

## 7. DTO 规范

### 7.1 `ExecutionDto`

```ts
interface ExecutionDto {
  id: string;
  userId: string;
  skillId: string;
  skillVersionId: string;
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
    | 'cancelled'
    | 'rolled_back';
  goal: string;
  normalizedInput: Record<string, unknown>;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  runtimeSessionId?: string | null;
  currentStepIndex?: number | null;
  resultSummary?: Record<string, unknown> | null;
  failureSummary?: Record<string, unknown> | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 7.2 `ExecutionStepDto`

```ts
interface ExecutionStepDto {
  id: string;
  executionId: string;
  stepIndex: number;
  title: string;
  capabilityName: string;
  runtimeType: 'browser' | 'api' | 'document' | 'code';
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'blocked';
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  verificationRule?: Record<string, unknown> | null;
  verificationResult?: Record<string, unknown> | null;
  failureReason?: Record<string, unknown> | null;
  retryCount: number;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### 7.3 `RuntimeSessionDto`

```ts
interface RuntimeSessionDto {
  id: string;
  executionId: string;
  runtimeType: 'browser' | 'api' | 'document' | 'code';
  state: 'allocating' | 'ready' | 'busy' | 'frozen' | 'recovering' | 'closed' | 'error';
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  workerId?: string | null;
  resourceRef?: string | null;
  connectUrl?: string | null;
  healthStatus?: 'healthy' | 'degraded' | 'unhealthy' | null;
  freezeReason?: string | null;
  lastHeartbeatAt?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}
```

### 7.4 `PlanDraftDto`

```ts
interface PlanDraftDto {
  goal: string;
  skillId: string;
  skillVersionId: string;
  normalizedInput: Record<string, unknown>;
  requiredInputs: Array<Record<string, unknown>>;
  planSteps: Array<Record<string, unknown>>;
  verificationRules: Array<Record<string, unknown>>;
  riskSummary: Record<string, unknown>;
}
```

---

## 8. 外部 API 详细规范

## 8.1 `POST /executions`

用途：

- 创建一次正式 `Execution`

请求体：

```json
{
  "goal": "为张三提交报销申请",
  "skillId": "expense-submit",
  "input": {
    "employeeName": "张三",
    "amount": 1280
  },
  "idempotencyKey": "optional-request-key"
}
```

行为：

- 先调用 Planner 生成 `PlanDraft`
- 进行 Policy 预检查
- 创建 `Execution`
- 如果输入不足，进入 `waiting_input`
- 如果风险过高，进入 `pending_approval`
- 否则进入 `queued`

成功响应示例：

```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "exe_123",
      "status": "queued"
    }
  }
}
```

### 8.2 `GET /executions/{id}`

用途：

- 查询 Execution 详情

返回：

- `ExecutionDto`
- 当前 `RuntimeSessionDto`
- 当前高亮 step 摘要

### 8.3 `GET /executions/{id}/steps`

用途：

- 查询 step 列表

返回：

- `ExecutionStepDto[]`

### 8.4 `GET /executions/{id}/artifacts`

用途：

- 查询执行产物

返回：

- artifacts 索引数组

### 8.5 `POST /executions/{id}/submit-input`

用途：

- 补交缺失参数

请求体：

```json
{
  "input": {
    "departmentCode": "FIN-01"
  }
}
```

行为：

- 合并输入
- 重新执行 Planner 校验
- 若满足条件，则从 `waiting_input` 转回 `queued`

### 8.6 `POST /executions/{id}/resume`

用途：

- 从 `paused / waiting_input / pending_approval` 恢复

约束：

- 必须先满足恢复前置条件

### 8.7 `POST /executions/{id}/cancel`

用途：

- 取消执行

行为：

- 结束后写入 `cancelled`
- 关闭相关 RuntimeSession

### 8.8 `POST /executions/{id}/approve`

用途：

- 批准执行继续

行为：

- 仅适用于 `pending_approval`
- 通过后进入 `queued`

### 8.9 `POST /executions/{id}/reject`

用途：

- 拒绝执行继续

行为：

- 仅适用于 `pending_approval`
- 拒绝后进入 `cancelled`

### 8.10 `POST /executions/{id}/takeover`

用途：

- 人工接管

行为：

- 将 `Execution.status` 设为 `human_control`
- 请求 `RuntimeSession.controlMode = HUMAN_CONTROL`

### 8.11 `POST /executions/{id}/release-human-control`

用途：

- 接管后交还控制权

行为：

- Runtime 恢复为 `AGENT_RUNNING`
- Execution 从 `human_control` 回到 `running`

---

## 9. 内部协作接口

### 9.1 `POST /internal/plans:generate`

输入：

- 用户请求
- Skill 上下文
- Memory Context
- Policy Snapshot

输出：

- `PlanDraftDto`

### 9.2 `POST /internal/policy:precheck`

输入：

- `PlanDraftDto`

输出：

- `PolicyDecision`

### 9.3 `POST /internal/runtime-sessions`

输入：

- `executionId`
- `runtimeType`
- `resourceConstraints`

输出：

- `RuntimeSessionDto`

### 9.4 `POST /internal/runtime/browser/steps:execute`

输入：

- `executionId`
- `stepId`
- `runtimeSessionId`
- `stepPayload`

输出：

- 执行结果
- 断言结果
- snapshot 引用
- 是否建议接管

---

## 10. 状态写入约束

### 10.1 `Execution.status`

只允许由 `Execution Control Plane` 修改。

不允许直接修改者：

- Planner
- Runtime
- Portal

### 10.2 `RuntimeSession.state`

只允许由 `Runtime Manager` 修改。

不允许直接修改者：

- Planner
- Portal
- Browser Runtime 以外的业务服务

### 10.3 `ExecutionStep.status`

只允许由 `Execution Engine` 修改。

不允许直接修改者：

- Planner
- Portal
- Runtime Manager

---

## 11. 推荐错误码

### 11.1 通用

- `INVALID_ARGUMENT`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `INTERNAL_ERROR`

### 11.2 Execution

- `EXECUTION_NOT_FOUND`
- `EXECUTION_INVALID_STATE`
- `EXECUTION_ALREADY_FINISHED`
- `EXECUTION_INPUT_MISSING`

### 11.3 Runtime

- `RUNTIME_SESSION_NOT_FOUND`
- `RUNTIME_SESSION_NOT_READY`
- `RUNTIME_ALLOCATION_FAILED`
- `RUNTIME_HEALTH_DEGRADED`

### 11.4 Policy

- `POLICY_DENIED`
- `APPROVAL_REQUIRED`
- `HUMAN_CONTROL_REQUIRED`

---

## 12. 典型时序

### 12.1 正常执行

`POST /executions -> Planner -> Policy Precheck -> Execution.queued -> Runtime allocate -> Execution.running -> Step execute -> Verification -> succeeded`

### 12.2 参数不足

`POST /executions -> Planner reports missing input -> Execution.waiting_input -> submit-input -> queued`

### 12.3 需要审批

`POST /executions -> Policy requires approval -> Execution.pending_approval -> approve -> queued`

### 12.4 人工接管

`running -> Runtime suggests takeover -> Execution.human_control -> release-human-control -> running`

---

## 13. 与现有仓库的映射

### 13.1 适合承接 API 外壳

- `control-plane`

### 13.2 适合承接 Planner 内部接口

- `ai-orchestrator`

### 13.3 适合承接 Runtime 内部接口

- `session-broker`
- `browser-worker`

---

## 14. 一句话总结

`v3` 的 API 设计重点是把“谁来写状态、谁来给建议、谁来实际执行”彻底拆开：

> Planner 输出计划，Execution 持有真相，Runtime 返回事实，Policy 决定边界，Portal 只消费稳定接口。
