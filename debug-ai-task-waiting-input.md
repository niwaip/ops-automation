[OPEN]

# Debug Session: ai-task-waiting-input

## Bug Summary

- Symptom: AI 任务模型显示出错，但执行管理显示该执行需要补参，状态为“待补输入”。
- Execution ID: `210a8f44-805b-4880-8058-b003dd61a7ea`
- Risk: `L1`

## Initial Hypotheses

1. AI 任务模型读取的是旧状态字段或错误映射字段，导致把 `waiting_input` 误判为“出错”。
2. 执行管理与 AI 任务模型分别读取不同服务或不同聚合视图，状态同步存在延迟或丢失。
3. 某个状态转换把“缺少补参”同时标记成异常，前端展示层把异常优先级放在了正常待补输入之前。
4. Execution 详情中 `normalizedInputJson.requiredInputs` 或 `paramResolution` 为空/异常，导致上层模型无法正确归类为待补输入。
5. 针对该 executionId 的查询接口在序列化或 mapper 层丢失了 `waiting_input` 语义，退化成通用错误态。

## Evidence Plan

- 查 executionId 在后端执行链路中的持久化状态和值。
- 查 AI 任务模型和执行管理分别依赖的接口、mapper、状态映射。
- 查是否已有将 `waiting_input` 映射为错误态的前端/后端逻辑。

## Status

- Session opened. No business logic changed.
