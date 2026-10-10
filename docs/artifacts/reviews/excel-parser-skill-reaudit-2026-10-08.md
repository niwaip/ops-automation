# Excel 解析与 XLSX Skill 修改后复审

日期：2026-10-08。范围：当前工作区源码、XLSX Skill、相关测试。未修改业务代码，未重启服务；本报告不确认运行容器已加载当前源码。

## 结论

本次修改方向正确，但尚未通过边界验收。原有日期/布尔值呈现、共享公式展开、有效区域切片、目录查询跳过重算以及缺少缓存时拒绝通过等问题已有改善。仍存在数值精度丢失、覆盖度守卫放行切片结论、合法空字符串公式误判、损坏缓存复用等问题。

现有测试 17 项通过：财务修复测试 15 项，Office 中 Excel 专项 2 项。额外使用临时工作簿验证以下边界；实际执行了本地 LibreOffice 重算。未使用用户原始工作簿。

## 主要发现

### 1. [P1] 数值格式化丢失原始精度

位置：`apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/office_tools.py:215-229`。

样例第二行输入为 `0.000049`、`7.123456789`、`0.12345678`，第三列格式为 `0.0000%`。实际输出：

```text
A2:0 | B2:7.1235 | C2:12.35%
```

普通浮点数固定保留四位小数，百分比最多保留两位，而输出没有独立 raw_value。汇率、单价、微小金额和利率的后续解释可能以错误精度为依据。

建议：保留无损数值字段；展示值按工作簿格式单独生成。不要使用展示字符串承担计算或证据传递。

### 2. [P1] 切片覆盖状态未进入全表审计守卫

位置：`src/dsh_modules/agent_loop.py:635-665`；相关输出位于 `office_tools.py:450-451`。

提取 `交易明细!A2:H3` 后，结果明确标记 `mode=SLICED` 和 `状态: SLICED`。向守卫输入全表查重问题和回答“经全面审查，未发现重复凭证。”，当轮没有执行计算工具，实际 action 为 `pass`。

新的附件截断提醒可以触发 `continue`，这是已修复项。但守卫仍不识别切片状态；纠偏计数达到 1 后，同一截断断言也直接 `pass`（`agent_loop.py:455-457`）。测试还明确把仅执行 `python3 -c 'import pandas'` 视为足够的计算依据。

建议：把目标 Sheet、请求区域、实际扫描区域、文件版本、计算结果及验证状态作为结构化检查依据。未覆盖全表时只能作区域结论；纠偏预算耗尽应返回未完成验证，而不是放行全量断言。

### 3. [P1] 合法空字符串公式被误判为未计算

位置：`skills/xlsx/scripts/recalc.py:261-265`；缓存检查 `office_tools.py:63-87`。

实际 LibreOffice 样例：A1 为 `=SUM(1,2)`，A2 为 `=""`。执行重算后结果为：

```json
{"status":"partial","total_formulas":2,"cached_formulas":1,"uncalculated_formulas":1,"uncalculated_locations":["Sheet!A2"],"total_errors":0}
```

`=""` 返回空字符串是合法计算结果。当前仅以 data_only 值为 None、或 XML 的 v 文本为空判定未计算，无法区分合法空字符串缓存与缺缓存。这会拒绝正常的 IF/IFERROR 空白输出工作簿，并导致重复重算。

建议：结合 OOXML 单元格结果类型、缓存节点和实际重算过程判断；将合法空字符串、缺缓存和无法确定分开记录。

### 4. [P1] 已有损坏缓存仍会被复用

位置：`office_tools.py:86-87,138-141`。

`_has_uncalculated_formulas` 对损坏 ZIP 返回 False。将非空损坏文件写入当前算法对应的缓存路径后，缓存 helper 直接返回该文件。复现仅模拟重算脚本/soffice 可用性，未执行重算；命中的是缓存复用分支，测试生成的缓存已删除。

新生成缓存会检查重算 JSON，这是改善。但已有缓存没有 ZIP/工作簿完整性、错误状态和验证凭据检查。

建议：解析异常返回 invalid/unknown；缓存复用必须验证完整性和明确的通过状态。缓存键纳入校验器版本，避免延续旧版本生成的不合格缓存。

### 5. [P2] 空值保留仍未覆盖表结构中的首尾字段

位置：`office_tools.py:369-388`。

样例 H1 为“必须填字段”，H2/H3 为空。指定 `A2:H3` 时正确显示 `H2:[EMPTY]`、`H3:[EMPTY]`；默认全表/目标表读取却按每行首尾非空单元格缩窄列范围，H2/H3 被省略，表仍标记 FULL。

建议：按表头、Excel Table、显式范围或数据契约确定列范围；字段完整性检查不能依赖每行的非空范围。

### 6. [P2] 无效或歧义切片请求静默扩大读取范围

位置：`office_tools.py:301-305,333-339,450-451`。

以下均已复现：

- 指定不存在的 Sheet 和 A2:B2，返回全部工作表。
- 指定有效 Sheet 和 `range=INVALID`，返回该表全量。
- 多 Sheet 工作簿只指定 A2:B2，不指定 Sheet，区域参数被忽略。

以上输出仍带 `mode=SLICED`，但表级状态是 FULL。ZIP/XML 降级路径也未执行新增 Sheet/range 参数约束，且静默吞掉 openpyxl 异常。

建议：不存在的 Sheet、非法区域、歧义区域明确返回错误；降级解析必须遵守同样的选择约束。覆盖状态应由实际执行结果生成。

### 7. [P2] 公式错误识别与状态存在边界错误

位置：`skills/xlsx/scripts/recalc.py:266-295`。

- 直接检查无公式、A1 是 Excel 错误值 `#DIV/0!` 的工作簿，得到 `status=verified` 且 `total_errors=1`。原因是 formula_count==0 分支优先判 verified。
- A1 为普通说明文本“错误说明：遇到 #N/A 时联系管理员”，A2 有合法缓存公式。普通说明文本被误算为错误，结果 partial。
- `_is_tool_error` 不识别仅包含 status=partial/unavailable 的 JSON。

边界说明：实际 CLI 重算纯 #DIV/0! 样例时，LibreOffice 将其转换为公式，CLI 正确返回 partial/退出码 1；不能把直接校验函数的误判描述成该 CLI 样例退出码为 0。

建议：按单元格错误类型判断；任何 verified 状态均要求 total_errors==0；统一执行状态与验证状态的接口。

## 性能与 Skill 一致性

- 目录模式确实不再调用重算 helper，已复现 call_count=0。
- 目录模式不加载公式工作簿，却仍输出“公式数:0”；样例实际有两条共享公式。未统计应输出“未统计”。
- 目录模式仍非 read_only 加载工作簿，并遍历每个 Sheet 的全部行后才取前三行，尚未实现轻量目录读取。
- 常规读取双份非流式加载，并对矩形 used range 逐格扫描。大表/远端格式单元格会增加内存与时间消耗。
- DATA_COVERAGE 目前仍是文本标签，缺少程序可检查的扫描行数、展示行数及重算状态。
- Skill 已增加只读、审计、生成三种流程；但通用约束仍要求“计算总计、均值、比率必须写入公式”，应限定于编辑/生成模式。
- 美化模板仍在主 SKILL.md 中，并非真正按需加载。832 行 office_tools.py 同时承载四类 Office 解析及两套 Excel 实现，后续修改宜将 Excel 解析、格式化和重算缓存职责下沉。

## 验证与复现

在仓库根目录使用工具返回的 bundled Python 执行：

```text
python3 -B -m unittest discover -s apps/backend/runtimes/personal-sandbox-runner/tests -p test_financial_workbook_fixes.py -v
15 tests: OK

python3 -B -m unittest discover -s apps/backend/runtimes/personal-sandbox-runner/tests -p test_office_sandbox.py -k xlsx -v
2 tests: OK
```

额外边界样例记录在同目录 `excel-parser-skill-reaudit-2026-10-08.json`，包含结果及五个关键文件 SHA-256。临时复现脚本位于 `/tmp/excel_parser_reaudit.py`。测试结束后核对关键源码哈希未变化。

当前测试不足：所谓四态测试只检查不存在文件返回原路径，没有验证合法空字符串、静态错误单元格、损坏缓存或真实状态流转。建议针对本报告的业务边界补充回归，而不是仅增加格式化函数的 Mock 测试。
