# 21:22 部门金额汇总及柱状图调用审计

## 1. 结论

**汇总数据正确，柱状图交付失败，最终成功提示不可信。复合原因，以工程交付闭环缺陷为主。**

模型实际调用两次内置 `aggregate_spreadsheet`，首轮参数错误、第二轮成功；未执行 bash、Python 脚本工具或写文件工具。最终 `/workspace/index.html` 确实存在，但由运行时把失败警告和汇总表转换为普通 HTML，内无柱状图。浏览器实际展开预览与保存文件一致。成功横幅来自程序导出器，并非模型完成图表后的有效确认。

本次审计仅新增报告、证据副本及隔离复核脚本，未修改业务源码，未覆盖用户原表或原交付文件。

## 2. 身份及调用链

- 会话：`chat-session-1793107293434-lr4uyhir`，独立新会话，Redis history=2。
- 轮次：`1793107368597734218-dd2dd737c2fe47b7bb93cbfea124ee91`。
- 消息：`1793107306717-5xkbmfk8`；完成时间 2026-10-27 21:22:48（北京时间）。
- 模型：`qwen36-35b-a3b`，平台 model ID `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`。
- 路由：User Web → AI Orchestrator → Session Broker → 用户沙箱 dsh → 模型代理。
- 意图门禁识别三个要求：按部门金额求和、排除六种 WBS 前缀、生成柱状图；产物类型 `.html`。
- 技能准入为 `frontend-design`，`use_default_rules=false`。没有走上一轮 `dept-summary` 个人技能执行捷径，也没有串入另一会话“大于200 K”的筛选条件。

## 3. Spreadsheet 执行与来源门禁

### 实际工具

| 调用 | 工具与来源 | 结果 |
|---|---|---|
| round 0 | aggregate_spreadsheet，model_tool_call | invalid_analysis_plan |
| round 1 | aggregate_spreadsheet，model_tool_call | 成功，证据126b1cd74f88abbffda5b0b5 |

首轮 `query` 为字符串，且在 where 后多关闭一个 `}`，把 group_by 留在 JSON 根对象外。独立 JSON 解码复现：`Extra data: line 1 column 187 (char 186)`。工具错误为 `plan：query 必须为有效字典对象`。这是模型参数构造错误；优化后的 schema 将 query 定义为对象，但调用接入层没有在执行前以 schema 拒绝字符串，随后由引擎报错。不能据此判定 SQL 风格 where/group_by 本身过于复杂，也不能说优化后已彻底杜绝参数偏航。

第二轮直接提交对象：

```json
{"source":{"sheet":"工数实绩明细","header_row":4,"data_range":"A5:R278"},"where":{"field":"WBS编号","op":"not_starts_with","values":["ex","sy","sp","ip","ib","sz"]},"group_by":["部门名称"],"metrics":[{"id":"amount","op":"sum","field":"金额(K)"}],"order_by":[{"ref":"amount","direction":"desc"}]}
```

上例仅展示用户必要指标；实际模型额外添加 records、avg_amount、max_hours、total_hours 四个指标，成功回执和最终表均包含它们。额外指标不是计算错误，但增加上下文和交付噪声，平均值甚至直接显示27位小数。

### 独立原件复核

附件 `工数实绩明细_20261020134124.xlsx`，SHA256：
`5d5b57bdcb5e3257b93ccd4e2f5b194e96c3c573e651b93799c3dec2ec8d5374`。

来源范围为工数实绩明细!A5:R278，274条；独立 openpyxl + Decimal 逐行求和，未复用聚合引擎，未保存原件。排除21条（sp=9、ip=6、ex=6，其他三种前缀本表无命中），剩余253条；7组金额和记录数均与回执逐项一致。

| 部门 | 金额合计（K） |
|---|---:|
| 華東MIS | 561.75345 |
| 華東BAS | 260.64793 |
| SM華南BAS | 212.90759 |
| 流通/EBISS | 198.51766 |
| DM華南BAS | 171.65638 |
| 華南MIS | 164.90159 |
| 華北BAS | 67.03530 |
| 全部部门合计（审计独立计算） | 1637.41990 |

来源哈希、范围、过滤条件、聚合结果均可追溯。`spreadsheet_evidence=accept` 在“核算证据”层面成立，不能当作“柱状图已交付”的通过证明。原表前后哈希不变。优化后的 query schema 和 analysis schema 运行时哈希与此前落地版本一致，本轮确实运行了优化后的工具接口。

## 4. 交付门禁与最终文本

真实守卫顺序：

1. `analysis_presentation=runtime_owned`：模型最后文本未按证据格式提交，程序改用核算结果渲染。
2. `spreadsheet_evidence=accept`。
3. **`deliverable_contract=reject`，原因 `missing_physical_file_.html`**。
4. 外层 `runner.py:807` 继续执行 `ArtifactExporter.export_html`。
5. `html_report_fallback.materialize_requested_html` 将含失败警告的表格正文转为 index.html；其黑名单漏掉“目标交付物尚未生成落盘”这个真实门禁文案。
6. `artifact_exporter.py:286` 后续警告判断也漏掉该文案，并仅以文件/HTML存在作为导出条件，最终注入“✨ 交互式页面已生成完毕！”固定横幅。
7. 导出后没有与本次“柱状图”要求绑定的最终验收，也没有更新为成功的交付门禁记录。

保存的 index.html 只有 CSS、两张表及警告正文，无 script、svg、canvas、img，也无 CSS 柱形绘制。它是静态表格兜底，不是柱状图。标题直接截取了 `> ⚠️ **【重要提示：目标交付物尚未生成落盘`；来源链接和 details 标签部分被当普通文本转义，BU文本出现二次转义。

浏览器展开在线预览确认只有这些表格和警告；前端还将普通 HTML 卡片标成 `presentation.html`，提示演示文稿已就绪、键盘翻页，与真实输出路径 index.html 不一致。这是额外的展示文案问题。

在原沙箱全新进程、临时目录中，使用同样警告正文执行兜底和导出函数，稳定复现：`created_warning_html=true`、`success_banner_despite_warning=true`、`chart_present=false`。没有调用模型，没有修改原工作区产物。

另查到 `completion_evaluator.py:176` 的现存 index.html 检查没有本轮修改时间约束，且只要命中任意一个事实数字即可视为有效 HTML；此逻辑还可能提前结束可视化阶段。**缺少本轮开始前 index.html 快照，不能断言它就是本轮停止的直接触发条件**。已证实本轮止于第二次工具调用、没有图表生成动作；确定根因是后续拒绝状态被 HTML 兜底和成功文案覆盖。

## 5. 性能与统计口径

| 指标 | 原记录 | 审计解释 |
|---|---:|---|
| HTTP 全程 | 61.907秒 | 服务日志 |
| Harness | 61.870秒 | Redis trace |
| dsh | 61.281秒 | runtime metrics |
| TTFT | 6.322秒 | runtime定义，非整条业务链首个内部决策耗时 |
| 内置工具 | 2次 | 1失败、1成功；无bash |
| LLM调用 | 11次 | 重复记账，实际代理HTTP完成10次 |
| LLM耗时合计 | 50.111秒 | 含重复规划7.371秒；去重42.740秒 |
| 输入/输出Token | 70935 / 3992 | 含重复规划7775 / 557 |
| 总Token | 74927 | 去重为66595（63160输入、3435输出） |

重复根因：`llm.py:414` 对 purpose=planning 自动 `record_auxiliary_call`；`planning_phase.py:373` 又将同一返回值 `record_llm_response`。同一时延7371.18ms及同一 usage 在 ledger 连续出现两次，代理日志只存在一次7370ms请求。去重是本地遥测校正，不能等同供应商账单结论。

规划约7.37秒、最终分析 synthesis约10.91秒；主循环两次prompt分别17940、19297 tokens，明显高于本次简单单表分组需求。总时间还包含未细分的约18.54秒，现有trace不能可靠拆为工具、文件扫描或其他具体模块耗时，不能全归给 spreadsheet 运算。

## 6. 责任与落地优先级

- **P1 工程：** 交付拒绝状态应贯穿所有 exporter/fallback；导出后必须重新验收当前用户的柱状图、来源绑定、数据完整性，普通表格不得替代图表验收。
- **P1 工程：** 用结构化终态替代互不一致的警告短语黑名单；未验收不得生成成功横幅。实际文件存在与任务完成分开记录。
- **P2 工程：** 对模型入参执行统一schema验证；拒绝 query 字符串并给精确错误，不再进入分析执行链才发现。
- **P2 工程：** 完成判断核对本轮产物时间及全部数据；不以任意数字命中为验收。
- **P2 工程：** 修正规划重复遥测；简单汇总减少重复规划和不必要指标，上下文仅带当前聚合事实。
- **模型：** 首轮 malformed query、额外四指标，以及本轮未实际生成图表均有责任；但最终固定成功横幅是工程输出，不能归为模型口头幻觉。
- **展示：** 卡片文件名、图表/报告/演示文稿类型与实际交付物一致；最终应明确“汇总已核验，柱状图未完成”。

证据目录：`docs/artifacts/reviews/department-chart-audit-20261027-2122/`。核心文件：turn.json、redis-session.json、target-window.log、index.html、final-answer.md、audit-findings.json、offline-verification.json、offline-verify.py、source-snapshots/。
