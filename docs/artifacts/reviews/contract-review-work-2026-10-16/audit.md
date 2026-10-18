# 工作模式合同审查 Skill：端到端测试与执行审计

日期：2026-10-16，Asia/Shanghai。对象：`platform.document.contract-reviewer@1.0.2`。

## 1. 结论与定性

**工程分工合理，但当前真实工作模式链路未通过验收。** 解析、批量语义判断、确定性报告渲染能够跑通；然而用户指定模型与立场未被可靠执行，同会话新附件会误入旧结果文本变换，模型失败能被包装成完整审查成功。仅凭最终 `succeeded`、生成 HTML 或六个成功样例，不能确认 Harness 可靠。

本轮新增并实际执行：12 个真实认证聊天 API E2E、1 个真实工作模式 UI 抽查、8 个隔离编排故障测试、1 个显式35B提供方连通对照。不同层次分别统计，不合并成一个通过率。

- E2E 原始硬断言：1 passed / 11 failed。
- 审计调整：**1 passed / 10 failed / 1 blocked**。C05 的 C04 前置未进入 waiting_input，故不能把续接作为有效验收；原始失败记录保留。
- 隔离故障审计：**2 passed / 6 failed**，真实编排函数配 mock 下游，绝不计作真实提供方 E2E。
- UI 抽查：执行与产物卡片成功，但**35B选择未落实、卖方变成默认买方**，故不通过。
- 直接模型对照：明确指定35B，5.733秒返回，提供方回报 `actualModel=qwen36-35b-a3b`。这只能证明该模型入口连通，不能代替 Work E2E。

归因以工程契约与运行时防御缺口为主。C02 的超时触发原因属于提供方/网络/服务耗时待进一步区分；**把不完整结果当作完整成功属于确定的工程问题**。本轮没有依据评价35B的合同语义能力，因为工作模式业务调用实际没有选中35B。提供方回报的模型身份也不等同于对内部模型权重的独立验证。

## 2. 执行边界与证据可信度

正式运行目录：`run-2026-10-16T15-38-32.384Z/`。正式运行约 23:38:32—23:45:54，耗时约7分22秒；测试账号 `test`，所有合同与企业名称均为合成数据。

真实链路：认证 → `/ai/chat/upload`（附件用例）→ `/ai/chat/stream`（顶层 modelId，config.mode=task）→ 工作能力目录/参数识别 → 冻结执行计划 → Control Plane builtin workflow adapter → 文档服务 parse → AI model/call 批处理 → render-report → 持久化结果 → 原始产物URL下载。

此 skill 是平台 manifest + workflow.json + domain-handler 形式；本轮没有把个人沙箱 dsh/ReAct 链路误当为工作模式入口，也不要求运行时读取不存在的 SKILL.md。

前期校准运行 `run-2026-10-16T15-35-02.673Z/` 沿用了旧测试客户端的 files.fileBase64 等协议，已用 `INVALID-RUN.md` 标记，**排除正式统计**。模型字段和附件接口均按真实前端核对后重跑；没有把校准脚本错误计入产品缺陷。

保存了请求、上传描述、实时SSE及事件接收时间、执行记录、结构化输出、模型账本、原始URL下载的HTML及SHA-256；数据库另查13份冻结计划和26条调用账本（含UI）。独立的 `audit.py` 从原始证据重新核对请求摘要、执行单对应、事件终止、节点唯一性、指标和账本精确条款覆盖，全部一致。不是让被测模型自评通过。

源码定位先使用 codebase-memory；容器操作统一通过根目录 `./docker/start-smart.sh`。挂载指向当前 PROJECT_ROOT。控制面源码与构建均包含 requestedModelId 路由逻辑，构建时间晚于该源码；记录见 `runtime-fingerprint.json` 与 `runtime-routing-check.txt`。本轮只新增测试和文档，保留用户原有两处业务源码改动，没有修改、重启或故障注入共享业务服务。

## 3. E2E 用例结果

| 用例 | 场景 | 控制面终态 | 耗时(s) | 审计判定 | 失败断言/说明 |
|---|---|---|---:|---|---|
| C01 | 自然语言+内联正文 | succeeded | 41.89 | failed | 实际业务模型与指定35B一致 |
| C02 | 真实DOCX附件绑定 | succeeded | 103.08 | failed | 无未声明的语义审查降级；实际业务模型与指定35B一致 |
| C03 | 同内容章节变形 | succeeded | 35.31 | failed | 实际业务模型与指定35B一致 |
| C04 | 无正文无附件缺参门禁 | failed | 7.71 | failed | 缺合同进入waiting_input |
| C05 | 缺参后上传附件续接 | succeeded | 29.14 | blocked | C04 未进入等待态，续接前置不成立；实际创建新执行单 |
| C06 | 损坏DOCX不伪成功 | failed | 7.49 | passed | 无 |
| C07 | 合同中的指令注入隔离 | succeeded | 45.44 | failed | 实际业务模型与指定35B一致 |
| C08 | 30条长文本多批覆盖 | succeeded | 80.58 | failed | 实际业务模型与指定35B一致 |
| C09 | 同会话替换合同不串件 | succeeded | 5.47 | failed | 实际执行合同审查能力；输出含结构化条款和指标 |
| C10 | 显式卖方立场传递 | succeeded | 34.17 | failed | 我方立场贯穿输出；实际业务模型与指定35B一致 |
| C11 | 概念咨询不误启动审查 | failed | 6.58 | failed | 概念咨询不创建合同审查执行 |
| C12 | 自然语言基线重复执行 | succeeded | 44.12 | failed | 实际业务模型与指定35B一致 |

严格判定中，“指定35B未落实”会使正常完成的用例失败，并不表示它们全部无法处理文档。正常正文覆盖、变形输入、损坏文件拒绝、长文分批与HTML交付有正面证据。

## 4. 主要发现与证据链

### P1-01：用户选35B，但工作模式业务调用仍使用默认模型

C01/C03/C12 内联与重复请求、真实附件和UI均复现。正式 request.json 顶层 modelId 为35B UUID；业务 usage 与数据库账本中回报的模型均为 `gemini-3.8-flash-high`。UI显示35B，执行单 `da61bcd3-30ee-478c-aea8-275cce988a92` 的两次审查调用同样记录Gemini。

控制面编排源码 `contract-review-orchestrator.ts:105` 只从 runtime request.input、metadata、parseResult或环境取模型，缺省为default；`deterministic-task-execution.service.ts:279` 附近创建执行的input未显式带上options.modelId，skill公开输入契约也未声明modelId。因此当前证据支持“选模语义没有形成贯穿业务阶段的执行契约”，不是35B不可用。参数识别阶段可能使用独立策略，不把其模型不同单独当成缺陷。

**建议：**将选择模型固化为执行级策略/节点元数据，沿任务创建、恢复和运行时传递，最终比对actualModel。不能只在聊天参数、规划请求或页面标题记录选择结果。

证据：正式 C01/C12 request、usage；`ui-audit.json`、`provider-control.json`、`ledger-audit.json`。

### P1-02：同会话上传新合同，被旧结果变换分支截走

C02完成后上传真正的新DOCX（金额280000、新文档/正文标记），C09却选择 `grounded_text_transform`，仅调用 `transform_text`。执行input.__promptDebug明确记载 n1.content 来自上一次执行 `ae1d7e4c-...` 的不可变结果快照；没有重新调用合同审查，没有结构化条款和新HTML。

`deterministic-recipe-matcher.service.ts:273` 的旧结果变换分支位于合同审查分支前，其条件排除了compare，却没有排除hasContractReview。该分支可在存在新附件且明确要求重新审查时抢先匹配。

**建议：**显式新资料操作优先于历史结果变换；新附件与新审查意图须形成新的资料绑定，冻结的计划中记录sourceAttachmentId/hash。不要仅增加“改为”关键词补丁。

证据：C09 upload、request、events、execution；C02与C09不同上传引用。

### P1-03：中文卖方输入不符合运行时立场枚举，静默退回买方

C10要求“我方是乙方，也就是卖方”，最终myPosition=buyer、positionSource=default；UI独立复现。冻结计划参数识别已提取中文立场，因此不能简单归因于模型没有读懂请求。

manifest把myPosition定义为自由字符串，描述允许“甲方、乙方、采购方、受托方”等中文；运行时 `contract-review-engine.service.ts:564` 只处理buyer/seller/neutral/party_a/party_b/both等规范值，其他字符串退回默认值。两层契约不一致。

**建议：**在能力输入边界统一角色规范化，保留原始值和规范化来源。无法解析时追问，不能把用户明确指定的立场静默替换成默认立场。

证据：C10 events、output；UI输入与结果见 `ui-dom.json`、`ui-audit.json`。

### P1-04：真实模型超时后静默降级，执行单仍宣称审查完成

C02共5个节点，批次1在90000ms后超时；只剩批次2的2个条款有模型结果。output.metrics.llmReviewedCount=2、totalClauses=5、warnings=[]，但执行状态succeeded且摘要为“合同智能合规审查与风险诊断完成”。该次总聊天耗时103.084秒。失败批次没有独立失败账本。

`contract-review-orchestrator.ts:554` 捕获异常并回退规则；`:588` 在无匹配规则时给出“权责约定明确对称/符合规范”措辞；`:728` 虽记录审查数量，却不形成降级门禁或可见警告。隔离F05/F06也复现此问题。

**建议：**定义reviewStatus、failedBatches、attempted/reviewed/skipped/failed数量；规则审查与语义审查区分。降级可以交付，但必须明确范围与原因，不能对未审完的条款给出完成性合规保证。

证据：C02 output/usage、runtime-excerpts.txt、数据库batchIndex=2且缺批次1；fault-evidence/F05、F06。

### P1-05：模型响应条款ID无严格集合校验，可能错配或崩溃

隔离F01只返回3条中的1条，编排最终在章节聚合处抛出undefined.clauseIndex（`:737`）。F02重复返回ID=0、F03返回90/91/92，均被当作3条完整审查结果。

根因位于`:418`：ID匹配失败后按数组位置兜底；`:552` 只要返回非空数组就标记整批成功，缺失条款不再兜底。

**建议：**按预期ID集合校验唯一性、覆盖率和未知ID；禁止无条件位置回填。仅对缺失条款做有界重试，失败时结构化标记不完整，之后再进入聚合/渲染。

证据：fault-evidence/F01—F03、fault-audit-jest.json；此项为隔离故障复现，不声称真实模型本轮产生了这些错误。

### P1-06：证据原文字段只做长度清理，未验证出处

隔离F04返回完全不存在于原文的句子，被原样保留在最终findings.evidenceQuote，未标识unverified。`:441`—`:444`仅检查长度并剥离引号，未检查原文包含关系或可追溯文本锚点。

**建议：**对规范化文本进行出处验证，保存offset/sourceHash；不匹配时拒绝该引用或明确标未验证。原始模型输出与规则补全后的最终finding应分别可追溯。

证据：fault-evidence/F04。本轮不据此宣称真实35B曾幻觉证据；发现的是Harness无法阻止该类输出。

### P2-01：无正文合同没有进入缺参等待，续接路径无法成立

C04创建执行后解析失败，未进入waiting_input；C05补传后创建新执行单，而不是恢复原执行。manifest输入没有required或文件/正文的替代必填关系，因此通用缺参机制无法知道“至少一种合同来源”是前提。

**建议：**声明并执行非空正文、文件或可访问引用至少满足一种的输入约束；缺来源在执行前等待。修复后重新运行C04→C05，当前不能宣称续接功能已通过或已独立证实失效。

证据：C04执行单506708c6-...、C05执行单eaef895d-...及原始SSE。

### P2-02：概念咨询仍被路由成实际合同审查

C11明确“只是咨询、不用审查任何具体合同、不用生成文件”，仍命中contract_review并最终报无有效条款。`:86`—`:102`主要通过“审查+合同”正则识别，未充分区分概念咨询与执行意图。

**建议：**加入咨询/否定/引用边界的路由测试与明确定义的优先级；先满足真实执行意图，再启动重型能力。

### P2-03：账本有业务调用，但不足以审计全链路成本与失败

13个执行单查询到26条记录，共33110个input+output tokens，全部purpose=llm_operation。正式12例的可观察部分是30899 tokens；这些数字只是成功入账部分，不能当成全链路总消耗。

参数识别在执行input.__promptDebug中有调用信息，但本次执行关联账本没有recognizer记录；C09实际做了文本变换而其关联账本为空；C02失败批次没有错误记录；业务trace_id使用trace_<executionId>而不是聊天trace。故调用链可以凭executionId关联，但按聊天trace检索可能不完整。

**建议：**每个调用attempt在开始时建记录，失败也落账；记录purpose、parentTrace、耗时、finishReason、实际模型与usage未知状态。区分估算和真实用量，不把缺失记录计为0。

## 5. 正面验证与性能边界

- C01/C03/C12：正文四个标记均覆盖，节点ID唯一，风险统计与条款数组一致，原始HTML URL可下载；格式变形与重复执行的内容覆盖通过。未对风险结论稳定性或法律准确率作通过声明。
- C08：31节点、30个正文标记完整、31节点标记llmReviewed；数据库11个批次，批大小3，最后1条，无重复或遗漏索引；无截断标记，耗时80.579秒。这是30条合成合同，不是数十页真实复杂文档基准。
- C06：损坏DOCX被拒绝，未生成报告，属于预期通过。
- C07：本次附件中覆盖审查要求的文本没有让系统输出100分全通过；仅验证这一个注入样例。
- F07：渲染失败未返回成功；F08：隔离调度并发不超过3、源条款顺序保持，显式传入业务input.modelId可被编排函数使用。
- 首SSE事件约16—81ms，只是“正在规划”事件，**不是LLM首token或任务完成时间**。正式review案例聊天耗时29.14—103.08秒。上传和下载未计入此totalMs，不能据此宣称完整用户操作时延。
- manifest声明timeoutSeconds=60，但实际执行超过60秒仍成功；这是需要厘清的预算契约差异，当前未证明该字段应由哪一层强制终止，故不额外判作超时实现缺陷。
- UI成功显示结果与产物卡片并展开iframe，但未独立验证iframe内部全部交互/DOM；下载实体的自动验证与完整预览交互验收分开。

## 6. 改进优先级与再验收

1. 先修静默降级、ID集合校验与空洞保护；保证“失败也诚实”。
2. 修新附件相对旧结果的路由优先级、模型策略传播、角色规范化。
3. 修输入来源的替代必填约束，再验缺参续接；补咨询/否定路由边界。
4. 补完整attempt账本和trace关联，随后才评估模型成本与性能收益。
5. 重跑当前失败用例和C01/C03/C08/C12基线；再扩展到跨条款/附件引用、扫描件、租户权限、幂等、重启恢复和长期上下文。尚未执行的场景明确为未测。

不建议通过放宽测试断言、改用默认模型或只测内部parse/render接口来消除红灯。修复后以同一批固定输入和保留的失败证据回归。

## 7. 复现与交付

- 用例、fixture生成、真实上传/聊天执行器及复审脚本：`tests/e2e/contract-review-work/`，见README。
- 隔离故障复现：`apps/backend/execution-control/control-plane/test/contract-review-harness-audit.test.ts`。
- 正式原始证据：`run-2026-10-16T15-38-32.384Z/`。
- 独立复审：`audit-summary.json`；运行 `python3 tests/e2e/contract-review-work/audit.py` 可重复核对现有证据。
- 故障原始输出：`fault-evidence/`、`fault-audit-jest.json`、`fault-audit-console.txt`。
- 数据库交叉核对：`ledger-audit.sql` / `ledger-audit.json`；仅查询本次测试执行单。
- UI与模型对照：`ui-dom.json`、`ui-audit.json`、`ui-execution.json`、`ui-usage.json`、`provider-control.json`。

本轮完成的是测试与审计，业务缺陷保持原状，失败测试作为可复现的修复验收标准保留。
