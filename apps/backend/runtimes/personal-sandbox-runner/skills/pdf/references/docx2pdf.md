# Scenario: Convert Word (.docx) to PDF

适用于：用户上传或生成了 `.docx` 文档（如合同、规格书、报告），要求将其转换为 PDF 格式。

## 完整 Python 转换脚本 (调用 bash 执行)：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn
from fpdf import FPDF

# 1. 路径配置
DOCX_PATH = '/workspace/目标文件.docx'
PDF_PATH  = '/workspace/目标文件.pdf'

FONT_CANDIDATES = [
    '/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf',
    '/tmp/font/NotoSansSC-Regular.otf',
]
FONT_PATH = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if not FONT_PATH:
    raise FileNotFoundError("未检测到本地中文字体，请检查 /opt/dsh/skills/pdf/assets/")

# 2. 读取 Word 内容结构
doc = Document(DOCX_PATH)
items = []
for child in doc.element.body.iterchildren():
    if child.tag == qn('w:p'):
        p = Paragraph(child, doc)
        text = p.text.strip()
        if text:
            items.append(('p', text))
    elif child.tag == qn('w:tbl'):
        tbl = Table(child, doc)
        rows = [[c.text.strip() for c in r.cells] for r in tbl.rows]
        items.append(('t', rows))

# 3. 初始化 PDF 并打开页面
pdf = FPDF(format='A4')
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(15, 15, 15)
pdf.add_page()
pdf.add_font('NotoSC', '', FONT_PATH)

def is_header(s: str) -> bool:
    return s.startswith('第') and ('条' in s or '章' in s) or s.startswith('附件')

# 4. 流式排版写入
for typ, data in items:
    if typ == 'p':
        if any(kw in data for kw in ('合同', '协议', '服务规格书', '契約')):
            pdf.set_font('NotoSC', '', 18)
            pdf.multi_cell(w=pdf.epw, h=10, text=data, align='C', new_x='LMARGIN', new_y='NEXT')
            pdf.ln(3)
        elif is_header(data):
            pdf.set_font('NotoSC', '', 12)
            pdf.multi_cell(w=pdf.epw, h=7, text=data, new_x='LMARGIN', new_y='NEXT')
            pdf.ln(1)
        else:
            pdf.set_font('NotoSC', '', 10)
            pdf.multi_cell(w=pdf.epw, h=5.8, text=data, new_x='LMARGIN', new_y='NEXT')
    else:
        if not data:
            continue
        pdf.ln(2)
        ncols = max(len(r) for r in data)
        col_w = pdf.epw / max(1, ncols)
        pdf.set_font('NotoSC', '', 8.5)
        for row in data:
            while len(row) < ncols:
                row.append('')
            for cell_text in row:
                pdf.cell(col_w, 6.5, cell_text[:25], border=1)
            pdf.ln()
        pdf.ln(2)

pdf.output(PDF_PATH)
print(f"SUCCESS: {PDF_PATH}, pages={pdf.page_no()}, size={os.path.getsize(PDF_PATH)}")
```
