# 工作模式路由重新审计：2026-10-15 21:00 轮次

## 结论

本轮脚本记录 18/18 通过，全部已保存断言为 true。独立核对对应的 16 个执行：15 个 succeeded，R08 按预期 waiting_input，步骤未见失败或重试。四份产物实体、SHA256、固定业务字段全部通过核验。上轮的汇总假通过缺陷已在源码修复，W01 增加了实际审批拒绝请求；附件续接前端执行 ID 丢失问题也已在源码修复。

仍不能据此宣告完整端到端验收完成：F03 未触发断线恢复；F02 本轮仅验证 API；回放证据的真实哈希与模型用量缺失；W01 尚非完整审批生命周期。这些主要属于工程实现、测试覆盖和观测问题，没有证据要求重新定义模式。

## 范围与证据

- 测试证据时间：北京时间 21:00:04–21:03:08；服务日志窗口 UTC 12:59:30–13:03:15。
- 按证据中的 16 个 execution UUID、20 个 trace UUID、test/law01 两个测试账户限定数据库查询；coordination task 单独限定 ID 查询。
- 采用 execution-auditor 审计方法，按实际 task 路由还原，不套用个人沙箱链路。
- 本次未重新发起业务执行，未修改业务实现。数据库只读，产物通过 GET 核验。
- 原始证据：`evidence/*.json`；独立交叉证据：`re-audit-2100-db.json`、`re-audit-2100-runtime.txt`、`re-audit-2100-config.json`、`re-audit-2100-coordination.json`、`re-audit-2100-artifacts.json`；统计：`re-audit-2100-summary.json`。
- 运行配置是审计时读取的当前配置，无法单独证明测试期间配置未变化。容器 dist/src 指纹已留档；前端源码修复不能代替浏览器实际请求验证。

## 与上轮对比

| 检查项 | 本轮独立判定 | 依据与边界 |
|---|---|---|
| 失败断言被 outcome.status=passed 覆盖 | 源码已修复 | run-e2e.ts:55–67 强制失败断言/空断言不能通过；本轮无 false 断言。未通过故障注入验证失败退出路径。 |
| W01 原先仅探测接口 | 有实质改进，部分覆盖 | 创建协同任务；test 自批返回 403 且包含非承办人原因；law01 请求返回 400。仍缺 400 响应业务原因和正常审批闭环。 |
| 附件续接前端丢 ID | 源码已修复，UI 未验收 | useChatPageActions.ts:124 使用 pendingExecutionId 或历史 waiting_input ID，不再因 hasFiles 清空。API 测试明确传 ID，不能检验浏览器行为。 |
| F02 同执行恢复 | 后端通过 | 两次请求执行 ID 同为 8b47e14c-5a59-469f-aadf-f0002fff72b7，最终 succeeded。 |
| F03 恢复测试 | 仍未覆盖原目标 | 仅 GET R09 已完成记录；没有中断 SSE、刷新重连、游标补读或重复副作用检查。 |
| 固化回放 | 计划稳定通过，证据未完整 | F01 两次数据库 plan_hash 一致，步骤均成功；JSON 证据仍未写入真实哈希。 |
| token 成本可解释 | 仍不可验收 | 账本按 execution/trace 查无记录；usageByPurpose 为空，相关开关关闭。 |

## 调用路径与业务结果

实际主链路是测试客户端 → `/ai/chat/stream` → 路由/固化计划或 single_skill → 执行步骤 → 文档产物；F03 读取控制面记录；W01 直接走工作台协同 API。本轮没有浏览器交互证据。

- R02/R07：附件提取成功；R08：无附件停在 waiting_input，符合缺输入门禁。
- R03：platform.search.web 固化计划；R04：single_skill。不能把两者都描述成相同固化执行路径。
- R05/R06：workspace.explorer，别名路径成功。A01 两个账户的隔离断言均通过，两个执行成功；不代表全部跨组织隔离场景已验证。
- R09：pdf-content-extractor → summarize_text → markdown-artifact-writer，全步骤成功。
- R10：只有 markdown-artifact-writer，数据库未出现重复提取步骤。
- R11：single_skill，而非设计中可独立证明的“原生生成＋RAG”路径；当前断言容许该行为，仍需明确验收标准。
- R01/R13/R14 没有 execution UUID，依赖响应断言；不能据“没有 execution”单独证明零规划模型调用。

## 固化回放与性能

F01 使用保存技能 df15c847-ddbe-4984-a688-d0e46babafa6，版本 1。两次执行：

| 执行 ID | HTTP 流请求耗时 | 提取步骤 | 摘要步骤 | 写文件步骤 |
|---|---:|---:|---:|---:|
| a0743035-7248-42cc-ac0a-0572b361409e | 6665 ms | 12 ms | 6477 ms | 22 ms |
| 4ecc5607-4b04-46f5-91ba-2b87aeaa79c9 | 10263 ms | 10 ms | 10086 ms | 24 ms |

两次执行计划哈希均为 `ca375dc56e6b924f5902e15f2b9e4bc6027e6d505dd854efa176c4137b86862b`。保存版本快照哈希与执行时绑定物化后的哈希属于不同对象，不将两者不同直接判作回放漂移。

摘要节点占主要耗时。固化拓扑并不意味着零模型调用：本例仍包含 summarize_text。两次产物 SHA256 不同，但预算、负责人、销售额、总额与占比一致，因此本轮证明的是计划稳定及固定字段正确，不能声称输出逐字节确定。原设计的无模型、两节点 literal writer 基准仍未覆盖。

F02 两次 HTTP 请求分别为 4533 ms、561 ms；第二次沿用同一个执行 ID 并完成。此耗时不是浏览器端完整端到端耗时，日志未提供可信 TTFT 或 token 吞吐量。

## W01 审批门禁

协同任务：coord_5076c2e1-9ef7-4301-bc6f-c705fbdf818b；收件箱记录：6892d1d2-9865-4d4e-a470-d244fa6d6605。服务日志确认 test 创建并分派 law01。独立数据库读取确认审计时 taskStatus=pending、stage=initiator_confirm、actions=[]，未发现两次被拒请求造成状态推进。

403 的业务原因已保存。400 仅保存状态码，缺少响应原因，因此严格结论应是“该请求被拒”，尚不能独立确认必然是缺产物门禁命中。GET executions 返回 200 只能证明可查询，不能证明审批策略被执行。W01 的 executionIds 字段实际放入 coordination task ID，应独立建 taskRefs，避免混淆证据类型。完整的有效产物审批→后续执行→归档闭环仍未测试。

## 剩余工程问题与建议顺序

1. **补真实恢复测试（F03）**：中断正在运行的 SSE，重载会话后按同一执行 ID 查询/补读，核对终态、产物及副作用次数。当前“Completed steps recorded with input and output contracts”断言只要 status=succeeded 就可通过，未检查步骤契约，应修正。
2. **补浏览器 F02**：从 waiting_input 状态上传附件，捕获真实请求 executionId，确认只续接原执行并正确展示产物；源码修复与后端通过不能替代这一步。
3. **落真实回放证据**：catalogSnapshotDigest/routingPolicyDigest 仍是占位字符串，18 份证据的 planHash/inputHash 均为空；actualInvocations 和 logicalEffectCount 未由完整权威事件账本证明。应以真实快照、绑定后输入和步骤事件写入证据。
4. **补成本账本与同任务对照**：MODEL_INVOCATION_LEDGER_ENABLED=false，PLANNING_DECISION_PERSIST_ENABLED=false，PRODUCTION_REACT_FALLBACK_ENABLED=false；本轮 execution/trace 范围内 usage=0 行。以相同任务、输入、输出验收，对比“AI 每次解析 Skills 并组织执行”与“已固化执行”，按路由、规划、执行、摘要等 purpose 统计 token 与调用次数；当前不能给节省比例，空记录也不是零消耗。
5. **完善工作流断言与覆盖清单**：W01 保存 400 业务错误码/原因、拒绝后的状态，并补完整合法路径；R11 路由要求对齐设计。28 个设计场景中本轮执行 18 个（64.3%），未覆盖 R12、F04–F08、A02、W02、X01、X02，18/18 不能表述为全部设计验收通过。

## 日志归因

本次限定的 orchestrator 日志未见 ERROR；3 条 WARN 为摘要模型输出非 JSON，被适配层包裹为 summary，关联 R09 和两次 F01。对应步骤成功、产物校验通过。属于模型输出格式偏离被工程兼容层处理，目前不是执行失败，也没有证据把覆盖/账本不足归咎于模型能力。此前提及的运行时默认值 403 在本次保存日志中未复现；不能据此推断所有环境已永久修复。
