---
name: xlsx
zh_name: "Excel 专业表格与数据分析引擎"
description: "专业级 Excel 电子表格创建、编辑、数据分析、动态公式计算与无头重算校验。当用户需要新建表格、处理 xlsx、计算财务模型、整理数据或导出 Excel 报表时必须使用此技能。不要用于普通的文本写作或幻灯片设计。"
tags:
  - "excel"
  - "xlsx"
  - "spreadsheet"
  - "report"
  - "data"
  - "recalc"
triggers:
  - "xlsx"
  - "excel"
  - "表格"
  - "做个表"
  - "报表"
  - "生成excel"
  - "导出excel"
  - "csv转excel"
  - "整理数据"
  - "财务模型"
  - "凭证"
  - "交易明细"
  - "工作表"
  - "工作簿"
  - "科目"
  - "资产负债"
  - "利润表"
  - "现金流量表"
  - "勾稽"
  - "sheet"
deliverables:
  - ".xlsx"
requires_execution: true
default_rounds: 5
---

# XLSX Creation, Editing, Analysis & Recalculation Skill

本技能提供工作簿只读解析、审计核算、动态公式建模与高保真整本翻译规范。总览索引保留核心环境约束与场景路由；各场景细则按需从 `references/` 加载，也可通过 `read_skill(skill_name="xlsx", section="<章节或文件名>")` 按需展开。

## 1. 核心红线与运行环境
- **只读与写操作边界**：只读分析、审计、核算与问答场景严禁改写原工作簿；新建与本地化修改产物统一保存至 `/workspace/<filename>.xlsx`。
- **预装工具与依赖**：内置 `openpyxl` 与整本翻译引擎 `/opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py`，严禁 `pip install`。
- **动态公式与无头重算**：新建或局部公式编辑必须写入经典兼容公式（禁用动态数组溢出函数 `XLOOKUP`/`FILTER`/`UNIQUE`/`SORT`/`SEQUENCE`，2007+ 函数加 `_xlfn.` 前缀），保存后执行 `python3 /opt/dsh/skills/xlsx/scripts/recalc.py <output_path>` 校验 `status == "verified"` 且 `total_errors == 0`。整本 OOXML 翻译默认跳过 LibreOffice 重写并设置打开时重算。
- **严谨证据链**：数字、公式引用与表结构必须源于本轮 `read_file` 或工具真实回执；严禁凭抽样切片下全表结论或虚构未验证结果。

## 2. 按场景加载细则索引（Progressive Reference Routing）

| 适用任务 | 按需模块 | 核心内容 |
|---|---|---|
| 只读读取、工作表目录、行列切片与格式还原 | [inspection.md](references/inspection.md) | `read_file`、`sheet_not_found` 自愈、日期/精度/空值规范 |
| 多表审计、异常查重、偏差对比、聚合查询与领域指标 | [audit.md](references/audit.md) | `compare_spreadsheet_columns`、`aggregate_spreadsheet`、公式/字段协议 |
| 新建报表、动态公式防火墙、`openpyxl` + `recalc.py` | [generation.md](references/generation.md) | `_xlfn.` 兼容名单、`recalc.py` 四态校验、生成模板 |
| 整本多语言翻译、原地保真改写、字体与公式前缀保护 | [translation.md](references/translation.md) | `ooxml_xlsx_translate.py auto`、本地化字体/公式/前缀保护与汇报规范 |
| 财务报表分析、三表勾稽与比率口径（仅财务域启用） | [finance-analysis.md](references/finance-analysis.md) | 财务指标口径、分子分母与跨期间约束 |
