# sandbox-worker

`sandbox-worker` 是平台物理执行运行时平面中的代码沙箱 HTTP API 网关（对外暴露端口 8090）。

## 职责与定位

1. **动态代码沙箱执行器 (Sandbox HTTP API)**：
   - `POST /execute` / `POST /execute/stream`：受控 Python 脚本动态执行（支持流式实时日志）；
   - `POST /validate-activity`：Activity 校验与语法验证（通过 Temporal Client 调度至 `temporal-worker` 执行）；
   - `POST /validate-workflow` / `POST /validate-workflow/stream`：工作流合规性检验；
   - `GET /health`：沙箱健康探针。
2. **与 `temporal-worker` 的分工**：
   - `sandbox-worker` 专注于对外 HTTP 接口与本地受控子进程代码执行，不直接轮询 Temporal 任务队列；
   - 复杂的工作流执行与分布式 Activity 调度由独立的 `temporal-worker` 承接。

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
