# NDA 工作流重新审计：1f11a245

日期：2026-09-30。业务时间使用北京时间，数据库原始时间为 UTC。

主执行：`1f11a245-60fe-4a65-81da-3974f50a07e7`。

关联执行：

- 智能审查：`3d12eebc-a227-4383-81ba-20e9cf29d66e`
- PDF 生成：`09af5c31-aa9e-49b7-9700-a16785f25fbf`
- 内部通知：`59c4f279-a887-4760-afac-963f24bded7c`

审计依据：当前工作区代码与 diff、数据库只读查询、运行服务日志、实际 DOCX、最终 PDF、流程管理空间物理文件和针对性测试。审计没有创建、审批或修改业务任务。

## 第一段：本次真实执行链路

本次“生成 → 发起人确认 → 智能审查 → 法务审批 → PDF → 内部通知 → 流程空间归档”全部真实运行，未发现本次正常路径进入直接降级。

| 环节 | 结果 |
| --- | --- |
| 初稿生成 | 21:43:36 成功；技能 `16fb88e9-ba9c-4ab7-b508-f23adb1a821a` |
| 主执行组织 | `org_id=e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c`，已修复上次为空的问题 |
| 初稿 DOCX | 19,448 字节；下载件 SHA-256 `8031b4a74467cff731c987c00346929bb69559a95b1fa672f9d8c29a7c0b79e2` |
| 发起人 GTD | inbox `001be415-ba17-48b8-ab8e-e533a141c4b8`；admin 于 21:43:47 发送 |
| 智能审查 | `platform.document.contract-reviewer`；确定性计划 frozen；执行成功 |
| 审查结论 | 31 分、HIGH；12 条，2 高风险、5 中风险、1 缺失、5 通过 |
| 法务 GTD | inbox `8ba85af2-3818-4b8a-82d4-6046fce8b8fc`；law01 于 21:45:27 批准 |
| PDF | 3 页，137,733 字节；SHA-256 `51006ca20cf7e52f090d5c85c3d1644a8c4ec6c50e2d3304547efdc9e921b254` |
| 内部通知 | 正式调用 `platform.notification.internal-message`，创建真实 inbox `950e67c5-577f-4f20-b701-33ffb25085f8` |
| 归档 | `LEGAL-ARC-927855`，真实保存 PDF、DOCX、HTML、两份 Markdown，共 5 个文件 |

流程管理空间物理 PDF 重新计算的 SHA-256 与 execution artifact 完全一致；归档 DOCX 也与下载件哈希一致。因此本次最终文件归档已从“数据库引用”提升为真实二进制归档。

## 第二段：已修复与仍未通过的问题

### 已确认修复

1. 四个关联 execution 均写入正确 `org_id`。
2. 风险报告仍正确传递为 31/HIGH，没有回归为 100/LOW。
3. 通知能力不再只写日志：本次真实创建发起人 GTD inbox，并返回持久化 UUID。
4. 通知失败的 stage-engine 分支会保持 in_progress，不再直接 completed。
5. 最终 PDF 已进入流程管理空间，且物理文件哈希与原 artifact 一致。
6. 发起人与法务审批 action 现在包含当时合同附件引用。
7. 未知通用自动化能力已改为抛错，不再返回虚假 LOW/100。
8. 直接审查路径缺失 metrics 时会失败，不再默认 100 分。

### P0：首阶段技能被直接硬编码，仍不是配置驱动

`chat-orchestrator.service.ts` 在多个分支直接写死：

`16fb88e9-ba9c-4ab7-b508-f23adb1a821a`

并直接改写 `planDraft.skill_match.skill_id`。`deterministic-task-execution.service.ts` 也再次写死相同 UUID。运行时没有从 `OrgWorkflowService` 的已发布工作流、submission 节点和版本快照解析这个技能。

因此本次调用了正确技能，但答案仍然是：**存在明确硬编码，而且工作流页面上修改首节点绑定不会可靠改变实际执行技能。**

修改要求：建立服务端 binding resolver，输入为 `orgId + workflowId + definitionVersion + stageId`，输出 immutable skill/capability binding。对话层不得知道 NDA 技能 UUID，更不能改写 planner 结果。

### P0：真实 GTD 回执没有任何合同附件

通知节点创建的 inbox `950e67c5…` 确实存在，但：

- `attachments=[]`
- `workflowId=null`
- `orgId=null`
- `sourceRefId` 是通知 execution ID，而不是原协同任务 ID
- 没有风险报告、PDF URL或归档 tracking number 的结构化载荷

原因是 runner 把附件放在 `taskContext.attachments`，而 handler 读取顶层 `input.attachments` 和 `input.metadata`。两端契约不一致。action processor 看到 `receiptExecutionId` 后又跳过旧的富回执创建逻辑，于是最终只剩一张空回执卡片。

这意味着“发送到发起者 GTD 收件箱”形式上完成，但“把最终合同交付给发起人”的业务目标未完成。

修改要求：定义通知 input schema，至少传递 `taskId/workflowId/orgId/trackingNumber/attachments/reviewSummary/operator`；handler 应读取同一 schema。增加验收：发起人回执必须能直接打开与归档哈希一致的 PDF。

### P0：Control Plane 不可用时仍会生成假通知成功

正常路径已经真实投递，但 `executeAutomationStage` 对网络错误和 90 秒超时仍回退 direct；`executeNotificationDirect` 依旧用 `notif_${Date.now()}` 返回“已成功送达”，没有写 inbox。

因此本次通过不能证明故障路径正确。通知节点必须 fail closed，或调用同一个持久化通知 adapter；不得保留模拟成功 fallback。

### P1：Outbox 不是完整可靠投递

本次写入 Outbox `24025277-da65-4478-8cae-2dc0b688dbdc`，但至审计时仍为：

- `published_at=null`
- `attempts=0`
- `claimed_by=null`

现有两个 dispatcher 只消费 `execution.ready` 和 `schedule.fire.created`，没有消费者处理 `notification.internal_message.delivered`。此外 inbox create 与 outbox enqueue 不在同一数据库事务中，enqueue 失败会被 catch 后继续返回 delivered。

修改要求：若 Outbox 只是审计记录，不应称其保证投递；若用于可靠投递，应在同一事务写 inbox+outbox，并增加对应消费者、发布状态和失败重试。

### P1：组织 ID 的写入方式可被请求参数冒充

`resolveEffectiveOrgId` 优先接受 DTO/input/metadata 中任意合法 UUID，没有验证当前用户是否属于该组织。Controller 也只在 dto.orgId 缺失时填认证组织，不会覆盖客户端传入值。

修改要求：普通请求必须使用认证上下文的 organizationId；显式 orgId 只能用于经过授权的内部服务，并校验 membership/scope。

### P1：获批文件版本仍没有哈希级绑定

本次法务 action 已记录 DOCX URL，这是改善；但 attachment 没有二进制 SHA-256 或 artifactId。实际 DOCX 哈希为 `8031b4...`，审查报告中的 `sourceDocumentVersion=sha256:9d7bfc...` 是正文文本哈希，两者不是同一概念。PDF 页脚仍写“已关联业务执行单记录”，没有写源 DOCX 哈希。

修改要求：审批 action 固化 `approvedArtifactId/versionId/binarySha256/contentSha256`，PDF 节点只接受该版本，并在归档节点和备案单中保存源、目标双哈希。

### P1：归档完整性检查只警告，不阻断

本次五个文件齐全，但 `WorkspaceProcessArchiveService` 对 `hasSourceDoc/hasFinalPdf/hasReviewReport` 不满足只打印 warning，仍返回成功；action processor 也 catch 归档异常继续结束流程。

修改要求：将工作流配置中的 required deliverables 作为门禁，缺 PDF、获批源文件或报告时保持 completion_pending，并允许可靠重试。

### P1：PDF 仍是重组文档，不是获批 DOCX 的忠实转换

视觉检查发现：

- 页首标题重复。
- 正文出现“豆包有限公司公司”。
- “合作业务事由”直接保留整段原始用户话术。
- 自动加入未由用户明确确认的“3 年”摘要。
- 第 10 条标题孤立在第 2 页，正文在第 3 页。
- 原签署表格被展平，甲乙方、地址和签名字段挤在连续文本中。
- 代码固定写“甲方（披露方）/乙方（接收方）”，对互相披露型 NDA 不一定成立。

PDF 没有数字签名字段。系统计算了 SHA-256，但文案仍称“电子签名与哈希校验”“不可篡改归档”，证据表述过度。

建议直接把获批 DOCX 转为 PDF，另附独立审计凭证页；不要从 reviewReport.clauses 重建合同正文。

### P2：状态和血缘仍存在双真相

- 顶层 `currentStage=final_receipt`，但 `parameters.currentStage=initiator_confirm`。
- 法务任务顶层 executionId 是审查执行，归档/通知靠其他字段关联。
- 生成 execution 仍没有 `execution_artifacts` 正式产物记录。
- 流程管理空间节点 `digest_json` 为空，虽然物理文件哈希此次人工验证一致。

建议引入 `workflowInstanceId` 和 stage execution 表，把当前节点、节点执行、审批版本和成果物作为规范化实体，不再复制多份 JSON 状态。

### P1：自动化测试基线未恢复

审计运行结果：

- `builtin-handler-registry.aliases.test.ts`：1/1 通过，但仅验证 handler alias，没有覆盖通知持久化。
- `workbench-coordination.test.ts`：26 项中 17 项失败、9 项通过。

主要失败原因是 CAS 新增 `$executeRaw`，测试 Prisma mock 没有同步；另有旧测试数据未提供合同附件，被新的送审门禁拒绝。线上样例成功不能替代回归测试，当前不应进入生产验收。

## 第三段：建议修改顺序与重新验收

第一批，先修业务交付真实性：

1. 修正通知 input/output contract，让发起人 GTD 回执携带 PDF、tracking number、workflow/task/org 关联。
2. 删除 `executeNotificationDirect` 的模拟成功；通知失败必须可重试且不完成流程。
3. 用真实配置解析首阶段技能，删除三个位置的 NDA 技能 UUID 硬编码。
4. 恢复 26 项工作台测试并新增通知、归档、故障注入用例。

第二批，修可靠性与证据链：

1. inbox + outbox 同事务，并提供 notification 事件消费者，或删除无效 Outbox 说法。
2. 审批绑定 DOCX artifact/version 和双哈希。
3. 归档缺必需文件时阻断终态。
4. orgId 只取可信认证上下文并做 membership 校验。

第三批，修合同产物质量：

1. 直接转换获批 DOCX，不再从条款列表重排。
2. 修复标题重复、“公司公司”、原始提示词泄漏、签署表格和分页问题。
3. 把哈希、电子签名、时间戳、不可篡改存储分开表述。

重新验收至少覆盖：

- 在工作流配置里替换生成技能，新 execution 的 skillId 必须随之变化。
- Control Plane 停止时，通知不得产生假成功。
- 发起人最终回执包含 PDF，PDF 哈希与流程空间文件一致。
- Outbox 被实际消费或明确不作为投递机制。
- 双击发送只创建一套审查/法务节点。
- 替换 DOCX 后旧审查失效并重新审查。
- 归档缺 PDF 时流程不能 completed。
- 伪造其他 orgId 的执行请求被拒绝。
- 工作台协调测试全部通过。

## 最终判断

本次相较上一轮有明显、可验证的实质改善：组织血缘、真实通知、真实 PDF 归档和风险结果均已跑通。但发起人收到的回执没有合同附件，首阶段技能改成了显式 UUID 硬编码，通知故障路径仍能假成功，且 17 项协调测试失败。

因此当前判定为：**主干运行通过；业务交付和配置驱动未通过；不建议生产验收。**
