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
  - "翻译ppt"
  - "翻译pptx"
  - "ppt翻译"
  - "翻译幻灯片"
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

### 场景二：已有 PPTX 高保真翻译与多语言替换（保持格式 100% 不变）

> ⚠️ **严禁规则**：
> 1. **附件路径规则**：沙箱中用户上传的附件均直接位于工作区 `/workspace/<文件名>.pptx`，**严禁猜测 `/mnt` 等不存在的路径**，若不确定文件名先 `ls /workspace` 确认；
> 2. **绝对禁止**由模型自主编写 `python-pptx` 的 Run 级 `replace` 脚本（会导致文字断裂、短词劫持与漏翻译）；
> 3. **绝对禁止**模型在 bash 循环中手动编写数十 KB 的 Python 字典或代码！
> 4. 必须使用沙箱内置的高性能 OOXML 翻译引擎：`/opt/dsh/skills/pptx/scripts/ooxml_translate.py`。

#### 推荐方案：一键全自动端到端翻译（耗时最短、体验最优）
直接调用 `bash` 执行沙箱内置的一键翻译流水线，脚本会自动执行解包、并发模型批量翻译、智能排版保护与格式打包：

- **翻译为英文演示文稿 (English)**：
  ```bash
  python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py auto \
    "/workspace/<输入文件>.pptx" \
    "/workspace/<输出文件>.pptx" \
    --lang en-US --font 'Calibri'
  ```
- **翻译为日文演示文稿 (Japanese)**：
  ```bash
  python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py auto \
    "/workspace/<输入文件>.pptx" \
    "/workspace/<输出文件>.pptx" \
    --lang ja-JP --font 'Yu Gothic'
  ```
该命令内置多语言行业专业术语库、多线程并发与排版敏感型紧凑翻译法则，自动启用版面自适应与字号动态保护，可在数十秒内完成数十页 PPT 的完整高保真本地化！

#### 备用方案：分步流水线法
如需中间干预或查看译文数据：
1. **第 1 步：解包提取待翻译 JSON 字典**
   ```bash
   python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py unpack "/workspace/<输入文件>.pptx" --out-json /workspace/translation_input.json --temp-dir /workspace/.ooxml_temp
   ```
2. **第 2 步：并发批量翻译**
   ```bash
   python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py translate /workspace/translation_input.json /workspace/translation_output.json --lang en-US
   ```
3. **第 3 步：注入并重新打包**
   ```bash
   python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py pack /workspace/.ooxml_temp /workspace/translation_output.json "/workspace/<输出文件>.pptx" --lang en-US --font 'Calibri'
   ```

4. **第 4 步：面向用户的友好交付回复规范（【极简精悍原则，篇幅控制在 250~350 字以内】）**
   当打包与校验完成后，在聊天窗口向用户进行交付汇报时，必须采用**面向最终商务用户（业务汇报人、演示者）的精炼、专业视角**，内容务必简洁干练，避免长篇累赘：
   - 🚫 **红线约束**：
     - **拒绝冗长流水账**：严禁把几十页逐一列出琐碎小要点，严禁大篇幅堆砌长表格；
     - **严禁输出测试员暗语**：严禁在回复中直接堆砌命令行参数、内部函数或协议名（如 `--shrink-font`、`--auto-fit`、`normAutofit`、`解包/打包` 等底层名词）；
     - **严禁泄露容器路径**：严禁在回复末尾或正文中直接展示 `/workspace/` 等内部沙箱物理路径；
     - **严禁虚假承诺与语言错位**：如果用户要求的是英文版，严禁输出日文内容；交付前必须确保文件语言与用户要求一致！
   - ✅ **标准极简商务交付结构（三段式，清新明快）**：
     1. **交付致辞与全局概览**（2~3 句话）：明确说明演示文稿已完成高保真本地化与智能版面优化，并高度提炼核心主题与结构；
     2. **精选核心术语对照**（精选 4~6 个最核心的业务/技术术语）：精炼紧凑的目标语言对照，助用户快速掌握关键翻译口径；
     3. **版面保障与微调建议**（1~2 句话）：告知原版母版、配色与矢量结构 100% 完整保留，默认适配标准商务字体（英文 Calibri / 日文 Yu Gothic），温和提示用户可直接点击下方文件卡片一键下载演示。

---

## 3. 注意事项

1. **避免输出未执行源码**：除非用户明确要求查看 Python 源码，否则不要向用户返回代码块，直接调用 `bash` 工具运行生成。
2. **文本自动换行**：添加文本框后务必设置 `text_frame.word_wrap = True`，防止文字溢出幻灯片边界。
3. **交付物通知**：生成完成后，遵循第 4 步交付规范给出清晰、友好的用户导读，用户界面将自动挂载下载卡片。
