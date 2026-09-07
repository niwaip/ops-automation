---
name: xlsx
zh_name: "Excel 专业表格与数据分析引擎"
description: |
  Professional Excel (.xlsx) creation, editing, formula calculation, and data processing using openpyxl.
zh_description: |
  专业级 Excel 电子表格创建、编辑与自动化处理技能。基于 openpyxl 提供带公式、样式美化、自动列宽与多 Sheet 报表生成的标准工程模版。
tags:
  - "excel"
  - "xlsx"
  - "spreadsheet"
  - "report"
  - "data"
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
---

# XLSX Creation, Editing & Analysis Skill

本技能为沙箱环境中的智能体提供专业级 Excel 电子表格处理规范。

---

## 1. 运行环境与依赖约束

- ✅ **预装库**：沙箱已内置 `openpyxl`，直接 `import openpyxl` 即可，**严禁使用 `pip install`**！
- ❌ **严禁填死计算结果**：计算总计、均值、比率时，**必须写入 Excel 动态公式**（如 `=SUM(B2:B10)`、`=AVERAGE(C2:C10)`），确保用户修改输入后能自动重算。
- ✅ **输出位置**：文件保存至 `/workspace/<filename>.xlsx`。

---

## 2. 专业排版金标准（Output Standards）

1. **视觉美化与表头设计**：
   - 表头采用深色背景（如科技深蓝 `#1F4E79` 或沉稳灰 `#333F48`）配白色粗体字，或优雅浅蓝灰配深色字；
   - 单元格设置浅灰细边框（`Thin` Border），区分度清晰；
   - 隔行斑马纹（可选浅灰 `#F2F4F7`）增强长数据可读性。
2. **公式与引用**：
   - 求和：`=SUM(C2:C15)`
   - 占比/增长率：`=C2/$C$16`
   - 条件统计：`=COUNTIF(D2:D15, ">=90")`
3. **数字格式化（Number Formatting）**：
   - 金额/数值：`#,##0.00` 或 `#,##0`
   - 百分比：`0.0%` 或 `0.00%`
   - 日期：`yyyy-mm-dd`
4. **自适应列宽（Auto-fit Columns）**：
   - 遍历每列，按中英文字符宽度加权计算 `max_len = max(len(str(val)))`，中文按双倍字符估算，设置 `ws.column_dimensions[col_letter].width = max(12, max_len + 4)`。
5. **冻结首行（Freeze Panes）**：
   - 数据多于 10 行时，必须设置 `ws.freeze_panes = 'A2'` 或表头下一行，滚动时不丢失表头。

---

## 3. 标准 Python 生成模版

当用户需要生成报表、统计表或导出数据时，调用 `bash` 工具执行如下标准脚本：

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
        
        # 格式化
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

---

## 4. 智能体执行准则

1. **静默执行**：生成 Excel 时，直接调用 `bash` 执行 Python 脚本完成落盘；
2. **严防代码泄漏**：不要直接向用户输出裸露脚本，落盘后向用户汇报：
   - 📊 **文件名称**：如 `业务度量统计报表.xlsx`
   - 📈 **数据结构**：包含的核心 Sheet 与列字段
   - 💡 **公式说明**：如“总计行已绑定 `=SUM(...)`，修改数据后自动重算”
