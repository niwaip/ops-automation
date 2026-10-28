# 2026-10-26 21:07 盈利能力分析调用：提示词、工具契约与执行门禁审查报告

审查日期：2026-10-26，时区 Asia/Shanghai。当前源码基线：`d1b5bcff1d9a12e14469ddd0cf7316a3491885fa`。

## 1. 结论与审查边界

**本次进程正常结束，完成了一次有效的财务计算，但最终交付未通过任务证据核验。问题属于工程与模型共同造成，其中错误任务契约、复核动作被改写和未核验正文降级输出，构成了主要工程缺陷。**

用户请求为“解释下半年盈利能力变化”。原始会话、成功计算回执和门禁记录支持以下结论：

1. `exitCode=0`，不等于业务验收成功。沙箱会话最终 `verification.verified=false`，证据文件顶层也是 `verified=false`。
2. 原审计所称“复核自动平反”未实际完成。复核模型建议撤销缺项，但确定性重验后仍是 `action=repair`、`dismissed_issue_codes=[]`，最终门禁继续 reject。
3. “基准值、乐观情景、保守情景”来自错误选中的“参数”工作表，并在本次意图裁判中成为强制指标。不是用户要求，也不是只能通过修改静态关键词规则解决的问题。
4. 4 次实际工具执行出现在 round 0、2、5、6。原报告把错误连续安排在 round 0、1、2，并称 round 3 已算完，不符合保存的回执。
5. 228,355 Tokens 是执行遥测中记录的用量。同期同用户模型代理日志有 16 次请求，遥测计数为 11；两者尚未完全对齐，不能直接认定这是整条调用链的完整模型成本。
6. 原审计对若干财务增长率及利润率变动的陈述与实际回执不符；最终回答中的部分因果解释也超过了已执行证据能证明的范围。

本次审查使用 execution-auditor 和 codebase-memory 技能，执行只读服务查询、原件读取、源码检查及离线诊断。没有修改业务源码，没有重启服务，没有重新调用模型，没有重新执行用户任务。当前运行容器与本地 13 个相关模块的 SHA-256 全部一致；这一结果证明当前环境的一致性，不替代历史请求快照。

证据目录：[prompt-call-review-20261026-2107](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/prompt-call-review-20261026-2107/summary.json)。目录包含指定会话副本、执行证据、相关裁判缓存、服务日志、结构预检结果、离线检查及哈希清单。保留原会话与原证据，未改写其内容。

## 2. 调用身份与证据等级

| 项目 | 已核实信息 |
|---|---|
| Session | `chat-session-1793019198260-1llzjmqv` |
| Assistant message | `1793020067816-xw1p82sk` |
| Turn | `1793020174836519792-d8466d28c3c14ba29a65e8055e650089` |
| 模型标识 | `qwen36-35b-a3b`，绑定 `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af` |
| 入口参数 | `--web-search --thinking --reasoning-effort medium --timeout 300` |
| 附件 | `AI能力测试_财务报表.xlsx` |
| 原件 SHA-256 | `9d71ca8cc6172add7e558ac6a906f677c784fcc5c9d3444cbb17de2772fd992f` |
| 成功计算证据 ID | `9726bdc6227ff2bb29f505eb` |
| 结果状态 | 进程结束；计算回执成功；任务核验未通过 |

证据分为三类，避免将推断描述为现场事实：

- **现场事实**：Redis 会话 metadata、沙箱 `.json/.evidence.json`、本次生成的裁判缓存及对应时间窗口服务日志。
- **当前实现与离线复现**：当前源码、运行容器哈希、同附件结构预检、选定函数的网络隔离诊断。
- **尚未核实**：历史每轮完整线上请求、实际 chat template 与 tokenizer 分项、缓存命中量、每次辅助裁判的 usage、历史每轮工具名单及各轮精确上下文大小。

两个相近意图缓存要分清：`014cda55…` 是 10 月 25 日的 v4 缓存；`e81f717e…` 是本次 10 月 26 日 21:07:59 生成的 v5 缓存。不能把旧缓存中的错误直接当作这次缓存命中的证据。

## 3. 执行链路与时序

链路为 User Web → AI-Orchestrator → Session-Broker → 用户沙箱 dsh → 模型代理；沙箱内部另外调用意图与完整性裁判。

| 时间或位置 | 原始证据支持的行为 | 结果 |
|---|---|---|
| 21:07:47—21:07:48 | 编排层分发、Broker 执行 dsh | 请求进入指定沙箱 |
| 21:07:59 | v5 意图缓存生成，metrics 为三个情景字段 | 错误契约进入后续检查 |
| receipt round 0 | 按“月度经营”查询，where 的月份条件有效；额外提交 `having={"and":[]}` | 空 HAVING 触发 `invalid_analysis_plan` |
| receipt round 2 | 重试仅提供 tables，缺少 file_path | `source_unavailable` |
| 21:08:10 / 21:08:19 / 21:08:46 | 完整性裁判分别给出 repair、clarify、clarify 建议 | 反馈相互切换；澄清建议在重验后又变成 repair |
| receipt round 5 | 定义两段期间与财务计算，增长率写成 `(H2/H1)-1` | 引擎拒绝 ratio 与 number 相减 |
| receipt round 6 | 修正后完成 18 项事实计算 | 有效计算回执产生 |
| 21:09:06 | 复核认为三个情景指标不属于用户要求，建议 recheck | 重验未能撤销缺项 |
| 21:09:34 | 最终 Markdown 连同“未完全通过核验”角标落库 | `verified=false`，最后仍有 reject |

保存的模型响应遥测为 11 次，实际工具回执为 4 次。其余响应涉及正文、协议或修复过程，现存材料不足以把每个模型响应严格对应到原报告声称的 round 0—10 阶段。审查不补造这部分时序。

## 4. 资源与性能：哪些数字可信

| 指标 | 核实数值 | 正确解释 |
|---|---:|---|
| Harness 端到端 | 106,920 ms | metadata.executionTrace.durationMs |
| 内部 duration | 106,299.19 ms | 与外层测量起止点不同 |
| 已记录 LLM 请求数 | 11 | telemetry.llmInvocations，不代表全链路请求总数 |
| 已记录输入 / 输出 | 223,349 / 5,006 Tokens | 记录口径内总和 228,355 |
| 平均输入 | 20,304.45 Tokens / 已记录调用 | 算术平均，不代表每轮大小相同 |
| 已记录 LLM 时间 | 69,454.74 ms | 请求遥测累计，不应称“纯 GPU 推理时间” |
| 同期代理请求 | 16 次 | 同用户与时间窗口关联，仍应补父子 span 映射 |
| 16 次代理 HTTP 耗时之和 | 89,248 ms | HTTP 请求累计墙钟时间；不等同纯计算时间 |
| 首次记录 TTFT | 6,955.49 ms | 已记录模型调用的指标，不是已证明的用户首字时间 |
| 工具执行 | 4 次，3 失败、1 成功 | 首次工具成功率在本样本为 0/1；工具调用成功比例为 1/4 |

原报告中的“系统词约 1,500、历史约 2,500、工具约 14,210 Tokens”缺少本次最终请求及目标 tokenizer 的分项记录，只能视为估算。不能以字符数除固定系数得出精确占比。

当前沙箱离线测量（`json.dumps(ensure_ascii=False)` 默认分隔符）：

- 完整工具注册表仍是 25 个工具，但 JSON 长度为 **31,139 字符**，与原报告的 49,736 不同。
- 禁用模型裁判后，对本请求调用现有分析裁剪函数，保留结构检查与聚合两个工具，两个工具对象共 **5,960 字符**，列表序列化还会有极少量括号和分隔符。
- 不含技能目录的基础系统词为 **2,136 字符**。
- 这是当前实现测量，不是历史每轮线上请求重建，也没有证明线上当时实际用了这一工具集合。

因此，优化应同时降低“单次输入体积”与“无效调用次数”；不能把 22.8 万全部解释为全量工具重复 11 次。现有裁剪已存在，下一步必须查它的生效条件，而不是重复实现一个裁剪开关。

## 5. 根因与责任裁决

### F1 · P1：错误主表上下文使意图裁判扩张用户要求

**现场证据。** 本次 v5 契约缓存输出 `metrics=["基准值","乐观情景","保守情景"]`。其文件哈希键可用“原始用户指令 + 参数表六个表头 + v5”精确重算得到，排除仅因缓存文字相似而误关联的可能。

**离线复现。** 对同一 SHA-256 的原件运行当前结构预检，primary_sheet 是“参数”；实际用于成功计算的“月度经营”也被正确扫描到，但没有成为主表。

**代码链。** 预检无明确匹配时回退到首个非封面业务 Sheet；`_resolve_available_headers()` 只取 primary headers；`build_analysis_contract()` 把裁判给出的 metrics 直接变成必需指标。于是“候选数据字段”升级成“用户任务要求”。

**责任。** 工程负责给裁判错误且不完整的候选上下文，并将未经来源约束的推断硬化；模型负责把情景列猜成用户要求。整体为工程主导的混合原因。

**修复。** 分离需求提取与数据绑定。先从用户及必要会话上下文提取业务概念，再在多个 Sheet 候选中绑定；每项必需指标必须记录来源：用户原话、领域概念展开或显式确认。真实表头只用于可用性判断，不能单独创造义务。低置信度主表不应提前把其他候选隐藏给裁判。

### F2 · P1：复核缺少契约修订通路，并覆盖澄清动作

**现场证据。** 缓存原始 action 为 clarify，但进入反馈时已改成 repair；最终误报复核原始 action 为 recheck，重验结果为 repair，dismissed 列表为空。

**代码原因。** `revalidate_review()` 最终统一按 `remaining` 写 action：有问题即 repair，无问题即 recheck。调用方又会因 dismiss 列表非空进入这一逻辑，即使原判定是 clarify。它还要求缺失指标已在事实或计划中出现，才能撤销告警；这一规则能处理“算过但没识别到”，无法处理“该指标原本就不该要求”。

**责任。** 明确工程缺陷，离线 AST 诊断已复现两条路径。复核模型本次后期已识别错误，程序未能表达相应状态转换。

**修复。** 区分三类动作：补执行、修订契约、等待用户。澄清动作不进入缺项撤销重验。修订契约必须指向 requirement_id、原始需求依据及候选修订，经规则校验后生成新契约版本，再重新评估事实。来源哈希、完整范围和执行真实性问题不能通过契约修订豁免。用现有契约类型演进，不新增一套并行状态机。

**相邻风险。** 当前重验还会从成功 receipts 重新收集全部 facts；离线诊断证明，即使传入的合规事实池为空，也可能凭原始成功事实撤销缺项。这不是本次三个情景指标误报的放行原因，但应防止后续通过放宽复核来修复本故障时，绕过来源与单位核验。

### F3 · P1：最终门禁失败后仍输出长篇未核验分析

**现场证据。** 最终 answer 有完整经营结论，文末只有“未完全通过单列聚合证据核验”的提示。保存状态却为 verified=false。

**代码原因。** `AnalysisTurn.render()` 在 state incomplete 时，只要模型正文超过 30 字且不含某个失败短语，就保留全文并加软角标。判断依据是正文长度与文本包含关系，不是逐项结论的证据覆盖。

**影响。** 读者会把正常业务正文视为完整验收结果；错误缺项和真正的数值不确定性也被混在一起。角标无法修复正文中的未证实归因。

**修复。** 输出明确的 complete / partial / awaiting_user / failed 状态。已核验金额与比率可继续呈现；未核验计算不生成确定性结论。事实、算术分解和待核实原因分开表达。门禁误报应修契约，不能靠全文降级返回消化。状态和前端展示使用同一个终态，不按字符串猜测是否核验通过。

### F4 · P1：工具契约与数学表达式造成可避免的修复轮次

**首轮实际错误。** `where.and` 有一个合法月份筛选，失败来自 `having.and=[]`。离线检查确认该 where 可通过，空 having 复现相同错误。因此不能笼统归因“模型不会写 and 嵌套”。

**缺路径。** 第二次执行遗漏 file_path；当前 Schema 明确要求 file_path，dispatcher 主要校验参数是 JSON 对象和工具可用性，没有在派发前完整执行暴露的 Schema 校验。

**增长率表达式。** `(H2/H1)-1` 在数学上正确，但引擎把商标记为 ratio，把常数 1 标记为 number，因单位不同拒绝相减。这是工具类型设计与模型表达之间的契约问题，不能直接定性为财务算法错误。保留金额与工时之间的严格维度检查仍然必要。

**修复。** 为 query/source/where/having 暴露可校验的嵌套结构与布尔数组长度；无 HAVING 时省略该字段。将报错定位到 JSON Pointer，例如 `/query/having/and`。对单一、已授权且绑定明确的附件，由执行上下文提供 attachment_id，避免每次重写路径；多附件时仍需明确绑定。增长率统一编译为 `(current-base)/base` 或注册增长率操作，补充分母为零行为，避免把所有 ratio/number 混算都放开。安全归一化应记录原计划和变换依据，不静默修正实体、期间或业务范围。

### F5 · P2：工具裁剪与提示词分层仍有边界问题

当前 runner 与 agent_loop 都有工具选择逻辑；遇到“报告”“report”或可视化交付时，会合并保留更广工具，工具错误达到一定次数后还会注入 bash 与“立即写 Python”的指导。本次保存的回执没有 bash，不能认定该兜底实际发生。

系统词、专业分析规范、领域词典、技能、附件结构和门禁 JSON 都可能叠加。专业规范中既有必要的取数原则，也有去重、空值、分组、前缀过滤、单位和异常检测等操作细节。工具 Schema 中还存在泛化 analyze 与细分能力的重叠。

**修复。** 沿用并统一现有工具策略，按当前阶段的能力需求选工具。文字“报告”本身不应开放天气、提醒、发送等无关能力。常驻规则只保留真实性、授权、信任边界和呈现原则；任务卡保留本次口径；细节移入对应 Schema 或按需示例。计算成功后进入有界综合阶段，不继续携带全部候选工具。保留发现缺口时返回计算阶段的受控转移。

### F6 · P2：遥测未覆盖整条模型调用链

16 次代理请求与 11 次 telemetry 计数不一致。当前语义契约裁判和任务完整性裁判直接调用 `call_model_proxy`，没有通过同一个全局用量汇总器记录。无法据此恢复全部辅助调用的精确 Tokens，也不能断言所有差额属于某一种裁判。

**修复。** 在模型代理边界统一记录 turn_id、span_id、parent_span_id、调用用途、模型、耗时和 usage；调用用途至少区分 intent、plan、tool_select、source_review、gate_review、synthesis。一次请求只入账一次；流式重试和缓存命中单独记录。应用阶段耗时与代理嵌套耗时分别展示，避免重复相加。用户首字时间从入口至首次可见业务内容测量，工具缓冲阶段不冒充已向用户输出。

### F7 · P2：裁判缓存与预算没有完整绑定任务上下文

当前语义缓存键主要由版本、指令和排序表头构成，未纳入 domain、模型、工作簿来源哈希、Sheet 结构及已确认比较基准。主契约调用也没有把当前任务 deadline 传递给裁判。两者会增加复用错误判断和预算失控的风险；本次没有证据证明跨文件缓存污染或超时已经发生。

**修复。** 区分“纯语言需求缓存”和“来源绑定缓存”；后者必须包含来源结构与任务确认版本。缓存使用规范 JSON 序列化，避免逗号拼接字段集合的歧义。所有辅助模型调用共享 task deadline，并设置独立剩余预算。复核按契约版本、证据版本和 issue 集合去重；同一状态不重复全文喂回模型。

## 6. 财务结果与最终文案审查

下表金额与期间比率来自本次成功计算回执；增长率及缺少的差额由本次审查使用 Decimal 对已保存事实离线计算，不能冒充当时已生成的工具事实。

| 指标 | 上半年 | 下半年 | 变化 |
|---|---:|---:|---:|
| 营业收入，千元 | 55,120.00 | 68,900.00 | +25.00% |
| 毛利，千元 | 22,970.00 | 30,473.25 | +32.67% |
| 营业利润，千元 | 8,309.60 | 12,899.80 | +55.24% |
| 净利润，千元 | 6,280.95 | 9,757.35 | +55.35% |
| 毛利率 | 41.67% | 44.23% | +2.56 个百分点 |
| 营业利润率 | 15.08% | 18.72% | +3.65 个百分点 |
| 净利率 | 11.40% | 14.16% | +2.77 个百分点 |

原审计中的毛利 +31.3%、营业利润 +58.3%、净利润 +56.5%、毛利率 +2.16%、营业利润率 +3.68%、净利率 +2.73% 均不能由该成功回执支持。原最终回答中的主要对比表更接近真实回执，不能把原审计的数字错误全部算到最终回答上。

原最终正文的“产品竞争力增强”“高毛利产品占比提高”“供应链议价能力增强”“固定成本受到控制”等，缺少产品、采购价格、成本性态或销量拆分证据。即使部分段落有“可能”，后面的确定性结论仍应降级为待核查假设。

费用率下降可以核实，但原 18 项工具事实没有销售、管理、研发费用聚合。审查直接读取原件可得到销售费用率约 11.8436% → 11.5679%，正文若保留一位小数应为 11.8% → 11.6%，而不是 11.5%。读取原件 data_only 时净利润等部分公式无缓存，本次净利润对比依赖原成功核算回执；没有将空值视作零，也没有重新运行 LibreOffice 重算。

建议合格答案采用“已核实变化 → 同口径算术分解 → 待核查原因”结构。例如，收入与利润率共同改善可以由回执证明；产品结构与议价原因需要额外数据。若要给出费用动因，应先把对应费用和费用率变化纳入工具计划。

## 7. 目标提示词与控制协议

### 7.1 五层输入结构

| 层次 | 内容 | 维护方式 |
|---|---|---|
| 稳定核心 | 真实性、授权、信任边界、语言与表达 | 少量常驻规则，避免堆业务补丁 |
| 任务约定 | 已确认需求、推定口径、完成条件 | 本轮构建一次，显式版本化 |
| 来源与工具 | 附件 ID、候选表、所需 Schema | 按阶段最小集合 |
| 执行状态 | 已核验事实、真实缺口、修复动作 | 结构化短反馈；详细证据另存 |
| 相关历史 | 年份、比较习惯、用户确认 | 保留语义与出处，折叠旧表格与证据抽屉 |

用户指令、附件事实、裁判建议应保留来源类型。当前 `normalize_messages_for_llm()` 会把非前导 system 转为 user；重构时需按后端支持的协议统一合并控制指引并隔离不可信证据，不能仅修改 role 字段而改变权限含义。

### 7.2 本次任务卡示例

```text
目标：解释 2026 年下半年盈利能力变化。
期间依据：年度来自已有会话与原件标题；本次按下半年对上半年解释。
比较基准：H2 对 H1，属于明确说明的分析假设，可由用户修正。
来源：已授权附件；优先检查含月份与收入、利润字段的候选表。
核心证据：两期间收入、毛利、营业利润、净利润及期间利润率。
规则：期间利润率使用利润合计/收入合计；比率差用百分点。
解释：费用归因须有对应取数；产品、价格和固定成本原因只能作为待核实假设。
完成：所需事实和口径核验通过后直接综合；不重复计算已成功项目。
候选字段不能自动成为任务要求；用户未要求情景分析时，不补造情景分析义务。
```

任务卡应由现有契约和来源绑定生成，不把此附件名、Sheet 名、年份或财务结果写成全局特判。“盈利能力”可由版本化领域定义展开为指标集，必须记录为领域推导，而非伪装成用户逐项点名。

### 7.3 精简错误反馈示例

```json
{
  "status": "repair_required",
  "contract_version": 2,
  "successful_fact_ids": [],
  "error": {
    "code": "invalid_predicate",
    "pointer": "/query/having/and",
    "reason": "逻辑组合必须包含至少一个子条件",
    "repair": "本次无需组后筛选，省略 query.having；保留有效的 query.where"
  },
  "retry_scope": "修复当前计划，不增加业务指标或比较情景"
}
```

无需每轮重复所有表头、所有历史错误和完整复核理由。事实 ID、源表定位和引用必须可回查；摘要不能替换底层证据或删除尚未解决的错误。

### 7.4 复核提示词的核心规则

```text
只核查当前问题，不新增任务目标。用户需求与真实来源优先于候选字段和旧计划。
判定分三类：执行缺项需要补算；任务约定错误需要提出有依据的契约修订；信息不足需要澄清。
每个动作指向 issue_id 或 requirement_id，并列出依据。
不得要求模型通过计算用户未请求的指标来消除契约错误。
不得以修订需求为由豁免来源哈希、范围完整性和执行真实性校验。
repair 只能引用当前实际支持的工具参数；无法表达时说明缺口，不编造 aggregation 等字段。
```

## 8. 实施阶段与代码边界

| 阶段 | 优先级与交付 | 主要位置 | 验收重点 |
|---|---|---|---|
| A | P1：需求来源、候选 Sheet 绑定、复核状态修复 | analysis_contract / spreadsheet_preflight / analysis_gate_review / analysis_task_state | 本次请求不产生三项情景必需指标；clarify 不变成 repair |
| B | P1：结构化工具参数与证据交付 | spreadsheet_analysis_schema / query_contract / tool_dispatch / analysis_turn | 首轮合法；错误精确定位；不再用长正文加角标替代证据覆盖 |
| C | P2：统一工具策略、提示词分层、历史与反馈预算 | runner / agent_loop / prompt_builder / context_budget | 仅开放阶段所需工具，保留需求与计算来源 |
| D | P2：全链路 usage、deadline、缓存与性能 | llm / telemetry / semantic_contract_judge / task_completeness_judge / 模型代理 | 代理请求与任务账本可对齐，缓存与重试独立计量 |

复用现有模块，避免增加第二套契约、工具路由和完成判定。当前 agent_loop 925 行、analysis_contract 754 行、analysis_task_state 644 行、prompt_builder 530 行、tools 790 行，虽然未超过 1,200 行，但多处已超过 500 行。实施时应把来源选择、契约修订、修复决策和呈现分别下沉，不继续把分支堆入编排文件；不按行数机械拆分。

上线采用固定请求对照与小流量灰度，分别记录正确率、误报率和成本。回滚按契约版本、提示词版本和工具策略版本切换，保留原任务证据。涉及参数、依赖、服务运行模式或跨服务链路时，通过根目录 `./docker/start-smart.sh` 更新相关服务并验证运行哈希与接口行为；不能仅看到本地测试通过就假定容器生效。本次审查没有做上线操作。

## 9. 回归矩阵与性能目标

### 必须通过的正确性场景

| 场景 | 预期 |
|---|---|
| 本次原请求与同一原件 | 无情景指标污染，核心事实正确，最终完整状态可核验 |
| 调换 Sheet 顺序、增加无关参数页 | 不改变原用户需求；不能因页序引入情景义务 |
| 用户明确要求乐观/保守情景 | 必须要求对应证据，不能被通用趋势规则删除 |
| 用户指定同比、预算或先确认口径 | 按指定基准执行或直接等待用户，不强制 H1/H2 |
| 无 HAVING、合法非空 HAVING、空 AND/OR、否定 | 合法计划可执行，非法节点精确报错；不能用省略逻辑改变筛选结果 |
| 单附件绑定、多附件歧义、附件变更 | 正确绑定；歧义不猜；来源变更使绑定与缓存失效 |
| `(H2/H1)-1`、规范增长率、零分母 | 等价表达有明确契约，金额与时间混算仍拒绝 |
| clarify 同时带待撤销问题 | 保留 awaiting_user，不改成 repair |
| 裁判判定契约误报 | 修订需求后重新核验；不能拿原始未合规事实直接放行 |
| 已算对但存在未证实因果段落 | 保留事实，因果标为假设或补充相应取数 |
| 单纯文字报告 vs 图表文件交付 | 前者不扩张全部工具；后者按阶段开放必要能力 |
| 代理重试、裁判调用、缓存命中 | 账本与代理请求一致；用途可分解，无重复计费统计 |

### 拟定性能验收目标，尚未实测

- 此类单文件、两期间比较任务：主规划/工具/综合模型调用通常控制在 3—4 次，辅助裁判仅按需要触发；真实缺口允许继续执行，不以硬截断换取好看的数字。
- 在冻结模型、源文件、历史和推理配置后，主执行口径输入 Tokens 以 **≤50,000** 为首轮优化目标；全链路 Token 另设包含裁判的独立账本。
- 同类任务端到端 p95 相对固定基线下降至少 30%；完整核验率不能下降；真实缺项和来源不一致的拒绝率不得下降。
- 建立覆盖上述场景的固定集合，多次重复记录首次有效计划比例、模型调用数、修复原因、Tokens、缓存命中、p50/p95。单一样本不用于声称平台级 95% 成功率。

按当前平均输入不变，仅将记录调用数从 11 降到 4，输入可由约 223k 降到约 81k，约减少 64%；这是算术情景，不是预测或实测。进一步下降取决于实际输入分项、来源摘要和工具策略。

前缀缓存应在版本和配置核实后测量。vLLM 官方说明 APC 复用共有前缀，降低 prefill 时间，不降低 decode 时间；因此不能承诺开启后整次调用降低 60%，更不能根据 prompt_tokens 总量反推缓存未启用或全部按未缓存价格计费。[vLLM APC 官方说明](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/#limits)

## 10. 本次已完成的验证与未完成项

已完成：原始 Redis 会话读取；沙箱证据读取；本次契约缓存键精确匹配；同附件结构预检确认主表错误；13 个运行文件哈希对齐；5 项网络隔离诊断；依据原成功回执的 Decimal 比较复核；原件部分金额与费用率离线检查。

5 项诊断分别覆盖：澄清动作被改写、错误契约指标无法撤销、原始成功事实绕开空合规事实池的相邻风险、本次 v5 契约缓存键匹配、有效月份 WHERE 与空 HAVING 的差异。前三项通过 AST 提取当前真实函数执行，避免导入有外部服务行为的模块。它们是窄范围复现，不是整条链路测试。

未完成且不应声称完成：历史最终请求完全重建；真实模型 Token 分项；16 次代理请求逐一绑定父级用途；历史缓存命中量；原请求真实模型复跑；任何优化后性能数据。报告中的修改、目标和灰度步骤均为待实施方案。

建议首先落地阶段 A 和 B，并用该 Session 作为固定回归样本；随后用统一调用账本判断哪一部分提示词真正值得进一步压缩。

## 11. 主要代码定位

| 能力 | 当前代码 |
|---|---|
| 主表候选选择 | [spreadsheet_preflight.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_preflight.py:305) |
| 主表表头进入契约 | [analysis_contract.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_contract.py:86) |
| 裁判输出进入强制指标 | [analysis_contract.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_contract.py:116) |
| 语义契约裁判与缓存 | [semantic_contract_judge.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/semantic_contract_judge.py:34) |
| 复核建议与重验 | [analysis_task_state.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_task_state.py:582) |
| 重验和动作改写 | [analysis_gate_review.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_gate_review.py:6) |
| 未通过时正文降级 | [analysis_turn.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_turn.py:214) |
| query 与专业指引 | [spreadsheet_analysis_schema.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_analysis_schema.py:101) |
| 逻辑条件校验 | [query_contract.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/query_contract.py:78) |
| 量纲和算术 | [spreadsheet_expression.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_expression.py:198) |
| 参数派发 | [tool_dispatch.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:54) |
| 基础系统词 | [prompt_builder.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py:46) |
| 工具策略与运行时追加 | [agent_loop.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:215) |
| 消息角色与请求组装 | [llm.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/llm.py:206) |
| 用量累计 | [telemetry.py](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/telemetry.py:190) |
