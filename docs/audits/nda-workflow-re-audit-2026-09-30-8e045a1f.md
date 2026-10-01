# NDA 工作流第三次审计：生成、发送与法务流转

日期：2026-09-30。以下时间均为北京时间。

生成执行：`8e045a1f-e979-44ba-a5e5-248cb69d76e6`。
发送后审查执行：`a2d67c72-4e22-4aba-a8cf-f6cb41a8ab17`。

依据：当前工作区代码和 diff、数据库只读查询、服务日志、合同与 HTML 下载接口。使用 codebase-memory 定位调用关系，最终以当前源码和运行记录核对。没有发送、审批或创建业务任务；没有运行会修改业务状态的 verify-nda-e2e.mjs。

## 第一段：本次真实执行链路

结论：生成 → 初稿 GTD → 发送 → Control Plane 正式审查 → 法务 GTD，实际跑通。不是仅生成页面提示，也不是上轮计划校验失败后直调的路径。但是法务 GTD 的审查结论错误，不能判定业务正确通过。当前停在待法务确认，尚未验收归档和最终回执。

| 环节 | 本次证据 |
| --- | --- |
| 生成 | 18:45:29.022 开始，18:45:29.195 succeeded |
| 生成技能 | 发布能力 16fb88e9-ba9c-4ab7-b508-f23adb1a821a；结果名称 ConfidentialityAgreementGenerationWorkflow |
| 文档 | 保密合同_豆包有限公司_v1_20260930.docx；下载标识 77526ba8-527e-4b7c-aa10-4df43b0a41c8 |
| 下载 | HTTP 200，DOCX MIME，19448 字节 |
| 原稿文件 SHA-256 | 9cfdeacd9e817320bfeb7dd5b44879803aaac1e9d0264820b09fe3155a501891 |
| 初稿 GTD | 18:45:31.584 创建，承办人 admin；inboxId abddaaa8-ab96-442a-842f-75b9fbbd3e2a |
| 初稿任务 | coord_65fdc087-935b-4c62-9e8f-a4388e3b676d |
| 发送动作 | 18:45:44.408，admin approve；随后创建审查执行 a2d67c72… |
| 正式审查 | deterministic_plan / plan；trigger_type=workbench_coordination；18:46:02.114 succeeded |
| 审查计划 | frozen；validation.valid=true；failurePolicy=abort；节点 platform.document.contract-reviewer |
| 实际文件读取 | 文档服务日志明确读取 77526ba8…docx，19448 字节，解析为 12 项条款 |
| 报告 | HTML 下载标识 862189eff59929e343d8235890d69ac0；HTTP 200，355797 字节 |
| 正式产物 | HTML 已登记 execution_artifacts，ID 4cfee68c-249d-426d-a906-9a42e09c41df |
| 法务 GTD | 18:46:02.310 创建；inboxId e20a2964-85da-4e72-8641-7ff9b2a9430f |
| 法务任务 | coord_e0e08e45-893f-403b-80d5-21ba061d3592；currentStage=legal_review，pending / unprocessed |
| 下一担当 | law01，属于与 admin 相同组织的法务部；附本次 DOCX 和 HTML 报告 |
| 后续归档 | 未发现关联该初稿或法务任务的归档执行；法务尚未审批 |

审查输出中的 sourceDocumentVersion 是提取正文的 SHA-256，不是 DOCX 二进制 SHA-256；两者不同不能据此推断文件串用。其值为 sha256:9d7bfceba0ace76a3da6dcc7d8fbc31699c75f73a0aa2982eea8bda05afc2e3e，定义见 contract-review-engine.service.ts:248。

## 第二段：修复进展及剩余问题

### 已确认改善

1. 正式审查计划已补 failurePolicy，本次通过校验、冻结并执行，日志没有显示本次走 400 后直调。
2. 400/403 调度错误已改为抛出，不再在这两个分支静默降级；错误场景未注入验证。
3. 正常登录时，前端初稿担当改为当前用户，不再优先取成员列表第一人。此次 admin 路径正常；普通员工未实测。
4. resolveUser 返回角色及组织，管理员判断改为 role=admin；初稿 payload 写入 orgId。
5. 发送加入数据库条件更新的 CAS 锁；创建加入 executionId 去重查询。但下列问题说明仍不能称为完整幂等。
6. 归档新增原稿解析，终态新增 completed / final_receipt 和 PDF 顶层附件。仅代码改善，本次未到该阶段，不能报运行验收成功。

### A1 / P1 / 本次已复现：真实高风险被转换成合规通过

原始步骤 outputJson.inline.metrics：healthScore=45，totalClauses=12，highRiskCount=1，mediumRiskCount=5，missingClausesCount=1，passCount=6。

法务 GTD reviewReport：metrics={}，riskScore=100，overallRisk=LOW；raw_content 显示“合规良好”，共 0 项条款；checkedRules 显示基线审查通过。

原因：coordination-automation-runner.service.ts:389 取 outputJson，但未解包 inline；:448 读外层 metrics，:449 默认 100，:450 默认 LOW。:1117 的 checkedRules 兜底又把空指标判断为通过。Control Plane 的步骤 DTO 保留封装结构，没有替消费者解包。

修改要求：统一结果适配层，按 planNodeId 定位步骤，解包 inline；必要时通过 resultRef 读取完整结果；校验 metrics 必填字段。缺失指标应是 unknown/结果不完整，不能默认为通过。同步传递 clauses、missingClauses、sourceDocumentVersion、规则版本。修复后需重建本次法务 GTD 的错误摘要，不要只修复未来任务。

### A2 / P1 / 代码确认：首阶段仍不是组织配置的强制派发

生成执行仍为 single_skill / custom，trigger_type、org_id 为空，input 中没有 taskContext/workflowId。前端虽然新增 taskContext，但 chat-orchestrator.service.ts:450 只在多步骤路径传入；本次走的单技能创建分支 :849 未传递它，等待补参分支 :701 同样遗漏。

而且新增上下文只是标记，没有根据组织定义解析 submission 绑定技能；仍用 planDraft.skill_match.skill_id。前端 useChatPageActions.ts:207 和 workflowNaturalLanguageRouter.ts:93 仍通过名称正则固定映射工作流，前端标记的阶段还是 initiator_confirm，而不是生成阶段 draft_submission。

修改要求：后端从认证组织、workflowId、发布版本中读取 submission 的技能绑定，明确派发；所有路径，包括单技能、补参、恢复，都携带同一实例与阶段关联。默认模板中的能力 ID 可以保留，但运行时必须尊重配置。增加“修改生成技能绑定后实际执行随之改变”的验收。

### A3 / P1 / 代码确认：CAS 锁可能导致任务永久忙碌

workbench-coordination.service.ts:624 在文件门禁 :653 之前设置 inTransit=true。无合同时 :669 抛 400，但没有释放锁。终态判断 :888 也在锁后，直接返回已有结果时不释放。原始 SQL 异常 :648 被吞掉并允许继续流转，会退化成无锁执行。

修改要求：先完成纯校验和终态检查，再在事务内原子领取；明确状态、动作幂等键、租约和失败恢复。领取后异常必须受控释放或写入可重试失败，SQL 错误不能 fail-open。setImmediate :993 仍是内存任务，不具备进程重启后的可靠恢复。

### A4 / P1 / 本次记录确认：组织信息在法务节点丢失

初稿 payload.orgId=e2bc525b-7b3e-499d-ba3d-e2a45ed9a71c，法务 payload 无 orgId；两个 execution.org_id 也为空。coordination-stage-engine.service.ts:482 重建 nextPayload 未继承 orgId。

workbench-coordination.service.ts:615 只有两边都有 orgId 才检查；因此下游组织校验可跳过。人员解析还存在指定用户、指定部门用户和 role 查询未统一带组织条件，以及多组织用户随意选第一条 membership 的问题。

修改要求：从认证组织上下文确定实例 orgId，所有节点、执行、人员解析及产物沿用；无组织应阻止流转。此次 law01 路由确实在同组织，但不证明跨组织隔离已通过。

### A5 / P1 / 未执行分支的代码风险：归档仍可能改写合同

buildPdfContentBlocks :864 把 ourParty 当甲方、counterpartyName 当乙方，忽略 ourRole。按本次输入会生成甲方富士通、乙方豆包，与原稿相反。:886 新增真实 DOCX 解析是改善，但 :903 解析失败只警告；缺正文时 :929 会生成固定条款，并默认三年、50 万违约金。不是归档获批原文。

即使解析成功，重新组合章节、添加主体和签署栏也不等于原稿的完整忠实转换。:947 还在没有源文件哈希时写固定存证说法。PDF 输出映射同样未解包 inline，也可能丢 pageCount/哈希等信息。

修改要求：优先将已批准的 artifactId/documentVersion 对应 DOCX 完整转换为 PDF；取不到获批正文必须失败，禁止填入另一份合同。主体严格依原稿或结构化甲乙方映射；记录原稿二进制哈希、正文版本哈希与 PDF 哈希，并验证输出文件。不要把计算哈希自动表述为已完成电子签名或不可篡改存储。

### A6 / P2 / 代码确认：创建去重不原子，且缺少归属限制

createTask :196 全局按 parameters.executionId 查第一条已有 inbox，未限制组织、发起人、工作流、阶段或初始任务。之后才 create，仍有并发窗口；下游法务工单也继承相同生成 executionId，查询可能返回错误节点。异常被吞掉后继续创建。

修改要求：专门的实例/初始交付唯一键和数据库唯一约束；先验证执行与产物归属，再返回对应的初始交付记录。不能将任意已有 inbox 当成幂等成功。

### A7 / P2 / 代码确认：配置覆盖与执行兜底尚未整理

stage-engine :673 的 assembledWorkflows.find 用宽泛 automation 条件，后续 PDF 可能匹配前一个审查配置。runner :201/:308 在任何包含 pdf 的能力分支强制使用 platform.document.pdf-create，不完全尊重节点绑定。Control Plane 业务失败、超时等仍可能触发直调；原执行未取消，可能重复。未知能力与合同比对失败仍有固定成功报告兜底 (:834、:1055 附近)。

修改要求：严格按 stageId 绑定能力，输入/输出契约从能力定义获得；明确且记录允许降级的条件；已创建执行的超时应恢复同一执行，不重新执行；未知能力失败。

### A8 / P2 / 持续存在：交付与定义依然缺可靠持久化

GTD 交付仍在 useChatStreaming.ts:204 流结束之后，未严格检查 succeeded 和有效产物，且回退到共享 activeExecutionIdRef；浏览器关闭、失败或并发仍有风险。组织定义在 OrgWorkflowService 的内存 Map 中维护，无持久化版本快照；当前生成 DOCX 仍没有正式 execution_artifacts 记录。

修改要求：后端通过持久化成功事件/Outbox 幂等交付 GTD；前端仅展示。持久化定义版本、实例、节点任务与产物。约 1100 行的 runner 同时承担计划编译、调度、结果适配、直调、PDF 内容与报告，新增修改优先按职责下沉。

### A9 / P2 / 业务参数准确性

本次审查 myPosition=buyer 来自模板默认配置；结果却标记 positionSource=user_confirmed。用户指定乙方不等同于指定披露方；NDA 还可双向披露。不能将模板默认当作用户确认。正文解析还显示“豆包有限公司公司”，富士通被模板扩展为全称；应在生成确认阶段显示标准主体和地址，避免不受控的名称拼接。

## 第三段：下一轮修改及验收

优先顺序：A1 风险结果适配及现有法务待办修复 → A3 锁和恢复 → A5 获批合同忠实归档 → A2 配置强制派发 → A4/A6 组织和幂等 → 持久化与能力适配。

下一轮必须覆盖：

1. 用本次真实输出封装做结果适配测试：法务 GTD 保持 45 分、12 项条款、1 高危、5 中风险、1 缺失、6 通过；空指标不能显示通过。
2. 单技能、等待补参和恢复路径都保留 workflowId、orgId、实例、正确生成 stageId；更换配置技能后实际派发改变。
3. 无合同首次提交 400 后补文件可再次提交；已办结重复动作不留下 inTransit；并发动作最多一个有效执行；锁/数据库异常不得无锁推进。
4. 普通员工从真实聊天入口发起，初稿到本人；同名跨组织部门不能串派，下游 task 与 execution 保留 orgId。
5. 原稿解析失败禁止用固定合同代替；归档 PDF 保持甲方豆包、乙方富士通及批准版本的全部内容，下载重算 PDF SHA-256。
6. 法务实际核准后再验证 completed / final_receipt、最终 PDF 附件和发起人回执；本次尚未发生，不能提前宣称完成。
7. 杀进程/重启后的在途任务可恢复；浏览器关闭不影响生成后交付。

本次 git diff --check 无错误。未运行会新增或审批任务的端到端脚本；本报告区分已观察运行事实与仅由代码确认的风险，不据其他测试样本宣称本次全流程通过。
