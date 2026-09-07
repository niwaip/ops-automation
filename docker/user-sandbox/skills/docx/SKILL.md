---
name: docx
zh_name: "Word 文档与合同处理引擎"
description: |
  Professional Microsoft Word (.docx) document creation, template placeholder filling, and contract formatting using python-docx.
zh_description: |
  专业级 Word 文档生成与合同处理规范：支持新建带层级标题的标准 Word 文档，或基于现有 .docx 模板批量替换占位符（如 {d.xxx}）并生成新合同。
tags:
  - "word"
  - "docx"
  - "document"
  - "contract"
triggers:
  - "docx"
  - "word"
  - "文档"
  - "合同"
  - "生成word"
  - "导出word"
  - "word文档"
---

# DOCX Creation, Template Filling & Contract Processing

本技能为沙箱环境中的智能体提供专业级 Word 文档与合同生成规范。

---

## 1. 运行环境与核心规范

- ✅ **预装依赖**：沙箱已预装 `python-docx`，直接使用，严禁 `pip install`！
- ✅ **中文字体规范**：中文字体统一指定为 `微软雅黑` 或 `宋体`，英文指定为 `Calibri` 或 `Arial`。
- ✅ **输出位置**：文件保存至 `/workspace/<filename>.docx`。

---

## 2. 场景一：基于模板替换占位符填充（如合同/服务规格书）

当用户工作区已有模板文件（如包含 `{d.contract.partyA_cn}` 等占位符）：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from docx import Document

def fill_docx_placeholders(src_path, dst_path, replacements):
    doc = Document(src_path)
    
    # 替换段落中的占位符
    for p in doc.paragraphs:
        for k, v in replacements.items():
            if k in p.text:
                p.text = p.text.replace(k, str(v))
                
    # 替换表格中的占位符
    for tbl in doc.tables:
        for row in tbl.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    for k, v in replacements.items():
                        if k in p.text:
                            p.text = p.text.replace(k, str(v))
                            
    doc.save(dst_path)
    print(f"SUCCESS: {dst_path}")
```

---

## 3. 场景二：从零创建排版精良的 Word 文档/报告

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

doc = docx.Document()

# 1. 页面边距 (A4，左右上下各 1 英寸)
for s in doc.sections:
    s.top_margin = Inches(1.0)
    s.bottom_margin = Inches(1.0)
    s.left_margin = Inches(1.0)
    s.right_margin = Inches(1.0)

# 2. 标题
title_p = doc.add_paragraph()
title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run_title = title_p.add_run("系统架构与自动化运维实施方案")
run_title.font.name = "Microsoft YaHei"
run_title.font.size = Pt(20)
run_title.font.bold = True
run_title.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
title_p.paragraph_format.space_after = Pt(18)

# 3. 结构化段落
h1 = doc.add_heading(level=1)
h1_run = h1.add_run("一、项目背景与建设目标")
h1_run.font.name = "Microsoft YaHei"
h1_run.font.size = Pt(14)
h1_run.font.bold = True
h1.paragraph_format.space_before = Pt(12)
h1.paragraph_format.space_after = Pt(6)

p = doc.add_paragraph()
p_run = p.add_run("本项目致力于通过 DeepSeek 与自动化编排框架构建新一代智能运维体系，实现分钟级故障发现与秒级自愈。")
p_run.font.name = "Microsoft YaHei"
p_run.font.size = Pt(10.5)
p.paragraph_format.line_spacing = 1.25
p.paragraph_format.space_after = Pt(8)

# 4. 专业表格
tbl = doc.add_table(rows=1, cols=3)
tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
hdr_cells = tbl.rows[0].cells
hdr_titles = ["模块名称", "核心职责", "SLA 指标"]
for i, title in enumerate(hdr_titles):
    hdr_cells[i].text = title
    hdr_cells[i].paragraphs[0].runs[0].font.name = "Microsoft YaHei"
    hdr_cells[i].paragraphs[0].runs[0].font.bold = True

rows_data = [
    ("API 网关", "请求路由与安全鉴权", "99.99%"),
    ("编排引擎", "多步骤工作流协同调度", "99.95%"),
    ("执行沙箱", "隔离安全命令运行", "99.90%"),
]
for row in rows_data:
    r_cells = tbl.add_row().cells
    for i, val in enumerate(row):
        r_cells[i].text = val
        r_cells[i].paragraphs[0].runs[0].font.name = "Microsoft YaHei"

doc.save("/workspace/系统架构与自动化运维实施方案.docx")
print("SUCCESS: /workspace/系统架构与自动化运维实施方案.docx")
```
