# planner/delegation adapter skeleton

本文件用于说明未来 `planner/delegation` 在真正接入专项 Agent 时，最小适配器
骨架应如何组织。

当前只固定职责边界、输入输出与阶段顺序，不引入任何真实实现。

## 目标

未来委派适配器只负责把：

1. 计划步骤
2. 执行上下文
3. 会话与前序结果摘要

组装为共享协议请求，并负责接住专项 Agent 回传的标准事件。

## 最小输入

未来适配器最少应消费三类输入：

```ts
type DelegationAdapterInput = {
  planStep: Record<string, unknown>;
  executionContext: {
    executionId: string;
  };
  sessionContext?: Record<string, unknown>;
};
```

约束：

- `planStep` 提供当前步骤目标、参数、约束与稳定 `stepId`
- `executionContext` 提供当前执行单稳定 `executionId`
- `sessionContext` 提供会话摘要、前序结果摘要与 runtime 句柄

## 最小输出

适配器本轮最小只应产出共享协议请求：

```ts
type DelegationAdapterOutput = {
  request: AgentExecutionStartRequest;
};
```

其中 `request` 的字段形状已由共享合同固定：

```ts
type AgentExecutionStartRequest = {
  executionId: string;
  stepId: string;
  agentKind: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
};
```

## 最小阶段顺序

未来真实适配器推荐只按以下顺序运行：

1. 判断当前步骤是否需要委派
2. 解析本次委派的 `agentKind`
3. 通过 request builder 组装 `AgentExecutionStartRequest`
4. 将请求发送给目标专项 Agent
5. 接收标准 `AgentExecutionProgressEvent`
6. 接收最终 `AgentExecutionResult`
7. 将标准结果回交上游编排层

## 建议骨架

未来实现时，可按以下最小骨架组织：

```ts
type DelegationAdapter = {
  supports(planStep: Record<string, unknown>): boolean;
  buildRequest(input: DelegationAdapterInput): AgentExecutionStartRequest;
  dispatch(request: AgentExecutionStartRequest): Promise<void>;
  onProgress(event: AgentExecutionProgressEvent): void;
  onResult(result: AgentExecutionResult): void;
};
```

这里的含义是：

- `supports`
  - 判断当前步骤是否应走专项 Agent 委派
- `buildRequest`
  - 只负责把上游输入收口成共享协议开始请求
- `dispatch`
  - 只负责把共享请求送到目标专项 Agent
- `onProgress`
  - 只消费共享协议进度事件
- `onResult`
  - 只消费共享协议最终结果

## 适配器负责的边界

未来委派适配器负责：

- 决定是否进入专项 Agent 委派链路
- 固定 `agentKind`
- 调用 request builder 生成共享协议请求
- 按共享协议接收进度事件与最终结果
- 把共享协议结果回交给上游编排层

## 适配器不负责的边界

未来委派适配器不负责：

- `codegen-agent` 内部生成、验证、导出逻辑
- `browser-nl-agent` 内部观察、推理、动作循环
- `control-plane` 的审批、等待输入、接管、状态推进
- `browser-worker`、`sandbox-worker` 等 runtime 原子执行
- 本地领域 DTO 到共享协议之外的额外跨服务翻译

## 进度事件处理原则

未来适配器消费 `AgentExecutionProgressEvent` 时，只应把它视为共享外壳事件：

```ts
type AgentExecutionProgressEvent = {
  executionId: string;
  stepId: string;
  status: 'running' | 'waiting' | 'takeover_required' | 'succeeded' | 'failed';
  timestamp: string;
  payload?: Record<string, unknown>;
};
```

原则：

- 只依赖 `executionId`、`stepId`、`status` 与标准 `payload`
- 不把专项 Agent 本地私有对象提升为控制面共享结构
- `payload` 可以承载进度摘要，但不应替代最终 `output`

## 结果处理原则

未来适配器消费 `AgentExecutionResult` 时，只应回收共享协议结果外壳：

```ts
type AgentExecutionResult = {
  executionId: string;
  stepId: string;
  status: 'succeeded' | 'failed' | 'waiting' | 'takeover_required';
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
};
```

原则：

- 成功结果通过 `output` 回传
- 失败信息通过 `error` 回传
- 本地领域对象仍保留在专项 Agent 自身契约中

## 最小失败边界

未来接线时，适配器至少应区分三类失败：

1. 委派前失败
2. 委派中失败
3. 结果消费失败

对应约束：

- 委派前失败
  - 例如无法确定 `agentKind`、无法组装合法请求
- 委派中失败
  - 例如专项 Agent 无响应、返回非法进度事件
- 结果消费失败
  - 例如终态结果结构不完整、与 `executionId / stepId` 不匹配

## 与现有文档关系

本文件承接以下说明：

- `README.md`
- `request-builder.md`
- `docs/design/v4/specialized-agent-execution-protocol-boundary_v4.1.md`
- `docs/design/v4/specialized-agent-execution-protocol-examples_v4.1.md`

## 当前结论

本轮之后，`planner/delegation` 已进一步明确未来最小适配器骨架：

- 上游输入来源固定
- 请求输出固定为 `AgentExecutionStartRequest`
- 中途只消费标准 `AgentExecutionProgressEvent`
- 终态只消费标准 `AgentExecutionResult`
- 仍不在本批次引入真实专项 Agent 调用实现
