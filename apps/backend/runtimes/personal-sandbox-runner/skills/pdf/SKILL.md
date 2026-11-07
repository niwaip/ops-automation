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
| 既有 PDF 高保真翻译与版式保留 | 调用兼容CLI：布局理解 → 结构化翻译 → HTML/CSS重排 → 运行时逐页验收 |
| 新建 PDF、Markdown/结构化数据排版 | 使用下方本地生成器；参数和 JSON 结构见 [report_pdf.md](references/report_pdf.md) |
| 字体、配色、打印/手机版式选择 | 按需阅读 [design.md](references/design.md) |
| Word 转 PDF，保留原版面 | [docx2pdf.md](references/docx2pdf.md) |
| 填写交互式表单 | [forms.md](references/forms.md)，复用现有检查、提取和填写脚本 |
| 阅读、提取、合并、拆分 | [processing.md](references/processing.md)；只读任务不生成额外报告 |

## 既有 PDF 高保真翻译与版式保留

内容完整与阅读顺序优先，在可读字号下尽量保留原章节、分栏和图文关系；允许自然跨页，不为固定页数删减内容。

默认保留主要结构，不要求页数相同。转中文正文使用10.5pt，转英语、日语使用9.5pt，标题、表格与说明按对应层级调整；字号不随页数压力继续缩小。命令与URL保持连续，原始外链须在译文中可点击。普通标签即使带连字符或脚注数字也须翻译，脚注编号与正文绑定，图表、题注和说明作为关联组排版。

```bash
python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto \
  /workspace/input.pdf /workspace/input_中文版.pdf --lang zh-CN
```

- 使用原生文字坐标和多模态布局分析建立文档IR，再按块翻译并通过受控HTML/CSS组件排版；无需现场编写python-docx或fitz脚本。
- 首版受运行环境灰度开关控制。收到`engine_not_enabled`时说明尚未开放，应报告状态；不要自行设置环境变量绕过灰度或改走通用PDF生成器。
- `candidate_ready`只代表隐藏候选生成，目标文件由运行时全部页验收通过后发布。不要查找目标不存在就重新生成，不发送隐藏候选或旧文件。
- 图形保留完整区域，图中标签附中文译文；扫描件/无法可靠解析区域会明确失败，不猜测原文。严格图内替换需求不应宣称已满足。
- `auto`的可恢复失败由运行时在同一任务deadline内自动恢复一次，复用合格布局和译文；不要另行重试、查找旧PDF或复制历史候选。回执含`recovered_from`表示恢复已用尽，仍失败就报告原因并停止。旋转边注与正文独立保留，不按普通段落翻译。检查点版本为layout-html/10，旧版本必须重新解析。
- 逐页验收失败时，运行时启动受控局部修复回路，按节点ID重译或重建受影响表格，整本重排并复用内容未变页面的验收结果；最多进行3轮局部修复。未收敛或不可恢复错误整份拒绝发布。
- 用户后续明确要求继续时，才用`auto INPUT OUTPUT --resume <工具回执中的resume_dir>`恢复；参数是`--resume`，不存在`--resume-dir`。没有`resume_dir`不得猜测目录。命令单独执行，不附加echo、分号或其他命令；运行时拒绝会掩盖退出状态的包装。禁止手改source.ir.json。
- 分步流程：`unpack INPUT WORKDIR`使用新的空目录，生成版本化检查点；随后可用`auto INPUT OUTPUT --resume WORKDIR`自动翻译。手动`pack WORKDIR OUTPUT`必须先完整填写按节点/单元格ID映射的`WORKDIR/translated.json`，并通过校验；pack不负责翻译。不存在`auto --unpack`参数，不猜测IR字段或反复检查不存在的blocks。
- 表格优先使用原文横线和文字坐标建立固定行列、列宽及合并关系；模型不得重新分配原生单元格。无法核实的表格结构拒绝发布，不按空格顺序补填。
- 候选就绪立即交接运行时；相同输入、输出、语言与布局的重复auto复用本轮有效候选，不再次翻译。表格实质缺陷不能用另一次PASS投票覆盖。
- 保留auto/unpack/pack入口；`--layout balanced`默认尽量保原结构，`reading`单栏阅读，`preserve`检查原页数约束；不承诺像素级位置不变。
- 失败按结构化错误有限修复，连接失败、漏译或缺键不能报成功；禁止把错误说明编成替代PDF。原稿与旧合格输出不得被未验收候选覆盖。

## 新建文档

运行时提供 `render_pdf` 时，直接提交完整 Markdown、output_path、template、theme、标题/副标题/署名与页数范围。
它调用下方同一固定生成器，返回候选 PDF 的 QA、逐页文字和目标 file_path。无需编写 Python/FPDF 排版脚本。
插入本地叶片示意图可使用 `![叶片示意](leaf.svg)`；仅作为素材，不复制整份示例文档。
渲染后逐页调用 `inspect_pdf_page(file_path, page)`；运行时绑定本轮正确 PNG，全部页通过后才发布最终文件。
不要猜测 PNG 路径。没有原生工具的运行环境继续使用下方 CLI，并用 `vision_inspect` 检查每页。

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
2. 用 `vision_inspect`（部分环境名为 `inspect_image`）打开 `previews` 中的每张 PNG，查看标题层次、字形、图表、跨页表格、页眉页脚、文字遮挡和留白。程序检查通过不代表视觉已验收。
3. 修改后重新生成并检查最终版；聊天中的页数与内容概览以最终产物为准。
4. 汇报实际文件和下载位置，简明说明内容。没有生成或检查失败时如实说明，不输出脚本作为交付物。

对其他工具生成的 PDF，可复用检查器（不会修改原件）：

```bash
python3 /opt/dsh/skills/pdf/scripts/check_pdf.py /workspace/result.pdf \
  --preview-dir /workspace/.pdf-preview/result
```

模板与视觉方法参考见 [design.md](references/design.md)。全部能力由本地 Python/CLI 提供，无需 MCP。
