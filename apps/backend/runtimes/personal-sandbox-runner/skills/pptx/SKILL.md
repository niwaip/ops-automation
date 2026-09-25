---
name: pptx
zh_name: "PowerPoint 演示文稿生成与编辑引擎"
description: "PowerPoint (.pptx) 幻灯片演示文稿生成、页面排版、图表与表格制作。当用户需要新建 PPTX、制作汇报幻灯片、生成演讲 Deck 或编辑已有 PPT 时使用此技能。输出必须为物理保存至 /workspace/ 路径下的 .pptx 交付物文件。"
tags:
  - "pptx"
  - "ppt"
  - "slides"
  - "presentation"
  - "powerpoint"
triggers:
  - "pptx"
  - "ppt"
  - "powerpoint"
  - "幻灯片"
  - "演示文稿"
  - "生成pptx"
  - "导出pptx"
  - "做个ppt"
  - "制作ppt"
deliverables:
  - ".pptx"
requires_execution: true
default_rounds: 5
od:
  mode: deck
  category: slides
---

# PPTX Creation & Presentation Generation

本技能为沙箱环境中的智能体提供专业级 PowerPoint (.pptx) 幻灯片生成、内容布局与样式排版规范。

---

## 1. 运行环境与核心规范

- ✅ **预装依赖**：沙箱已预装 `python-pptx`，直接在 Python 脚本中使用，严禁 `pip install`！
- ✅ **交付闭环**：当用户要求生成 PPT/幻灯片时，必须调用 `bash` 工具执行 Python 脚本，将最终产物落盘保存至 `/workspace/<文件名>.pptx`。
- ✅ **16:9 现代比例**：默认采用 16:9 宽屏高清尺寸（13.333 × 7.5 英寸 / 12192000 × 6858000 EMU）。
- ✅ **字体与配色规范**：
  - 中文字体统一推荐使用 `微软雅黑` (Microsoft YaHei) 或 `黑体` (SimHei)；英文字体推荐 `Calibri` 或 `Arial`。
  - 主题色彩层次：选用深色/高端主色（如商务蓝 `#1e293b`、科技蓝 `#0284c7` 或深墨绿 `#064e3b`）搭配鲜明点缀色，确保文字与背景高对比度。

---

## 2. 标准快速生成模版与示例

### 场景：一键生成现代化商业汇报 PPTX

在 Python 中调用 `python-pptx` 构建多页幻灯片：

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation()
# 设置 16:9 宽屏
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# 使用空白版式自由排版
blank_layout = prs.slide_layouts[6]

# --- 封面页 ---
slide1 = prs.slides.add_slide(blank_layout)

# 标题
tb = slide1.shapes.add_textbox(Inches(1.5), Inches(2.5), Inches(10.3), Inches(1.5))
tf = tb.text_frame
tf.word_wrap = True
p = tf.paragraphs[0]
p.text = "2026 年度企业数字化与智能化战略汇报"
p.font.name = "Microsoft YaHei"
p.font.size = Pt(40)
p.font.bold = True
p.font.color.rgb = RGBColor(30, 41, 59)

# 副标题
p2 = tf.add_paragraph()
p2.text = "业务增长 · 自动化协同 · 技术落地规划"
p2.font.name = "Microsoft YaHei"
p2.font.size = Pt(20)
p2.font.color.rgb = RGBColor(100, 116, 139)

# --- 内容页：多卡片/多要点布局 ---
slide2 = prs.slides.add_slide(blank_layout)

# 页面标题
title_box = slide2.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.3), Inches(0.8))
tp = title_box.text_frame.paragraphs[0]
tp.text = "核心业务进展与里程碑"
tp.font.name = "Microsoft YaHei"
tp.font.size = Pt(28)
tp.font.bold = True
tp.font.color.rgb = RGBColor(15, 23, 42)

# 要点列表
content_box = slide2.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.3), Inches(4.8))
c_tf = content_box.text_frame
c_tf.word_wrap = True

points = [
    ("智能化沙箱调度上线", "实现全隔离轻量容器毫秒级响应，支持无缝安全交互。"),
    ("跨系统协同工作流重构", "打通企业通讯与审批链路，自动化处理效率提升 65%。"),
    ("多模态文档生成引擎升级", "支持 Word、Excel、PDF 与 PPT 原生高保真双向导出。"),
]

for idx, (head, desc) in enumerate(points):
    p_h = c_tf.paragraphs[0] if idx == 0 else c_tf.add_paragraph()
    p_h.text = f"•  {head}"
    p_h.font.name = "Microsoft YaHei"
    p_h.font.size = Pt(18)
    p_h.font.bold = True
    p_h.font.color.rgb = RGBColor(30, 41, 59)

    p_d = c_tf.add_paragraph()
    p_d.text = f"    {desc}"
    p_d.font.name = "Microsoft YaHei"
    p_d.font.size = Pt(14)
    p_d.font.color.rgb = RGBColor(100, 116, 139)
    p_d.space_after = Pt(14)

# 保存至工作区交付物
out_file = "/workspace/presentation.pptx"
prs.save(out_file)
print(f"PPTX 成功生成并保存至: {out_file}")
```

---

## 3. 注意事项

1. **避免输出未执行源码**：除非用户明确要求查看 Python 源码，否则不要向用户返回代码块，直接调用 `bash` 工具运行生成。
2. **文本自动换行**：添加文本框后务必设置 `text_frame.word_wrap = True`，防止文字溢出幻灯片边界。
3. **交付物通知**：生成完成后，直接告知用户文件已生成保存至 `/workspace/<文件名>.pptx`，用户界面将自动挂载下载卡片。
