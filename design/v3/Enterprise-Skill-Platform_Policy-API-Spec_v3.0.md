# 企业级 Skill 平台 Agent OS Policy API 规范

**Policy API Spec v3.0**  
日期：2026-04-26

> 本文定义 `Phase 2` 的 Policy API、DTO 和状态约束，目标是让 `PolicyDecision`、`ApprovalRequest` 和 step gate 真正进入执行主链，而不是继续依赖各服务内部的临时判断。

---

## 1. 文档目标

本文回答以下问题：

- `Policy` 相关正式接口有哪些
- `precheck / step-check / postcheck` 分别如何输入输出
- 审批接口如何与 `Execution` 主链协同
- 哪些状态由谁写、谁不能写

---

## 2. 设计原则

### 2.1 Policy 只给出决策，不直接改业务主状态

- Policy Service 返回 `PolicyDecision`
- 由 `Execution Control Plane` 决定如何推动 `Execution.status`

### 2.2 审批是正式对象，不是布尔值

- “需要审批”必须体现在 `ApprovalRequest`
- 审批通过或拒绝必须有正式记录

### 2.3 Step gate 必须结构化

- 所有关键 step 必须通过明确的 `step-check`
- 返回结果必须是 `allow / require_approval / require_human / deny`

---

## 3. 角色划分

### 3.1 调用方

- `Execution Control Plane`

### 3.2 被调用方

- `Policy Service`

### 3.3 相关协作方

- `auth`
- `Execution Control Plane`
- `portal`

---

## 4. 外部与内部边界

### 4.1 外部 API

对 Portal 暴露的治理动作由 `Execution Control Plane` 提供：

- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `GET /executions/{id}/approvals`

### 4.2 内部 API

由 `Policy Service` 提供：

- `POST /internal/policy:precheck`
- `POST /internal/policy:step-check`
- `POST /internal/policy:postcheck`
- `GET /internal/policy-decisions/{id}`
- `GET /internal/approval-requests/{id}`

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
    "code": "POLICY_DENIED",
    "message": "Policy denied the requested action",
    "details": {}
  }
}
```

---

## 6. DTO 规范

### 6.1 `PolicyDecisionDto`

```ts
interface PolicyDecisionDto {
  id: string;
  executionId: string;
  stepId?: string | null;
  decisionType: 'precheck' | 'step_check' | 'postcheck';
  decision: 'allow' | 'require_approval' | 'require_human' | 'deny';
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  reasonCodes: string[];
  explanations: string[];
  requiredControls: string[];
  effectiveScope: Record<string, unknown>;
  expiresAt?: string | null;
  createdAt: string;
}
```

### 6.2 `ApprovalRequestDto`

```ts
interface ApprovalRequestDto {
  id: string;
  executionId: string;
  stepId?: string | null;
  policyDecisionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  requestReason: string;
  requiredApprovers: string[];
  requestedAt: string;
  decidedAt?: string | null;
}
```

### 6.3 `PrecheckRequestDto`

```ts
interface PrecheckRequestDto {
  userId: string;
  orgId?: string | null;
  skillId: string;
  skillVersionId: string;
  goal: string;
  normalizedInput: Record<string, unknown>;
  riskHint?: Record<string, unknown> | null;
}
```

### 6.4 `StepCheckRequestDto`

```ts
interface StepCheckRequestDto {
  executionId: string;
  stepId: string;
  stepIndex: number;
  capabilityName: string;
  runtimeType: 'browser' | 'api' | 'document' | 'code';
  inputPayload: Record<string, unknown>;
  verificationRule?: Record<string, unknown> | null;
}
```

### 6.5 `PostcheckRequestDto`

```ts
interface PostcheckRequestDto {
  executionId: string;
  stepId?: string | null;
  runtimeType?: 'browser' | 'api' | 'document' | 'code' | null;
  outputPayload?: Record<string, unknown> | null;
  verificationResult?: Record<string, unknown> | null;
  failureSummary?: Record<string, unknown> | null;
}
```

---

## 7. 内部 API 详细规范

## 7.1 `POST /internal/policy:precheck`

用途：

- 在 Execution 创建前给出正式决策

请求体：

```json
{
  "userId": "u_123",
  "skillId": "expense-submit",
  "skillVersionId": "sv_456",
  "goal": "为张三提交报销申请",
  "normalizedInput": {
    "amount": 1280
  },
  "riskHint": {
    "plannerLevel": "L2"
  }
}
```

返回：

- `PolicyDecisionDto`
- 若需要审批，附带 `ApprovalRequestDto`

典型结果：

- `allow`
- `require_approval`
- `deny`

### 7.2 `POST /internal/policy:step-check`

用途：

- 在 step 执行前判断是否允许继续

请求体：

```json
{
  "executionId": "exe_123",
  "stepId": "step_001",
  "stepIndex": 3,
  "capabilityName": "api.submit_expense",
  "runtimeType": "api",
  "inputPayload": {
    "amount": 1280
  }
}
```

返回：

- `PolicyDecisionDto`
- 可附带 `ApprovalRequestDto`

典型结果：

- `allow`
- `require_approval`
- `require_human`
- `deny`

### 7.3 `POST /internal/policy:postcheck`

用途：

- 在 step 或 execution 完成后追加治理判断

请求体：

```json
{
  "executionId": "exe_123",
  "stepId": "step_001",
  "runtimeType": "document",
  "outputPayload": {
    "artifactId": "art_001"
  },
  "verificationResult": {
    "ok": true
  }
}
```

返回：

- `PolicyDecisionDto`

典型结果：

- `allow`
- `require_approval`
- `deny`

### 7.4 `GET /internal/policy-decisions/{id}`

用途：

- 查询单个决策结果

返回：

- `PolicyDecisionDto`

### 7.5 `GET /internal/approval-requests/{id}`

用途：

- 查询单个审批请求

返回：

- `ApprovalRequestDto`

---

## 8. 外部审批接口

这些接口仍由 `Execution Control Plane` 对外提供，但语义上依赖 `PolicyDecision` 和 `ApprovalRequest`。

### 8.1 `POST /executions/{id}/approve`

用途：

- 批准待审批执行继续

行为：

- 只适用于存在 `ApprovalRequest.status = pending` 的 Execution
- 更新 `ApprovalRequest`
- 由 `Execution Control Plane` 决定将 Execution 推回 `queued`

### 8.2 `POST /executions/{id}/reject`

用途：

- 拒绝待审批执行继续

行为：

- 更新 `ApprovalRequest`
- 由 `Execution Control Plane` 决定将 Execution 置为 `cancelled`

### 8.3 `GET /executions/{id}/approvals`

用途：

- 查看 Execution 相关审批请求

返回：

- `ApprovalRequestDto[]`

---

## 9. 状态写入约束

### 9.1 `PolicyDecision`

只允许由 `Policy Service` 写入。

### 9.2 `ApprovalRequest`

允许写入方：

- `Policy Service` 创建
- `Execution Control Plane` 在审批动作完成时更新状态

### 9.3 `Execution.status`

不允许由 `Policy Service` 直接修改。

仍只允许：

- `Execution Control Plane`

### 9.4 `RuntimeSession.state`

不允许由 `Policy Service` 直接修改。

---

## 10. 推荐错误码

### 10.1 Policy

- `POLICY_DENIED`
- `POLICY_NOT_FOUND`
- `POLICY_INVALID_SCOPE`
- `POLICY_DECISION_EXPIRED`

### 10.2 Approval

- `APPROVAL_REQUIRED`
- `APPROVAL_REQUEST_NOT_FOUND`
- `APPROVAL_ALREADY_DECIDED`
- `APPROVAL_INVALID_STATE`

### 10.3 Runtime / Step Gate

- `HUMAN_CONTROL_REQUIRED`
- `STEP_POLICY_BLOCKED`
- `RISK_LEVEL_UNSUPPORTED`

---

## 11. 典型时序

### 11.1 创建前预检查

`POST /executions -> Policy precheck -> allow -> Execution.queued`

### 11.2 创建后进入审批

`POST /executions -> Policy precheck -> require_approval -> ApprovalRequest.pending -> Execution.pending_approval`

### 11.3 Step 执行前被阻断

`step-check -> deny -> Execution.failed or cancelled`

### 11.4 Step 执行前要求人工接管

`step-check -> require_human -> Execution.human_control`

---

## 12. 与当前仓库的映射

### 12.1 适合承接 Policy 协调

- `control-plane`

### 12.2 适合承接授权与元数据

- `auth`

### 12.3 适合提供风险提示

- `ai-orchestrator`

---

## 13. 一句话总结

`Phase 2` 的 Policy API 核心是：

> 让每个关键动作先经过正式决策，再由 Execution Control Plane 按决策推进执行，而不是让执行器和 Planner 自己猜测治理边界。
