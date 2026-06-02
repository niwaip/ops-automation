# [OPEN] temporal-save-result

## 背景

- 现象：用户提供一次 `PUT /api/temporal/4c32e057-cb5f-43c5-b177-e72892089e47` 请求，状态码 `200 OK`，需要确认“保存后的结果是不是仍然不正确”，重点关注 `inputpolice` 默认值及相关情报。
- 当前阶段：仅建立调试会话与假设，不修改业务逻辑。

## 假设

1. 请求进入后端前，`inputpolice` 就已经是错误默认值，后端只是原样持久化。
2. 后端 DTO/Schema/Entity 映射阶段对缺失字段填充了错误默认值。
3. 持久化结果正确，但查询或回显阶段把 `inputpolice` 覆盖回默认值。
4. 文档参数对象在 merge/normalize 过程中被后续数据源覆盖，导致最终保存结果异常。

## 计划

1. 定位 `PUT /api/temporal/:id` 入口、保存逻辑、查询逻辑。
2. 只添加最小化运行时埋点，记录请求体、归一化结果、落库前结果、读回结果中的 `inputpolice`。
3. 复现一次相同请求，采集证据后判断是哪一层写错或读错。
4. 证据明确后再做最小修复，并做前后对比验证。

## 当前取证

- 已启动 Debug Server：`.dbg/temporal-save-result.env`
- 已增加埋点文件：
  - `apps/frontend/portal/src/features/admin/temporal/pages/TemporalPage.tsx`
  - `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.service.ts`
- 已直接读取数据库中 `temporal_workflows.id = 4c32e057-cb5f-43c5-b177-e72892089e47` 的持久化结果。

## 初步证据

- 数据库中的 `workflow_dsl.inputParams["contract.contractNo"].localizedDefaultValue`
  - `cn = "11"`
  - `jp = "112"`
- 同一条记录中的 `workflow_dsl.inputPolicy.params["contract.contractNo"].defaultValue`
  - `cn = "11"`
  - `jp = "11"`
- 对照项 `contract.partyA` 在 `inputParams.localizedDefaultValue` 与 `inputPolicy.defaultValue` 中保持一致：
  - `cn = "阿"`
  - `jp = "ashi"`

## 假设判定（阶段性）

| ID | 假设 | 状态 | 证据 |
|----|------|------|------|
| A | 请求进入后端前就已经错误 | 已确认 | 前端保存 payload 中 `requestInputParams.contract.contractNo.jp = 1123`，但 `requestInputPolicy.contract.contractNo.jp = 11` |
| B | 后端归一化/映射阶段生成了错误默认值 | 已排除为主因 | 后端持久化结果与前端送入的旧 `inputPolicy` 一致，说明主要是保留了显式旧值 |
| C | 持久化正确，但读回时被覆盖 | 已排除 | 数据库原始记录本身已经不一致 |
| D | merge 顺序导致局部字段被旧值覆盖 | 已确认 | 仅修改 `inputParams.localizedDefaultValue`，未同步更新 `inputPolicy.defaultValue`，保存时旧策略覆盖新值 |

## 二次复现证据

- 用户将 `contract.contractNo.jp` 修改为 `1123` 后再次保存。
- 前端日志显示：
  - `requestInputParams["contract.contractNo"].localizedDefaultValue.jp = "1123"`
  - `requestInputPolicy["contract.contractNo"].defaultValue.jp = "11"`
- 数据库持久化结果显示：
  - `inputParams["contract.contractNo"].localizedDefaultValue.jp = "1123"`
  - `inputPolicy.params["contract.contractNo"].defaultValue.jp = "11"`

## 根因结论

- 前端编辑默认值时只更新了 `workflowDsl.inputParams`，没有同步更新 `workflowDsl.inputPolicy.params`。
- 保存时 `TemporalPage` 直接把整个 `workflowDsl` 原样提交，其中夹带了旧的 `inputPolicy`。
- 后端 `normalizeWorkflowInputPolicy()` 会合并显式策略，并在显式 `policy.defaultValue` 已存在时优先保留旧值，因此旧的 `11` 被持续写回。
