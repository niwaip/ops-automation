# 资料空间保存功能第二轮独立审计

## 结论

整改部分有效，仍不能验收“真实工作任务全链路成功”或“清理竞态彻底解决”。本次审计读取当前源码、三份新测试报告及 platform/ai-orchestrator/session-broker 对应日志；未修改业务代码或重跑线上测试。另用当前解析函数做了一次本地最小复现。

| 测试 | 北京时间 | 原报告 | 独立判定 |
|---|---|---|---|
| E2E_VERIFY_MVAZKKZ0 | 21:11:11–21:12:18 | 56 项，失败 | createdNodes 未定义，已在后续修正 |
| E2E_VERIFY_MVAZMRWJ | 21:12:53–21:14:40 | 64/64 | 保存 API 正向验证通过，9 个后台任务都有完成日志 |
| REAL_CHAT_E2E_MVAZPFHW | 21:14:57–21:20:17 | 15/15 | 个人文本/HTML 生成与 API 保存有证据；工作任务实际规划失败，且存在清理后提炼中止 |

## 已确认修复

- run.mjs 初始化异常现在写报告并设置失败退出码，清理异常纳入 verdict。
- AI 摘要缺失会记录失败，不再静默省略断言。
- 资产清单改为标题与相对链接同时存在，关闭了原先“只出现文件名就通过”的漏洞。
- docExtension、headings、rawData 的检查已接入；幂等新增文件数量断言。但 headings 仍只检查数量，rawData 仍只检查 details 外壳，不能证明内容完整。
- API 最新运行的 9 个归档提炼任务均完成，未见该批次 Record to update not found 或非 JSON 降级告警。
- 个人两次请求确实经过 Orchestrator → Broker → 用户沙箱 → 模型代理；默认模型日志为 gemini-3.8-flash-high。

## 尚未闭环的问题

### P1：真实工作任务失败被误判通过

real-chat-flow.mjs:207 仅检查正文非空，210 在 executionId 缺失时允许复用历史 ID，222 硬编码 skillUsed。client.mjs:198–226 不拒绝 SSE error，甚至没有 result 时回退为 observation 或原始事件文本。

对应工作会话 chat-e2e-1792156771760-khvi 在 21:19:55 明确报：

- DeterministicPlanGeneratorService：Two-Stage Topology Planner failed。
- DeterministicTaskExecutionService：CAPABILITY_NOT_FOUND。
- 原始规划结果 matchDecision=no_match，matchConfidence=0，nodes=[]，说明能力库没有集群巡检能力。

因此“流式任务交互正常完成”“真实 execution_id”“真实工作任务归档成功”不能作为任务执行成功证据。最多证明可把该响应按 task_result DTO 保存。根因是测试门禁与测试场景选型问题；规划拒绝缺失能力本身符合设计，不能归责模型执行失败。

修正：使用当前环境确实支持的工作能力；要求成功终态、真实新 executionId、执行记录归属当前会话和产物存在，禁止历史 ID 兜底。错误事件与错误正文必须失败。

### P1：等待屏障仍然静默超时，真实测试再次提前清理

client.mjs:138–160 超时无返回状态、无异常；任意 GET 错误都从 pending 删除；调用者不记录等待结果。digest.summary 也不是索引和所有文件提交结束的正式状态。

日志时序：

- 21:19:55.921：工作成果 b7cc9b78-8872-486b-9c34-5e8cf7e9e330 开始提炼。
- 21:20:17.899：测试已完成且 cleanupRecords 声明该文件夹已删除。
- 21:20:19.486：后台警告 Folder ... no longer exists, aborting folder rename。

新存活检查避免了这次 Prisma 错误，但未完成的提炼仍被测试清理中断。故“彻底解决竞态”不成立。先查再更新也不是原子操作；findUnique 与 update 之间仍可被删除。正文写盘在 note 存活检查前执行（helper:300–337），还有删除期间重新写文件的静态风险，未在本轮实测确认。

修正：暴露可查询的后台任务终态；等待必须返回 pending/failed/timeout 并影响 verdict；仅任务终结后清理。删除与更新使用并发安全策略并验证删除后无残留文件。

### P1：新增 JSON 容错可能把全文替换成摘要

workspace-note-ai.helper.ts:469–477 正则仅取得 title/summary，却令 refinedContent=summary 或 title。外层判断认为字段齐全，随后将其覆盖主文档（:300–301）。这属于工程实现导致的内容损失风险。

已调用当前源码中的 parseAiJsonResponse 做最小复现：输入含 title=完整报告、summary=简短摘要、refinedContent=第1行与第2行，同时存在未转义换行及尾逗号；返回 refinedContent=简短摘要。正文丢失，解析仍被视为成功。该复现验证代码风险，不代表本轮实际文件已经受损。

修正：解析失败应保留 dto.content；不能以摘要冒充修复后的全文。对损坏 JSON、转义引号、Markdown 代码块与长文加入内容保全验证。

### P2：模型与降级标记仍不准确

21:14:17.955 日志明确 qwen-3.8-27b-custom unavailable，切换 default。FrontMatter 和 digest 仍写 dto.aiModel（:233、328）；启发式兜底仍写 ai_refined=true、cleanedByAi=true（:224、327）。因此存在“声明模型”“实际提炼模型”混淆，也不能区分规则兜底与 AI 成功。建议记录 requestedModel、effectiveModel 与 refinementStatus，测试分别断言。

## 性能与产物观察

- API 最新套件耗时 107.328 秒；真实会话套件 320.567 秒。
- 个人纯文本 /ai/chat/stream 14.176 秒；HTML 请求 259.514 秒；锁等待分别 1ms/0ms，未见锁瓶颈。
- 工作规划请求 24.117 秒后拒绝缺失能力；不是任务执行完成时间。
- HTML 的 service_status.html 2461 字节归集成功；日志还显示 index.html 51557 字节随后归集，但测试即时目录快照仅检查到前者。未保存完整响应与最终目录快照，无法判断额外文件是否正确属于本轮；需要补齐资产集合断言，不能直接判定污染。
- 本次日志无足够 TTFT、token 或完整循环遥测，无法精确归因 HTML 259 秒的耗时。

## 覆盖是否全面

仍不全面。新增真实链路只有个人纯内容、个人 HTML、工作巡检请求三条；没有 UI 点击保存，仍手工组装 DTO；工作正向未成功；缺两模式 × 纯内容/MD/HTML 的六条真实主链路、真实个人模型切换、PDF/DOCX/XLSX/PPTX/图片等产物、最终文档保真、权限负向、并发/配额、失败重试与内容检索。

下一轮优先：修 SSE 与工作成功门禁、修等待超时门禁、取消有损 JSON 兜底，再补真实工作成功用例与 UI 六场景。现有 64 项可作为 API 正向回归基线；15/15 不能作为全链路验收结论。

## 证据文件

- 同目录 reaudit-runtime.log：本轮两份最终测试时间窗相关服务日志，保留原服务名与 UTC 时间戳。
- tests/e2e/workspace-save/report-E2E_VERIFY_MVAZMRWJ.json。
- tests/e2e/workspace-save/report-REAL_CHAT_E2E_MVAZPFHW.json。
