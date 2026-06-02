# [OPEN] temporal-renderpath-save

## 背景

- 现象：用户重新保存 `Template1febbc18Workflow` 后，数据库中的 `workflow_dsl.inputParams.renderPath` 与 `workflow_dsl.inputPolicy.params.*.templateBinding` 仍为空，导致发布阶段判定 `mappedInputCount = 0`。
- 目标：定位“当前保存链路里为什么 `renderPath/templateBinding` 没有保存成功”。
- 约束：在取得运行时证据前，不修改业务逻辑；优先通过最小埋点确认丢失发生在前端请求、后端归一化、还是读回阶段。

## 假设

1. 前端编辑器 state 里已经丢失 `renderPath`，请求发出前 payload 就不完整。
2. 前端保存前同步 `inputPolicy` 时，没有从 `renderPath` 正确生成 `templateBinding`。
3. 后端 `normalizeWorkflowDsl` / `normalizeWorkflowInputPolicy` 在保存时清掉了映射字段。
4. 数据库持久化结果正确，但查询/回显阶段覆盖成空值。

## 计划

1. 检查当前代码库里是否已有保存链路调试埋点可复用。
2. 如证据不足，在前端保存前与后端归一化/落库前增加最小化埋点。
3. 让用户复现一次保存，采集前后端日志。
4. 基于日志判断字段丢失位置，再做最小修复。
