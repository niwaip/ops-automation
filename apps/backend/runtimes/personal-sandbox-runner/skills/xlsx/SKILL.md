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
deliverables:
  - ".xlsx"
requires_execution: true
default_rounds: 5
---

# XLSX Creation, Editing, Analysis & Recalculation Skill

本技能为沙箱环境中的智能体提供专业级 Excel 电子表格处理、公式兼容性控制与自动重算规范。

---

## 1. 运行环境与依赖约束

- ✅ **预装库**：沙箱已内置 `openpyxl`，直接 `import openpyxl` 即可，**严禁使用 `pip install`**！
- ❌ **严禁填死计算结果**：计算总计、均值、比率时，**必须写入 Excel 动态公式**（如 `=SUM(B2:B10)`、`=AVERAGE(C2:C10)`），确保用户修改输入后能自动重算。
- ⚠️ **公式重算强校验（Recalculate Mandatory）**：openpyxl 写入的公式默认**无缓存值**，若不重算，下游工具读取均会显示 `None`。保存后必须执行 `/opt/dsh/skills/xlsx/scripts/recalc.py` 完成静默计算与格式修复。
- ✅ **输出位置**：文件保存至 `/workspace/<filename>.xlsx`。

---

## 2. 函数兼容性防火墙（Choosing Formulas That Survive Verification）

大模型容易写入 LibreOffice 或旧版 Excel 无法识别的新函数导致 `#NAME?` 报错。必须遵循以下白名单法则：

1. **首选经典稳固函数（无需前缀）**：
   - `SUMIFS`, `COUNTIF`, `INDEX`, `MATCH`, `IFERROR`, `SUMPRODUCT`, `VLOOKUP`, `AVERAGE`
2. **现代函数必须添加 `_xlfn.` 前缀**：
   - openpyxl 将公式原样写入 XML，Excel 内部对 2007 之后的函数带有前缀。如果不写前缀，LibreOffice 无法计算并直接报错：
   - `_xlfn.TEXTJOIN(...)`, `_xlfn.CONCAT(...)`, `_xlfn.IFS(...)`, `_xlfn.SWITCH(...)`, `_xlfn.MAXIFS(...)`, `_xlfn.MINIFS(...)`
3. **严禁使用动态数组溢出函数**：
   - 严禁使用 `XLOOKUP`, `XMATCH`, `SORT`, `FILTER`, `UNIQUE`, `SEQUENCE`（因缺乏 spill metadata 会造成数据被截断）。请在 Python 侧预先完成排序与去重，或使用 `INDEX` + `MATCH` 替代。

---

## 3. 标准生成与重算工作流

```bash
# 步骤 1: 运行 Python openpyxl 脚本生成 xlsx 文件
python generate_sheet.py

# 步骤 2: 驱动无头 LibreOffice 重算公式并固化缓存值 (强制执行)
python /opt/dsh/skills/xlsx/scripts/recalc.py /workspace/业务度量统计报表.xlsx
```

运行 `recalc.py` 会返回 JSON 诊断：
- 若返回 `{"status": "success", "total_errors": 0}`，说明所有公式均通过计算并已回填缓存；
- 若返回 `errors_found`，检查报错单元格坐标（如出现了 `#NAME?`、`#REF!`），修复脚本后重新运行。

---

## 4. 标准 Python 生成模板

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "业务统计报表"

# 1. 颜色与样式预设
header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
header_font = Font(name="Microsoft YaHei", size=11, bold=True, color="FFFFFF")
title_font = Font(name="Microsoft YaHei", size=14, bold=True, color="1F4E79")
regular_font = Font(name="Microsoft YaHei", size=10)
bold_font = Font(name="Microsoft YaHei", size=10, bold=True)
total_fill = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")

thin_border = Border(
    left=Side(style="thin", color="D3D3D3"),
    right=Side(style="thin", color="D3D3D3"),
    top=Side(style="thin", color="D3D3D3"),
    bottom=Side(style="thin", color="D3D3D3")
)

# 2. 写入主标题
ws.merge_cells("A1:E1")
ws["A1"] = "2026年业务运营度量报告"
ws["A1"].font = title_font
ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
ws.row_dimensions[1].height = 30

# 3. 写入表头
headers = ["序号", "业务系统 / 模块", "请求量 (QPS)", "成功率", "平均耗时 (ms)"]
ws.append([]) # 空行
ws.append(headers)
ws.row_dimensions[3].height = 24

for col_idx in range(1, len(headers) + 1):
    cell = ws.cell(row=3, column=col_idx)
    cell.fill = header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.border = thin_border

# 4. 写入业务明细数据
rows_data = [
    [1, "用户认证网关 (auth-service)", 12500, 0.9998, 12.5],
    [2, "AI 任务编排引擎 (orchestrator)", 4200, 0.9950, 450.0],
    [3, "工作流控制面 (control-plane)", 8800, 0.9992, 28.0],
    [4, "文件与文档渲染引擎 (carbone)", 1600, 0.9985, 120.0],
    [5, "安全沙箱调度中心 (broker)", 3100, 0.9990, 35.0],
]

start_row = 4
for r_idx, r_val in enumerate(rows_data, start=start_row):
    ws.append(r_val)
    ws.row_dimensions[r_idx].height = 20
    for c_idx in range(1, len(r_val) + 1):
        cell = ws.cell(row=r_idx, column=c_idx)
        cell.font = regular_font
        cell.border = thin_border
        if c_idx == 1:
            cell.alignment = Alignment(horizontal="center")
        elif c_idx == 3:
            cell.number_format = '#,##0'
            cell.alignment = Alignment(horizontal="right")
        elif c_idx == 4:
            cell.number_format = '0.00%'
            cell.alignment = Alignment(horizontal="right")
        elif c_idx == 5:
            cell.number_format = '#,##0.0'
            cell.alignment = Alignment(horizontal="right")

end_row = start_row + len(rows_data) - 1
total_row = end_row + 1

# 5. 写入动态公式汇总行
ws.cell(row=total_row, column=1, value="")
ws.cell(row=total_row, column=2, value="合计 / 平均值")
ws.cell(row=total_row, column=3, value=f"=SUM(C{start_row}:C{end_row})")
ws.cell(row=total_row, column=4, value=f"=AVERAGE(D{start_row}:D{end_row})")
ws.cell(row=total_row, column=5, value=f"=AVERAGE(E{start_row}:E{end_row})")

ws.row_dimensions[total_row].height = 22
for c_idx in range(1, len(headers) + 1):
    cell = ws.cell(row=total_row, column=c_idx)
    cell.fill = total_fill
    cell.font = bold_font
    cell.border = thin_border
    if c_idx == 2:
        cell.alignment = Alignment(horizontal="center")
    elif c_idx == 3:
        cell.number_format = '#,##0'
    elif c_idx == 4:
        cell.number_format = '0.00%'
    elif c_idx == 5:
        cell.number_format = '#,##0.0'

# 6. 冻结表头与自动列宽
ws.freeze_panes = "A4"

for col in ws.columns:
    col_letter = get_column_letter(col[0].column)
    max_len = 0
    for cell in col:
        if cell.row == 1:
            continue
        v_str = str(cell.value or '')
        l = sum(2 if ord(ch) > 127 else 1 for ch in v_str)
        if l > max_len:
            max_len = l
    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)

out_file = "/workspace/业务度量统计报表.xlsx"
wb.save(out_file)
print(f"SUCCESS: {out_file}")
```
