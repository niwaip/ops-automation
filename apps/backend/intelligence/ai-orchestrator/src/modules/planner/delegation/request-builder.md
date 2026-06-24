# planner/delegation request-builder

本文件用于说明未来 `planner/delegation` 如何把上游规划结果与执行上下文
收口为共享协议 `AgentExecutionStartRequest`。

当前只定义映射原则与组装顺序，不引入真实实现。

## 目标输出

委派层后续的最小目标输出如下：

```ts
type AgentExecutionStartRequest = {
  executionId: string;
  stepId: string;
  agentKind: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
};
```

## 输入来源

未来组装请求时，主要会使用三类上游输入：

1. 当前计划步骤
2. 控制面执行上下文
3. 会话与前序结果摘要

## 映射原则

### 1. `plan step -> input`

当前计划步骤中与本次专项 Agent 执行目标直接相关的字段，应收口到 `input`。

典型来源包括：

- 步骤目标
- 已识别参数
- 明确约束
- 当前步骤的专项输出类型

示意：

```json
{
  "input": {
    "objective": "...",
    "recognizedParams": {},
    "constraints": {},
    "outputType": "..."
  }
}
```

原则：

- `input` 只放“Agent 本轮必须消费的直接业务输入”
- 不把执行上下文、会话句柄、前序结果摘要混入 `input`

### 2. `execution context -> executionId`

控制面执行上下文中能稳定标识当前执行单的字段，应直接映射到顶层 `executionId`。

示意：

```json
{
  "executionId": "exec_123"
}
```

原则：

- `executionId` 必须来自控制面稳定主键
- 不从计划步骤本身推导 `executionId`

### 3. `plan step -> stepId`

当前计划步骤的稳定标识，应直接映射到顶层 `stepId`。

示意：

```json
{
  "stepId": "step_codegen_001"
}
```

原则：

- `stepId` 应与计划系统中的步骤标识一致
- 不在委派层重新生成新的步骤 ID

### 4. `delegation decision -> agentKind`

规划阶段已经确定的委派目标，应直接映射到顶层 `agentKind`。

典型值包括：

- `codegen-agent`
- `browser-nl-agent`

原则：

- `agentKind` 代表路由目标
- 不在委派层再做二次“猜测式”分类

### 5. `session / prior outputs / runtime handles -> context`

所有不是直接业务输入、但对专项 Agent 执行仍有帮助的附加信息，都进入 `context`。

典型来源包括：

- 会话信息
- 上游计划摘要
- 前序结果摘要
- runtime 资源句柄
- sandbox 或 browser session 绑定信息

示意：

```json
{
  "context": {
    "planSummary": {},
    "session": {},
    "priorOutputs": {},
    "runtimeHandle": {}
  }
}
```

原则：

- `context` 只承载补充性上下文
- 能让专项 Agent 少查一次上游系统，但不要求控制面理解里面的全部领域结构

## 推荐组装顺序

未来真正实现 request builder 时，推荐按以下顺序组装：

1. 先确定 `agentKind`
2. 再绑定 `executionId`
3. 再绑定 `stepId`
4. 从当前步骤提取 `input`
5. 从执行上下文、会话、前序结果中提取 `context`
6. 最后做最小结构校验，确保共享协议字段齐全

## 最小校验点

未来接线时，委派层至少应校验：

- `executionId` 非空
- `stepId` 非空
- `agentKind` 非空
- `input` 为对象
- `context` 如存在则为对象

## 不在本文件范围内

本文件不负责：

- `AgentExecutionProgressEvent` 的具体发送实现
- `AgentExecutionResult` 的消费实现
- `control-plane` 状态回写
- `codegen-agent`、`browser-nl-agent` 的内部本地 DTO 组装
- runtime worker 调用细节

## 当前结论

本轮之后，`planner/delegation` 的 request builder 责任可以固定为：

- 顶层字段只负责执行路由与关联
- `input` 负责直接业务输入
- `context` 负责附加上下文
- 真正的领域对象仍留在专项 Agent 自身契约里
