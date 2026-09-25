# Scenario: Markdown / Direct Report PDF Generation

适用于：从聊天上下文、Markdown、统计指标、天气预报、分析总结等直接排版生成单页/多页 PDF 报表。

## 推荐标准方案：使用内置 generate_report_pdf.py 命令行工具（100% 避免字符串转义错误）

将生成的内容直接写入 `/workspace/report.md`，然后调用标准脚本生成，完全不用手写复杂的 FPDF 坐标计算与引号转义：

```bash
cat << 'EOF' > /workspace/report.md
# 报表标题
副标题或发布说明

## 一、核心概要
此处为详细分析与数据总结内容，支持多行文本自适应换行。

| 日期 | 天气状况 | 气温范围 | 降水概率 | 风力 |
|---|---|---|---|---|
| 周四 (9/24) | 晴 | 24-31°C | 10% | 3级 |
| 周五 (9/25) | 多云 | 23-30°C | 20% | 3级 |

> 温馨提示：外出请根据气温适时增减衣物。
EOF

python3 /opt/dsh/skills/pdf/scripts/generate_report_pdf.py --input /workspace/report.md --output /workspace/report.pdf --theme blue
```

---

## 备选方案：手写原生 Python 模板脚本 (调用 bash 执行)：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
from fpdf import FPDF

# 1. 字体路径探测 (系统内置保证 100% 存在)
FONT_PATH = '/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf'
if not os.path.exists(FONT_PATH):
    FONT_PATH = '/tmp/font/NotoSansSC-Regular.otf'
if not os.path.exists(FONT_PATH):
    raise FileNotFoundError("未检测到本地中文字体，请检查 /opt/dsh/skills/pdf/assets/")

BOLD_FONT_PATH = '/opt/dsh/skills/pdf/assets/NotoSansSC-Bold.otf'

class CleanReportPDF(FPDF):
    def header(self):
        pass  # 禁用默认 header

    def footer(self):
        # 页面底部页码
        self.set_y(-12)
        self.set_font('Noto', size=9)
        self.set_text_color(150, 150, 150)
        self.cell(0, 8, f"第 {self.page_no()} 页", align='C')

# 2. 初始化 PDF 实例
pdf = CleanReportPDF(orientation='P', unit='mm', format='A4')
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(15, 15, 15)

# 3. 注册中文字体 (必须在写内容前注册)
pdf.add_font('Noto', '', FONT_PATH)
if os.path.exists(BOLD_FONT_PATH):
    pdf.add_font('Noto', 'B', BOLD_FONT_PATH)
else:
    pdf.add_font('Noto', 'B', FONT_PATH)

# ★★★ 必须调用 add_page() 打开页面！严禁在未打开页面前调用 ln() 或 cell() ★★★
pdf.add_page()

# 4. 标题与头部排版
pdf.set_font('Noto', size=20, style='B')
pdf.set_text_color(33, 37, 41)
pdf.cell(0, 14, text="报表标题", new_x="LMARGIN", new_y="NEXT", align="C")

pdf.set_font('Noto', size=10)
pdf.set_text_color(108, 117, 125)
pdf.cell(0, 8, text="生成日期: 2026年9月24日", new_x="LMARGIN", new_y="NEXT", align="C")
pdf.ln(4)

# 装饰分割线
pdf.set_draw_color(220, 224, 230)
pdf.set_line_width(0.4)
pdf.line(15, pdf.get_y(), 195, pdf.get_y())
pdf.ln(6)

# 5. 正文区块与数据列表
pdf.set_font('Noto', size=14, style='B')
pdf.set_text_color(33, 37, 41)
pdf.cell(0, 10, text="一、核心概要", new_x="LMARGIN", new_y="NEXT", align="L")
pdf.ln(2)

pdf.set_font('Noto', size=11)
pdf.set_text_color(49, 53, 59)
pdf.multi_cell(0, 7, text="此处为详细分析与数据总结内容，支持多行文本自适应换行。")
pdf.ln(4)

# 绘制规范表格（严禁使用 row.index(row)，直接用 enumerate 遍历）
pdf.set_font('Noto', size=10, style='B')
pdf.set_fill_color(240, 243, 246)
col_widths = [35, 45, 45, 30, 25]
headers = ["日期", "天气状况", "气温范围", "降水概率", "风力"]
for i, h in enumerate(headers):
    pdf.cell(col_widths[i], 8, text=h, border=1, fill=True, align='C')
pdf.ln()

pdf.set_font('Noto', size=9)
table_rows = [
    ["今天 (9/24)", "阴", "23.7 ~ 31.3°C", "12%", "3级"],
    ["明天 (9/25)", "毛毛雨", "23.9 ~ 33.1°C", "72%", "3级"],
]
for row_idx, row in enumerate(table_rows):
    pdf.set_fill_color(255, 255, 255) if row_idx % 2 == 0 else pdf.set_fill_color(248, 250, 252)
    for col_idx, cell_value in enumerate(row):
        pdf.cell(col_widths[col_idx], 8, text=str(cell_value), border=1, fill=True, align='C')
    pdf.ln()
pdf.ln(6)

# 6. 保存输出：必须保存至 /workspace/ 路径
output_path = '/workspace/report.pdf'
pdf.output(output_path)
print(f"SUCCESS: {output_path}, pages={pdf.page_no()}, size={os.path.getsize(output_path)}")
```
