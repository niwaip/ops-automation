# Debug Session: execution-empty-output

- **Status**: [OPEN]
- **Issue**: 执行单 `c1e55b82-1c7c-4806-bc37-3e477bb5393f` 先执行，结果大部分内容正常但局部出现 `[object Object]`；执行单 `7ed5e567-23b4-4f9e-99a4-620bb2dd8b93` 后执行，状态已完成但文档内容整体空白。需要确认两次执行是否命中相同发布快照，以及空白发生在参数装配、运行时映射还是渲染阶段。
- **Goal**: 通过运行时证据明确两个执行单的 `publishedSkillId / releaseId / sourceSnapshotId / normalizedInput / render_data` 差异，定位“后执行反而整份空白”的直接原因。

## Reproduction
1. 对比执行单 `c1e55b82-1c7c-4806-bc37-3e477bb5393f` 与 `7ed5e567-23b4-4f9e-99a4-620bb2dd8b93`。
2. 检查两者命中的 skill/release/snapshot。
3. 检查 planner 快照、control-plane 运行时请求、最终渲染 payload 是否一致。

## Hypotheses
1. 两个执行单命中的 `publishedSkillId` 或 `sourceSnapshotId` 不同，后一个执行单实际运行了不同快照。
2. 两个执行单命中同一快照，但 `7ed5...` 的 `normalizedInput.paramResolution` 或 `input.data` 在运行时构造时丢失，导致 `render_data` 近乎为空。
3. `7ed5...` 的 workflow/activity 返回成功，但系统没有校验渲染内容质量，空文档被误标记为已完成。
4. `c1e55...` 的 `[object Object]` 与 `7ed5...` 的整份空白不是同一根因，前者是局部 locale 对象未拆值，后者是整体映射失效。
5. 新发布模板定义本身没有明显缺陷，问题出在执行时缓存、会话快照或参数结构漂移。

## Constraints
- Steps 1-4 不修改业务逻辑。
- 第一处对现有代码的改动只能是插桩。
- 先拿到两个执行单的运行时证据，再决定是否需要修复。

## Evidence
- `current-empty-doc-execution.json`、`current-empty-doc-execution-after-submit.json`、`current-empty-doc-submit-response.json` 三份样本中，关键参数的 `paramResolution.render_path` 和 `template_binding` 从执行单创建前到提交后始终为空，说明映射不是在 `submit-input` 阶段丢失，而是在 planner 构造 execution snapshot 时就缺失了。
- `execution.service.ts:4689-4730` 的 `reconcileParamResolutionWithSubmittedInput()` 只会保留并覆盖已有 `entry` 字段，不会主动清空 `render_path/template_binding`；因此空白更早发生。
- `planner.service.ts:763-919` 的 `buildRequiredInputs()` 会优先从 `matchedSkill.paramsSchema.properties[*].renderPath` 或 `workflowInputPolicy.params[*].templateBinding` 写入 `render_path/template_binding`。当前执行快照没有这些字段，说明 `matchedSkill` 对应元数据缺失。
- `planner.service.ts:327-388` 与 `440-518` 显示，planner 只有拿到 `apiEndpoints.runtimeMetadata.mappingHints` 或 `workflowInputPolicy` 时，才会把 runtime 映射补回 `paramsSchema`。
- `tech_service_skill_detail.json` 展示的某个 skill 详情中，`paramsSchema.renderPath`、`runtimeMetadata.mappingHints`、`workflowInputPolicy` 是完整的；但该 skill id 为 `75701359-1e26-428b-992d-a9c087fe0630`，不是本次执行命中的 `b49a3dcb-3ae2-4343-a2c5-bf7c67354024`。
- `tech_service_e2e_chat_response.json` 中，命中 `b49a3dcb-3ae2-4343-a2c5-bf7c67354024` 的 planner `required_inputs` 实际带有 `render_path`，但识别结果本身已经明显退化，例如 `payment.method`、`service.period`、`contract.partyA.name` 都带入了英文说明残句。
- 同一份 `tech_service_e2e_chat_response.json` 的参数识别提示里，`payment.bankAccount` 被定义为 `number`；而 `tech_service_skill_detail.json` 中正常 skill 详情里的 `payment.bankAccount` 为 `string` 且带双语 `renderPath`。这说明至少存在两份不一致的 skill 元数据快照。
- `current-empty-doc-execution-after-submit.json` 中执行结果显示 `status=succeeded`、`resultJson.status=rendered` 且有 `downloadUrl`，即使文档内容空白，系统仍然判成功，验证了“空文档误判完成”的假设。

## Conclusion
- 当前更可信的主因不是“后发布模板文件本身坏了”，而是执行单命中的 skill 元数据快照发生了退化或不一致，导致 planner/execution snapshot 缺少稳定映射信息，同时参数识别质量也明显下降。
- `c1e55...` 与 `7ed5...` 大概率共享同一类链路问题，但表现层次不同：前者更像“识别值退化 + 局部对象拆值异常”，后者更像“映射信息缺失或不足 + 识别值退化”，最终造成整份文档近似空白。
- 下一步需要直接抓取线上 `b49a3dcb...` 的 skill 详情与两个 execution 的 live 明细，确认它们是否命中了不同的 `runtimeMetadata/workflowInputPolicy` 快照。
