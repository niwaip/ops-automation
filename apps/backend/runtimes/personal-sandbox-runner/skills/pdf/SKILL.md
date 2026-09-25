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
deliverables:
  - ".pdf"
requires_execution: true
default_rounds: 5
---

# PDF Document Generation & Interactive Form Processing Skill

本技能为沙箱环境中的智能体提供标准、离线、高可靠的 PDF 生成指引与交互式表单填报规范。

---

## 1. 智能体执行准则（绝不直接输出代码，必须调用 bash 执行落盘）

1. **自动闭环执行**：
   - 收到“生成PDF”、“导出PDF”、“转为PDF”或填表请求时，**必须直接调用 `bash` 工具在终端静默执行 Python 脚本**；
   - **【红线】：严禁直接向用户输出 Python 代码或脚本半成品！用户需要的是实际生成的交付物文件，不是代码！**
2. **必须先调用 `pdf.add_page()` 打开页面**：
   - 实例化 `pdf = FPDF(...)` 后，在写入任何文字或调用 `pdf.ln()`、`pdf.cell()` 前，**必须先显式调用 `pdf.add_page()`**，否则代码会抛出 `FPDFPageException: No page open, you need to call add_page() first` 导致脚本崩溃。
3. **输出路径必须指定在 `/workspace/`**：
   - 保存输出必须为 `/workspace/<文件名>.pdf`（例如 `pdf.output('/workspace/天气报告.pdf')`）。只有保存在 `/workspace/` 下，系统才能识别并为用户挂载前端下载卡片。
4. **生成完毕后汇报**：
   - 执行成功后，向用户汇报文件名称、页数与大小，简明概述核心数据与结论，提示文件已保存在个人工作区。

---

## 2. 运行环境与核心约束（严禁联网下载！）

沙箱容器中**已永久内置全部必要环境与中文字体**：
- ✅ **中文字体位置**：优先使用 `/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf` 或 `/tmp/font/NotoSansSC-Regular.otf`（100% 存在）。
- ✅ **粗体字体位置**：`/opt/dsh/skills/pdf/assets/NotoSansSC-Bold.otf`（若不存在则回退常规体）。
- ✅ **预装依赖库**：`pypdf`、`python-docx` 与 `fpdf2` 已预装就绪。
- ❌ **严格禁止**：在脚本中编写 `pip install`、`curl` 或 `wget` 联网下载字体！严禁编写 ` || ` 等未完成的空命令。

---

## 3. 场景分层索引 (Hierarchical Scenarios)

系统支持以下三种标准场景，根据用户任务按需分层载入：

### 场景一：交互式表单识别与自动填报 (Interactive Form Filling)
当用户提供需填写的政府/企业/银行 PDF 表单时，调用预置脚本完成填报（参见 `references/forms.md`）：
```bash
python /opt/dsh/skills/pdf/scripts/check_fillable_fields.py /workspace/input_form.pdf
python /opt/dsh/skills/pdf/scripts/extract_form_field_info.py /workspace/input_form.pdf /workspace/field_info.json
python /opt/dsh/skills/pdf/scripts/fill_fillable_fields.py /workspace/input_form.pdf /workspace/field_values.json /workspace/filled_form.pdf
```

### 场景二：从 Word 合同/文档 (.docx) 生成 PDF
当用户上传了 `.docx` 并要求生成 PDF 时，读取段落与表格结构流式写入（参见 `references/docx2pdf.md`）。

### 场景三：从 Markdown / 分析总结生成报告 PDF
从聊天上下文或分析数据直接排版生成美观单页/多页报告 PDF（参见 `references/report_pdf.md`）：

**【首选推荐方案】：使用内置标准生成器（杜绝 Python 字符串转义错误与格式崩溃）：**
```bash
cat << 'EOF' > /workspace/report.md
# 报告标题
生成日期: 2026年9月24日

## 一、核心概要
此处为详细分析与数据总结内容，支持多行文本自适应换行。

| 日期 | 天气状况 | 气温范围 | 降水概率 | 风力 |
|---|---|---|---|---|
| 周四 (9/24) | 晴 | 24-31°C | 10% | 3级 |
| 周五 (9/25) | 多云 | 23-30°C | 20% | 3级 |

> 温馨提示：外出请根据气温适时增减衣物。
EOF
python3 /opt/dsh/skills/pdf/scripts/generate_report_pdf.py --input /workspace/report.md --output /workspace/报告.pdf
```

**【高级定制方案】：手写原生 FPDF 脚本（仅在需要特殊像素级坐标排版时使用）：**
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
pdf.add_font('Noto', '', FONT_PATH)
pdf.add_page()  # 必须先打开页面！

# 标题
pdf.set_font('Noto', size=18)
pdf.cell(0, 12, text='分析调研报告', new_x="LMARGIN", new_y="NEXT", align='C')
pdf.ln(4)

# 正文
pdf.set_font('Noto', size=11)
pdf.multi_cell(0, 7, text='核心摘要与详细内容...')

# 落盘到 /workspace
out_path = '/workspace/report.pdf'
pdf.output(out_path)
print(f"SUCCESS: {out_path}, size={os.path.getsize(out_path)}")
```
