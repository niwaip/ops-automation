# NDA 工作流重新审计（2026-09-30）

审计执行单：`095f9740-1a72-49e1-96a3-27fc0a7b1a6c`。

工作流：`legal.nda.generation_and_review_flow`。

本报告依据当前工作区代码、用户修改的 diff、运行容器日志、数据库记录和文档下载接口。审计未执行发送、审批、归档操作，也未运行会创建并审批业务任务的 `scripts/verify-nda-e2e.mjs`。时间使用北京时间。

## 1. 审计结论

“生成真实 DOCX，然后把本次 DOCX 交付到 GTD”的正常路径已经修复。当前执行单与 GTD 的关联正确，附件可以下载。

但“组织工作流指定技能并驱动完整执行”尚未实现。首阶段仍由聊天编排器独立匹配技能，前端在流结束后创建协同工单。后续标准 Control Plane 调度存在确定性计划格式错误，已有测试实际走文档服务直调。归档虽然开始生成真实 PDF，但内容是参数摘要，不是获批合同全文。

当前执行单本身尚未发送送审；不能据其 succeeded 判定六阶段工作流已完成。

## 2. 本次执行的运行证据

| 项目 | 记录 |
| --- | --- |
| 生成开始 | 2026-09-30 17:54:55.826 |
| 生成完成 | 2026-09-30 17:54:56.004 |
| 执行状态 | succeeded |
| 发布能力 ID | 16fb88e9-ba9c-4ab7-b508-f23adb1a821a |
| 结果技能名称 | ConfidentialityAgreementGenerationWorkflow |
| 执行模式 / runtime | single_skill / custom |
| trigger_type / taskContext / workflowId | 空 |
| 文件 | 保密合同_豆包有限公司_v1_20260930.docx |
| 文档下载标识 | 084dea90-f49e-4654-8b7a-0d862620d6ac |
| 下载接口 | HTTP 200，DOCX MIME，19448 字节 |
| GTD 创建 | 2026-09-30 17:55:01.146 |
| GTD ID | 046fb78c-3993-4693-b8c3-8b88b7214bc8 |
| 协同任务 ID | coord_65369af6-6ba7-48f7-a1a8-c6f98d1931cd |
| GTD 工作流 / 阶段 | legal.nda.generation_and_review_flow / initiator_confirm |
| GTD 执行关联 | parameters.executionId 精确指向本次执行单 |
| GTD 附件 | 1 个，对应本次 DOCX 下载标识 |
| GTD 状态 | unprocessed / pending |
| 本次下游审查、法务任务 | 未发现 |
| 正式 execution_artifacts 记录 | 0 条；附件没有 artifactId、SHA-256 和 size |

本次技能输入正确包含：甲方豆包有限公司、乙方富士通、甲方地址北京王府井大街1000号、合作主题 ai模型开发。此处核对的是执行输入与附件关联，未作合同内容或版式的完整审查。

## 3. 已改善事项

1. 删除前端提前并行创建 GTD 的路径，改为流结束后交付 executionId 和产物信息。本次运行确认 GTD 晚于生成完成。
2. 删除固定技能 UUID 查询全库最近成功执行的兜底，改为按 executionId 精确查询。本次附件关联正确。
3. 增加发送时无文件/无条款内容拦截，删除自动拼接通用 NDA 的审查输入兜底。
4. 合同审查服务失败后不再调用本地启发式报告伪装成功；该失败分支已在代码中修正，本次未注入失败验证。
5. 增加承办人校验与运行中重复提交拦截；仍存在下面列出的权限与并发缺口。
6. PDF 直调开始调用真实 PDF 引擎，并返回 URL 和 SHA-256。已有独立测试样本在 17:53:11 产生真实归档产物记录，不能据此证明本次合同已归档。

## 4. 待修复问题

### F1 / P1：组织工作流仍未驱动首阶段技能

位置：`apps/frontend/user-web/src/features/chat/hooks/useChatPageActions.ts:182`、`apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:204`、`apps/backend/governance/workbench/src/coordination/org-base-workflow-templates.constants.ts:43`。

生成执行单仍无工作流上下文。triggerEvent 只存在于定义、类型中，未找到后端运行时消费入口。更改管理台 NDA 生成技能不能保证聊天编排器改用该能力。

修复：传递结构化 workflowId；后端基于已发布版本解析 submission 的能力，创建实例并派发执行。技能调用必须携带实例、版本、阶段关联。工作流名称只用于展示。

### F2 / P1：标准调度实际因计划格式错误失败，被直调掩盖

位置：`apps/backend/governance/workbench/src/coordination/coordination-automation-runner.service.ts:160`、`:45`。

17:51、17:53 的已有测试日志显示 Control Plane 返回 HTTP 400，错误为 PLAN_SCHEMA_INVALID：节点 failurePolicy 为 undefined。调用器随后直接访问文档领域服务，并在完成后手工补写 succeeded 执行记录。

修复：使用共享 deterministic-plan 合约和编译器，补齐 failurePolicy: abort，并校验其他必填字段。400、403、配置/校验错误禁止静默降级；允许降级的条件必须显式配置并记录。验证生成执行计划能通过控制面 validator，而不只是最终有报告。

PDF 节点目前还复用了审查节点的 handlerKey、输入绑定和输出契约；恢复标准调度时需同步按实际能力构建 PDF 计划。

### F3 / P1：PDF 是业务参数摘要，不是获批合同的最终版本

位置：`apps/backend/governance/workbench/src/coordination/coordination-automation-runner.service.ts:748`。

PDF 输入只有标题、签约主体、签署日期、期限、存证说明和 remarks，未读取 activeAttachment 的内容，也未转换 DOCX。当前 GTD 使用 ourParty/ourRole/counterpartyRole，PDF 却读取 partyAName/partyBName 等字段，本次路径可能回退为甲方“我方企业”、乙方“豆包有限公司”。

修复：归档输入必须是法务实际批准的 artifactId/documentVersion；把该完整 DOCX 转为 PDF，或使用经过批准的完整合同模型渲染。保留源文档哈希、PDF 哈希、来源版本。摘要凭证可以单独生成，但不能冒充合同 PDF。SHA-256 是完整性校验，不足以单独证明不可篡改存储。

### F4 / P1：初稿担当仍从成员列表取第一人

位置：`apps/frontend/user-web/src/features/chat/lib/workflowNaturalLanguageRouter.ts:24`、`:380`。

resolveAssignee() 无参数时取列表第一人，接口按用户名排序；异常还回退 admin。并没有使用当前登录用户。此次 admin 发起且 admin 接收恰好正常，普通员工发起可能把初稿发给 admin。

修复：initiator_confirm 的担当由后端通过认证用户和 approverRule=initiator 解析；前端不能猜发起人，也不能用 admin 静默兜底。

### F5 / P1：组织隔离条件没有可靠生效

位置：`apps/backend/governance/workbench/src/coordination/workbench-coordination.service.ts:582`、`apps/backend/governance/workbench/src/coordination/coordination-collaborator.service.ts:112`、`:174`、`:240`、`:357`。

WorkbenchInboxItem 模型没有 orgId，resolveUser 只返回 id/username/email，故新增 targetItem.orgId 和 operator.orgId 条件无法生效。部门路由只在查到发起人组织时过滤；未查到则无过滤。指定用户/指定部门成员校验、角色查询仍有跨组织路径。多组织用户的 findFirst 也没有明确本次任务的组织。

修复：任务和实例存储明确 orgId，从当前认证组织上下文获得。全部人员、部门、角色、执行单、附件查询带相同 orgId。无组织上下文时阻止流转。管理员代办依据角色/授权校验并记录，不能依据 username=admin 判断。

### F6 / P1：重复发送拦截存在并发窗口，任务重启不可恢复

位置：`apps/backend/governance/workbench/src/coordination/workbench-coordination.service.ts:587`、`:900`、`:931`。

先读取状态再更新，两个并发请求可同时读到未运行并同时执行。setImmediate 没有持久化任务；进程退出会丢失工作。异步最外层异常只打日志，人员路由等异常可能留下 running/inTransit 状态。

修复：数据库条件更新/CAS 或实例锁，添加动作幂等键；同一实例同一阶段同一文档版本只有一个有效执行。使用持久化任务/Outbox/Temporal，并保证失败写回及可恢复重试。

### F7 / P1：流结束不等于技能 succeeded，GTD 创建仍依赖浏览器

位置：`apps/frontend/user-web/src/features/chat/hooks/useChatStreaming.ts:199`、`apps/frontend/user-web/src/features/chat/lib/workflowNaturalLanguageRouter.ts:399`。

没有在创建 GTD 前显式校验执行 succeeded 和有效文档，artifactContext 空对象也满足创建条件。executionId 还可能回退到跨流共享 activeExecutionIdRef。用户关闭页面、转后台或网络断开可能使成功文档没有协同工单；创建失败仅 console.warn。

修复：由后端消费 execution.succeeded 事件创建/更新对应 GTD，按实例/执行单幂等。前端仅显示状态。事件必须附带同一执行单的有效文档产物。

### F8 / P2：终态和正式产物登记仍不完整

位置：`apps/backend/governance/workbench/src/coordination/coordination-stage-engine.service.ts:559`、`apps/backend/governance/workbench/src/coordination/coordination-action.processor.ts:280`。

独立测试样本已产生归档 PDF 和回执，但 payload.status 仍为 approved，currentStage 仍为 legal_review；final_receipt 只出现在 externalSyncResult 中。PDF 放在 detail，回执顶层 attachments 仍继承上一版本文档。当前生成执行单没有正式 execution_artifacts 记录。

修复：最终归档与通知成功后更新实例为 completed、currentStage=final_receipt；回执明确列出最终 PDF、原始 DOCX、审查报告及其版本。所有产物进入正式表，不只放在自由 JSON。

### F9 / P2：定义持久化、能力匹配和未知能力兜底仍需整理

位置：`apps/backend/governance/workbench/src/coordination/org-workflow.service.ts:38`、`apps/backend/governance/workbench/src/coordination/coordination-stage-engine.service.ts:666`、`apps/backend/governance/workbench/src/coordination/coordination-automation-runner.service.ts:836`。

工作流仍保存在内存 Map，实例无定义快照。assembledWorkflows.find 的宽泛 automation 条件会提前匹配其他节点，可能让 PDF 节点继承审查的名称/config。未知能力在标准调度失败后仍有直接返回成功的通用兜底。

修复：定义数据库版本化；严格先按 stageId 匹配，绑定唯一能力；未知或未发布能力报错，不生成成功报告。

## 5. 建议修改顺序

1. 修复正式计划合约及 failurePolicy；把 400 错误视为配置故障，并正确构建 PDF 计划。
2. 将 PDF 改为转换获批合同全文，校验主体、完整条款、源文档版本与哈希。
3. 将首阶段生成与 GTD 交付迁移到后端；结构化 workflowId、明确发起人、实例和执行关联。
4. 补齐组织上下文、管理员角色校验、原子状态更新和动作幂等。
5. 持久化工作流定义/实例/阶段任务，完善恢复、终态、正式产物登记和通知。

## 6. 下一轮验收要求

- 当前合同点击发送后，审查输入必须对应下载标识 084dea90-f49e-4654-8b7a-0d862620d6ac，不能使用测试文本或其他合同。
- 普通员工从聊天入口发起，初稿 GTD 必须落到本人；不能只通过直接 createTask API 验证。
- 审查执行单通过 Control Plane 创建，计划合法并携带实例/阶段上下文；400 不触发静默直调。
- 同时发送两次只产生一个审查执行和一个法务 GTD。
- 法务批准后 PDF 包含批准合同的全部条款与正确主体；下载后重算 SHA-256，与记录一致。
- 最终实例为 completed，法务任务与回执指向 final_receipt，回执包含最终 PDF。
- 缺文件、坏链接、审批越权、无组织、服务不可用、重启、同名跨组织部门都要有明确失败/恢复结果。

## 7. 现有验证脚本的局限

`scripts/verify-nda-e2e.mjs` 直接创建任务，传入独立 text 和 sample_nda.docx URL，绕开真实聊天生成及附件绑定入口。它检查 SHA-256 的格式，却未下载文件重算，也未核对 PDF 全文。回执选择条件只按标题或 parentTaskId，没有限定 isReceipt，可能选到初始工单；completed 断言与当前数据库 approved 状态不符。

因此该脚本可覆盖部分送审与权限场景，但不足以证明“配置指定技能生成同一份合同，审查并归档该合同”的端到端一致性。
