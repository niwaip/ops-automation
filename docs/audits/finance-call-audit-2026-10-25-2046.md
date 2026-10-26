# 财务汇总调用审计：2026-10-25 20:46

## 结论

**这次存在可复现的门禁误拦截，且会连带阻断自动补算。查询与计算并非互斥，但混合计划的执行协议尚不完整。**

- 同一任务“查询金额 → 计算毛利率”已有支持，现有定点测试通过。
- query 本身支持聚合计算，本次第三次工具调用已执行 `sum`。
- 同一个参数对象同时传 `query` 与顶层 `calculations` 时，当前执行器先返回 query 结果，顶层派生计算没有执行。这是协议缺口，不能作为正常完成。
- 本次的直接失败路径是：期间被语义合约标为过滤 → 指标选行被排除在业务过滤之外 → 合法事实被清空 → 误报全部指标未知、存在多余过滤 → 自动补算提前退出。

因此需要修正过滤语义与混合计划执行，不应整体关闭来源、单位、范围和计算证据校验。

## 原调用与性能

| 项目 | 证据 |
|---|---|
| 指令 | 总结2026年收入、毛利率、营业利润和净利润。 |
| 会话 | `chat-session-1792925510601-ej9n8j4g` |
| 消息 | `1792932302448-58dpttf4` |
| turn | `1792932374899205836-711aac5680d14fa2a4f1949fe28ed0f7` |
| HTTP trace | `fbc5b71c-7b9d-4c2d-8542-89648abb5d39` |
| 实际时间（北京时间） | 20:45:02 发起，20:46:14 完成 |
| 模式/模型 | chat，default 解析为 qwen36-35b-a3b，thinking，medium，timeout=300s |
| HTTP / Harness / Runner 耗时 | 72,401 / 72,350 / 71,808.13 ms |
| 遥测 TTFT / LLM duration | 7,337.78 / 30,581.72 ms；不代表浏览器首字与全部辅助模型总耗时 |
| 遥测响应 / 工具回执 | 7 次 / 3 份（失败 2，成功 1） |
| 累计输入 / 输出 token | 129,661 / 1,574；不是单次上下文长度 |
| 业务终态 | `verified=false`，spreadsheet_evidence reject；进程 exitCode=0 |

链路为 ChatController → UserSandboxDispatcher → Session Broker → dsh → Model Proxy / Spreadsheet tools → 门禁 → 会话持久化。附件本轮重新上传，SHA-256 为 `9d71ca8cc6172add7e558ac6a906f677c784fcc5c9d3444cbb17de2772fd992f`。

日志另记录 20:45:41、20:45:48 两次 `aborted` 重试；本时间窗没有足够证据将其进一步定性为上次相同的 TLS 错误。

## 三次工具执行

1. **失败：计划 ID 校验。** 毛利率项把 `id=gm`、`label=毛利率` 放进 expression 内，calculation 顶层缺少 ID；其余项还存在 `rev → rev` 等自引用，没有实际来源表达式。不是“禁止查询和计算同时使用”。复核建议中的“补 plan_id”也不准确，原错误校验的是计划内各项 ID。
2. **失败：calculations 不是合法 JSON 数组。** 回执未保存该次完整 requested_plan，不能重建全部原始参数。
3. **成功：利润表按项目分组取实际值。** query 指定 `A4:D14`、header_row=3、`group_by=[项目]`，对“2026实际”执行 sum，选行条件为 `项目 in [营业收入, 毛利, 营业利润, 净利润]`。

第三次回执 `0bc077bb2eb7810772e51999` 完整覆盖所选范围，返回四个来源明确的金额事实：

| 项目 | 实际值（千元） | 来源 |
|---|---:|---|
| 营业收入 | 124,020 | 利润表!B4 |
| 毛利 | 53,443.25 | 利润表!B6 |
| 营业利润 | 21,209.4 | 利润表!B10 |
| 净利润 | 16,038.3 | 利润表!B14 |

该科目过滤是在行式报表中选取指标及毛利率的分子、分母，没有按部门、客户等维度缩小业务口径。金额已读取；毛利率仍需要派生计算回执。

## 已定位的工程错误

### 1. 期间条件与业务行过滤混为一个布尔开关

`analysis_contract.py` 会从附件预检取得“月度经营”的字段列表，再使用 SemanticContractJudge 缓存。用相同指令和实际预检字段计算出的缓存键是 `3602663779980fec233c02ca9012e48198bee15a797d4ff867e0b12baafd0197`，缓存内容为：

`filter_conditions = ["月份 = '2026年' 或 包含 '2026' 的周期"]`

`_contract_from_judge_verdict` 据此设 `has_filters=True`。选择年度是合理要求，但“2026实际”列已承担期间选择；不能仅因没有月份 WHERE 就否定这个年度列。当前布尔值没有区分期间绑定、指标选行与业务范围筛选。

### 2. 合法指标选行被清空，错误被描述成“多余过滤”

`analysis_fact_selection.py:249` 因 has_filters 进入过滤分支。`_is_metric_row_filter` 正确识别上述科目筛选，包括毛利率所需的毛利。随后 259–262 行将它排除出业务过滤列表；没有业务过滤的事实没有被加入任何候选集合。294 行又因 has_filters=True 不允许回退保留，最终 303 行清空 items。

`analysis_task_state.py:95` 见“有成功回执，但筛选后 facts 为空”，随后将其归类为 `unsolicited_filter_applied`，并因没有事实而追加四项 `required_metrics_missing`。这两条用户提示是同一处事实丢失造成的级联症状，不是四个字段真的都缺失。

此路径不会调用 SemanticFilterJudge。即使同一科目筛选已有 matched=true 缓存，也无法救回事实。

### 3. 误报阻止派生计算

`registered_metric_completion.py:73` 只允许在 issue 为 required_metrics_missing / comparison_windows_missing 时补算。多出的 unsolicited_filter_applied 使其直接返回，原调用没有生成 registered_derivation 回执。

与 18:54 审计时相比，当前代码已增加 query 分组事实到单元格操作数的绑定能力。这次不能继续归因于“完全不支持 query 事实补算”；当前卡点在前置误报。

### 4. 同一对象的 query 与 calculations 未完整串接

`spreadsheet_analysis.py:397–405` 执行 query 后直接返回，不会继续后面的 legacy calculations 循环。

用独立临时数值工作簿验证：同时提交合法 query 和毛利率 calculations，工具返回 success、四份金额事实，但没有毛利率事实。这是静默漏执行，需要修复或明确拒绝该混用形态。它与上述过滤误报是两个不同问题；本次成功调用只带 query，不能把混合协议问题认作该成功调用清空事实的原因。

## 定点验证

已保存可重复运行的 `offline_probe.py`，使用原回执和原语义缓存，禁止模型调用，不覆盖原工作簿。

| 实验 | 保留的目标金额事实 | 缺失指标 | 自动补算源调用 |
|---|---:|---|---:|
| 原缓存合约 has_filters=True | 0 | 四项全部 | 0 |
| 仅将合约 has_filters 改为 False | 3 | 仅毛利率 | 1（拦截执行、检查生成计划） |

第二组生成的派生表达式明确为利润表 B6÷B4，output_unit=%，证明程序具备从该 query 取数后继续计算的能力。修改 has_filters 是诊断实验，不能作为全局关闭过滤核验的修复方案。

另运行既有 `test_registered_metric_completion_query.py`：1 项通过，包含实际派生计算、完整性判断和结果渲染。该测试使用结构合约回退路径，没有覆盖本次真实语义缓存，因此测试通过与线上失败并不矛盾。

第三组验证同一对象 query+calculations：success 但派生未执行，已写入 offline-probe.json。

## 修复建议

1. **P1：将期间绑定、指标选行、业务 WHERE、HAVING 分开表示和校验。** 年度列能提供期间证据；指标选行及其派生操作数应被保留。真正的跨期间或业务范围偏移仍应拒绝。
2. **P1：修正事实选择器的空候选分支。** 有合约过滤意图但当前事实只有指标选择时，应核对实际期间来源，不应直接清空，也不应自动报“未经请求的过滤”。
3. **P1：补齐 query → 派生表达式的显式阶段。** 同一任务允许查询和计算组合；同一计划必须完整执行声明项，暂不能执行的混合形态应明确报错。
4. **P2：修复与终态提示只围绕未完成项。** 保留三项已核实金额，准确指出毛利率未算；别让已恢复的两次计划语法错误覆盖第三次成功事实。
5. **P2：增加带真实语义合约缓存/表头的集成回归。** 同时验证正确年度列、指标选行、派生操作数、真正业务过滤、错误期间和混合计划，避免只验证离线回退路径。

## 证据与边界

产物目录：`docs/artifacts/reviews/finance-call-audit-20261025-2046/`，包含 session.json、execution-evidence.json、service-logs.txt、contract-judgment.json、offline_probe.py、offline-probe.json、source-hashes.json。

目标沙箱与本机关键模块 SHA-256 一致；核对了实际导入位置 `/usr/local/bin/dsh_modules/`。仅凭普通无附件的离线构约会走 has_filters=False 的回退路径，无法复现本次故障；加入真实缓存后已精确复现两条告警和补算阻断。

本轮仅审计、封存及验证，没有修改业务代码、重跑用户会话、重启或部署服务。完整毛利率计算在本次原调用中仍未完成。
