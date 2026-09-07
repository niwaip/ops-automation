---
name: pdf
zh_name: "PDF 文档与报告生成引擎"
description: |
  Generate professional, beautifully formatted PDF documents and reports from Word (.docx), Markdown, or structured data.
zh_description: |
  专业级 PDF 生成规范：支持将 Word (.docx)、Markdown、表格与结构化数据快速转换为排版精良的 PDF 文档，内置中文字体与开箱即用的本地生成模版。
tags:
  - "pdf"
  - "document"
  - "report"
  - "docx-to-pdf"
  - "export-pdf"
triggers:
  - "pdf"
  - "生成pdf"
  - "导出pdf"
  - "转为pdf"
  - "转成pdf"
  - "pdf report"
  - "继续生成"
  - "1"
---

# PDF Document Generation Skill

> 本技能为沙箱环境中的智能体提供标准、离线、高可靠的 PDF 生成指引与代码模版。

---

## 1. 运行环境与字体约束（严禁联网下载！）

沙箱容器中**已永久内置全部必要环境与中文字体**，执行生成时：
- ✅ **中文字体位置**：优先使用 `/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf` 或 `/tmp/font/NotoSansSC-Regular.otf`（100% 存在）。
- ✅ **预装依赖库**：`python-docx` 与 `fpdf2` 已预装就绪。
- ❌ **严格禁止**：在脚本中编写 `pip install`、`curl` 或 `wget` 联网下载字体！严禁编写 ` || ` 等未完成的空命令。

---

## 2. 场景一：从 Word 合同/文档 (.docx) 生成 PDF

当用户上传了 `.docx` 并要求生成 PDF 时，使用如下标准的 Python 脚本生成（调用 `bash` 工具静默执行）：

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

# 3. 初始化 PDF
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

---

## 3. 场景二：从 Markdown / 分析总结生成报告 PDF

若用户需要将对话中的分析、热点榜单或调研报告直接导出为 PDF：

```python
#!/usr/bin/env python3
import os
from fpdf import FPDF

FONT_PATH = '/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf'
if not os.path.exists(FONT_PATH):
    FONT_PATH = '/tmp/font/NotoSansSC-Regular.otf'

pdf = FPDF(format='A4')
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(15, 15, 15)
pdf.add_page()
pdf.add_font('NotoSC', '', FONT_PATH)

# Title
pdf.set_font('NotoSC', '', 18)
pdf.multi_cell(0, 10, '分析调研报告', align='C')
pdf.ln(5)

# Body
pdf.set_font('NotoSC', '', 10.5)
# 写入段落内容...
pdf.output('/workspace/report.pdf')
```

---

## 4. 智能体执行准则（严防代码泄漏与半成品）

1. **自动闭环执行**：
   - 收到“生成PDF”、“继续生成”或数字回复时，**智能体必须直接调用 `bash` 工具静默执行 Python 生成脚本**；
   - **严禁**直接在最终回答中输出裸露的 `set -e`、`pip install` 或 `=== [1/4] ===` 等脚本草稿！
2. **生成完毕后汇报**：
   - 执行成功后，检查 `/workspace/<filename>.pdf` 是否存在；
   - 向用户清晰汇报：
     - 📄 **文档名称**：如 `1234 (2).pdf`
     - 📊 **页数与大小**：如 `共 6 页，约 48 KB`
     - 💾 **下载与查看方式**：已成功保存至个人工作区，支持在左侧资料面板下载或直接预览。
