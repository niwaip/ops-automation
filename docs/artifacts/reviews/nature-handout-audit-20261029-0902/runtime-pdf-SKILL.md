---
name: pdf
zh_name: "PDF 文档设计与处理"
description: "创建、排版、导出或处理 PDF，包括中文报告、讲义、手机阅读文档、Word 转 PDF 和表单填写。新建文档使用本地设计模板和 WeasyPrint，生成后检查文本、字体、分页并逐页查看预览。仅讨论代码或普通聊天时不生成文件。"
tags: [pdf, document, report, docx-to-pdf, export-pdf, form-fill]
triggers: [生成pdf, 导出pdf, 转为pdf, 转成pdf, pdf report, pdf表单, 填写pdf, 表单填报]
deliverables: [.pdf]
requires_execution: true
default_rounds: 5
---

# PDF 文档设计与处理

按用户动作选择路径；现有文件的阅读、提取或表单填写不需要重新设计版式。

| 任务 | 路径 |
| --- | --- |
| 新建 PDF、Markdown/结构化数据排版 | 使用下方本地生成器；参数和 JSON 结构见 [report_pdf.md](references/report_pdf.md) |
| 字体、配色、打印/手机版式选择 | 按需阅读 [design.md](references/design.md) |
| Word 转 PDF，保留原版面 | [docx2pdf.md](references/docx2pdf.md) |
| 填写交互式表单 | [forms.md](references/forms.md)，复用现有检查、提取和填写脚本 |
| 阅读、提取、合并、拆分 | [processing.md](references/processing.md)；只读任务不生成额外报告 |

## 新建文档

默认使用固定生成器，把内容与样式分开。普通文档直接写 Markdown，再运行：

```bash
python3 /opt/dsh/skills/pdf/scripts/generate_report_pdf.py \
  --input /workspace/report.md --output /workspace/report.pdf \
  --template report --theme blue
```

生成器已在镜像中预装 WeasyPrint、Markdown、Jinja2、Poppler 和 Noto CJK 字体，支持真实 Regular/Bold 字重。任务期间无需安装依赖或下载字体；环境缺失应报告运行时错误。

- `report`：正式报告；`handout`：讲义/说明；`editorial`：宋体正文的长文；`mobile`：适合手机的窄页面。
- 默认不单独增加封面；确有封面需求时加 `--cover`。不要为了装饰自动扩充页数。
- 明确的页数范围传入 `--min-pages N --max-pages M`。失败时调整内容布局，不通过不断缩小字号硬塞。
- 可以选择主题或 `--accent '#RRGGBB'`；字体、行距、留白由模板统一维护，不为每次任务重写绘制脚本。
- 插图使用输入目录中的本地文件；需要外部素材时先通过获准工具取得并保存，再引用。生成器不联网取字体、CSS 或图片。
- 输出 PDF 放在 `/workspace/`；保留输入内容供后续修改。中间 HTML、质量报告和 PNG 自动放入隐藏的 `.pdf-preview/<文件名>/`，不作为最终附件交付。

特殊绘图或定制版式可使用专用代码，但仍执行下方最终检查。普通报告优先使用模板，不要求模型临时编写 FPDF 坐标或完整排版程序。

## 最终检查与交付

生成器自动执行 PDF 解析、页数范围、两种文本提取器的内容覆盖、字体嵌入和页面边界检查，并生成每页 PNG。检查失败返回非零退出码，不发布新 PDF，也不覆盖旧 PDF。

1. 读取生成器打印的 `qa.json`，确认 `valid=true`，核对最终页数、输出路径和文本。
2. 用 `inspect_image` 打开 `previews` 中的每张 PNG，查看标题层次、字形、图表、跨页表格、页眉页脚、文字遮挡和留白。程序检查通过不代表视觉已验收。
3. 修改后重新生成并检查最终版；聊天中的页数与内容概览以最终产物为准。
4. 汇报实际文件和下载位置，简明说明内容。没有生成或检查失败时如实说明，不输出脚本作为交付物。

对其他工具生成的 PDF，可复用检查器（不会修改原件）：

```bash
python3 /opt/dsh/skills/pdf/scripts/check_pdf.py /workspace/result.pdf \
  --preview-dir /workspace/.pdf-preview/result
```

模板与视觉方法参考见 [design.md](references/design.md)。全部能力由本地 Python/CLI 提供，无需 MCP。
