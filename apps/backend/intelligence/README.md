# Intelligence Plane

该目录用于承载未来可独立演进的专项智能体服务。

当前已包含：

- `ai-orchestrator`
- `codegen-agent`
- `browser-nl-agent`

约束：

- `ai-orchestrator` 作为当前主编排服务留在 `intelligence/`，后续再继续向 `master-planner` 与专项 Agent 收敛
- 不把专项 Agent 重新堆回单个巨型服务
- Agent 只负责自己的高频推理循环与委派后执行
- 发布、审批、运行时执行仍通过共享契约与其他平面协作
