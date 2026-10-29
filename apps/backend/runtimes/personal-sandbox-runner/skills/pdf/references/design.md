# PDF 版式与中文设计

## 按阅读场景选版式

| 版式 | 页面与正文 | 适用 |
| --- | --- | --- |
| report | A4，黑体正文 10.5pt，约 20mm 侧边距 | 正式报告、计划、业务材料 |
| handout | A4，黑体正文 11.5pt，较宽松行距 | 讲义、说明、活动材料 |
| editorial | A4，宋体正文 11pt，黑体标题 | 长文、专题介绍、阅读材料 |
| mobile | 108×192mm，正文 11.5pt，10mm 侧边距 | 手机阅读；避免多列宽表 |

模板选择与配色是独立参数。打印用途优先浅底深字；展示需要才增加独立封面。留白是布局的一部分，不用“每页必须填满”替代设计判断。

## 统一设计参数

`scripts/pdf_design/themes.py` 管理页面、字号、行距、书体及强调色；`templates/print.css` 管理组件的间距、边线、列表、引用、图注和跨页规则；`templates/document.html` 管理封面与正文骨架。
同一文档的标题、表头、强调块共用主题色。内容不写死颜色或绝对坐标。

模板包含明确字号层级、真实粗体、稳定段间距、重复表头、页码和运行页眉。
长文本、网址和表格内容允许自然换行；图片保持比例，不拉伸。正文和主要信息不放入装饰图形。
章节标题与后文尽量同页，段落使用孤行控制，表格行尽量不跨页。

## 中文字体

镜像安装 `fonts-noto-cjk` 和 `fonts-dejavu-core`，通过 Fontconfig 指定 `Noto Sans CJK SC`、`Noto Serif CJK SC`；代码使用 DejaVu Sans Mono 并回退中文字体。
生成前验证每种正文/标题书体的 Regular 与 Bold 均存在且来自不同字体文件，不将常规体注册成伪粗体。
字体由渲染器嵌入 PDF，任务期间不加载 Google Fonts 或其它远程字体。
变更字体或升级渲染器后重新检查中文标点、英中混排、代码、长表格和图片分页。

## 最终页面复核

自动检查不能判断所有审美问题，也不能证明正文语义正确。查看最终 PDF 的每页 PNG，重点关注：

- 标题层级是否清楚，字体是否可读，有无缺字。
- 页边距、图表比例、段间距是否一致。
- 长表格是否重复表头、保留完整内容。
- 标题是否孤悬，图注是否与图片分离，页眉页脚是否挤压正文。
- 留白是否符合阅读目的，有无非预期空页。

## 参考来源与采用范围

这些是设计/工程方法参考，本项目实现为本地 Python/CLI，没有安装对应插件或 MCP，也没有复制外部 skill 的自动安装、发布或清理动作。

- [Anthropic PDF](https://github.com/anthropics/skills/tree/main/skills/pdf)：通用处理与表单能力分工；保留现有辅助脚本。
- [MiniMax PDF design](https://github.com/MiniMax-AI/skills/blob/main/skills/minimax-pdf/design/design.md)：内容与设计参数分离、统一字号和间距体系。
- [daymade PDF creator](https://github.com/daymade/claude-code-skills/blob/main/daymade-docs/pdf-creator/SKILL.md)：中文字体、打印/手机阅读和最终预览思路；字体适配 Linux Noto CJK。
- [WeasyPrint PDF skill](https://github.com/slapash/weasyprint-pdf-skill/blob/main/SKILL.md)：模板/数据分离及多层质量检查。
- [WeasyPrint 官方文档](https://doc.courtbouillon.org/weasyprint/v68.1/)：使用固定 68.1 渲染器；升级后验证版面。

Typst 可作为后续长篇技术文档路线，本次不增加第二套排版依赖。
