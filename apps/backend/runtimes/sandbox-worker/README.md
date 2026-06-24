# sandbox-worker

`sandbox-worker` 是运行时平面中的动态代码沙箱执行器，负责：

- `POST /execute`
- `POST /execute/stream`
- `POST /validate-activity`
- `POST /validate-workflow`
- `POST /validate-workflow/stream`
- `GET /health`

当前目录是动态代码沙箱运行时的主实现目录。

当前阶段策略：

- 新增代码默认只落在本目录
- Docker 默认构建/挂载路径应指向本目录
- 历史 `runtime/sandbox-agent` 兼容转发层已移除
- 根入口 `worker.py` 已收敛为兼容启动文件
- HTTP API 与启动编排已分别下沉到 `src/api`、`src/worker`
- `workflows.py` 已收敛为兼容导出层，真实实现下沉到 `src/workflows`
- `sandbox_executor.py` 已收敛为兼容导出层，真实实现下沉到 `src/execution`

后续仍要继续完成的拆分：

- 继续按职责细化 `src/*` 内部结构
