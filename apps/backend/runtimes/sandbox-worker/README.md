# sandbox-worker

`sandbox-worker` 是运行时平面中的核心组件，当前承担**双重复合职责**：

1. **Temporal 核心工作流执行 (Temporal Worker)**：
   - 监听 `SANDBOX_WORKER_TASK_QUEUE` 与校验队列；
   - 负责运行 Python 端核心编排工作流：`AgentSessionWorkflow`、`ActivityValidationWorkflow`、`WorkflowValidationWorkflow` 以及活动 `execute_code_activity`。
2. **动态代码沙箱执行器 (Sandbox HTTP API)**：
   - `POST /execute` / `POST /execute/stream`：受控 Python 脚本动态执行；
   - `POST /validate-activity`：Activity 校验与语法验证；
   - `POST /validate-workflow` / `POST /validate-workflow/stream`：工作流合规性检验；
   - `GET /health`：沙箱探针。

当前目录是动态代码沙箱运行时的主实现目录。

当前阶段策略：

- 新增代码默认只落在本目录
- Docker 默认构建/挂载路径应指向本目录
- 历史 `runtime/sandbox-agent` 兼容转发层已移除
- 根入口 `worker.py` 已收敛为兼容启动文件
- HTTP API 与启动编排已分别下沉到 `src/api`、`src/worker`
- `workflows.py` 已收敛为兼容导出层，真实实现下沉到 `src/workflows`
- `sandbox_executor.py` 已收敛为兼容导出层，真实实现下沉到 `src/execution`
- 上游 URL 配置已切换为优先使用 `SANDBOX_WORKER_URL`，并兼容历史 `WORKFLOW_VALIDATION_AGENT_URL`、`ACTIVITY_VALIDATION_AGENT_URL`、`TEMPORAL_SANDBOX_AGENT_URL`、`SANDBOX_AGENT_URL`
- Worker 队列配置已切换为优先使用 `SANDBOX_WORKER_TASK_QUEUE`，并兼容历史 `SANDBOX_TASK_QUEUE`

后续仍要继续完成的拆分：

- 继续按职责细化 `src/*` 内部结构
