# Excel 调用修复后的通用方案评估

日期：2026-10-09。范围：当前工作区 Excel 解析、公式缓存、工具结果、Agent 任务验收与上下文管理。只读复核业务代码，使用临时合成工作簿验证边界；未重放线上模型调用、未重启容器、未修改业务实现。

## 判断

当前修复适合作为短期止损：不存在的 Sheet 能标为错误，原先数值公式空缓存误判有所修正，年度指标问答增加了纠偏。但核心机制仍依赖自然语言错误匹配、关键词、公式文本猜测及提示词。继续追加这些规则会增加误判并扩大 agent_loop.py 的职责。

更稳妥的工程方案是：结构发现 → 数据定位 → 有证据的计算 → 按任务契约验收 → 渲染答案。没有一个协议能够自动证明任意 Excel 财务回答正确；下文区分已有协议能力与本项目应自行实现的领域契约。

## 本地验证结果

三个新增回归用例通过：metric_alignment、sheet_not_found_structured、formula_str_empty_v。测试通过说明已覆盖的样例修复有效，不证明下面这些未覆盖边界正确。

| 边界输入 | 当前结果 | 缺口 |
| --- | --- | --- |
| 用户要求四项指标；只答“营业收入：100千元。” | guard=pass | 没有逐项验收 |
| 同一任务；答“营业收入：2026年尚未计算。” | guard=pass | 年份被正则当作指标数字 |
| round_idx=3；答“请问是否需要我读取利润表？” | guard=pass | 达到硬轮次上限后跳过验收 |
| 用户“统计订单金额。”；答“订单金额：500元。” | guard=continue | 通用金额任务被套入财务指标词表 |
| 正常说明文字包含 sheet_not_found | _is_tool_error=True | 内容与业务状态混淆 |
| =IF(FALSE,"",123)，t=str，缓存为空，默认 XML 命名空间 | 输入检查认为未计算；recalc 校验器认为 verified | 两套校验规则矛盾，表达式存在空串分支不证明实际结果为空 |
| =1+1，人为设置缓存值为 999 | verified_existing，校验器 verified | 有缓存不等于缓存正确或最新 |
| =1+1，缓存为空，XML 使用合法 ss 命名空间前缀 | 输入检查漏检，verified_existing；recalc 校验器 failed | 原始字节正则依赖无前缀标签 |

缓存样例为临时合成文件，使用 openpyxl 创建后修改单元格 XML，保持默认命名空间或显式设置 ss 前缀。条件公式样例两种判定来自同一文件。它们说明代码边界，不代表生产附件具有这些全部特征。本机无 soffice，条件样例 helper 返回 unavailable；没有验证 LibreOffice 本轮实际重算。

## 1. 工具层：采用明确的结果契约

当前 `excel_tools.py:349` 返回的是格式化字符串，即使包含“状态”“错误代码”，仍不是真正的结构化对象。`agent_loop.py:764` 继续靠正文搜索错误词。

新增内部 `ToolResult`，工具生产端直接决定业务状态，展示文字由 renderer 生成；调度器、遥测、任务验收读取同一对象。保留旧字符串工具的过渡适配器，逐个迁移，不一次重写所有工具。

建议最小对象：

```json
{
  "schema_version": 1,
  "status": "error",
  "data": null,
  "error": {
    "code": "sheet_not_found",
    "requested_sheet": "财务数据摘要",
    "available_sheets": ["经营汇总", "基础假设"],
    "recovery": "select_existing_sheet"
  },
  "provenance": {"workbook_id": "源文件SHA-256"}
}
```

`recovery` 是本项目自定义字段，不是 MCP 标准。若暴露为 MCP 工具，可映射工具执行失败为 `isError=true`，成功数据使用 `structuredContent` 与 `outputSchema`；协议支持结构化结果和错误信号，不负责验证领域指标正确性。[MCP 工具规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)。

独立记录执行结果、读取覆盖度、计算可信状态和任务结果。返回了可用的局部数据不等于工具执行失败；完成了进程也不等于用户任务完成。

## 2. 解析层：先结构发现，再按需读取

保留 `read_file` 兼容入口，内部区分 `inspect_workbook`、`read_cells`、`recalculate`。先获得一次工作簿 manifest：真实 Sheet 标识/名称、表头、范围、命名区域、表对象、公式分布及少量样本。

- 在重算前验证 Sheet 和区域；目前 `excel_tools.py:316` 先重算，再检查表名，错误选择也可能触发昂贵操作。
- 从 manifest 中选择已有表，用表头/科目定位实际单元格。不能把“利润表/月度经营”写成适用于全部附件的必然存在条件。
- 精确匹配优先；模糊匹配仅作为候选，歧义需要解决，不能静默替换用户指定表名。
- 目录任务不重算；数值任务读取目标区域并使用满足该任务的计算证据。全表查重才读取全量明细。
- 返回 raw_value、display_value、formula、number_format、source_cell；计算使用原始值，格式化不改变计算输入。

这一层可以复用 openpyxl。其 `data_only` 读取的是保存的计算结果，不会执行公式；官方明确说明 openpyxl 不计算公式。[公式说明](https://openpyxl.readthedocs.io/en/stable/simple_formulae.html)、[load_workbook 参数](https://openpyxl.readthedocs.io/en/stable/api/openpyxl.reader.excel.html)。

## 3. 计算层：统一缓存检查，并记录计算证据

停止用公式是否含 IF/空串来证明缓存已经算好。读取原件缓存时只描述“存在、缺失、错误、类型”，既有缓存可以供用户查看，但应标为 cached_unverified。存在缓存不能命名为 verified_existing。

共用一个校验器，输入预检和重算后校验都调用它；用命名空间感知 XML 解析或 openpyxl 支持的对象，不用无前缀标签正则判断公式。共享/数组公式也需要明确支持或报告不支持。

任务要求可信数值时，在隔离副本中调用计算引擎。现有 LibreOffice 可以继续使用，`calculateAll()` 提供全量重算能力，不必为本问题立即替换整套框架。[LibreOffice 计算接口](https://api.libreoffice.org/docs/idl/ref/interfacecom_1_1sun_1_1star_1_1sheet_1_1XCalculatable.html)。

计算证据至少包括：完整源哈希、输出哈希、引擎版本、校验器版本、计算时间、错误位置、必需单元格类型/结果。缓存键覆盖这些影响结果的条件；校验规则修改后失效旧凭据。波动函数、外部数据/链接和 Excel 特有函数另有新鲜度或兼容性限制，不能仅凭源文件哈希认为永远有效。

合法空字符串可以是任务允许的结果，但年度收入/净利润要求 number 时不能接受空串。把全工作簿健康状态与当前指标所需区域状态分开；无关 Sheet 的错误不应无条件阻止可证实的指标，但相关公式依赖的错误必须阻止。

不自行实现通用 Excel 公式解释器。直接从原始数据独立做聚合时，记录方法与来源，区分“复核计算”和“已重算工作簿”。

## 4. 任务层：逐项验收，并绑定来源

为本轮请求建立 `AnalysisContract`：period=2026、currency=CNY、金额单位来自工作簿、必需项 revenue/gross_margin/operating_profit/net_profit、actual/budget 口径。其他请求动态生成自己的契约，不能全局强制四个财务指标。

每项结果包含 value、unit、period、status、source_refs 和 calculation_ref。验证器检查：

1. 所有用户要求的指标都有结果或明确的缺失/失败状态。
2. 引用绑定当前附件哈希、真实单元格或真实计算输出，不能接受模型自行填写的“已验证”。
3. 数值类型、单位、年度范围与实际/预算口径一致；显示四舍五入与原值在约定容差内一致。
4. 年度毛利率按年度毛利/年度收入求比率，不能默认平均月度百分比；分母为零要明确失败。

任务验收基于结构化结果，最终正文只负责解释已验证数据。单纯 JSON schema 只能保证形状，仍必须核对真实来源与计算结果。

## 5. 编排与上下文：证据状态独立于聊天文字

`discover → select → read/recalculate → compute → validate → answer` 是建议的内部阶段，不必每阶段都增加一次模型请求；可在工具服务中合并确定性步骤。

- sheet_not_found 触发基于 available_sheets 的恢复；重算失败按原因处理；只在数据或口径确实缺失时询问用户。
- 达到预算上限后保持 task_status=partial/failed，输出已完成项与具体阻碍；停止纠偏不等于验收通过。
- 独立保存 TaskState、附件版本、工具结果引用和必要证据；模型消息压缩不删除真实验收依据。
- 模型上下文保留当前问题、紧凑目录、目标数据和必要计算结果。重复读取去重，大明细存为可分页引用，避免每轮重复注入整工作簿。
- tool call 与 tool result 按协议成组保留；旧附件的数据不能因会话摘要混入当前附件证据。
- 系统纠偏使用明确标识的控制消息，不作为新增业务需求重新识别。所有终局路径调用同一个验收器，避免主循环和 finalizer 的规则漂移。

## 6. Skill 与模块边界

Skill 保留如何使用工具、如何识别口径、何时需要计算与遇错恢复。机器可以强制验证的状态、表名、缓存和完成条件下沉到代码；删除针对某一次附件的表名禁用清单和过强的“全部禁止反问”。

`agent_loop.py` 当前 1,489 行，已超过仓库 1,200 行评估阈值。后续改动应将业务检查下沉，按职责拆分：

| 模块 | 职责 |
| --- | --- |
| tool_result.py | 工具结果契约与旧工具适配 |
| workbook_reader.py | manifest、真实 Sheet/区域校验、带类型的读取 |
| workbook_calculation.py | 引擎适配、共享校验器、缓存凭据 |
| analysis_contract.py | 当前任务所需指标与口径 |
| analysis_validation.py | 证据绑定、数值核验、完成条件 |
| task_state.py | 本轮状态、恢复策略、证据引用与预算终止 |

保留 excel_tools.py/office_tools.py 对外兼容，agent_loop.py 只编排通用阶段。模块拆分与行为改动分别小步提交。

## 落地顺序与验收

第一步：ToolResult、统一缓存校验与可信状态命名；兼容已有工具入口和日志。

第二步：工作簿 manifest 与结构化任务契约，替换财务数字正则；预算耗尽不再返回完成。

第三步：紧凑上下文与结果复用，最后简化 Skill。增加典型成功、选表恢复、真实不可计算、上下文压缩和预算耗尽的端到端回归。

最低回归集应覆盖：四项只答一项、年份混入、英文/换行/负数/零值、正确但非财务的金额任务；空串条件两分支、过期非空缓存、命名空间前缀、共享/数组公式；源码哈希不变但引擎/校验器改变；预算耗尽、工具错误后恢复、旧附件证据隔离。

效果指标应包括任务验收成功率、错误 Sheet 恢复率、无证据数值放行率、真实失败正确报告率、每任务工具/模型调用数、上下文 Token 和耗时。不能仅以退出码 0 或不再出现反问来证明质量改善。

以上是针对当前项目的工程设计建议；MCP 只提供工具协议标准，任务契约与财务验收属于项目自身职责。
