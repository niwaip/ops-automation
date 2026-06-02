# Debug Session: empty-document-output

- Status: OPEN
- Date: 2026-05-30
- Symptom: 任务模式生成“技术服务合同”时，文档生成成功但内容为空。
- Scope:
  - `planner.service.ts`
  - `execution.service.ts`
  - runtime payload assembly

## Hypotheses

1. `planner` 阶段没有为合同技能产出关键参数，导致后续 `execution.normalizedInputJson.paramResolution` 本身就是空或缺关键字段。
2. `planner` 有产出候选参数，但 `execution create` / `submitInputAndResume` 在落库时没有正确写入 `paramResolution` 或 `input`。
3. `execution` 已落库参数，但字段缺少 `final === true`，导致 runtime payload 装配阶段被全部过滤。
4. `execution` 已落库参数且为 final，但缺少 `templateBinding` 或 `renderPath`，导致 runtime payload 为空。
5. 任务模式走了旁路/fallback，与预期主链路不一致，导致 `planner -> execution -> runtime` 证据链断裂。

## Plan

1. 阅读 `planner.service.ts` 与 `execution.service.ts` 相关代码，定位参数生成与落库路径。
2. 对关键节点添加最小化埋点，采集 planner 产出、execution 落库、runtime 组装证据。
3. 复现“技术服务合同”生成，判定是“没产出”还是“落库/装配被过滤”。
4. 基于证据做最小修复。
5. 重新端到端验证，确认文档有内容且字段正确。

## Evidence

- 旧运行环境中，任务模式首轮会进入 `waiting_input`，且缺失 17 个关键业务组；重启到当前 worktree 后，同一请求仅缺 2 个业务组，说明运行环境此前未加载当前代码。
- 当前代码路径下，`planner` 仍有字段未产出：
  - `contract.partyA` 缺失；
  - `items[].quantity` 只识别出 1/2 条，进入 `partial_group`。
- 更关键的是，当前执行单 `normalizedInputJson.paramResolution` 中所有 `final === true` 的字段都缺少 `render_path/template_binding`。
- 代码静态检查表明：
  - `planner.service.ts` 会在 `required_inputs` 中透传 `render_path/template_binding`；
  - `execution.service.ts` 会把这两个字段写入 `paramResolution`；
  - 但真实技能 `TechnicalServiceContractRenderingWorkflow` 的 `paramsSchema.properties` 中根本没有 `renderPath`，也未见 workflow 侧 `templateBinding`。
- E2E 补齐最后 2 个缺项后，执行单成功 `succeeded`，但下载的 docx 只剩模板固定文本，关键业务值均未写入：
  - `Party A CN Ltd` 不存在；
  - `TSC-2026-0528-001` 不存在；
  - `MES Upgrade Integration Project` 不存在；
  - `789456123012` 不存在。

## Conclusion

1. 问题不是单纯“execution 落库时把已有值丢了”。
2. 当前是双重问题：
   - 一部分字段在 `planner` 阶段就没有正确产出；
   - 已产出的字段虽然成功落库为 `final === true`，但由于缺少 `render_path/template_binding`，进入 runtime 时无法映射到模板 payload。
3. 这正对应“执行成功但文档动态内容为空”的现象：模板渲染成功，但动态数据几乎全部被映射阶段过滤。
