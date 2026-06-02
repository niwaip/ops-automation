# Debug Session: missing-last-parameter

- Status: OPEN
- Execution ID: `e2d47f6f-8e3e-47db-b09b-bbbf8a1bddf9`
- Symptom: 参数识别成功后，AI 执行报错，执行历史显示少一个参数，疑似最后一个参数丢失。

## Hypotheses

1. AI 执行入参组装时，尾部参数被过滤或截断。
2. 识别结果已保存，但执行阶段读取了错误的数据源或旧快照。
3. 参数映射/序列化逻辑对空值、数组或对象尾项处理异常。
4. 执行历史展示与实际执行 payload 使用了不同字段或不同版本结构。
5. 单据 `e2d47f6f-8e3e-47db-b09b-bbbf8a1bddf9` 的运行路径命中特殊分支，导致最后一个参数未透传。

## Plan

1. 定位执行单查询、参数识别、AI 执行、执行历史写入/展示相关代码。
2. 增加最小化调试日志，分别记录识别结果、执行前 payload、持久化 payload、历史读取 payload。
3. 复现并比对日志，确认参数丢失发生在哪一层。
4. 基于证据做最小修复，并进行前后对比验证。

## Evidence

- 执行单 `e2d47f6f-8e3e-47db-b09b-bbbf8a1bddf9` 当前数据库状态为 `waiting_input`，尚未进入 `execute_skill`。
- 当前唯一剩余必填参数为 `items[].quantity`，说明“最后一个参数”实际仍未完整补齐。
- `execution.partial_input_submitted` 事件里保留了多次补参的增量 payload。
- `execution_steps.output_json` 在每次补参时被覆盖为 `normalizedSubmittedInput`，导致执行历史只显示“最后一次补参”，看起来像少了一个参数。
- 列表页 `ExecutionListPage` 对数组参数未按 JSON 解析，`items[].quantity` 这类尾部数组参数可能以字符串而非数组提交，造成恢复执行异常或继续停留在 `waiting_input`。

## Fix

1. 后端 `submitInputAndResume` 将 `execution_steps.output_json` 改为累计合并后的已收集参数，避免历史只显示最后一次增量。
2. 前端执行列表页对数组参数启用 JSON 输入/解析，与执行详情页保持一致，避免最后一个数组参数类型错误。
