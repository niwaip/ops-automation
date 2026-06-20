# Debug Session: gross-margin-review

Status: OPEN

## Symptoms

- 任务“对第二条记录进行毛利审查”失败。
- 执行单 ID：`1af172e4-df32-48da-bfc7-1de9bc00b02d`
- 前端提示：`Request failed with status code 400`

## Scope

- Execution / Control Plane request chain
- Runtime browser or workflow input mapping
- End-to-end validation for the failed flow

## Hypotheses

1. 执行单触发时，发往后端的参数缺失或类型错误，导致某个下游接口直接返回 400。
2. “第二条记录”在模板/工作流中被映射成了非法的 `rowIndex`、`rowKey` 或筛选条件，导致执行请求校验失败。
3. 该工作流引用的 Temporal / Capability / Skill 元数据仍是旧版本，运行时请求体与当前后端 schema 不兼容。
4. 浏览器模板执行前置页面状态不满足预期，运行时生成的请求参数为空或错误，最终由执行接口以 400 拒绝。
5. 失败并非业务接口，而是 Portal/Control Plane 代理层请求组装错误，导致实际发送给 `/executions` 或相关接口的 body 不符合要求。

## Evidence Plan

- 定位执行单详情、状态、错误信息和关联 workflow / capability。
- 检查 platform / control-plane / portal 相关运行日志，确认 400 来源接口和返回体。
- 对照该能力/工作流的输入参数定义，确认“第二条记录”如何映射。
- 必要时做最小化运行时复现，验证修复前后行为差异。

## Progress Log

- 初始化调试会话文件。
