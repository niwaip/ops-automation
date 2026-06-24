# planner/delegation event handoff

本文件用于说明未来 `planner/delegation` 在收到专项 Agent 回传事件后，如何把
共享协议中的 `progress` 与 `result` 回交给上游编排层。

当前只固定事件消费边界与回传原则，不引入真实实现。

## 目标

未来委派层在发出 `AgentExecutionStartRequest` 之后，应只依赖共享协议中的：

1. `AgentExecutionProgressEvent`
2. `AgentExecutionResult`

来判断当前专项 Agent 的执行状态，并把这些状态以稳定、最小、去领域耦合的方式
回交给上游编排层。

## 上游编排层最小关注点

未来 `master-planner` 或其上游编排层，最小只应关注：

- 当前回传属于哪个 `executionId`
- 当前回传属于哪个 `stepId`
- 当前状态是否仍在运行、等待输入、需要接管、已成功、已失败
- 当前是否带有可读的进度摘要、最终输出或错误信息

上游编排层不应依赖：

- `codegen-agent` 本地 `GeneratedWorkUnit`
- `browser-nl-agent` 本地 `BrowserAtomicAction`
- 任何专项 Agent 私有内部状态机

## 进度事件最小消费规则

未来委派层收到进度事件时，只应消费共享协议标准字段：

```ts
type AgentExecutionProgressEvent = {
  executionId: string;
  stepId: string;
  status: 'running' | 'waiting' | 'takeover_required' | 'succeeded' | 'failed';
  timestamp: string;
  payload?: Record<string, unknown>;
};
```

消费原则：

- 用 `executionId + stepId` 关联回当前执行步骤
- 用 `status` 判断当前是否继续等待后续事件
- 用 `timestamp` 记录事件时间顺序
- 用 `payload` 承载“可选进度摘要”，而不是强耦合专项 Agent 本地对象

## 进度事件建议回传形状

未来委派层回交上游编排层时，建议只保留最小标准容器：

```ts
type DelegationProgressHandoff = {
  executionId: string;
  stepId: string;
  status: 'running' | 'waiting' | 'takeover_required' | 'succeeded' | 'failed';
  timestamp: string;
  progress?: Record<string, unknown>;
};
```

其中：

- `progress`
  - 由共享协议 `payload` 直接透传或做最小重命名
- 不在这里引入专项 Agent 私有 DTO

## 结果事件最小消费规则

未来委派层收到终态结果时，只应消费共享协议标准字段：

```ts
type AgentExecutionResult = {
  executionId: string;
  stepId: string;
  status: 'succeeded' | 'failed' | 'waiting' | 'takeover_required';
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
};
```

消费原则：

- 用 `executionId + stepId` 绑定终态归属
- 用 `status` 判断是成功、失败、等待输入还是需要接管
- 成功时只通过 `output` 回交共享结果
- 失败时只通过 `error` 回交共享错误摘要

## 结果事件建议回传形状

未来委派层回交上游编排层时，建议只保留最小标准容器：

```ts
type DelegationResultHandoff = {
  executionId: string;
  stepId: string;
  status: 'succeeded' | 'failed' | 'waiting' | 'takeover_required';
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
};
```

原则：

- 不在委派层把 `output` 展开成上游私有字段
- 不在委派层把 `error` 映射成专项 Agent 私有错误枚举

## 建议回传顺序

未来真实接线时，建议委派层按以下顺序处理：

1. 发送 `AgentExecutionStartRequest`
2. 持续接收 `AgentExecutionProgressEvent`
3. 将进度事件整理为 `DelegationProgressHandoff`
4. 在终态到来时接收 `AgentExecutionResult`
5. 将结果整理为 `DelegationResultHandoff`
6. 把最终结果回交上游编排层

## 最小关联约束

未来委派层至少应保证：

- 任何 `progress` 都必须带有效 `executionId`
- 任何 `progress` 都必须带有效 `stepId`
- 任何 `result` 都必须与已发出的请求 `executionId / stepId` 对齐
- 不接受无法关联到当前步骤的孤立终态结果

## 最小状态约束

未来委派层至少应按以下方式理解共享状态：

- `running`
  - 专项 Agent 仍在执行中
- `waiting`
  - 需要等待外部输入、审批或资源
- `takeover_required`
  - 需要人工或上游系统介入
- `succeeded`
  - 执行成功结束
- `failed`
  - 执行失败结束

约束：

- `succeeded` 与 `failed` 属于终态
- `waiting` 与 `takeover_required` 可被上游视为阻塞态
- 委派层不负责定义这些状态在控制面中的完整状态机含义

## 禁止上浮的对象

未来委派层向上回传时，不应把以下对象作为共享结构直接上浮：

- `GeneratedWorkUnit`
- `GeneratedWorkUnitArtifact`
- `SecurityLintResult`
- `BrowserNlAgentSession`
- `BrowserObservationSnapshot`
- `BrowserAtomicAction`
- `BrowserNlAgentTurnResult`

这些对象如需传递，也应先由专项 Agent 收口进共享 `payload`、`output` 或 `error`
容器，再由上游按共享协议理解。

## 与现有文档关系

本文件承接以下说明：

- `README.md`
- `request-builder.md`
- `adapter-skeleton.md`
- `docs/design/v4/specialized-agent-execution-protocol-boundary_v4.1.md`
- `docs/design/v4/specialized-agent-execution-protocol-examples_v4.1.md`

## 当前结论

本轮之后，`planner/delegation` 从发起委派到接住回传事件的最小闭环已进一步明确：

- 请求阶段只产出 `AgentExecutionStartRequest`
- 过程阶段只消费 `AgentExecutionProgressEvent`
- 终态阶段只消费 `AgentExecutionResult`
- 上游编排层只接收最小标准 handoff 容器
- 仍不在本批次引入真实事件总线、回调通道或专项 Agent 调用实现
