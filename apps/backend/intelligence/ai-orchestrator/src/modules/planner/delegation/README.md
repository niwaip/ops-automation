# planner/delegation -> master-planner/delegation

当前目录代表未来 `master-planner` 的专项 Agent 委派层逻辑视图。

当前仍未承载真正的专项 Agent 调用实现，运行时能力仍暂由 `modules/agent`
提供。本目录在当前批次的职责，是明确未来委派层应如何把计划步骤与执行上下文
收口为共享执行协议请求。

## 该目录负责

- 决定当前计划步骤是否需要委派给专项 Agent
- 明确本次委派对应的 `agentKind`
- 从当前计划步骤中提取可执行目标、参数和约束
- 从控制面执行上下文中提取 `executionId`
- 从当前计划步骤中提取 `stepId`
- 从会话、前序结果、运行时资源句柄中收口 `context`
- 组装共享协议 `AgentExecutionStartRequest`

## 未来组装原则

委派层后续只应稳定产出以下共享协议字段：

- `executionId`
- `stepId`
- `agentKind`
- `input`
- `context`

其中：

- `executionId`
  - 来自控制面执行上下文
- `stepId`
  - 来自当前计划步骤
- `agentKind`
  - 来自规划阶段的专项 Agent 选择结果
- `input`
  - 由步骤目标、参数、约束收口而来
- `context`
  - 由会话信息、前序结果摘要、运行时句柄、计划摘要收口而来

## 该目录不负责

- `codegen-agent` 的生成、验证与导出内部流程
- `browser-nl-agent` 的高频观察、推理与动作循环
- `control-plane` 的审批、等待输入、接管、状态机管理
- `browser-worker`、`sandbox-worker` 等 runtime 的原子执行

## 当前关联文档

- `adapter-skeleton.md`
- `event-handoff.md`
- `integration-placement.md`
- `migration-cutover.md`
- `request-builder.md`
- `validation-checklist.md`
- `docs/design/v4/specialized-agent-execution-protocol-boundary_v4.1.md`
- `docs/design/v4/specialized-agent-execution-protocol-examples_v4.1.md`

## 当前结论

本目录当前先作为委派层逻辑壳存在：

- 对上承接 `master-planner` 的计划步骤与委派决策
- 对下只约束共享执行协议的请求形状
- 已补充 request builder 映射说明，明确 `plan step / execution context / session context` 如何进入共享协议
- 已补充 adapter skeleton 说明，明确未来委派适配器的最小输入、请求输出、进度回收与结果回收边界
- 已补充 event handoff 说明，明确未来委派层如何把标准进度事件与终态结果回交上游编排层
- 已补充 integration placement 说明，明确未来真实委派适配器在 `planner/delegation` 内的挂载位置、依赖方向与稳定入口
- 已补充 migration cutover 说明，明确未来如何从 `delegation/index.ts -> modules/agent` 平滑切到本地委派适配器
- 已补充 validation checklist，明确未来 delegation adapter 接线时的最小验证范围、通过标准与验收口径
- 暂不在本批次引入真实专项 Agent 调用适配器
