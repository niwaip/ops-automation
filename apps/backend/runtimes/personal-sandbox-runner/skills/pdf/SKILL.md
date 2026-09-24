---
name: pdf
zh_name: "PDF 文档与交互式表单处理引擎"
description: "专业级 PDF 文档生成、格式转换（Word/Markdown转PDF）与交互式 AcroForm 表单填报引擎。当用户需要生成 PDF、导出 PDF 报表、填写 PDF 表单、或将文档转为 PDF 时必须使用此技能。不要用于普通的日常问答或代码开发。"
tags:
  - "pdf"
  - "document"
  - "report"
  - "docx-to-pdf"
  - "export-pdf"
  - "form-fill"
triggers:
  - "pdf"
  - "生成pdf"
  - "导出pdf"
  - "转为pdf"
  - "转成pdf"
  - "pdf report"
  - "pdf表单"
  - "填写pdf"
  - "表单填报"
  - "继续生成"
  - "1"
---

# PDF Document Generation & Interactive Form Processing Skill

本技能为沙箱环境中的智能体提供标准、离线、高可靠的 PDF 生成指引与交互式表单填报规范。

---

## 1. 运行环境与约束（严禁联网下载！）

沙箱容器中**已永久内置全部必要环境与中文字体**，执行生成时：
- ✅ **中文字体位置**：优先使用 `/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf` 或 `/tmp/font/NotoSansSC-Regular.otf`（100% 存在）。
- ✅ **预装依赖库**：`pypdf`、`python-docx` 与 `fpdf2` 已预装就绪。
- ❌ **严格禁止**：在脚本中编写 `pip install`、`curl` 或 `wget` 联网下载字体！严禁编写 ` || ` 等未完成的空命令。
- ✅ **黑盒脚本工具库**：表单识别与填报脚本位于 `/opt/dsh/skills/pdf/scripts/`，详细表单工作流可参阅 `forms.md`。

---

## 2. 场景一：交互式 PDF 表单识别与自动填报 (Interactive Form Filling)

当用户提供需填写的政府/企业/银行 PDF 表单时，严格按如下黑盒 CLI 流程处理：

```bash
# 步骤 1: 检查 PDF 是否包含交互式表单字段
python /opt/dsh/skills/pdf/scripts/check_fillable_fields.py /workspace/input_form.pdf

# 步骤 2: 若具备表单字段，提取表单字段元数据 (生成 field_info.json)
python /opt/dsh/skills/pdf/scripts/extract_form_field_info.py /workspace/input_form.pdf /workspace/field_info.json

# 步骤 3: 根据用户提供的信息构造待填充值映射文件 /workspace/field_values.json，格式示例:
# [
#   {"field_id": "company_name", "value": "智能科技有限公司"},
#   {"field_id": "is_general_taxpayer", "value": "/Yes"}
# ]

# 步骤 4: 执行表单填报并校验生成终态文件
python /opt/dsh/skills/pdf/scripts/fill_fillable_fields.py /workspace/input_form.pdf /workspace/field_values.json /workspace/filled_form.pdf
```

---

## 3. 场景二：从 Word 合同/文档 (.docx) 生成 PDF

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

## 4. 场景三：从 Markdown / 分析总结生成报告 PDF

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
pdf.output('/workspace/report.pdf')
```

---

## 5. 智能体执行准则

1. **自动闭环执行**：
   - 收到“生成PDF”、“继续生成”或填表请求时，直接调用 `bash` 工具静默执行 Python 脚本；
   - 严禁直接输出脚本源码半成品给用户。
2. **生成完毕后汇报**：
   - 执行成功后，向用户汇报文件名称、页数与大小，提示文件已保存在个人工作区。
