# 专项 Agent 共享执行协议示例载荷 (v4.1)

日期：2026-06-24

> 本文件承接 `M6` 的共享协议接入阶段，用示例载荷固定 `planner/delegation -> specialized agent -> control-plane` 的最小协议实例形状。

## 1. 目标

- 为 `codegen-agent` 与 `browser-nl-agent` 提供统一的协议示例。
- 明确 `input / context / payload / output` 四个容器分别放什么。
- 避免后续接入时重新发明控制面私有 DTO。

## 2. 通用约束

所有专项 Agent 都先遵守共享外壳：

```ts
AgentExecutionStartRequest
AgentExecutionProgressEvent
AgentExecutionResult
```

其中：

- `executionId`
  - 对应控制面的执行单标识
- `stepId`
  - 对应计划中的当前步骤标识
- `agentKind`
  - 对应被委派的专项 Agent 种类，例如 `codegen-agent`、`browser-nl-agent`
- `input`
  - 本次专项 Agent 真正要处理的业务输入
- `context`
  - 上游提供的附加上下文
- `payload`
  - 运行中的阶段进度、等待原因、接管信号
- `output`
  - 终态业务结果

约束：

- `planner/delegation` 和 `control-plane` 只稳定依赖这层外壳。
- 专项 Agent 本地领域对象只放在容器内部，不提升为共享协议顶层字段。

## 3. `codegen-agent` 示例

### 3.1 Start Request

```json
{
  "executionId": "exec_codegen_001",
  "stepId": "step_codegen_001",
  "agentKind": "codegen-agent",
  "input": {
    "objective": "生成一个 Temporal activity 与对应测试",
    "outputType": "activity_code",
    "allowedLanguages": ["typescript"],
    "constraints": {
      "framework": "nestjs",
      "mustIncludeTests": true
    }
  },
  "context": {
    "planSummary": {
      "planId": "plan_123",
      "phase": "delegated_codegen"
    },
    "workUnitRef": {
      "workUnitId": "wu_123"
    },
    "sandboxBinding": {
      "runtime": "sandbox-worker",
      "executionMode": "verification"
    }
  }
}
```

说明：

- `input` 里只放本次代码生成直接需要的任务目标和约束。
- `context` 里放规划摘要、工作单关联、sandbox 绑定等上游上下文。

### 3.2 Progress Event

```json
{
  "executionId": "exec_codegen_001",
  "stepId": "step_codegen_001",
  "status": "running",
  "timestamp": "2026-06-24T12:00:00.000Z",
  "payload": {
    "stage": "security_lint",
    "progress": 0.65,
    "generatedFiles": 4,
    "blockingIssueCount": 0
  }
}
```

说明：

- `payload` 可表达生成阶段、lint 阶段、dry-run 阶段。
- `control-plane` 不需要理解生成文件内部结构，只需要理解阶段与状态。

### 3.3 Result

```json
{
  "executionId": "exec_codegen_001",
  "stepId": "step_codegen_001",
  "status": "succeeded",
  "output": {
    "generatedWorkUnit": {
      "workUnitId": "wu_123",
      "title": "Temporal Activity Bundle",
      "objective": "生成 activity 与测试",
      "outputType": "activity_code",
      "entrypoints": ["src/activity.ts"],
      "artifacts": [
        {
          "path": "src/activity.ts",
          "kind": "source",
          "language": "typescript"
        }
      ]
    },
    "securityLint": {
      "status": "passed",
      "issues": []
    },
    "sandboxBinding": {
      "runtime": "sandbox-worker",
      "executionMode": "verification"
    }
  }
}
```

说明：

- `GeneratedWorkUnit`、`SecurityLintResult`、`SandboxRuntimeBinding` 保持为本地领域对象。
- 共享协议只承担结果容器，不展开这些对象为顶层字段。

## 4. `browser-nl-agent` 示例

### 4.1 Start Request

```json
{
  "executionId": "exec_browser_001",
  "stepId": "step_browser_001",
  "agentKind": "browser-nl-agent",
  "input": {
    "userGoal": "登录后台并导出今日报表",
    "entryUrl": "https://example.internal/login",
    "constraints": {
      "allowTakeover": true,
      "maxTurns": 8
    }
  },
  "context": {
    "session": {
      "sessionId": "browser_session_001",
      "userGoal": "登录后台并导出今日报表",
      "runtimeSessionId": "runtime_session_001"
    },
    "initialObservation": {
      "url": "https://example.internal/login",
      "title": "登录页"
    },
    "runtimeHandle": {
      "worker": "browser-worker",
      "sessionId": "runtime_session_001"
    }
  }
}
```

说明：

- `input` 放用户目标和当前任务入口。
- `context` 放浏览器会话、初始观察快照和运行时句柄。

### 4.2 Progress Event

```json
{
  "executionId": "exec_browser_001",
  "stepId": "step_browser_001",
  "status": "waiting",
  "timestamp": "2026-06-24T12:05:00.000Z",
  "payload": {
    "turnStatus": "blocked",
    "observationSummary": {
      "url": "https://example.internal/2fa",
      "title": "二次验证"
    },
    "nextActions": [
      {
        "actionId": "act_001",
        "tool": "type",
        "params": {
          "selector": "#otp",
          "valueSource": "user_input"
        }
      }
    ],
    "requiresTakeover": true,
    "waitingReason": "需要用户提供验证码"
  }
}
```

说明：

- `payload` 可以表达当前 observation 摘要、计划动作、阻塞原因和接管信号。
- `control-plane` 只需要识别“等待”和“需要接管”，不需要理解完整浏览器推理过程。

### 4.3 Result

```json
{
  "executionId": "exec_browser_001",
  "stepId": "step_browser_001",
  "status": "succeeded",
  "output": {
    "turnResult": {
      "status": "completed",
      "message": "已成功导出今日报表",
      "requiresTakeover": false
    },
    "finalObservation": {
      "url": "https://example.internal/report/export",
      "title": "导出完成"
    },
    "actionSummary": {
      "executedActionCount": 6,
      "exportedArtifactCount": 1
    }
  }
}
```

说明：

- `BrowserNlAgentTurnResult`、观察快照和动作摘要继续保留在本地领域输出内部。
- 共享协议只要求有统一终态结果容器。

## 5. `planner/delegation` 需要稳定提供什么

当前 `planner/delegation` 虽然仍是逻辑壳，但后续真正接线时，至少应稳定产出：

- `executionId`
- `stepId`
- `agentKind`
- `input`
- `context`

其中：

- `executionId`
  - 由控制面执行上下文提供
- `stepId`
  - 由当前计划步骤提供
- `agentKind`
  - 由规划阶段决定委派到哪个专项 Agent
- `input`
  - 由步骤目标、参数、约束收口而来
- `context`
  - 由会话、上游计划摘要、运行时资源句柄、前序结果摘要收口而来

## 6. 结论

本轮之后可以把专项 Agent 的协议实例形状固定为：

- 顶层只保留共享执行协议字段
- `input` 放任务直接输入
- `context` 放上游附加上下文
- `payload` 放运行中阶段信息和等待/接管信号
- `output` 放专项 Agent 的终态业务结果

这样后续无论新增 `codegen-agent`、`browser-nl-agent` 还是新的专项 Agent，都可以复用同一执行外壳，而不必再改控制面核心协议。
