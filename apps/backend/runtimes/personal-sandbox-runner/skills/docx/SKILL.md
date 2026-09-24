---
name: docx
zh_name: "Word 文档与合同深度处理引擎"
description: "Word 文档生成、模板填充、合同审阅合规、修订留痕（Tracked Changes）与原生批注（Comments）注入。当用户需要新建 Word、编辑 docx、审查合同条款、修改建议或添加批注时必须使用此技能。不要用于纯纯代码生成或普通聊天问答。"
tags:
  - "word"
  - "docx"
  - "document"
  - "contract"
  - "redline"
  - "comment"
triggers:
  - "docx"
  - "word"
  - "word文档"
  - "合同"
  - "生成word"
  - "导出word"
  - "合同审阅"
  - "修订留痕"
  - "批注"
deliverables:
  - ".docx"
requires_execution: true
default_rounds: 5
---

# DOCX Creation, Template Filling, Redlining & Commenting

本技能为沙箱环境中的智能体提供专业级 Word 文档生成、模板填充、合同审阅修订留痕与批注规范。

---

## 1. 运行环境与核心规范

- ✅ **预装依赖**：沙箱已预装 `python-docx`、`defusedxml`，直接使用，严禁 `pip install`！
- ✅ **黑盒脚本工具库**：脚本位于 `/opt/dsh/skills/docx/scripts/`，调用时请使用 CLI 方式，严禁将脚本源码读取并刷入模型上下文。
- ✅ **中文字体规范**：中文字体统一指定为 `微软雅黑` 或 `宋体`，英文指定为 `Calibri` 或 `Arial`。
- ✅ **输出位置**：生成或修改的文件必须保存至 `/workspace/<filename>.docx`。

---

## 2. 场景一：合同/文档审阅修订留痕与批注注入 (Tracked Changes & Comments)

对已有 `.docx` 进行专业合同审查、修改条款并留下 Word 原生红线修订与侧边批注时，提供两种使用方式：

### 方式一：一键快速添加批注 (推荐日常高频使用)
无需手动解包与重打包，直接指定目标文字与批注内容：
```bash
python /opt/dsh/skills/docx/scripts/add_comment.py /workspace/contract.docx \
  --target "全额预付100%款项" \
  --comment "【法务风险提示】：全额预付款风险极高，建议调整为按里程碑3:4:3分期支付" \
  --author "AI法务合规官" \
  -o /workspace/reviewed_contract.docx
```

### 方式二：深度多处修订留痕与精细化 XML 编辑 (底层工作流)
当需要同时进行大面积段落删除、文字替换、插入 `<w:ins>` / `<w:del>` 红线留痕时：
```bash
# 1. 解压 Word 文档至临时目录
unzip -q /workspace/original.docx -d /workspace/unpacked/
find /workspace/unpacked -type l -delete   # 剥离软链接安全风险

# 2. 合并 XML 中被拼写检查打碎的文本 Runs (使文字在 XML 中可直接被检索和替换)
python /opt/dsh/skills/docx/scripts/merge_runs.py /workspace/unpacked/

# 3. 注入侧边批注定义 (自动维护 comments.xml、people.xml 等 6 个关联文件)
python /opt/dsh/skills/docx/scripts/comment.py /workspace/unpacked/ "合规风险：违约金比例过高，建议下调至 20%" --author "AI法务审查员"

# 4. 在 document.xml 中加入修订留痕 (Tracked Changes)
#    - 插入文本: 使用 <w:ins w:id="1" w:author="AI法务审查员" w:date="2026-09-19T00:00:00Z"><w:r><w:t>新增文本</w:t></w:r></w:ins>
#    - 删除文本: 使用 <w:del w:id="2" w:author="AI法务审查员" w:date="2026-09-19T00:00:00Z"><w:r><w:delText>被删除文本</w:delText></w:r></w:del>

# 5. 重新打包生成审查后文档
(cd /workspace/unpacked && rm -f /workspace/reviewed.docx && zip -q -Xr /workspace/reviewed.docx .)
```

# 6. (可选) 验证生成的 docx 结构完整性
python /opt/dsh/skills/docx/scripts/office/validate.py /workspace/reviewed.docx --original /workspace/original.docx
```

### 产出纯净版 (接受所有修订)：
```bash
python /opt/dsh/skills/docx/scripts/accept_changes.py /workspace/reviewed.docx /workspace/clean_contract.docx
```

---

## 3. 场景二：基于模板替换占位符填充（如合同/服务规格书）

当用户工作区已有模板文件（包含 `{d.contract.partyA_cn}` 等占位符时）：

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

## 4. 场景三：从零创建专业排版 Word 文档/研究报告

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

doc = docx.Document()

# 1. 页面边距 (A4，标准 1 英寸)
for s in doc.sections:
    s.top_margin = Inches(1.0)
    s.bottom_margin = Inches(1.0)
    s.left_margin = Inches(1.0)
    s.right_margin = Inches(1.0)

# 2. 标题
title_p = doc.add_paragraph()
title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run_title = title_p.add_run("企业级智能自动化平台设计报告")
run_title.font.name = "Microsoft YaHei"
run_title.font.size = Pt(20)
run_title.font.bold = True
run_title.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
title_p.paragraph_format.space_after = Pt(18)

# 3. 结构化段落
h1 = doc.add_heading(level=1)
h1_run = h1.add_run("一、项目概述")
h1_run.font.name = "Microsoft YaHei"
h1_run.font.size = Pt(14)
h1_run.font.bold = True
h1.paragraph_format.space_before = Pt(12)
h1.paragraph_format.space_after = Pt(6)

p = doc.add_paragraph()
p_run = p.add_run("本系统通过融合两阶段确定性规划与沙箱环境，为企业提供受控的高可用自动化执行能力。")
p_run.font.name = "Microsoft YaHei"
p_run.font.size = Pt(10.5)
p.paragraph_format.line_spacing = 1.25
p.paragraph_format.space_after = Pt(8)

# 4. 表格
tbl = doc.add_table(rows=1, cols=3)
tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
hdr_cells = tbl.rows[0].cells
for i, title in enumerate(["模块", "状态", "SLA"]):
    hdr_cells[i].text = title
    hdr_cells[i].paragraphs[0].runs[0].font.name = "Microsoft YaHei"
    hdr_cells[i].paragraphs[0].runs[0].font.bold = True

for row in [("API网关", "Active", "99.99%"), ("执行沙箱", "Isolated", "99.95%")]:
    r_cells = tbl.add_row().cells
    for i, val in enumerate(row):
        r_cells[i].text = val
        r_cells[i].paragraphs[0].runs[0].font.name = "Microsoft YaHei"

doc.save("/workspace/企业级智能自动化平台设计报告.docx")
print("SUCCESS: /workspace/企业级智能自动化平台设计报告.docx")
```
