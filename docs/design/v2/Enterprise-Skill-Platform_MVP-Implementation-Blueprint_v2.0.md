# 企业级 Skill 平台 MVP 详细设计蓝图

**MVP Implementation Blueprint v2.0**  
日期：2026-04-19

> 本文补充 `Master`、`Core Data Model`、`Execution Lifecycle RFC`、`Service API Contract` 等上层设计，专门给出第一阶段可直接指导开发的详细设计。

---

## 1. 文档目标

本文聚焦以下问题：

- 第一阶段主链路到底落哪些对象、哪些状态、哪些接口
- 数据库、Redis、运行时之间如何分工
- 哪些字段先做，哪些字段明确后置
- `control-plane`、`ai-orchestrator`、`session-broker`、`browser-worker`、`portal` 如何串成闭环
- 开发时如何避免重新掉回“session 混用业务语义”的旧模式

本文默认覆盖的主链路为：

`Skill 执行 -> Browser Runtime -> 人工接管 -> 恢复执行 -> 日志与产物归档`

---

## 2. 设计边界

### 2.1 In-Scope

- Browser Runtime 场景
- `Execution`
- `RuntimeSession`
- `ExecutionStep`
- `ExecutionEvent`
- takeover / resume 主链路
- 最小审计与最小产物索引

### 2.2 Out-of-Scope

- 正式 `memory-service`
- 正式 `evaluation-service`
- 自动 `candidate patch`
- 多 Runtime 联合作业
- 完整审批编排引擎
- Skill Marketplace

---

## 3. 第一阶段主对象

### 3.1 `Execution`

定义：

- 一次 Skill 的正式业务执行实例

负责：

- 保存业务状态
- 关联 Skill 和 SkillVersion
- 记录输入、结果、失败原因
- 表示是否进入审批或人工接管

不负责：

- 直接管理浏览器资源
- 保存 worker lease
- 保存浏览器底层连接生命周期

### 3.2 `RuntimeSession`

定义：

- 一次 Execution 使用的实际运行时资源会话

负责：

- 标识分配到了哪个 worker / profile
- 标识当前运行时是否 ready、busy、frozen、closed
- 暴露连接信息，例如 noVNC 地址

不负责：

- 决定 Execution 是否成功
- 持有业务审批结论

### 3.3 `ExecutionStep`

定义：

- Execution 内最小可观测动作

负责：

- step 级日志
- 断点恢复
- retry 记录
- takeover 触发点记录

### 3.4 `ExecutionEvent`

定义：

- MVP 阶段的平台级事件归档表

负责：

- 保存关键状态变化和重要操作痕迹
- 为后续接消息总线、审计检索、evaluation 提供基础

---

## 4. 最小状态模型

### 4.1 `Execution.status`

第一阶段只强制支持以下状态：

- `queued`
- `running`
- `pending_approval`
- `human_control`
- `succeeded`
- `failed`
- `cancelled`

第一阶段可保留但暂不强制打通：

- `draft`
- `waiting_input`
- `paused`
- `rolled_back`

### 4.2 `RuntimeSession.state`

第一阶段只强制支持：

- `allocating`
- `ready`
- `busy`
- `frozen`
- `closed`
- `error`

可保留但暂不强制：

- `recovering`

### 4.3 `RuntimeSession.control_mode`

- `AGENT_RUNNING`
- `HUMAN_CONTROL`

### 4.4 `ExecutionStep.status`

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`

---

## 5. 存储分工

### 5.1 PostgreSQL

保存：

- `executions`
- `runtime_sessions`
- `execution_steps`
- `execution_events`
- 最小 `artifacts` 索引

特点：

- 可查询
- 可审计
- 可回放历史

### 5.2 Redis

保存：

- 当前 Runtime 高频状态
- 当前 step 指针
- lock / lease
- freeze 原子切换

建议 Key：

- `execution:{id}:current_step`
- `runtime:{id}:state`
- `runtime:{id}:control_mode`
- `lock:profile:{profile_id}`
- `lease:runtime:{id}`

### 5.3 Object Storage

保存：

- screenshot
- trace
- document output
- browser snapshot

对象路径建议：

```text
artifacts/{execution_id}/{artifact_id}
snapshots/{execution_id}/{step_index}
traces/{execution_id}/{runtime_session_id}
```

---

## 6. 数据库表详细设计

以下表结构是第一阶段推荐最小集合。

### 6.1 `executions`

用途：

- 保存 Execution 主状态和业务主信息

建议字段：

```text
id
org_id
created_by
skill_id
skill_version
status
runtime_type
risk_level
input_json
normalized_input_json
result_json
failure_reason
failure_code
runtime_session_id
current_step_id
requires_approval
approval_status
takeover_required
takeover_reason
started_at
ended_at
created_at
updated_at
```

关键说明：

- `status` 是业务真相源
- `runtime_session_id` 是快捷关联字段，但 Runtime 真相仍在 `runtime_sessions`
- `current_step_id` 方便 Portal 直接展示当前进度

建议索引：

- `(created_by, created_at desc)`
- `(skill_id, created_at desc)`
- `(status, created_at desc)`
- `(runtime_session_id)`

### 6.2 `runtime_sessions`

用途：

- 保存 Runtime 资源状态

建议字段：

```text
id
execution_id
runtime_type
worker_id
profile_id
state
control_mode
lease_expires_at
connection_info_json
capabilities_json
health_status
freeze_reason
last_activity_at
created_at
updated_at
closed_at
```

关键说明：

- `state` 是资源真相源
- `control_mode` 独立于业务状态，避免混淆
- `connection_info_json` 第一阶段先不拆列

建议索引：

- `(execution_id)`
- `(state, updated_at desc)`
- `(worker_id, state)`
- `(profile_id, state)`

### 6.3 `execution_steps`

用途：

- 保存 step 级执行计划与执行结果

建议字段：

```text
id
execution_id
step_index
name
type
status
action
target_json
input_json
output_json
assertion_json
error_message
error_code
retry_count
snapshot_id
takeover_triggered
started_at
ended_at
created_at
updated_at
```

关键说明：

- `step_index` 是排序和恢复基准
- `takeover_triggered=true` 表示该 step 触发过人工介入
- `snapshot_id` 指向对象存储中的快照引用

建议索引：

- `unique(execution_id, step_index)`
- `(execution_id, status)`
- `(execution_id, created_at)`

### 6.4 `execution_events`

用途：

- 保存关键状态流转

建议字段：

```text
id
execution_id
runtime_session_id
step_id
event_type
event_source
payload_json
created_at
```

建议 `event_type`：

- `execution.created`
- `execution.started`
- `execution.human_control.entered`
- `execution.resumed`
- `execution.failed`
- `execution.succeeded`
- `runtime.allocated`
- `runtime.frozen`
- `runtime.resumed`
- `runtime.closed`
- `step.started`
- `step.succeeded`
- `step.failed`
- `step.takeover_requested`

---

## 7. TypeScript 领域对象草案

本节不是代码实现要求，而是接口和 DTO 的字段约束参考。

### 7.1 `ExecutionDto`

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

### 7.2 `RuntimeSessionDto`

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

### 7.3 `ExecutionStepDto`

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

---

## 8. API 合同详细设计

### 8.1 外部 API

由 `skill-control-plane` 对 Portal 提供：

#### `POST /executions`

用途：

- 发起一次正式执行

请求体建议：

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
  }
}
```

响应建议：

```json
{
  "success": true,
  "data": {
    "id": "execution-123",
    "status": "queued"
  }
}
```

#### `GET /executions/{id}`

用途：

- 查看 Execution 主状态

#### `GET /executions/{id}/steps`

用途：

- 查看 step 列表

#### `POST /executions/{id}/takeover`

用途：

- 显式请求进入人工接管

请求体建议：

```json
{
  "reason": "Captcha detected"
}
```

#### `POST /executions/{id}/resume`

用途：

- 从人工接管后恢复执行

请求体建议：

```json
{
  "stepId": "step-2",
  "comment": "captcha solved"
}
```

#### `POST /executions/{id}/cancel`

用途：

- 主动取消

### 8.2 内部 API

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
- `POST /browser-sessions/{id}/freeze`
- `POST /browser-sessions/{id}/resume`
- `GET /browser-sessions/{id}/connection`
- `GET /browser-sessions/{id}/last-snapshot`

---

## 9. DTO 详细设计

### 9.1 `CreateExecutionDto`

```ts
interface CreateExecutionDto {
  skillId: string;
  skillVersion?: string;
  runtimeType?: 'browser';
  input: Record<string, unknown>;
  idempotencyKey?: string;
}
```

### 9.2 `TakeoverExecutionDto`

```ts
interface TakeoverExecutionDto {
  reason: string;
  requestedBy?: string;
}
```

### 9.3 `ResumeExecutionDto`

```ts
interface ResumeExecutionDto {
  stepId?: string;
  comment?: string;
  resumedBy?: string;
}
```

### 9.4 `CreateRuntimeSessionDto`

```ts
interface CreateRuntimeSessionDto {
  executionId: string;
  runtimeType: 'browser';
  profileId?: string;
  capabilities?: string[];
}
```

### 9.5 `ExecuteBrowserStepDto`

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

### 9.6 `ExecuteBrowserStepResultDto`

```ts
interface ExecuteBrowserStepResultDto {
  success: boolean;
  pageSummary?: string;
  snapshotId?: string;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  shouldTakeover?: boolean;
  takeoverReason?: string;
}
```

---

## 10. 服务职责细化

### 10.1 `skill-control-plane`

职责：

- 创建 Execution
- 持有 Execution 主状态
- 聚合展示 Execution + RuntimeSession + Steps
- 对 Portal 暴露统一接口

不负责：

- 实际执行浏览器 step
- 直接写 Runtime 状态

### 10.2 `skill-orchestrator`

职责：

- 根据 SkillVersion 和 input 生成最小 step plan
- 驱动执行顺序
- 接收 step 成败并决定继续、失败或接管

第一阶段建议：

- 保守实现
- 不追求复杂 Planner
- 优先让状态正确、闭环成立

### 10.3 `runtime-manager`

职责：

- 分配 RuntimeSession
- freeze / resume / close
- 维护 lease 和运行时状态

### 10.4 `browser-runtime`

职责：

- 执行具体浏览器动作
- 返回 step 结果和 snapshot
- 暴露接管连接信息

### 10.5 `portal`

职责：

- 发起 Execution
- 轮询查看状态
- 进入 Execution 页面内联接管区
- 恢复执行
- 查看 step log

---

## 11. 主链路时序

### 11.1 正常执行时序

```text
Portal
  -> skill-control-plane: POST /executions
  -> runtime-manager: create RuntimeSession
  <- runtime-manager: RuntimeSession ready
  -> skill-orchestrator: start execution
  -> browser-runtime: execute step #1
  <- browser-runtime: success
  -> browser-runtime: execute step #2
  <- browser-runtime: success
  -> skill-control-plane: mark execution succeeded
```

### 11.2 人工接管时序

```text
Portal
  -> skill-control-plane: POST /executions
  -> runtime-manager: create RuntimeSession
  -> skill-orchestrator: start execution
  -> browser-runtime: execute current step
  <- browser-runtime: shouldTakeover=true
  -> runtime-manager: freeze runtime session
  -> skill-control-plane: Execution.status=human_control
  -> Portal: display takeover entry
  -> User enters noVNC workbench
  -> Portal: POST /executions/{id}/resume
  -> runtime-manager: resume runtime session
  -> skill-orchestrator: resume from step
  -> browser-runtime: continue execution
```

---

## 12. 状态更新规则

### 12.1 Execution 状态更新规则

- `queued -> running`
  - 触发条件：RuntimeSession ready 且 orchestrator 正式启动
- `running -> human_control`
  - 触发条件：step 结果要求 takeover 或人工显式请求 takeover
- `human_control -> running`
  - 触发条件：用户完成接管并点击 resume
- `running -> succeeded`
  - 触发条件：全部 step 成功并通过最小校验
- `running -> failed`
  - 触发条件：step 最终失败且不进入 takeover
- `queued/running/human_control -> cancelled`
  - 触发条件：用户取消或系统终止

### 12.2 RuntimeSession 状态更新规则

- `allocating -> ready`
  - worker 分配成功
- `ready -> busy`
  - 开始执行 step
- `busy -> frozen`
  - 进入人工接管
- `frozen -> busy`
  - resume 后继续执行
- `busy/ready/frozen -> closed`
  - 任务结束或主动释放
- `allocating/busy -> error`
  - 分配失败或连接异常

---

## 13. 第一阶段最小 Portal 页面

### 13.1 `ExecutionStartPage`

必须支持：

- 选择 Skill
- 输入参数
- 发起执行

### 13.2 `ExecutionDetailPage`

必须支持：

- 查看 Execution 状态
- 查看当前 step
- 查看 step 列表
- 查看失败原因
- 当状态为 `human_control` 时显示进入接管入口

### 13.3 `ExecutionDetailPage / ExecutionListPage` 内联接管/恢复区

必须支持：

- 展示 noVNC 或受控浏览器入口
- 显示当前 takeover reason
- 提供 resume 按钮

---

## 14. 第一阶段不做的实现

- 不做完整 Approval workflow engine
- 不做正式 Memory 注入服务
- 不做事件总线强依赖
- 不做自动 patch 生成
- 不做复杂多场景 Planner
- 不做一次性全量服务重命名

---

## 15. 开发落地建议

### 15.1 优先顺序

1. 先把 `Execution`、`RuntimeSession`、`ExecutionStep` 的表和接口定死
2. 再打通 create / start / freeze / resume / close 主链路
3. 最后接 Portal 工作台

### 15.2 兼容策略

- 迁移初期允许 `session-broker` 保留旧接口
- 新链路统一新增 `RuntimeSession` 视角接口
- 旧前端页面可继续读取旧数据，但新工作台只读新对象

### 15.3 风险控制

- 禁止多个服务直接改 `Execution.status`
- 禁止浏览器执行器直接改 `RuntimeSession` 主状态之外的业务状态
- 禁止继续把 session 当成 Execution 主对象

---

## 16. 与现有文档的关系

- 顶层愿景：见 `Enterprise-Skill-Platform_Master_v2.0.md`
- 数据总览：见 `Enterprise-Skill-Platform_Core-Data-Model_v2.0.md`
- 执行状态机：见 `Enterprise-Skill-Platform_Execution-Lifecycle-RFC_v2.0.md`
- 服务 ownership：见 `Enterprise-Skill-Platform_Service-API-and-Ownership-Contract_v2.0.md`
- MVP 范围：见 `Enterprise-Skill-Platform_MVP-Scope-and-Acceptance_v2.0.md`

本文的定位不是替代上述文档，而是把它们汇总为一份可直接指导第一阶段开发拆解的详细设计蓝图。
