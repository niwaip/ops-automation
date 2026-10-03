# NDA 工作流完整复审报告：e291dd57

日期：2026-09-30。报告中的业务时间按北京时间表述，数据库原始时间为 UTC。

主生成执行：`e291dd57-c920-4308-bb65-b42d1fcbdad5`。

关联执行：

- 智能审查：`8e39bfdd-fb8b-485e-a4be-3b5a4afa2f32`
- PDF 生成：`954a71db-8e19-4cef-9522-31054f1bb84c`
- 回执通知：`ba1916a5-0fca-4c7a-8553-9c357a29ed6b`

审计范围：当前工作区代码、数据库只读记录、相关服务日志、生成的 DOCX、HTML 审查报告和最终 PDF。审计期间没有发起、审批、修改或归档任何业务任务，也没有运行会改变业务状态的端到端脚本。

## 一、结论

本次执行真实完成了“生成合同 → 发起人 GTD 确认 → 智能审查 → 法务 GTD 审批 → PDF 生成 → 发起人 GTD 回执”。合同审查结果正确传递为 31 分、HIGH，上一轮将风险错误转换为 100 分 LOW 的问题已修复。PDF 也确实由正式能力节点生成，并登记了哈希和 execution artifact。

但当前不能作为完整生产闭环验收通过，原因有三项：

1. `platform.notification.internal-message` 虽被正式计划调用，但处理器只写日志并返回模拟通知 ID，没有写通知表、Outbox 或调用通知服务。发起者实际看到的 GTD 回执，是 `coordination-action.processor.ts` 另一段直接创建 inbox item 的代码完成的。
2. 最终 PDF 出现在法务任务和发起人 GTD 回执中，却没有进入“流程管理空间”。归档空间实际只有 DOCX、HTML 和两份 Markdown。
3. 组织工作流配置声明首阶段应调用 `ConfidentialityAgreementGenerationWorkflow`，本次实际也恰好调用了对应发布技能，但运行时没有根据工作流发布版本强制解析并校验该绑定，仍由 planner 的 `skill_match.skill_id` 决定。因此这次结果正确，机制仍可能漂移。

综合判定：**有条件通过功能联调，不通过生产级闭环验收**。

## 二、实际执行链路

| 环节 | 真实结果 | 证据摘要 |
| --- | --- | --- |
| 初稿生成 | 成功 | 20:19:37 执行；`single_skill/custom`；技能 ID `16fb88e9-ba9c-4ab7-b508-f23adb1a821a`；结果名 `ConfidentialityAgreementGenerationWorkflow` |
| 合同参数 | 正确 | 甲方豆包有限公司、地址北京王府井大街1000号；乙方富士通；事项 AI 模型开发；日期 2026-09-30 |
| DOCX | 成功 | `保密合同_豆包有限公司_v1_20260930.docx`，19,448 字节；二进制 SHA-256 `53aaca9c99352580333a36f457aa604821aaa2dec94551d6ad21d238f5460269` |
| 发起人 GTD | 成功 | inbox `3c52e095-2c86-4d6e-8d35-5fd96b990f78`；admin 于 20:21:12 approve |
| 智能审查 | 成功 | deterministic plan 已冻结；能力 `platform.document.contract-reviewer`；执行 `8e39bfdd…` |
| 审查输出 | 正确传递 | 31 分、HIGH；12 个条款、2 个高风险、5 个中风险、1 个缺失、5 个通过；HTML 371,999 字节 |
| 法务 GTD | 成功 | inbox `9306ebc6-637b-4d34-8791-499b29e0753f`；同组织法务用户 law01 于 20:22:21 approve |
| PDF 能力 | 成功 | `platform.document.pdf-create`；执行 `954a71db…`；3 页、137,729 字节 |
| PDF 校验 | 成功 | execution artifact 已登记；下载文件 SHA-256 与记录一致：`beb5af83130ede7c12d89480e78d1b07a72c7184e62dd8b5a5894763a971b86e` |
| 通知能力 | 形式成功、实际未投递 | 执行 `ba1916a5…` 返回 `notif_...`，但处理器仅日志 + 模拟返回 |
| 发起人回执 | 真实成功 | inbox `f50c789f-f4bc-41cc-823c-a434ad63e74b`，由 action processor 直接写数据库；包含 PDF、DOCX、HTML |
| 流程管理空间 | 部分成功 | 归档文件夹 `LEGAL-ARC-941808` 创建成功，但只有 DOCX、HTML 和两份 Markdown，缺最终 PDF |

PDF 文本核对显示，DOCX 中有意义的长文本均能在 PDF 中找到；PDF 下载哈希与数据库登记相符。PDF 没有 AcroForm 或数字签名字段，因此它是“带 SHA-256 的归档副本”，不能称为已完成电子签名或天然不可篡改文件。

## 三、已确认修复

1. 审查结果封装已解包。本次原始审查与 GTD 中均为 31 分、HIGH，没有再次出现 100 分 LOW。
2. 初稿执行已携带 `task-context/v1`、工作流 ID、`draft_submission` 和 `workbench_coordination` 触发类型。
3. 下游审查、PDF、通知三个节点均通过 Control Plane 确定性计划执行；计划状态为 frozen，节点状态 succeeded。
4. 甲乙方映射本次正确：豆包有限公司为甲方，富士通为乙方。
5. 无获批正文时不再拼接固定合同正文，代码已改为阻断。
6. 组织 ID 已进入初稿、法务任务及最终回执 payload；本次 law01 与 admin 属于同一组织。
7. 发送动作增加 CAS 条件更新，重复点击保护较上一版明显改善。
8. 最终 PDF 已放入任务顶层附件，并记录真实 SHA-256。

## 四、必须优先修改的问题

### P0：通知技能是假成功

`builtin-handler-registry.service.ts:121-134` 的 `platform.notification.internal-message` 只读取 recipient/title、写一条日志，然后用 `Date.now()` 构造 `notificationId` 返回成功。它没有调用 `NotificationService`，没有持久化通知，也没有 Outbox/投递回执。

同时，`coordination-stage-engine.service.ts:593-611` 即使通知阶段三次重试后失败，也仍会在 `:613-620` 返回 completed。因此“通知节点成功”不是流程完成的可靠条件。

修改建议：

- 让能力处理器调用统一的通知应用服务，写 `notifications`/Outbox；返回持久化 ID。
- 区分 `accepted`、`persisted`、`delivered`，不要在尚未投递时返回 delivered。
- 若工作流把回执定义为必达节点，失败必须使流程进入 `completion_pending`/retryable，而不是 completed。
- GTD 回执与通知能力二选一作为权威实现，或让通知能力内部调用 GTD inbox adapter；禁止两套互不关联的投递逻辑。

### P0：最终 PDF 未进入流程管理空间

`coordination-action.processor.ts:542-563` 调归档时传入的是审批前的 `payload.attachments`，不是包含 PDF 的 `finalAttachments`/`updatedPayload.attachments`。因此数据库实际归档文件只有：

- DOCX 19,448 字节
- HTML 371,999 字节
- 审查报告 Markdown
- 流程备案 Markdown

修改建议：归档参数改用终态附件快照，且归档完成后校验必需成果物集合至少包含获批源文件、最终 PDF、审查报告。缺任意一项时不能宣称归档完成。

### P1：首阶段技能没有被工作流配置强制绑定

配置中 `DEFAULT_NDA_ASSEMBLED_WORKFLOWS` 确实声明 `ConfidentialityAgreementGenerationWorkflow`，本次运行结果也与之吻合。但对话执行仍直接使用 `planDraft.skill_match.skill_id` 创建 execution；`taskContext.workflowId/stageId` 只是上下文，没有参与“从发布的工作流版本解析首阶段能力并校验 skill ID”。

修改建议：服务端根据 `orgId + workflowId + publishedVersion + stageId` 解析能力绑定，生成 immutable binding snapshot，随后用解析出的 skill ID 创建执行。planner 只能填参数或建议候选，不能覆盖锁定绑定。增加测试：修改工作流首节点技能后，新执行必须随配置切换；未发布或绑定不存在必须失败。

### P1：配置仍存在硬编码和非持久化

- 前端 `workflowNaturalLanguageRouter.ts` 和 `useChatPageActions.ts` 用名称正则决定 workflowId。
- 预置工作流在 `OrgWorkflowService` 内存 Map 中维护，运行时修改缺少可靠的版本化持久化快照。
- `myPosition: buyer`、通知/PDF fallback 能力、默认三年期限等仍写在代码或种子配置中。

预置默认值本身可以在 seed 中存在；问题在于运行时把它们当成权威配置，且执行记录没有完整绑定版本。建议前端只传选中的 workflowId；后端读取已发布定义并固化 `workflowInstanceId`、`definitionVersion`、`bindingSnapshotHash`。

### P1：失败降级仍可能产生伪成功

`executeAutomationStage` 对除 HTTP 400/403 外的 Control Plane 错误会进入直接执行。直接审查路径仍在缺指标时使用 `healthScore ?? 100`；未知自动化能力直接返回 LOW/100 和“执行通过”。这会重新引入“失败被包装为成功”的风险。

修改建议：

- 缺 metrics 一律失败，不允许默认 100。
- 未知能力一律 `unsupported_capability`，不能生成成功报告。
- 只有明确列入 allowlist 且具备相同输入输出契约的能力才允许降级。
- 已创建 execution 超时后恢复/查询同一 execution，不能重新直调造成重复副作用。

### P1：文件版本与审批没有形成不可抵赖绑定

审查报告的 `sourceDocumentVersion` 是抽取正文的 SHA-256，不是 DOCX 二进制哈希。审批 action 的 attachments 是空数组；最终 PDF 页脚在取不到源哈希时写“已关联业务执行单记录”。因此还不能证明 law01 批准的就是后来转成 PDF 的精确字节版本。

修改建议：审批时固化 `approvedArtifactId + binarySha256 + contentSha256 + versionId`；PDF 节点只接受该版本；归档凭证记录源 DOCX 哈希、PDF 哈希、审批人、审批时间和配置版本。若法务替换文件，必须重新审查并清除旧报告。

### P1：替换文件后可能继续使用旧审查条款

PDF 组装优先读取 `reviewReport.clauses`，其次才解析 active attachment。若法务上传修订文件但旧 reviewReport 仍在，可能把旧条款生成成新 PDF。

修改建议：附件版本变化必须使 reviewReport 失效并重新运行审查；PDF 节点按 approved version 直接转换，不应优先消费缓存条款。

## 五、次优先级问题

1. 四个 execution 的 `org_id` 都是 null，尽管 GTD payload 有 orgId。组织隔离不应只依赖 JSON payload。
2. `parameters.currentStage` 仍停在 `initiator_confirm`，顶层 `currentStage` 已到 `final_receipt`，存在双真相。
3. 生成 DOCX 没有登记 `execution_artifacts`；生成执行 artifactCount=0。
4. PDF 是重排生成，不是忠实版式转换：标题重复，签署表格被展平成文本，第 10 条标题孤立在上一页底部；“披露方/接收方”角色由代码固定推断。
5. 文案称“电子签名与哈希校验”“不可篡改归档完成”，但本次仅计算 SHA-256，没有电子签名、时间戳服务或 WORM 存储证据。
6. 高风险 31 分仍允许法务普通 approve。若业务要求高风险强管控，应要求覆盖理由、二级审批或阻断阈值；当前行为不一定是技术错误，但政策需明确。
7. `CoordinationAutomationRunnerService` 已 1329 行，超过仓库 1200 行评估阈值；应拆为计划编译、结果适配、审查执行、PDF 归档、通知适配等模块。
8. 日志出现 runtime defaults flow 404 后继续执行，应修复 flow 引用或将缺失定义显式视为配置错误。

## 六、建议修改顺序与验收标准

第一批：修生产真实性。

1. 实现真实通知 adapter/Outbox，并让终态受通知策略控制。
2. 用终态附件归档最终 PDF，并做归档必需文件校验。
3. 去除所有缺指标、未知能力的 LOW/100 成功兜底。
4. 固化获批文件版本与源/PDF 哈希链。

第二批：修配置驱动。

1. 建立持久化、版本化的工作流定义与实例表。
2. 后端按发布版本解析所有 stage binding，首阶段也必须一致。
3. 前端不再根据中文名称正则推断 workflowId。
4. execution、task、artifact、notification 全部带 orgId 和 workflowInstanceId。

第三批：修可靠性和维护性。

1. 将 setImmediate 后台处理改为持久化队列/Outbox worker。
2. 为实例推进建立唯一键、幂等键和租约恢复。
3. 拆分超大 runner/service。
4. 增加失败注入和并发测试。

最小验收用例：

- 修改工作流首阶段绑定，实际 skill ID 必须随配置变化。
- 通知服务不可用时，流程不能显示“通知已送达”；恢复后同一 Outbox 只投递一次。
- 双击发送只产生一个审查 execution 和一个法务 GTD。
- 法务替换 DOCX 后必须重新审查，旧报告不能生成 PDF。
- 流程管理空间必须包含与 GTD 回执 SHA-256 一致的最终 PDF。
- 重启 platform/control-plane 后，进行中的流程可以恢复。
- 跨组织用户不能读取、审批或复用对方 execution/artifact。
- 缺 metrics、未知能力、PDF 生成失败、归档失败均不得返回 completed。

## 七、最终判断

这次不是“页面演示式硬编码流转”：审查、法务路由、PDF 能力、数据库 GTD 和流程管理空间都发生了真实调用。但它也不是完全配置驱动的生产工作流：首节点绑定未被服务端强制执行，通知技能是假实现，最终 PDF 未真正归档，多个 fallback 仍能制造成功结果。

因此当前最准确的状态是：**主干业务链路真实；风险评分修复有效；配置绑定、通知真实性、最终归档和版本证据链仍未闭环。**
