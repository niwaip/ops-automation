# planner/delegation integration placement

本文件用于说明未来专项 Agent 委派适配器在 `ai-orchestrator` 中的最小接入点与
逻辑落点。

当前只固定挂载位置、依赖方向与对外入口，不引入真实实现。

## 目标

未来专项 Agent 委派能力需要满足三件事：

1. 对上仍表现为 `planner` 通用规划链路的一部分
2. 对内保持在 `planner/delegation` 目录下演进
3. 对下通过共享执行协议接入专项 Agent，而不是直接耦合控制面私有 DTO

## 当前现状

当前代码关系为：

```ts
planner/index.ts -> delegation/index.ts -> modules/agent
```

这说明：

- `planner` 已经把委派能力作为通用规划链路的一部分对外暴露
- `delegation/index.ts` 当前仍只是未来逻辑视图 facade
- 真实运行时能力暂时仍由 `modules/agent` 提供

## 推荐逻辑落点

未来真实委派适配器的逻辑落点，应继续保留在：

```text
apps/backend/intelligence/ai-orchestrator/src/modules/planner/delegation/
```

原因：

- 该能力本质上属于 `master-planner` 的专项 Agent 委派子层
- 它的上游输入来自计划步骤、执行上下文与会话摘要
- 它的下游输出是共享协议请求、进度事件与终态结果
- 它不属于 `browser-domain`、`codegen-agent` 或 `control-plane` 自身内部逻辑

## 推荐接入点

未来真实接线时，推荐接入点保持在以下层级：

1. `planner` facade
2. `planner/delegation` 子层

推荐依赖方向如下：

```text
planner facade
  -> delegation facade / adapter
    -> shared execution protocol
      -> specialized agent
```

约束：

- `planner` facade 只依赖委派层抽象能力
- `planner/delegation` 负责真正的协议组装与事件回收
- 专项 Agent 本地契约不直接上浮到 `planner` facade

## 不推荐的落点

未来不推荐把真实委派适配器直接落在：

- `modules/agent`
- `modules/browser`
- `control-plane`
- `codegen-agent`
- `browser-nl-agent`

原因：

- `modules/agent`
  - 当前是过渡承接层，不应继续承担未来 `master-planner/delegation` 的稳定落点
- `modules/browser`
  - 浏览器域属于能力域，不应反向承接通用委派适配器
- `control-plane`
  - 控制面只应消费标准协议结果，而不是持有 Planner 内部委派适配器
- `codegen-agent` / `browser-nl-agent`
  - 专项 Agent 不应反向持有上游规划层适配器

## 推荐目录角色

未来 `planner/delegation` 目录内，可按以下最小角色理解：

- `index.ts`
  - 对外稳定出口
- `request-builder.md`
  - 固定共享请求组装原则
- `adapter-skeleton.md`
  - 固定适配器最小骨架
- `event-handoff.md`
  - 固定事件回传原则
- `integration-placement.md`
  - 固定适配器挂载位置与依赖方向

## 推荐对外入口

未来真正实现后，`planner/index.ts` 仍应只暴露委派层稳定出口，而不暴露专项 Agent
内部实现细节。

也就是说，对外仍应保持类似的稳定使用方式：

```ts
export { AgentService } from './delegation';
```

后续如果需要把 `AgentService` 替换为更明确的委派适配器命名，也应优先在
`delegation/index.ts` 内完成兼容转发，而不是让上游直接改为深层引用。

## 与现有 `modules/agent` 的关系

未来迁移时，推荐按以下顺序演进：

1. 保持 `delegation/index.ts` 作为稳定逻辑出口
2. 在 `planner/delegation` 内补齐真实委派适配器实现
3. 让 `delegation/index.ts` 从转发 `modules/agent` 逐步切换为转发本地委派适配器
4. 再评估 `modules/agent` 中哪些能力应继续保留、哪些应下沉或退场

约束：

- 不在一次变更里同时做协议重命名、运行时改线和目录迁移
- 先替换出口背后的承接实现，再考虑是否清理历史过渡层

## 与上游的边界

未来上游 `planner` 或 `planning` 链路只应知道：

- 当前步骤是否需要委派
- 委派后能拿到标准进度与标准结果

未来上游不应知道：

- 具体专项 Agent 的本地 DTO
- 具体事件通道实现
- 具体 runtime worker 调用细节

## 与下游的边界

未来 `planner/delegation` 对下只应稳定依赖：

- `@ops/backend-agent-execution-protocol`
- 专项 Agent 的标准 ingress 能力

未来 `planner/delegation` 不应直接依赖：

- 控制面私有请求/响应 DTO
- 浏览器域私有 controller/service
- 专项 Agent 内部 module 细节

## 当前结论

本轮之后，未来真实委派适配器的最小挂载策略已进一步固定：

- 稳定逻辑落点在 `planner/delegation`
- 稳定上游入口在 `planner/index.ts`
- 稳定对下协议为共享执行协议
- `modules/agent` 继续只作为过渡承接层
- 仍不在本批次引入真实委派适配器实现
