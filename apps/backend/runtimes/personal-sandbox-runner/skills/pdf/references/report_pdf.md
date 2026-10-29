# Markdown / JSON → 设计模板 → PDF

## 命令入口

```bash
python3 /opt/dsh/skills/pdf/scripts/generate_report_pdf.py \
  --input /workspace/report.md --output /workspace/report.pdf \
  --template report --theme emerald --min-pages 2 --max-pages 4
```

保留旧入口 `generate_report_pdf.py` 及 `--input/--text/--output/--title/--subtitle/--author/--date/--theme`。
内部使用 WeasyPrint，不再用 FPDF 逐行绘制；`--input` 支持 `.md`、`.txt`、`.json`。
也可通过 stdin 输入。标题默认取第一个 Markdown H1，正文中去除该 H1，避免重复标题。
作者和日期只在传入时显示；生成器不自行添加组织署名。

新增选项：

| 参数 | 用途 |
| --- | --- |
| `--template report/handout/editorial/mobile` | 版面、字号、正文书体 |
| `--theme blue/emerald/slate/burgundy/warm` | 统一配色；讲义/编辑版默认 warm，其余 blue |
| `--accent '#RRGGBB'` | 自定义强调色，淡色背景由其自动推导 |
| `--cover` | 显式增加独立封面 |
| `--min-pages/--max-pages` | 检查实际页数范围 |
| `--preview-dir` | 覆盖默认预览目录 |

## Markdown 内容

支持标题、加粗、斜体、列表、链接、表格、引用、代码块和本地插图。普通段落让引擎自然换行，不按纸面宽度手工拆成许多短行。

常用火焰、图表、视频等图标由生成器转为本地 SVG，不依赖 emoji 字体；奖牌排名转为数字。
报纸、体育、财经、交通、定位等常见图符有本地矢量资源；未知图符以可读名称标签显示，
不会导致整个 PDF 失败。国旗显示地区标识，组合 emoji 整体降级，不能把缺字方框当成正常图标。
支持的 grid/card 容器会解析内部 Markdown；不要将任意 HTML 容器与 Markdown 混写。
通过 bash 生成的 PDF 也要经过统一的结构与逐页视觉发布门禁，检查器失败必须修复后重新生成。

```markdown
# 城市自然观察手册

## 观察前的准备

带上记录本，从**颜色、形状和声音**三个方面观察。

> 留出时间停下来观察，比匆忙记录更多项目更有帮助。

| 观察对象 | 记录内容 |
| --- | --- |
| 树木 | 叶片形状与树皮纹理 |
| 鸟类 | 声音、颜色和活动位置 |

![叶片示意](images/leaf.png)

<!-- pagebreak -->

## 记录与交流

把观察结果整理成短句，与同伴比较。
```

`<!-- pagebreak -->` 表示主动分页；常规内容依靠自然分页。长表格自动重复表头，行尽量保持完整。不要用固定页面高度加 `overflow:hidden` 掩盖内容溢出。

## 结构化 JSON

图文组件较多、需要可靠复用时使用 JSON；内容字符由程序转义。`markdown` 块可承载必要的富文本。

```json
{
  "title": "城市自然观察手册",
  "subtitle": "观察、记录与分享",
  "language": "zh-CN",
  "blocks": [
    {"type": "heading", "level": 2, "text": "准备"},
    {"type": "paragraph", "text": "带上记录本和铅笔。"},
    {"type": "list", "items": ["观察颜色", "记录声音"]},
    {"type": "callout", "text": "观察时不要打扰动物。"},
    {"type": "table", "headers": ["对象", "记录"], "rows": [["树木", "叶片形状"]]},
    {"type": "image", "path": "images/leaf.png", "caption": "叶片示意"},
    {"type": "pagebreak"},
    {"type": "markdown", "text": "## 交流\n\n比较大家的记录。"}
  ]
}
```

`heading` 支持 level 2/3/4；`list` 可加 `ordered:true`；`quote` 与 `callout` 都渲染为强调区块。
`title/subtitle/author/date/language` 为可选文档属性，CLI 显式参数优先。
未知块或列数不匹配直接报错，不静默丢内容。

## 质量回执

默认生成 `/workspace/.pdf-preview/report/qa.json`、`document.html` 和 `page-1.png` 等。
回执包含 PDF SHA-256、页数、逐页提取文本、嵌入字体、页面尺寸、错误和渲染/检查/预览耗时。
`valid` 只表示程序检查通过；`visual_review=required` 提醒模型仍需查看每页 PNG。
失败回执保留在同一隐藏目录，原始 Markdown/JSON 保留不删除。
