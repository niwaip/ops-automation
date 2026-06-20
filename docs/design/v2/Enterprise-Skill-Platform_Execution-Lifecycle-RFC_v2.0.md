# 企业级 Skill 平台 Execution 生命周期 RFC

**Execution Lifecycle RFC v2.0**  
日期：2026-04-19

> 本文用于把当前仓库从“会话驱动的浏览器自动化链路”收敛为“以 Execution 为主对象、以 RuntimeSession 为资源对象”的统一执行模型。

---

## 1. 目标

本文回答以下问题：

- 一次企业级 Skill 执行的主对象到底是什么
- `Execution` 与 `RuntimeSession` 的边界如何划分
- 执行状态如何流转，分别由谁驱动
- 审批、接管、暂停、续跑应落在哪一层
- 当前仓库应如何从现有实现迁移到目标模型

---

## 2. 背景问题

当前仓库已经具备执行能力，但仍存在以下结构性问题：

- `session-broker` 既管理会话，也直接拉模板执行步骤
- `replay-engine` 也维护自己的执行状态与 step log
- `session state` 与业务执行状态混在一起
- “接管”“暂停”“失败”“完成”缺少统一真相源

这会导致后续补 `approval`、`policy`、`audit` 时边界继续漂移。

因此，本 RFC 的核心结论是：

> 业务执行以 `Execution` 为真相源，资源承载以 `RuntimeSession` 为真相源。

---

## 3. 核心对象定义

## 3.1 `Execution`

`Execution` 表示一次 Skill 的正式执行实例，是权限、审计、审批、接管、结果归档的主容器。

它回答的是：

- 谁发起了任务
- 用了哪个 `SkillVersion`
- 任务当前处于什么业务状态
- 是否需要审批
- 是否进入人工接管
- 最终结果是否成功

`Execution` 不负责：

- 浏览器或文档运行资源的底层分配
- worker 的 lease / lock / health

---

## 3.2 `RuntimeSession`

`RuntimeSession` 表示一次 Execution 使用的运行时承载资源。

它回答的是：

- 当前分配了什么运行时
- 绑定了哪个 worker / browser profile / document runtime
- 资源是否 ready / busy / frozen / closed
- 当前接入点和健康状态是什么

`RuntimeSession` 不负责：

- 决定任务是否通过审批
- 决定任务业务上是否成功
- 决定是否应当发布或回滚 Skill

---

## 3.3 `ExecutionStep`

`ExecutionStep` 是一次 `Execution` 内的最小可观测动作。

它用于：

- step 级日志
- step 级重试
- 审批暂停点
- 接管恢复点
- 最终回放与审计

---

## 4. 当前仓库到目标对象的映射

### 当前主要对象

- `session-broker.session`
- `replay-engine.execution`
- `template.steps`
- `browser-worker` 内部 worker/session

### 目标映射

- `session-broker.session` -> `RuntimeSession`
- `replay-engine.execution` -> `Execution + ExecutionStep`
- `template.steps` -> `SkillVersion` 绑定的 plan / step definition
- `browser-worker` 内部 runtime state -> `RuntimeSession` 的实现层细节

### 收敛原则

- 所有 UI 与审计系统默认查看 `Execution`
- 所有资源调度系统默认查看 `RuntimeSession`
- `Execution` 可存在而尚未分配 Runtime
- `RuntimeSession` 必须从属于某次 `Execution`

---

## 5. Execution 状态机

推荐状态如下：

- `draft`
- `queued`
- `running`
- `waiting_input`
- `pending_approval`
- `human_control`
- `paused`
- `succeeded`
- `failed`
- `cancelled`
- `rolled_back`

---

## 5.1 状态语义

### `draft`

- 任务刚创建，但参数还未补齐
- 尚未通过策略检查

### `queued`

- 参数已足够
- 等待调度 Runtime 或等待执行窗口

### `running`

- 已开始正式执行
- 至少有一个运行中 step

### `waiting_input`

- 等待用户补参数、确认内容、补凭证
- 不是审批态，也不是接管态

### `pending_approval`

- 已触发治理策略
- 等待审批系统给出继续或拒绝的结果

### `human_control`

- 已进入人工接管
- Agent 不再推进后续自动步骤

### `paused`

- 系统级或人工级暂停
- 可在后续恢复

### `succeeded`

- 执行完成且验证通过

### `failed`

- 执行失败且未进入成功补偿

### `cancelled`

- 用户取消、审批拒绝、系统主动终止

### `rolled_back`

- 结果已被补偿或撤销

---

## 5.2 允许的状态转移

### 创建期

- `draft -> queued`
- `draft -> cancelled`

### 执行期

- `queued -> running`
- `queued -> pending_approval`
- `queued -> cancelled`

### 运行期

- `running -> waiting_input`
- `running -> pending_approval`
- `running -> human_control`
- `running -> paused`
- `running -> succeeded`
- `running -> failed`
- `running -> cancelled`

### 中间态恢复

- `waiting_input -> queued`
- `pending_approval -> queued`
- `pending_approval -> cancelled`
- `human_control -> running`
- `human_control -> cancelled`
- `paused -> queued`
- `paused -> cancelled`

### 后处理

- `succeeded -> rolled_back`
- `failed -> rolled_back`

---

## 5.3 非法转移示例

以下转移默认不允许：

- `succeeded -> running`
- `failed -> running`
- `cancelled -> running`
- `rolled_back -> running`

如果确实需要“重新执行”，应新建新的 `Execution`，而不是复活旧记录。

---

## 6. RuntimeSession 状态机

推荐状态如下：

- `created`
- `allocating`
- `ready`
- `busy`
- `frozen`
- `recovering`
- `closed`
- `error`

---

## 6.1 状态语义

### `created`

- RuntimeSession 已创建，但尚未真正分配资源

### `allocating`

- 正在申请 worker、profile、browser/document runtime

### `ready`

- 资源可用，但当前未执行 step

### `busy`

- 正在承载 step 执行

### `frozen`

- 运行资源已冻结
- 常用于人工接管或风险暂停

### `recovering`

- 正在恢复会话、重连运行时或续跑

### `closed`

- 运行资源已释放

### `error`

- 资源分配失败、连接中断、健康检查失败

---

## 6.2 允许的状态转移

- `created -> allocating`
- `allocating -> ready`
- `allocating -> error`
- `ready -> busy`
- `busy -> ready`
- `busy -> frozen`
- `busy -> error`
- `frozen -> recovering`
- `recovering -> ready`
- `recovering -> error`
- `ready -> closed`
- `error -> closed`

---

## 7. Execution 与 RuntimeSession 的联动规则

### 规则 1

`Execution` 可以存在于没有 `RuntimeSession` 的状态。

适用场景：

- 等待审批
- 等待输入
- 调度排队

### 规则 2

同一次 `Execution` 可以拥有一个或多个 `RuntimeSession`，但在 MVP 阶段默认先按“一次执行主用一个 RuntimeSession”实现。

### 规则 3

`Execution.status = human_control` 时：

- `RuntimeSession.state` 应进入 `frozen` 或接近等价的托管态
- Agent 不得继续自动推进

### 规则 4

`RuntimeSession.error` 不等于 `Execution.failed`。

先由执行器决定：

- 重试
- 重新分配 Runtime
- 转人工接管
- 最终失败

### 规则 5

`Execution.succeeded / failed / cancelled / rolled_back` 后，应触发 Runtime 关闭流程，把 `RuntimeSession` 收敛为 `closed`。

---

## 7.1 状态变更责任表

为避免当前仓库“多个服务各写一套状态”的问题，MVP 阶段建议按下表收口状态写权限。

| 对象             | 字段                   | 允许主写服务          | 其他服务行为                                |
| ---------------- | ---------------------- | --------------------- | ------------------------------------------- |
| `Execution`      | `status`               | `skill-control-plane` | 通过命令或事件请求变更，不直接写主状态      |
| `Execution`      | `approval_state`       | `skill-control-plane` | `policy-service` 只返回治理决策             |
| `Execution`      | `normalized_goal_json` | `skill-orchestrator`  | 由 control-plane 接收后落库                 |
| `Execution`      | `result_summary_json`  | `execution-engine`    | 由 control-plane 接收后落库                 |
| `ExecutionStep`  | 全量 step 记录         | `execution-engine`    | 其他服务只读                                |
| `RuntimeSession` | `state`                | `runtime-manager`     | `execution-engine` 请求 freeze/resume/close |
| `RuntimeSession` | `health_status`        | `runtime-manager`     | `browser-runtime` 上报健康信息              |

补充规则：

- `execution-engine` 不直接更新 `Execution.status`
- `runtime-manager` 不直接决定 `Execution.failed / succeeded`
- `skill-orchestrator` 不直接冻结 Runtime

---

## 7.2 典型联动场景

### 场景 A：正常执行

1. `Execution` 从 `queued` 进入 `running`
2. `RuntimeSession` 从 `ready` 进入 `busy`
3. `execution-engine` 顺序写入 `ExecutionStep`
4. 执行结束后 `Execution` 进入 `succeeded`
5. `RuntimeSession` 进入 `closed`

### 场景 B：执行中审批

1. `execution-engine` 执行到高风险 step
2. `policy-service` 返回 `require_approval`
3. `skill-control-plane` 创建 `ApprovalRequest`
4. `Execution` 进入 `pending_approval`
5. 审批通过后重新进入 `queued`
6. `execution-engine` 再次拉起执行

### 场景 C：执行中接管

1. `execution-engine` 识别到验证码、MFA、UI 偏移
2. `skill-control-plane` 将 `Execution` 置为 `human_control`
3. `runtime-manager` 将 `RuntimeSession` 置为 `frozen`
4. 接管人完成操作后发起恢复命令
5. `RuntimeSession` 进入 `recovering -> ready`
6. `Execution` 回到 `running`

---

## 8. 角色与责任边界

### `skill-control-plane`

负责：

- 创建 Execution
- 持有 Execution 主状态
- 审批状态和审计索引

不负责：

- 执行 step
- 分配 worker

### `skill-orchestrator`

负责：

- 目标理解
- Skill 选择
- 计划生成
- 结果验证
- 失败分流建议

不负责：

- Runtime 资源生命周期

### `policy-service`

负责：

- 风险判断
- 审批要求
- 接管要求
- Runtime 限制

### `runtime-manager`

负责：

- RuntimeSession 创建与回收
- worker allocation
- lock / lease / freeze / resume

### `execution-engine`

负责：

- step 执行
- step retry
- step log
- 失败后调用 `policy-service` 或 `skill-orchestrator` 获取处理建议

---

## 9. 事件模型

建议引入统一事件，至少包括：

- `execution.created`
- `execution.queued`
- `execution.started`
- `execution.waiting_input`
- `execution.approval_requested`
- `execution.human_control_requested`
- `execution.resumed`
- `execution.succeeded`
- `execution.failed`
- `execution.cancelled`

- `runtime_session.created`
- `runtime_session.ready`
- `runtime_session.frozen`
- `runtime_session.recovered`
- `runtime_session.closed`
- `runtime_session.error`

- `execution_step.started`
- `execution_step.succeeded`
- `execution_step.failed`
- `execution_step.retrying`
- `execution_step.takeover_requested`

---

## 9.1 命令模型

在进入正式事件总线前，建议先统一“状态变更命令”语义。

推荐最小命令集：

- `CreateExecution`
- `QueueExecution`
- `RequestExecutionApproval`
- `ApproveExecution`
- `RejectExecution`
- `AllocateRuntimeSession`
- `StartExecution`
- `PauseExecution`
- `RequestHumanControl`
- `ResumeExecutionFromStep`
- `CompleteExecution`
- `FailExecution`
- `CancelExecution`
- `CloseRuntimeSession`

规则：

- 命令由拥有者服务消费
- 命令可以来自 API、内部调用或事件适配层
- 命令必须显式包含发起方、原因、关联对象

建议最小字段：

```json
{
  "command_id": "string",
  "command_type": "RequestHumanControl",
  "execution_id": "string",
  "runtime_session_id": "string",
  "actor_type": "system",
  "actor_id": "execution-engine",
  "reason": "captcha_detected"
}
```

---

## 10. 审批、接管、暂停在状态机中的落点

### 审批

- 审批属于 `Execution` 层
- 审批对象应是 `ApprovalRequest`
- `pending_approval` 是正式状态，不是 UI 变量

### 接管

- 接管属于 `Execution` 与 `RuntimeSession` 的联动状态
- `Execution` 进入 `human_control`
- `RuntimeSession` 进入 `frozen`

### 暂停

- 暂停属于系统调度能力
- `Execution` 可进入 `paused`
- `RuntimeSession` 可保持 `ready` 或 `frozen`，取决于暂停原因

---

## 11. MVP 级最小字段建议

### `executions`

```text
id
tenant_id
skill_id
skill_version_id
initiator_user_id
status
approval_state
risk_level
goal_text
input_payload_json
normalized_goal_json
result_summary_json
started_at
finished_at
created_at
updated_at
```

### `execution_steps`

```text
id
execution_id
step_index
step_type
capability_name
target_summary
result
error_class
error_message
retry_count
takeover_triggered
created_at
```

### `runtime_sessions`

```text
id
execution_id
runtime_type
worker_ref
state
lease_expires_at
health_status
endpoints_json
created_at
updated_at
closed_at
```

---

## 12. 当前仓库迁移建议

### 第一阶段

- 保留 `replay-engine` 作为唯一执行引擎
- 停止在 `session-broker` 中继续扩展执行逻辑
- 把 `session-broker.session` 语义改写为 `runtime_session`

### 第二阶段

- 将 `replay-engine` 内存中的 execution state 正式持久化
- 将 `step_logs` 扩展为 `execution_steps + step_logs`

### 第三阶段

- 为 `Execution` 增加 `pending_approval` 与 `human_control`
- 将当前接管逻辑挂到正式的 `Execution` 状态机上

---

## 13. 对当前代码的直接要求

在本 RFC 生效后，以下约束应立即执行：

- 不再把 `session` 当作业务执行主对象
- 不再在多个服务里各自维护一套 execution 真相状态
- 不再让接管、审批、暂停只存在于局部实现
- 所有新开发都必须围绕 `Execution` 与 `RuntimeSession` 建模

---

## 13.1 需要立即拍板的三项决策

为了让本 RFC 不停留在文档层，建议项目组先明确以下三项决定：

### 决策 1：唯一执行引擎

建议：

- 由 `replay-engine` 演进为唯一 `execution-engine`

理由：

- 当前它最接近正式 step 执行器
- 已具备 step log、retry、takeover 的实现基础

### 决策 2：会话对象重命名与语义收敛

建议：

- 当前 `session-broker.session` 统一收敛为 `RuntimeSession`

理由：

- 否则业务执行态与运行时资源态会持续混写

### 决策 3：Execution 主状态收口

建议：

- 由 `skill-control-plane` 持有 `Execution.status` 主状态

理由：

- 审批、接管、审计最终都要围绕治理层主对象收口

---

## 14. 结论

本 RFC 的核心不是引入更多概念，而是收敛已有概念。

一句话总结：

> `Execution` 管业务与治理，`RuntimeSession` 管资源与承载，`ExecutionStep` 管最小可观测动作。

只要这三者被统一下来，后续的 `policy`、`approval`、`artifact`、`memory` 才有稳定落点。
