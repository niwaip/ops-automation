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

## 1. 核心任务路径导航 (Task Routing)

按用户任务目标严格选择对应路径，禁止无意义的手写底层拼装脚本：

| 任务类型 | 首选路径 | 核心规范与工具 |
| :--- | :--- | :--- |
| **新建专业文档 / 报告 / 安装指南** | **路径一：`render_docx` 工具 (推荐优先)** | 提交连续 Markdown 正文与主题，底层引擎全自动应用排版系统，严禁手写数百行 python-docx 代码！ |
| **视觉呈现与交付验收 (Visual Inspection)** | **页面预览图验收** | 渲染器自动生成 `.docx-preview/<name>/page-*.png`，使用 `vision_inspect` 检查排版质量。 |
| **合同/文档审阅修订留痕 (Tracked Changes)** | **路径二：XML 红线留痕流水线** | `unzip` → `merge_runs.py` → 注入 `<w:ins>`/`<w:del>` → `zip` → `validate.py` 严格校验。 |
| **向已有文档添加原生侧边批注 (Comments)** | **路径三：`add_comment.py` 一键注入** | 无需解包，直接调用脚本在段落或目标文字处注入侧边原生批注。 |
| **基于既有模板占位符批量回填** | **路径四：模板占位符替换** | 针对企业已有 `{d.party_a}` 模板，执行快速安全文本置换。 |

---

## 2. 场景一：新建专业 Word 文档（高阶分层渲染）

### 方式一：直接调用 `render_docx` 工具（强烈推荐）
运行时提供了 `render_docx` 工具时，直接传入 Markdown 正文及目标路径。无需编写 Python 排版脚本：

```json
{
  "name": "render_docx",
  "arguments": {
    "title": "DeepSeek Harness 安装与部署指南",
    "subtitle": "企业级自动化平台环境准备与多环境实战手册",
    "author": "Ops Automation Platform",
    "theme": "tech-blue",
    "output_path": "/workspace/DeepSeek_Harness_安装指南.docx",
    "markdown": "# 概述\n\n本文档介绍 DeepSeek Harness 的安装与配置。\n\n> [!NOTE]\n> 安装前请确认系统已预装 Python 3.11 与 Node.js 20+。\n\n## 一、前置环境\n\n| 平台 | 最低配置 | 推荐环境 |\n| --- | --- | --- |\n| macOS | macOS 13+ | Apple Silicon (M系列) |\n| Linux | Ubuntu 22.04 | 4C 8G 内存 |\n\n## 二、安装命令\n\n```bash\nnpx @deepseek-ai/dsh web --port 8080\n```\n"
  }
}
```

### 方式二：无原生工具时调用 CLI 引擎
若在纯 bash 命令行环境下，直接调用系统内置的固化生成器：
```bash
python3 /opt/dsh/skills/docx/scripts/generate_report_docx.py \
  --input /workspace/content.md \
  --output /workspace/output.docx \
  --theme tech-blue \
  --title "文档主标题" \
  --preview-dir /workspace/.docx-preview/output
```

### 视觉主题配置 (`theme`)：
- `tech-blue`（默认）：深科技蓝 (`#1E40AF`)，适合技术白皮书、架构设计、安装部署指南；
- `business-navy`：商务灰蓝 (`#0F172A`)，适合工作汇报、管理方案、立项报告；
- `elegant-teal`：雅致青绿 (`#0F766E`)，适合产品手册、调研总结、运营报告；
- `crimson-red`：典雅朱红 (`#991B1B`)，适合正式通报、决议纪要、红头公文；
- `modern-graphite`：现代冷灰 (`#18181B`)，适合极简设计、技术规范。

---

## 3. 页面呈现与视觉质检验收 (Visual Quality & Verification)

参考 Anthropic 优秀验证范式，文档生成后应当进行真实视觉质检验收：

1. **自动生成的高清预览**：
   - 渲染器已集成 LibreOffice (`soffice`) 与 Poppler (`pdftoppm`)；
   - 生成文档时会自动将各页导出至 `/workspace/.docx-preview/<文件名>/page-1.png`、`page-2.png` 等。
2. **视觉抽检**：
   - 可调用 `vision_inspect`（或 `inspect_image`）查看关键页面预览图，核对标题层次、表格排版与文字留白；
   - 排版标准要求：
     - **表格美化**：主题色深色表头，白色粗体字；交替行浅灰斑马纹；单元格具备防挤压内边距；
     - **提示框（Callout）**：左侧 3pt 粗边条、浅色填充底色；支持 Note、Tip、Warning、Important；
     - **代码块**：浅灰底色 `#F8FAFC`、等宽 `Consolas` 字体、浅边框，禁止溢出与换行错位；
     - **字体统一**：中文字体统一采用 `微软雅黑`，英文字体统一采用 `Calibri`。

---

## 4. 场景二：合同/文档审阅修订留痕与批注注入 (Tracked Changes & Comments)

对已有 `.docx` 进行专业合同审查、修改条款并留下 Word 原生红线修订与侧边批注时，提供两种使用方式：

### 方式一：一键快速添加批注 (推荐日常高频使用)
无需手动解包与重打包，直接指定目标文字与批注内容：
```bash
python3 /opt/dsh/skills/docx/scripts/add_comment.py /workspace/contract.docx \
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
python3 /opt/dsh/skills/docx/scripts/merge_runs.py /workspace/unpacked/

# 3. 注入侧边批注定义 (自动维护 comments.xml、people.xml 等 6 个关联文件)
python3 /opt/dsh/skills/docx/scripts/comment.py /workspace/unpacked/ "合规风险：违约金比例过高，建议下调至 20%" --author "AI法务审查员"

# 4. 在 document.xml 中加入修订留痕 (Tracked Changes)
#    - 插入文本: 使用 <w:ins w:id="1" w:author="AI法务审查员" w:date="2026-10-29T00:00:00Z"><w:r><w:t>新增文本</w:t></w:r></w:ins>
#    - 删除文本: 使用 <w:del w:id="2" w:author="AI法务审查员" w:date="2026-10-29T00:00:00Z"><w:r><w:delText>被删除文本</w:delText></w:r></w:del>

# 5. 重新打包生成审查后文档
(cd /workspace/unpacked && rm -f /workspace/reviewed.docx && zip -q -Xr /workspace/reviewed.docx .)

# 6. 验证生成的 docx 结构完整性 (严格保证 XSD 校验通过)
python3 /opt/dsh/skills/docx/scripts/office/validate.py /workspace/reviewed.docx --original /workspace/original.docx
```

### 产出纯净版 (接受所有修订)：
```bash
python3 /opt/dsh/skills/docx/scripts/accept_changes.py /workspace/reviewed.docx /workspace/clean_contract.docx
```

---

## 5. 场景三：基于既有模板替换占位符填充

当用户工作区已有包含 `{d.party_a}` 等占位符的现有模板文件时：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from docx import Document

def fill_docx_placeholders(src_path, dst_path, replacements):
    doc = Document(src_path)
    for p in doc.paragraphs:
        for k, v in replacements.items():
            if k in p.text:
                p.text = p.text.replace(k, str(v))
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
