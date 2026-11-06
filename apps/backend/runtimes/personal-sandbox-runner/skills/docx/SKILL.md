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
  - "翻译word"
  - "翻译docx"
  - "word翻译"
  - "docx翻译"
  - "翻译文档"
  - "文档翻译"
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
| **已有 Word/DOCX 高保真翻译与多语言替换 (保持格式 100% 不变)** | **路径五：`ooxml_docx_translate.py` 一键全自动端到端翻译** | 原生解包 → 碎片合并 → 并发批量模型翻译 → 原地 XML 靶向注入与东亚字体适配，严禁手写脚本重新生成！ |

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

---

## 6. 场景四：已有 Word / DOCX 高保真翻译与多语言替换（保持格式 100% 不变）

> ⚠️ **严禁规则**：
> 1. **附件路径规则**：沙箱中用户上传的附件均直接位于工作区 `/workspace/<文件名>.docx`，若不确定文件名先 `ls /workspace` 确认；
> 2. **绝对禁止**由模型自主编写 `python-docx` 重新生成文档（绝对禁止 `new_doc = Document()`，这会导致 A4 纸张变 Letter、页眉页脚与动态页码丢失、样式丢失）；
> 3. **绝对禁止**模型在 bash 循环中手动编写数十 KB 的 Python 字典或代码！
> 4. **必须使用沙箱内置的高性能 OOXML Word 翻译引擎**：`/opt/dsh/skills/docx/scripts/ooxml_docx_translate.py`。

### 推荐方案：一键全自动端到端翻译（耗时最短、体验最优）
直接调用 `bash` 执行沙箱内置的一键翻译流水线，脚本会自动执行解包、merge_runs 碎片整合、并发模型批量翻译、东亚字体适配、语言标记注入与结构打包：

- **翻译为日文 Word 文档 (Japanese)**：
  ```bash
  python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py auto \
    "/workspace/<输入文件>.docx" \
    "/workspace/<输出文件>.docx" \
    --lang ja-JP --font 'MS Mincho'
  ```

- **翻译为英文 Word 文档 (English)**：
  ```bash
  python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py auto \
    "/workspace/<输入文件>.docx" \
    "/workspace/<输出文件>.docx" \
    --lang en-US --font 'Calibri'
  ```

该命令内置日企/国际商务与法律合同专业术语库、多线程并发与排版敏感型紧凑翻译法则，自动注入目标语言与东亚字体，并在 20~30 秒内完成整篇长文档的高保真本地化，母版、纸张尺寸、页眉页脚、动态页码与表格 100% 原样保留！

### 备用方案：分步流水线法
如需中间干预或查看译文数据：
1. **第 1 步：解包提取待翻译 JSON 字典**
   ```bash
   python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py unpack "/workspace/<输入文件>.docx" --out-json /workspace/translation_input.json --temp-dir /workspace/.ooxml_temp
   ```
2. **第 2 步：并发批量翻译**
   ```bash
   python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py translate /workspace/translation_input.json /workspace/translation_output.json --lang ja-JP
   ```
3. **第 3 步：注入并重新打包**
   ```bash
   python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py pack /workspace/.ooxml_temp /workspace/translation_output.json "/workspace/<输出文件>.docx" --lang ja-JP --font 'MS Mincho'
   ```

### 面向用户的友好极简交付汇报规范（【极简精悍原则，篇幅控制在 250~350 字以内】）
当打包与校验完成后，在聊天窗口向用户进行交付汇报时，必须采用**面向最终商务/法务用户的精炼、专业视角**，内容务必简洁干练，**严禁在对话框流式输出整篇 Markdown 文本（彻底避免超出 Token 限制发生截断）**：
- 🚫 **红线约束**：
  - **严禁输出关键术语对照字典**：严禁罗列“术语 -> 译文”对照列表，用户需要的是业务交付成果说明，不是字典；
  - **严禁全文倾泻**：严禁在聊天窗口粘贴长篇协议译文；
  - **严禁输出底层命令行名词**：严禁堆砌 `--font`、`unpack/pack`、`ooxml` 等内部底层名词；
  - **严禁泄露容器路径**：严禁在回复中直接展示 `/workspace/` 等内部沙箱物理路径；
- ✅ **标准商务交付结构（四段式，清新明快）**：
  1. **任务完成状态（## ✅ Word 文档翻译完成）**：明确说明 Word 文档已完成高保真本地化与排版校验；
  2. **主要处理内容（### 📋 主要处理内容）**：概述翻译覆盖的正文前言、章节条款、表格数据与签署确认栏，说明语言风格（如地道商务/法务规范用语）；
  3. **交付成果物（### 📦 交付成果物）**：列明交付文件名，明确原文档纸张规格（A4）、版心页边距、动态页脚页码及表格结构已 100% 完整保留，引导用户点击卡片下载；
  4. **提示与使用建议 / 警告（### 💡 提示与使用建议）**：说明跨平台标准字体适配（日文 MS Mincho / 英文 Calibri / 中文微软雅黑），或提示特定企业简称可在 Word 中灵活微调。
- ⚠️ **失败场景规范**：若执行异常或无法生成文件，严禁输出“执行错误达到上限”等内部暗语；必须按【⚠️ 目标文件未能成功生成】明确说明原因（如文件密码保护或宏脚本不兼容），并提供 3 条清晰可操作的下一步建议。

