# temporal-worker

`temporal-worker` 是平台物理执行运行时平面中的核心 Worker，专门负责监听 Temporal 任务队列并执行 Python 端的工作流与活动。

## 职责与边界

- **专注工作流监听与执行**：
  - 监听 `SANDBOX_WORKER_TASK_QUEUE`：执行 `AgentSessionWorkflow` 以及通用代码执行活动 `execute_code_activity`。
  - 监听 `ACTIVITY_VALIDATION_TASK_QUEUE`：执行静态与动态语法校验流 `ActivityValidationWorkflow`、`WorkflowValidationWorkflow`。
- **与 `sandbox-worker` 的区别**：
  - `temporal-worker` 是一个常驻的后台任务消费者（Temporal Worker），不暴露 HTTP 端口。
  - `sandbox-worker` 是对外的 HTTP 服务网关（8090 端口），接收 NestJS 等上游服务的验证请求并通过 Temporal Client 触发本 Worker 执行。

## 技术栈

- Python 3.11
- `temporalio` SDK
