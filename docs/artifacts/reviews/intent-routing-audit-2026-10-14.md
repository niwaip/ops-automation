# 意图识别重构审查与办公场景路由实测

日期：2026-10-14（Asia/Shanghai）。

## 完整结论

本轮改动解决了之前“无需HTML/PPT”没有识别为否定的问题。上一轮制造业设备夜班交接的完整请求，现在返回 skill_id=None、is_generate_intent=True，交付物只有指定 Markdown；24 条短否定组合全部通过。零售闭店 Word 清单也正确选择 docx，冷藏食品温度不再命中天气模式。

但当前版本尚不能判定为“通用办公意图路由验收通过”。实际运行 140 条预先定义业务断言的用例，102 条通过、38 条未满足断言。普通制造业和零售业单轮请求各 14/15，通过情况较好；问题集中于格式转换、混合正负要求、只读与编辑、多轮重试和联网约束。部分失败只是状态字段或前置检索标志不一致，并不表示下游任务必然失败。

这些结果全部来自确定性的工程路由函数；本轮没有调用模型，故无法归因于小参数模型随机性。对每条请求再运行 3 次，共 420 次，所有路由决定一致。测试期间相关源码哈希未变。

## 方法与范围

- 实际调用当前仓库源码 `SkillRouter.route` 和 `select_active_tools`，使用部署共享目录 `data/shared/dsh-skills` 扫描的 18 个真实技能元数据，没有 mock 路由结果或以手工技能替代真实注册表。
- 记录 skill_id、动作/意图布尔值、交付物、执行要求、匹配依据和可用工具；输入包含用户原话、附件文件名、真实风格的附件包装和历史。
- 另外检查 runner 中前置检索的纯条件表达式。测试脚本重现该表达式，不执行 cmd_run；这个结果只评价前置检索决策，并不表示后续模型不能自行调用联网工具。
- 没有模型生成、文档质量评测、真实工具派发、网页检索、聊天/API端到端调用或容器热加载验证。路由运行环境为本地当前源码；本轮结论不替代部署后端到端验证。
- 另选 11 个已有路由、否定、动态技能、调研与相关提示构造测试方法，全部通过。这些方法包含多条内部断言，不与新增 140 个用例混算。
- 初次检查还运行过整个 `test_tech_deliverables_and_negation.py`（10 个方法全过），其中有临时目录下的产物和 CSV 格式检查；这些非路由检查不计入本报告的 140 条路由数据。
- 本轮仅新增测试脚本及审查证据，没有修改业务实现。

## 场景结果

| 分组 | 用例 | 通过 | 未满足断言 |
|---|---:|---:|---:|
| 制造业：生产、来料、库存、采购、设备、质检 | 15 | 14 | 1 |
| 零售业：销售、退换货、补货、排班、交接 | 15 | 14 | 1 |
| 通用办公：文档、会议、报销、只读总结 | 20 | 18 | 2 |
| 上一轮真实请求重放 | 3 | 2 | 1 |
| 格式优先级、否定作用域、修改动作 | 19 | 9 | 10 |
| 6种否定词×4种分隔符 | 24 | 24 | 0 |
| 历史续作、重新生成、确认生成 | 9 | 1 | 8 |
| 实时信息、联网要求、调研及天气 | 12 | 6 | 6 |
| 源/目标格式交叉、附件包装、多附件 | 7 | 7 | 0 |
| 文件名、输出契约、外发约束及英文 | 16 | 7 | 9 |
| 合计 | 140 | 102 | 38 |

这是刻意覆盖边界条件的用例集，102/140=72.9% 是本组断言通过比例，不是线上请求正确率，更不是模型能力评分。

## 确认的代码问题

### P1：一个否定的“生成”会取消其他正向生成要求

位置：`skill_router.py:268`。

`has_generate` 对一个动词按整段请求判断：只要任一处出现“不要生成”，同一动词在正向分句里的出现也被忽略。上一轮真实 MFG-01 请求要求“生成Excel…不要生成PPT或HTML”，本轮实际返回 xlsx 技能，但 `is_generate_intent=False`、`deliverables=[]`；工具列表只剩读取/分析表格能力，没有 bash 或写文件能力。这是本轮最关键的旧请求未闭环问题，修复 CSV 工具异常也不能解决该路由结果。

另一个固定复现是“不要生成PDF，改为生成整改.docx”：选择 docx，却没有生成意图和 `.docx` 交付契约。应按动词的每次出现和所属分句判定，禁止格式 A 不能取消生成格式 B。

### P1：否定作用域扩大到转折后的目标，格式别名也过度合并

位置：`skill_router.py:164`、`skill_router.py:169`。

新正则将否定一直扩展到中文标点，没有在“而是/改用/只要”等转折处结束。“不用PPT而是生成Word通知.docx”把目标 Word 一起否定，最终没有技能；“不要HTML改用Markdown，保存为巡检.md”没有 Markdown 契约。

此外 `.doc` 与 `.docx` 通过同义词表互相否定。“请生成日报.docx，不要生成旧格式.doc”会抑制 docx。用户指定的精确扩展名，应与宽泛格式家族分开处理；禁止旧格式不等于禁止全部 Word 格式。

### P1：没有区分输入格式与输出格式，技能分数覆盖转换目标

位置：`skill_router.py:737`，以及 `skill_router.py:881`。

“将上传的设备夜班清单.docx转为可下载PDF文件”返回 docx、交付物 `.docx`；零售巡检清单同样复现。输入文件中的 docx 同时获得 trigger 与 id/alias 加分，优于目标 PDF；随后输出契约直接取 docx 技能默认值，进一步固化错误。

需要先解析 source_files 和 requested_outputs，再只在兼容输出格式的技能中评分。输入为 Word 可以引用 Word 的读取能力，但不能把输出 PDF 换成 Word。

### P1：只读动作被文件名、修饰词或末尾补救逻辑改回生成

位置：`skill_router.py:265`、`skill_router.py:291`、`skill_router.py:920`。

- “总结生成的库存.xlsx”被判断为生成，交付 `.xlsx` 并开放写文件、bash、提醒等完整工具；“总结”没有进入已生成文件的只读语法保护。
- “查看制作说明.docx”把文件名中的“制作”当成动作，返回生成 DOCX。
- “查看刚才生成的交接.md”本应只读，末尾 `.md` 提取又检测到“生成”并将生成标志设回 True，交付物甚至变成 `查看刚才生成的交接.md`。

文件名和引用内容必须先从动作判定中隔离。只读结论应成为受保护的动作状态，不能被末尾文件名兜底反转。这里只证明工具面被错误开放，并未实际执行修改或外发。

### P1：多轮重试继承被禁止的格式，确认生成缺少完整恢复

位置：`skill_router.py:278`、`skill_router.py:310`、`skill_router.py:804`。

历史为“生成Word/Excel/PDF/Markdown…不要HTML/PPT”，本轮“重新生成”全部先匹配历史中的 HTML，选中 frontend-design。继承逻辑只搜词，没有沿用已解析的目标和禁止项。

“确认生成”在文件动作识别的基础分支提前返回，未到历史恢复；技能确认列表也没有覆盖这条词组，结果生成标志为 False、目标契约为空。9 条续作用例仅 1 条通过。

应保存并继承结构化上轮任务契约（动作、目标、来源、禁止格式），仅当前明确要求才能覆盖；不能从上一轮回答或原始整句中重新猜格式。

### P1：外发否定没有生效

位置：`skill_router.py:629`。

“不要通过微信发送，只生成Word交接.docx”返回 `is_send_intent=True`。该字段使用整句 substring 搜索，没有否定处理。虽然本轮没有调用 send_file，这仍是错误的动作识别，会使后续提示和执行流程误以为用户要求外发。发送动作必须解析出明确正向指令，并独立于文件生成。

### P2：编辑、图片问答和部分输出契约仍不完整

- 上传排班.xlsx 后要求“将明天的早班换成晚班”，路由只提供只读表格工具；修改交接.md 人员时只提供网页工具，缺少本地编辑能力。上传 Word 的预算修改则仍获得写能力，说明各格式行为不一致。测试对修改要求只检查可用写能力，不强制将修改标成新建。
- “仅回答上传照片里的商品是什么”没有检查意图，工具列表只有 web_search/fetch_page。需要把附件可读性和文件来源作为输入上下文，不能仅等待少数检查动词命中。
- “生成一页Markdown报告”仍被一页报告默认规则选为 frontend-design（`skill_router.py:710` 漏掉 Markdown），虽有 MD 目标，却带入 UI 技能。
- 未加引号的“整理并保存为交接.md”把动词前缀吞进目标文件名；大写 `.MD` 不提取；读入的 `.md` 也会被加入新交付物。`保存为Markdown文件`、CSV/JSON 导出缺少对应格式契约。契约缺失只表示路由无法完整验收，不表示本轮已经证明后续文件必然缺失。

### P2：本地调研文档与联网决策有歧义

- “检查上传的供应商调查报告，不要联网”因“调查”选中 research、关闭检查意图并开放完整工具。应先区分文件题名与用户调研动作，并尊重联网禁止项。
- “查看今天的铜价…”没有搜索意图；“联网查询今日铜价并生成Word报告”的前置检索仍为 False：runner 的新规则只是免于关闭搜索，不会为“联网查询”建立正向搜索决定。
- “生成今日天气PDF报告”被文档搜索抑制逻辑关闭前置检索；“降温检查项”仍命中天气 regex，但文档抑制层使其没有真正触发前置检索。
- allow_research=True 时分析附件 xlsx，研究标志虽为 False，检查标志也被最后一段清空；本例工具仍是只读表格面，是状态不一致，不是已证明的任务失败。

网页工具可能仍对模型可见，所以上述缺少前置搜索不等于无法联网；本轮评价的是路由字段与应执行策略的一致性。

## 工程评价与建议

优点是当前规则运行快、可重放，技能元数据仍能动态发现，不需要模型参与路由。新增同义词和短否定确实修复了真实案例；将“禁止修改原件”与“禁止生成文件”区分开也有价值。

不足是所谓 semantic affinity 目前是词项/中文字串重合、加权打分和正则，没有模型语义推理。不同阶段反复改写意图：先词匹配、再选技能、再恢复历史、再绑定技能默认输出、最后又用文件名兜底。最早正确的判定可以被后面覆盖，导致多种布尔值和实际工具能力互相矛盾。不能用更多末尾特判解决所有作用域问题。

建议按以下顺序小步重构：

1. 先建立统一请求契约，至少包含 action（read/create/modify/convert/search/send）、source_files、requested_outputs、forbidden_outputs、network_policy；中文/英文大小写、全角命令、文件名边界先归一化。
2. 正负分句、明确输出格式及只读/外发约束先解析，再选择兼容技能；技能默认输出只能填补用户没有指定的部分。
3. 多轮直接继承上轮契约；生成、只读、修改动作确定之后，统一导出工具面和提示。删除会在末尾反转动作的补救路径。
4. 固化本报告的完整真实请求与边界断言，优先消除 P1，再做部署后的少量真实回归。不需要为路由换模型，也不应把这些错误算作小模型不确定性。

`skill_router.py` 当前约 940 行，未超过仓库 1200 行阈值，但 route 函数同时处理动作、格式、上下文、技能评分和交付契约。建议随上述改动按职责下沉，不继续向该函数叠加新分支；runner 中的前置检索决定也应使用同一契约。

## 可复现证据

- `intent-routing-audit-2026-10-14.py`：140 条完整输入与业务断言，运行实际源码函数。
- `intent-routing-audit-2026-10-14.json`：每条返回值、工具列表、未满足断言、真实技能元数据与源码 SHA256。
- `intent-routing-audit-2026-10-14-repeat.json`：420 次重复路由，决定变化为 0，源码一致。

复现命令（仓库根目录）：

```bash
/Users/chain/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 docs/artifacts/reviews/intent-routing-audit-2026-10-14.py
```

路由纯函数本地重复测得中位数 1.52ms、P95 4.32ms；此值不含模型、网络、Docker、工具执行或 UI 开销。

源码指纹：

- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/skill_router.py`：`161f98123f0ffb30035eee4e20ef55042bc472d110c1629df1675dbfd840ae78`
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/runner.py`：`ac99986905768a3fd5d85fb1c8f20b3153a0ff4b01ca00cebb3332cede7b132b`
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py`：`51c863ea7eb633b7b51a1f3897d410f22e0e3b82bc9012a21863bf72a6b8ae2c`

## 全部用例与实际路由

下面技能为空以 `—` 表示；失败列为预设断言。完整布尔值与工具列表以 JSON 为准。

### 制造业：生产、来料、库存、采购、设备、质检

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| manufacturing-01 | 生成可下载Excel文件“生产日报.xlsx”，按产线统计计划、完成、不良数量。 | xlsx / .xlsx | 通过 |
| manufacturing-02 | 生成可下载Excel文件“来料检验.xlsx”，记录供应商、批次、抽样数量和不良数。 | xlsx / .xlsx | 通过 |
| manufacturing-03 | 生成可下载Excel文件“库存盘点.xlsx”，记录物料编号、账面数量、实盘数量和差异。 | xlsx / .xlsx | 通过 |
| manufacturing-04 | 生成可下载Excel文件“采购比价.xlsx”，比较单价、交期和起订量。 | xlsx / .xlsx | 通过 |
| manufacturing-05 | 制作一份设备交接Word文档，保存为“设备交接.docx”。 | docx / .docx | 通过 |
| manufacturing-06 | 制作一份供应商会议纪要Word文档，保存为“供应商会议纪要.docx”。 | docx / .docx | 通过 |
| manufacturing-07 | 制作一份质量整改通知Word文档，保存为“质量整改通知.docx”。 | docx / .docx | 通过 |
| manufacturing-08 | 读取上传记录，整理设备夜班清单并保存为“设备夜班清单.md”，无需HTML/PPT。（附件：交接记录.txt） | — / 设备夜班清单.md | 通过 |
| manufacturing-09 | 制作3页设备夜班清单培训演示文稿，生成原生“设备夜班清单.pptx”，不要HTML。 | pptx / .pptx | 通过 |
| manufacturing-10 | 将上传的设备夜班清单.docx转为可下载PDF文件。（附件：设备夜班清单.docx） | docx / .docx | skill_in；format_has |
| manufacturing-11 | 总结上传的日报，只在聊天中回答，不要生成任何文件。（附件：日报.xlsx） | internal-comms / 空 | 通过 |
| manufacturing-12 | 检查上传的记录并列出异常，不要修改原文件。（附件：记录.docx） | docx / 空 | 通过 |
| manufacturing-13 | 核对上传库存.xlsx中的账面数量与实盘数量，只给出差异。（附件：库存.xlsx） | xlsx / 空 | 通过 |
| manufacturing-14 | 读取上传的采购.csv，统计供应商数量，只在聊天中回答。（附件：采购.csv） | — / 空 | 通过 |
| manufacturing-15 | 草拟一封催交货邮件，直接在聊天中输出。 | — / 空 | 通过 |

### 零售业：销售、退换货、补货、排班、交接

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| retail-01 | 生成可下载Excel文件“门店销售.xlsx”，按门店汇总销售额与订单数。 | xlsx / .xlsx | 通过 |
| retail-02 | 生成可下载Excel文件“退换货.xlsx”，按原因汇总退货与换货数量。 | xlsx / .xlsx | 通过 |
| retail-03 | 生成可下载Excel文件“库存补货.xlsx”，记录现存、安全库存和建议补货量。 | xlsx / .xlsx | 通过 |
| retail-04 | 生成可下载Excel文件“员工排班.xlsx”，安排早晚班、休息和责任人。 | xlsx / .xlsx | 通过 |
| retail-05 | 制作一份闭店交接Word文档，保存为“闭店交接.docx”。 | docx / .docx | 通过 |
| retail-06 | 制作一份促销活动通知Word文档，保存为“促销活动通知.docx”。 | docx / .docx | 通过 |
| retail-07 | 制作一份收银交接Word文档，保存为“收银交接.docx”。 | docx / .docx | 通过 |
| retail-08 | 读取上传记录，整理门店巡检清单并保存为“门店巡检清单.md”，无需HTML/PPT。（附件：交接记录.txt） | — / 门店巡检清单.md | 通过 |
| retail-09 | 制作3页门店巡检清单培训演示文稿，生成原生“门店巡检清单.pptx”，不要HTML。 | pptx / .pptx | 通过 |
| retail-10 | 将上传的门店巡检清单.docx转为可下载PDF文件。（附件：门店巡检清单.docx） | docx / .docx | skill_in；format_has |
| retail-11 | 总结上传的日报，只在聊天中回答，不要生成任何文件。（附件：日报.xlsx） | internal-comms / 空 | 通过 |
| retail-12 | 检查上传的记录并列出异常，不要修改原文件。（附件：记录.docx） | docx / 空 | 通过 |
| retail-13 | 核对上传库存.xlsx中的账面数量与实盘数量，只给出差异。（附件：库存.xlsx） | xlsx / 空 | 通过 |
| retail-14 | 读取上传的采购.csv，统计供应商数量，只在聊天中回答。（附件：采购.csv） | — / 空 | 通过 |
| retail-15 | 草拟一封促销通知邮件，直接在聊天中输出。 | — / 空 | 通过 |

### 通用办公：文档、会议、报销、只读总结

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| general-01 | 生成会议纪要Word文件“会议.docx” | docx / .docx | 通过 |
| general-02 | 生成费用报销Excel“费用.xlsx” | xlsx / .xlsx | 通过 |
| general-03 | 生成员工培训PDF手册“培训.pdf” | pdf / .pdf | 通过 |
| general-04 | 生成项目汇报原生PPTX“项目.pptx” | pptx / .pptx | 通过 |
| general-05 | /word 制作周报 | docx / .docx | 通过 |
| general-06 | /excel 制作报销表 | xlsx / .xlsx | 通过 |
| general-07 | /pdf 制作项目说明 | pdf / .pdf | 通过 |
| general-08 | 将周会整理成“行动清单.md”（附件：会议.txt） | — / 行动清单.md | 通过 |
| general-09 | 把客户反馈保存为“客户反馈.md”（附件：会议.txt） | — / 客户反馈.md | 通过 |
| general-10 | 读取上传会议.txt，生成可下载“会议纪要.md”，不要生成PPT或HTML（附件：会议.txt） | — / 会议纪要.md | 通过 |
| general-11 | 查看上传的合同.docx的内容（附件：合同.docx） | docx / 空 | 通过 |
| general-12 | 阅读刚才生成的报告.pdf（附件：报告.pdf） | pdf / 空 | 通过 |
| general-13 | 总结生成的库存.xlsx（附件：库存.xlsx） | xlsx / .xlsx | is_generate_intent；deliverables_empty；tools_not |
| general-14 | 只在聊天中总结附件，不要生成文件（附件：材料.txt） | — / 空 | 通过 |
| general-15 | 总结这份文档，不用创建任何文件（附件：文档.docx） | — / 空 | 通过 |
| general-16 | 仅回答上传照片里的商品是什么（附件：商品.jpg） | — / 空 | is_inspect_intent；tools_has |
| general-17 | 总结这段话：今天已完成三项采购审核。 | — / 空 | 通过 |
| general-18 | 给出简短的会议开场白。 | — / 空 | 通过 |
| general-19 | 写一封请假邮件，不需要文件。 | — / 空 | 通过 |
| general-20 | 用Markdown表格比较早班与晚班职责，只在聊天中输出，不生成文件。 | — / 空 | 通过 |

### 上一轮真实请求重放

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| regression-01 | 请只根据上传的设备交接记录整理一份制造业设备夜班交接清单，生成可下载Markdown文件“制造业_M03夜班交接.md”。包含设备状态、巡检事项、异常处置条件、物料余量、安全事项、交接双方；原文里没有的信息标“未提供”，不要自行编造。无需HTML/PPT。（附件：制造业_设备交接记录.txt） | — / 制造业_M03夜班交接.md | 通过 |
| regression-02 | 请读取上传的制造业生产日报，按产线汇总计划数量、完成数量和不良数量，并计算完成率=完成数量/计划数量、不良率=不良数量/完成数量。生成可下载的Excel文件“制造业_生产日报汇总.xlsx”，至少包含“产线汇总”和“原始数据”两个工作表。只需要完成表格和必要说明，不要生成PPT或HTML。（附件：制造业_生产日报.csv） | xlsx / 空 | is_generate_intent；format_has |
| regression-03 | 请制作一份零售门店闭店交接清单，生成可下载Word文件“零售门店闭店交接清单.docx”。内容至少覆盖：现金与收银、冷藏食品温度、货架补货、退换货暂存、设备断电检查、钥匙交接、异常记录；用勾选表格呈现，包含责任人和备注栏。无需长篇说明。 | docx / .docx | 通过 |

### 格式优先级、否定作用域、修改动作

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| boundary-01 | 生成一页Markdown报告“日报.md”（附件：交接.txt） | frontend-design / 日报.md | skill_not |
| boundary-02 | 生成一页PDF报告的摘要，保存为“摘要.md”（附件：交接.txt） | pdf / .pdf, 摘要.md | 通过 |
| boundary-03 | 不需要HTML/PPT，整理交接记录保存为“夜班.md”（附件：交接.txt） | — / 夜班.md | 通过 |
| boundary-04 | 不要HTML改用Markdown，保存为“巡检.md”（附件：交接.txt） | — / 空 | deliverables_has |
| boundary-05 | 不要生成PDF，改为生成“整改.docx” | docx / 空 | is_generate_intent；format_has |
| boundary-06 | 不用PPT而是生成Word文档“通知.docx” | — / 空 | is_generate_intent；skill_in；format_has |
| boundary-07 | 不需要HTML只要原生PPTX文件“班组.pptx” | — / 空 | is_generate_intent；skill_in；format_has |
| boundary-08 | 不要改动原始Word，另存为“通知_v2.docx” | docx / .docx | 通过 |
| boundary-09 | 只生成“库存.xlsx”，不要任何其他文件 | xlsx / .xlsx | 通过 |
| boundary-10 | 请生成可下载“日报.docx”，不要生成旧格式.doc | internal-comms / 空 | is_generate_intent；skill_in；format_has |
| boundary-11 | 生成一页PDF报告，不要HTML | pdf / .pdf | 通过 |
| boundary-12 | 查看“制作说明.docx”（附件：制作说明.docx） | docx / .docx | is_generate_intent；deliverables_empty；tools_not |
| boundary-13 | 总结“生产日报.xlsx”（附件：生产日报.xlsx） | xlsx / 空 | 通过 |
| boundary-14 | 查看刚才生成的PPT，别重新生成（附件：班组.pptx） | guizang-ppt / 空 | 通过 |
| boundary-15 | 只提取“通知.pdf”的文字，不用Word文档（附件：通知.pdf） | pdf / 空 | is_inspect_intent；tools_not |
| boundary-16 | 把预算从30000改为36000，其他不变（附件：方案.docx） | docx / 空 | 通过 |
| boundary-17 | 将明天的早班换成晚班（附件：排班.xlsx） | xlsx / 空 | tools_any |
| boundary-18 | 把交接人李师傅改为王师傅（附件：交接.md） | — / 空 | tools_any |
| boundary-19 | ／excel 制作门店盘点表 | xlsx / .xlsx | 通过 |

### 6种否定词×4种分隔符

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| negation-01 | 生成可下载“交接.md”，无需HTML/PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-02 | 生成可下载“交接.md”，无需HTML或PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-03 | 生成可下载“交接.md”，无需HTML和PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-04 | 生成可下载“交接.md”，无需HTML、PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-05 | 生成可下载“交接.md”，不需要HTML/PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-06 | 生成可下载“交接.md”，不需要HTML或PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-07 | 生成可下载“交接.md”，不需要HTML和PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-08 | 生成可下载“交接.md”，不需要HTML、PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-09 | 生成可下载“交接.md”，不要生成HTML/PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-10 | 生成可下载“交接.md”，不要生成HTML或PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-11 | 生成可下载“交接.md”，不要生成HTML和PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-12 | 生成可下载“交接.md”，不要生成HTML、PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-13 | 生成可下载“交接.md”，严禁生成HTML/PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-14 | 生成可下载“交接.md”，严禁生成HTML或PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-15 | 生成可下载“交接.md”，严禁生成HTML和PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-16 | 生成可下载“交接.md”，严禁生成HTML、PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-17 | 生成可下载“交接.md”，不用制作HTML/PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-18 | 生成可下载“交接.md”，不用制作HTML或PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-19 | 生成可下载“交接.md”，不用制作HTML和PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-20 | 生成可下载“交接.md”，不用制作HTML、PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-21 | 生成可下载“交接.md”，不含HTML/PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-22 | 生成可下载“交接.md”，不含HTML或PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-23 | 生成可下载“交接.md”，不含HTML和PPT。（附件：记录.txt） | — / 交接.md | 通过 |
| negation-24 | 生成可下载“交接.md”，不含HTML、PPT。（附件：记录.txt） | — / 交接.md | 通过 |

### 历史续作、重新生成、确认生成

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| continuation-01 | 重新生成（历史：生成可下载Word文件“方案.docx”，不要HTML/PPT。） | frontend-design / 空 | skill_not；skill_in；format_has |
| continuation-02 | 确认生成（历史：生成可下载Word文件“方案.docx”，不要HTML/PPT。） | — / 空 | is_generate_intent；skill_in；format_has |
| continuation-03 | 重新生成（历史：生成可下载Excel文件“销售.xlsx”，不要HTML/PPT。） | frontend-design / 空 | skill_not；skill_in；format_has |
| continuation-04 | 确认生成（历史：生成可下载Excel文件“销售.xlsx”，不要HTML/PPT。） | — / 空 | is_generate_intent；skill_in；format_has |
| continuation-05 | 重新生成（历史：生成可下载PDF文件“报告.pdf”，不要HTML/PPT。） | frontend-design / 空 | skill_not；skill_in；format_has |
| continuation-06 | 确认生成（历史：生成可下载PDF文件“报告.pdf”，不要HTML/PPT。） | — / 空 | is_generate_intent；skill_in；format_has |
| continuation-07 | 重新生成（历史：生成可下载Markdown文件“交接.md”，不要HTML/PPT。） | frontend-design / 空 | skill_not；deliverables_has |
| continuation-08 | 确认生成（历史：生成可下载Markdown文件“交接.md”，不要HTML/PPT。） | — / 空 | is_generate_intent；deliverables_has |
| continuation-09 | 继续总结，不要生成文件（附件：材料.docx） | — / 空 | 通过 |

### 实时信息、联网要求、调研及天气

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| search-01 | 深度调研制造业供应链软件，比较常见产品 | research / 空 | 通过 |
| search-02 | /research 零售门店数字化方案 | research / 空 | 通过 |
| search-03 | 检查上传的供应商调查报告，不要联网（附件：报告.docx） | research / 空 | is_research_intent |
| search-04 | 查看今天的铜价和原料价格 | — / 空 | is_search_intent |
| search-05 | 查询最新零售市场动态 | — / 空 | 通过 |
| search-06 | 搜索最近的注塑行业展会信息 | — / 空 | 通过 |
| search-07 | 生成今日天气PDF报告 | pdf / .pdf | presearch |
| search-08 | 联网查询今日铜价并生成Word报告 | docx / .docx | presearch |
| search-09 | 制作Excel报表，不要搜索网络 | xlsx / .xlsx | 通过 |
| search-10 | 制作设备点检Word文档，包含降温检查项 | docx / .docx | weather |
| search-11 | 分析上传库存.xlsx（附件：库存.xlsx）（调研开关：开启） | xlsx / 空 | is_inspect_intent |
| search-12 | 比较不同的零售补货策略（调研开关：开启） | research / 空 | 通过 |

### 源/目标格式交叉、附件包装、多附件

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| attachment-01 | 读取采购.xlsx，生成采购说明.docx（附件：采购.xlsx） | docx / .docx | 通过 |
| attachment-02 | 读取设备.docx，生成培训.pptx（附件：设备.docx） | pptx / .pptx | 通过 |
| attachment-03 | 读取销售.csv，生成销售汇总.xlsx（附件：销售.csv） | xlsx / .xlsx | 通过 |
| attachment-04 | 读取销售.csv和说明.txt，生成经营分析.pdf（附件：销售.csv, 说明.txt） | pdf / .pdf | 通过 |
| attachment-05 | 读取通知.pdf，将其中内容保存为通知.docx（附件：通知.pdf） | docx / .docx | 通过 |
| attachment-06 | 【当前轮次用户上传附件】: 交接记录.txt ⏎ 用户指令：只在聊天中总结附件，不生成文件（附件：交接记录.txt） | — / 空 | 通过 |
| attachment-07 | 【当前轮次用户上传附件】: 交接记录.txt ⏎ 用户指令：生成“交接.md”，无需HTML/PPT（附件：交接记录.txt） | — / 交接.md | 通过 |

### 文件名、输出契约、外发约束及英文

| ID | 输入 | 技能 / 交付物 | 结果与未满足断言 |
|---|---|---|---|
| extended-01 | 查看刚才生成的交接.md（附件：交接.md） | — / 查看刚才生成的交接.md | is_generate_intent；deliverables_empty；tools_not |
| extended-02 | 读取交接.md并生成Word通知.docx（附件：交接.md） | docx / .docx, 读取交接.md | format_not |
| extended-03 | 整理并保存为交接.md（附件：交接.txt） | — / 整理并保存为交接.md | deliverables_has |
| extended-04 | 将交接记录保存为“交接.MD”（附件：交接.txt） | — / 空 | deliverables_has |
| extended-05 | 总结上传材料，保存为Markdown文件（附件：材料.txt） | — / 空 | format_has |
| extended-06 | 将门店销售导出为“销售.csv” | — / 空 | format_has |
| extended-07 | 将订单汇总导出为“订单.json” | — / 空 | format_has |
| extended-08 | Create a Word document checklist.docx. Do not generate HTML or PPT. | docx / .docx | 通过 |
| extended-09 | 不想要PPT，请制作Word通知.docx | docx / .docx | 通过 |
| extended-10 | 不要通过微信发送，只生成Word交接.docx | docx / .docx | is_send_intent |
| extended-11 | 通过微信发送上传的交接.docx（附件：交接.docx） | docx / 空 | 通过 |
| extended-12 | 查询知识库中的门店盘点流程 | — / 空 | 通过 |
| extended-13 | 不要任何文件，只用Markdown表格回复班次职责 | xlsx / 空 | 通过 |
| extended-14 | Export the attached production data as a PDF report.（附件：production.xlsx） | pdf / 空 | is_generate_intent；format_has |
| extended-15 | 【当前轮次用户上传附件】: 交接.docx ⏎ 用户指令：检查交接内容并列出异常（附件：交接.docx） | docx / 空 | 通过 |
| extended-16 | 制作一个可交互的HTML门店经营看板 | dashboard / 空 | 通过 |

