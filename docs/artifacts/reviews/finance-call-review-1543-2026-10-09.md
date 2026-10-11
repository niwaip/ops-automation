# 10/9 15:43 月度最大偏差调用复核

用户问题：找出收入与净利润偏差最大的月份。

会话：chat-session-1791531739690-piddfrm1。实际分发时间15:42:38，回答保存时间15:43:11，北京时间。

## 结论

这次有明确实现回归：自动重算模块与独立脚本的导入边界被打断，指标契约仍按正文正则验收且遗漏“偏差最大月份”的任务操作，最终追加了错误的“净利润已达成”声明。模块拆分与统一工具结果的方向可以保留，当前实现尚未形成计算与任务验收闭环。

不能用两个不同问题的单次结果证明整体系统质量下降。但本次确实没有回答目标，且能复现具体代码故障。

本轮未修改业务代码、原工作簿或服务配置，未重放生产模型请求。仅保存审计报告及证据；计算验证使用临时副本和一次性子进程环境。

## 实际调用与版本

Redis history只有本次一问一答。分发参数携带正确问题和附件，未发现旧会话串入的证据。沙箱当前 analysis_contract、analysis_validation、workbook_calculation、excel_tools、agent_loop 与 recalc.py 六个文件哈希全部与本地一致。

Redis executionTrace：4次模型调用、3次bash工具调用，外层耗时32,512ms，累计输入68,628 Token、输出2,503 Token、合计71,131 Token；结束原因依次为tool_calls/tool_calls/tool_calls/stop，Harness exitCode=0。

| 顺序 | 保留的命令预览 | 遥测状态 |
| --- | --- | --- |
| 1 | cd /workspace，Python导入openpyxl/load_workbook，指定工作簿路径 | success |
| 2 | Python导入openpyxl/subprocess/json，注释“先运行 recalc.py 进行公式重算” | success |
| 3 | Python导入openpyxl/subprocess/json，注释“复制一份以允许重新计算”，调用cp | success |

命令参数只保存截断预览，没有完整脚本及完整工具输出，不能据此精确还原每次子进程参数或stderr。以下依赖故障为当前同版本代码、同哈希附件的运行时复现。

## P0：重构后两种正式入口都有导入故障

位置：workbook_calculation.py:254、skills/xlsx/scripts/recalc.py:227。

1. 自动计算模块改成 `import recalc`，但该脚本在 `/opt/dsh/skills/xlsx/scripts/recalc.py`，不在运行解释器模块搜索路径。实际沙箱helper复现：

```text
status=failed
Exception during recalculation: No module named 'recalc'
```

2. 独立CLI脚本可以启动，LibreOffice也存在于 `/usr/bin/soffice`。但其重算后校验新增导入 `dsh_modules.workbook_calculation`，独立脚本解释器找不到 `/usr/local/bin/dsh_modules`。对原件指定临时输出复现：

```text
returncode=1
error=No module named 'dsh_modules'
status=failed
output_created=true
source_unchanged=true
```

这是项目内部模块部署/导入路径问题，不能直接归因于缺少LibreOffice或建议pip安装项目内部模块。

现有测试 test_financial_workbook_fixes.py:23-26 手动把 src 与 skills/xlsx/scripts 同时加入sys.path，测试运行环境比真实入口多了搜索路径，因此可能掩盖这一部署边界。

建议：将共享校验器放到正式安装、双方可导入的包内；CLI只做薄适配，运行模块调用包内服务。短期可以恢复明确绝对路径的子进程入口并配置受控模块路径。新增真实容器入口测试，不能先人工修改sys.path再把成功视为部署通过。保留原件只读、输出副本和计算凭据。

## P1：契约遗漏真正的任务操作

build_analysis_contract 把这句话解析成营业收入与净利润两个 expected_type=number 指标，is_audit_intent=True，但没有操作、对比基准、分组维度、排序方向及所需月份字段。

本次按附件“预算对比”表可建立明确口径：

```text
operation=argmax
group_by=month
metrics=[revenue_variance, net_profit_variance]
baseline=budget
variance=actual-budget
ranking=absolute_value
outputs=[month, actual, budget, signed_variance, source]
```

这是基于本附件预算表的分析解释，不是所有“偏差”问题都必然采用的口径。用户指定百分比、环比或其他基准时应按其要求处理；实际歧义需要澄清。

结果必须验证全部12个月参与比较，各指标分别给出最大偏差月份和实际/预算/差额。出现收入或利润数字不等于完成排序任务。

## P1：“净利润已达成”来自75%的误匹配

位置：analysis_validation.py:58,74-88。

将实际回复的模型正文输入当前验证器，结果为：

```text
status=partial
satisfied_metrics=['净利润']
missing_metrics=['营业收入']
净利润 detected_value_text='75%'
```

75%是税率推导中的比例，不是某月净利润金额，也不是预算差额。当前number指标允许百分比单位，且未绑定工具证据、真实月份或计算输出。

建议：验证结构化计算结果的字段类型、单位、操作及来源；最终文案只渲染经过验证的结果。禁止将解释中的比例、公式常量及任意数字作为完成证据。模型写入的source或verified字段还须核对真实工具结果，不能自行宣称可信。

## P1：最终声明固定归因于轮次上限

位置：agent_loop.py:1168-1191。

finalizer对不通过的指标契约一律追加“当前对话达到执行轮次上限”，不读取实际终止原因。即使其他原因结束，也可能出现同样文案。当前run_agent_loop硬上限4轮；只读分析默认3轮。此次4次模型调用与硬上限一致，限制没有留下继续修复和核算的空间。

但不能把所有失败都归因于预算不足：导入故障在正常路径中就已存在，增加轮数无法从根本解决模块搜索路径。新的finalizer没有给任务增加真实计算能力，仅更显眼地暴露了未完成状态，而且“已达成项”也误判。

建议：保留真实 termination_reason 和 TaskState；按已验证结果生成 partial/failed，列出真正缺项和根因。预算按读取、计算、恢复阶段分配且保持硬上限，不用把所有只读分析一概压成3轮。终止时不能再要求用户确认系统已经读到的表结构。

## 模型正文中的计算错误

原公式：M=max(0,L×25%)，N=L-M。

- L>0：N=0.75L。
- L<=0：M=0，N=L；亏损仍为负数，只有L=0时净利润为0。

回复将“税前利润<=0”概括为“净利润为0”错误。正文也只承诺手工计算，没有展示逐月计算、比较结果或最终月份。

## 临时副本正向验证

原件SHA-256：9d71ca8cc6172add7e558ac6a906f677c784fcc5c9d3444cbb17de2772fd992f。

仅在一次性CLI子进程设置 PYTHONPATH=/usr/local/bin，调用同一recalc.py，原件指定独立临时输出：returncode=0，289个公式缓存全部通过，0未计算、0错误，原件哈希保持不变。没有更改持久环境或业务代码。

从计算后的“预算对比”表，按实际-预算的绝对值排序：

| 指标 | 最大绝对偏差月份 | 实际 | 预算 | 有符号差额 | 来源 |
| --- | --- | ---: | ---: | ---: | --- |
| 收入 | 12月 | 13,400 | 11,530 | +1,870 | 预算对比!A15:D15 |
| 净利润 | 7月 | 934.3125 | 1,380 | -445.6875 | 预算对比!A10,E10:G10 |

单位：人民币千元。该正向验证说明附件数据与现有LibreOffice可完成该任务，模块路径缺口可以定位，无须模型手工展开全部公式。

## 优先修复及验证范围

1. 修复共享包部署和两种正式入口导入，真实容器启动测试先通过。
2. 将最大偏差月份建成比较/排序任务契约；金额指标拒绝百分比证据。
3. 用真实计算输出与出处验收，不再正则扫描最终解释当作核算。
4. 记录真实终止原因并安排恢复预算，最终声明准确列出任务结果。
5. 对bash内子进程使用check=True或明确检查returncode与业务JSON状态；外层Python正常退出不能证明重算成功。本次3个success只证明当前遥测记录，缺少完整输出不能断言每次内部失败的具体形式。

限制：部署哈希证明当前运行文件一致，不能代替历史逐时刻版本存档；重算报错和成功结果来自当前环境复现，生产调用保留的工具参数只为预览。不同问题之间的耗时与Token不用于证明模型整体能力升降。
