# planner/delegation validation checklist

本文件用于说明未来 `planner/delegation` 真正接入本地委派适配器时，最小应验证
哪些点、哪些现象可视为通过、哪些内容不应混入同一批次。

当前只固定验收口径，不引入真实实现。

## 目标

未来委派适配器接线时，需要验证：

1. 上游稳定入口是否保持不变
2. 共享请求是否能被正确组装
3. 共享进度事件与终态结果是否能被正确消费
4. 上游是否仍只依赖最小标准 handoff 容器
5. 切换是否没有把额外重构混入同一批

## 最小验证范围

未来最小验证范围应只覆盖：

- `planner/index.ts`
- `planner/delegation/index.ts`
- 本地委派适配器
- request builder
- event handoff
- 共享执行协议请求/进度/结果三类壳

未来不应在同一批强行扩大到：

- `browser-domain` 内部实现迁移
- `codegen-agent` 内部生成链路重构
- `browser-nl-agent` 内部循环改造
- `control-plane` 私有状态机重写
- `modules/agent` 的历史能力一次性清空

## 入口稳定性检查

未来至少应确认：

1. `planner/index.ts` 的对外导出方式未破坏
2. 上游调用方仍只通过 `planner` 使用委派能力
3. `delegation/index.ts` 仍作为稳定逻辑出口存在

通过标准：

- 上游不需要改为深层引用 `planner/delegation/*`
- 对外导出名未被一次性重命名为新的不兼容接口

## 请求组装检查

未来至少应确认：

1. `executionId` 来自执行上下文
2. `stepId` 来自计划步骤
3. `agentKind` 来自委派决策
4. `input` 只承载直接业务输入
5. `context` 只承载补充上下文

通过标准：

- 能稳定产出 `AgentExecutionStartRequest`
- 不把本地领域对象直接塞进共享协议顶层字段

## 进度事件检查

未来至少应确认：

1. 能按 `executionId + stepId` 关联回当前步骤
2. 能消费 `running / waiting / takeover_required / succeeded / failed`
3. `payload` 只作为可选进度摘要容器

通过标准：

- 能稳定消费 `AgentExecutionProgressEvent`
- 上游编排层不需要了解专项 Agent 本地对象

## 终态结果检查

未来至少应确认：

1. 成功结果通过 `output` 回传
2. 失败结果通过 `error` 回传
3. `status` 能区分终态与阻塞态

通过标准：

- 能稳定消费 `AgentExecutionResult`
- 上游编排层只接收最小标准结果容器

## Handoff 检查

未来至少应确认：

1. 进度事件可整理为标准 `progress handoff`
2. 终态结果可整理为标准 `result handoff`
3. `GeneratedWorkUnit`、`BrowserAtomicAction` 等对象未直接上浮为共享结构

通过标准：

- 上游只依赖共享协议壳与最小 handoff 容器
- 本地领域契约仍保留在专项 Agent 自身边界内

## 切换顺序检查

未来至少应确认：

1. 先补本地适配器，再切 `delegation/index.ts` 的转发目标
2. 切换批次里没有同时修改协议命名、对外导出名和旧层清理
3. `modules/agent` 仍先作为过渡承接层存在，直到本地适配器稳定

通过标准：

- 切换范围集中在 `planner/delegation` 子层
- 问题定位不会扩散到多服务、多目录的大范围改动

## 最小失败检查

未来至少应检查以下失败场景：

1. 无法确定 `agentKind`
2. 无法组装合法 `AgentExecutionStartRequest`
3. 进度事件缺失 `executionId` 或 `stepId`
4. 终态结果与已发出请求不匹配

通过标准：

- 失败能在委派层被明确识别
- 不需要由上游或控制面兜底理解委派层内部错误细节

## 建议验收口径

未来一个最小 delegation adapter 接线批次，可按以下口径验收：

1. 上游入口未破坏
2. 共享请求可稳定产出
3. 共享进度事件可稳定消费
4. 共享终态结果可稳定消费
5. handoff 容器边界未被突破
6. 切换没有混入无关重构

## 与现有文档关系

本文件承接以下说明：

- `README.md`
- `request-builder.md`
- `adapter-skeleton.md`
- `event-handoff.md`
- `integration-placement.md`
- `migration-cutover.md`

## 当前结论

本轮之后，`planner/delegation` 的最小验收口径已进一步固定：

- 验证范围聚焦在委派层自身
- 请求、事件、结果、handoff 都有最小通过标准
- 切换批次应保持小步替换而不是大范围重构
- 仍不在本批次引入真实实现
