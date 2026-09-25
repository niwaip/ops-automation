#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Standard CLI Report PDF Generator for DeepSeek Harness (dsh).
Parses Markdown/Text and generates a polished, publication-ready PDF
using fpdf2 and embedded NotoSansSC fonts.
"""

import os
import sys
import re
import argparse
from datetime import datetime
from pathlib import Path
from fpdf import FPDF


THEMES = {
    "blue": {
        "primary": (37, 99, 235),       # #2563eb
        "primary_light": (239, 246, 255),# #eff6ff
        "primary_dark": (30, 64, 175),  # #1e40af
        "text_main": (30, 41, 59),      # #1e293b
        "text_muted": (100, 116, 139),  # #64748b
        "border": (226, 232, 240),      # #e2e8f0
        "zebra": (248, 250, 252),       # #f8fafc
    },
    "emerald": {
        "primary": (16, 185, 129),
        "primary_light": (236, 253, 245),
        "primary_dark": (6, 95, 70),
        "text_main": (24, 33, 27),
        "text_muted": (100, 116, 139),
        "border": (226, 232, 240),
        "zebra": (248, 250, 252),
    },
    "slate": {
        "primary": (71, 85, 105),
        "primary_light": (241, 245, 249),
        "primary_dark": (30, 41, 59),
        "text_main": (15, 23, 42),
        "text_muted": (100, 116, 139),
        "border": (226, 232, 240),
        "zebra": (248, 250, 252),
    },
    "burgundy": {
        "primary": (159, 18, 57),
        "primary_light": (255, 241, 242),
        "primary_dark": (136, 19, 55),
        "text_main": (30, 27, 28),
        "text_muted": (100, 116, 139),
        "border": (226, 232, 240),
        "zebra": (248, 250, 252),
    }
}


def find_font_paths():
    """Locates regular and bold Chinese fonts in standard sandbox locations."""
    reg_candidates = [
        "/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf",
        "/tmp/font/NotoSansSC-Regular.otf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf",
        os.path.expanduser("~/.fonts/NotoSansSC-Regular.otf"),
        # Local repo fallback for dev testing
        str(Path(__file__).resolve().parent.parent / "assets" / "NotoSansSC-Regular.otf")
    ]
    bold_candidates = [
        "/opt/dsh/skills/pdf/assets/NotoSansSC-Bold.otf",
        "/tmp/font/NotoSansSC-Bold.otf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        str(Path(__file__).resolve().parent.parent / "assets" / "NotoSansSC-Bold.otf")
    ]

    reg_path = None
    for p in reg_candidates:
        if os.path.exists(p):
            reg_path = p
            break

    bold_path = None
    for p in bold_candidates:
        if os.path.exists(p):
            bold_path = p
            break

    return reg_path, bold_path or reg_path


class CleanReportPDF(FPDF):
    """FPDF subclass providing standard report headers, footers, and page numbers."""
    def __init__(self, doc_title: str = "", theme_name: str = "blue", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.doc_title = doc_title
        self.colors = THEMES.get(theme_name, THEMES["blue"])

    def header(self):
        # Header shown on page 2 and later
        if self.page_no() > 1:
            self.set_y(8)
            self.set_font('Noto', size=8)
            r, g, b = self.colors["text_muted"]
            self.set_text_color(r, g, b)
            self.cell(0, 5, self.doc_title, align='R')
            self.set_y(14)
            br, bg, bb = self.colors["border"]
            self.set_draw_color(br, bg, bb)
            self.set_line_width(0.3)
            self.line(self.l_margin, 14, self.w - self.r_margin, 14)

    def footer(self):
        self.set_y(-12)
        br, bg, bb = self.colors["border"]
        self.set_draw_color(br, bg, bb)
        self.set_line_width(0.2)
        self.line(self.l_margin, self.h - 13, self.w - self.r_margin, self.h - 13)

        self.set_font('Noto', size=8)
        r, g, b = self.colors["text_muted"]
        self.set_text_color(r, g, b)

        # Left: Generated info
        self.set_x(self.l_margin)
        self.cell(60, 8, "DeepSeek Harness 智能报表", align='L')

        # Center / Right: Page count
        self.cell(0, 8, f"第 {self.page_no()} 页 / 共 {{nb}} 页", align='R')


def clean_markdown_inline(text: str) -> str:
    """Cleans inline markdown formatting for plain text output."""
    # Convert bold **text** to text
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    # Convert italic *text* to text
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    # Convert `code` to code
    text = re.sub(r'`(.*?)`', r'\1', text)
    # Convert [text](url) to text
    text = re.sub(r'\[(.*?)\]\((.*?)\)', r'\1', text)
    return text.strip()


def render_report(
    content_lines: list,
    output_path: str,
    title: str = "",
    subtitle: str = "",
    author: str = "",
    date_str: str = "",
    theme: str = "blue"
):
    """Renders structured markdown lines into a clean PDF."""
    reg_font, bold_font = find_font_paths()
    if not reg_font:
        raise FileNotFoundError("无法找到 NotoSansSC 中文字体，请确认 /opt/dsh/skills/pdf/assets/ 存在！")

    colors = THEMES.get(theme, THEMES["blue"])

    # Determine title from content if not provided
    first_h1 = None
    cleaned_lines = []
    for line in content_lines:
        line_s = line.strip()
        if not first_h1 and line_s.startswith("# "):
            first_h1 = clean_markdown_inline(line_s[2:])
            continue
        cleaned_lines.append(line)

    doc_title = title or first_h1 or "分析报告"
    today_str = date_str or datetime.now().strftime("%Y年%m月%d日")

    pdf = CleanReportPDF(
        doc_title=doc_title,
        theme_name=theme,
        orientation='P',
        unit='mm',
        format='A4'
    )
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(15, 16, 15)

    pdf.add_font('Noto', '', reg_font)
    pdf.add_font('Noto', 'B', bold_font)

    # 1. 必须先调用 add_page() 打开页面
    pdf.add_page()
    effective_w = pdf.w - pdf.l_margin - pdf.r_margin

    # 2. 顶部主标题
    pr, pg, pb = colors["primary"]
    pdf.set_font('Noto', 'B', 20)
    pdf.set_text_color(pr, pg, pb)
    pdf.cell(effective_w, 12, text=doc_title, new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(1)

    # 3. 副标题与元数据栏
    meta_parts = []
    if subtitle:
        meta_parts.append(subtitle)
    meta_parts.append(f"生成日期: {today_str}")
    if author:
        meta_parts.append(f"报告编制: {author}")

    pdf.set_font('Noto', '', 9.5)
    mr, mg, mb = colors["text_muted"]
    pdf.set_text_color(mr, mg, mb)
    pdf.cell(effective_w, 6, text="  |  ".join(meta_parts), new_x="LMARGIN", new_y="NEXT", align="L")
    pdf.ln(3)

    # 主题色横线
    pdf.set_draw_color(pr, pg, pb)
    pdf.set_line_width(1.0)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(6)

    # 4. 逐行解析 Markdown 内容
    in_table = False
    table_rows = []

    def flush_table():
        nonlocal in_table, table_rows
        if not table_rows:
            in_table = False
            return

        # 过滤分隔线行 (如 |---|---|)
        data_rows = []
        for r in table_rows:
            is_sep = all(re.match(r'^:?-+:?$', c.strip()) for c in r if c.strip())
            if not is_sep and any(c.strip() for c in r):
                data_rows.append([clean_markdown_inline(c) for c in r])

        if not data_rows:
            table_rows = []
            in_table = False
            return

        num_cols = max(len(r) for r in data_rows)
        # 补齐列数
        for r in data_rows:
            while len(r) < num_cols:
                r.append("")

        # 计算每列字符权重与宽度分配
        col_lens = [0] * num_cols
        for r in data_rows:
            for ci, c in enumerate(r):
                # 中文字符计 1.5 权值
                col_lens[ci] = max(col_lens[ci], sum(1.5 if ord(ch) > 127 else 1.0 for ch in c))
        tot_len = sum(col_lens) or 1
        col_widths = [max(18.0, (l / tot_len) * effective_w) for l in col_lens]
        # 调整至恰好填满页面宽度
        scale = effective_w / sum(col_widths)
        col_widths = [w * scale for w in col_widths]

        # 检查剩余空间是否足够容纳表头，不足则翻页
        if pdf.get_y() > pdf.h - 35:
            pdf.add_page()

        # 表头
        br, bg, bb = colors["border"]
        pdf.set_draw_color(br, bg, bb)
        pdf.set_line_width(0.2)

        header_row = data_rows[0]
        pdf.set_font('Noto', 'B', 9.5)
        plr, plg, plb = colors["primary_light"]
        pdf.set_fill_color(plr, plg, plb)
        pdr, pdg, pdb = colors["primary_dark"]
        pdf.set_text_color(pdr, pdg, pdb)

        for ci, val in enumerate(header_row):
            pdf.cell(col_widths[ci], 8, text=val, border=1, fill=True, align="C")
        pdf.ln()

        # 表格数据行
        pdf.set_font('Noto', '', 9.0)
        tmr, tmg, tmb = colors["text_main"]
        pdf.set_text_color(tmr, tmg, tmb)
        zr, zg, zb = colors["zebra"]

        for ri, r in enumerate(data_rows[1:]):
            if pdf.get_y() > pdf.h - 25:
                pdf.add_page()
            # 斑马纹交替底色
            if ri % 2 == 1:
                pdf.set_fill_color(zr, zg, zb)
            else:
                pdf.set_fill_color(255, 255, 255)
            for ci, val in enumerate(r):
                align = "C" if ci == 0 or len(val) <= 6 else "L"
                pdf.cell(col_widths[ci], 7.5, text=val, border=1, fill=True, align=align)
            pdf.ln()

        pdf.ln(4)
        table_rows = []
        in_table = False

    i = 0
    while i < len(cleaned_lines):
        line = cleaned_lines[i]
        line_s = line.strip()

        # 表格行检测
        if line_s.startswith("|") and line_s.endswith("|"):
            in_table = True
            cells = [c.strip() for c in line_s.strip("|").split("|")]
            table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            flush_table()

        if not line_s:
            pdf.ln(3)
            i += 1
            continue

        # 分割线
        if line_s in ("---", "***", "___") or re.match(r'^-{3,}$', line_s):
            pdf.ln(2)
            br, bg, bb = colors["border"]
            pdf.set_draw_color(br, bg, bb)
            pdf.set_line_width(0.3)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.ln(4)
            i += 1
            continue

        # 二级标题 H2
        if line_s.startswith("## "):
            h2_text = clean_markdown_inline(line_s[3:])
            if pdf.get_y() > pdf.h - 35:
                pdf.add_page()
            pdf.ln(4)
            cur_y = pdf.get_y()
            # 装饰左侧色块条
            pdf.set_fill_color(pr, pg, pb)
            pdf.rect(pdf.l_margin, cur_y + 0.5, 3.5, 7.5, style="F")

            pdf.set_x(pdf.l_margin + 6)
            pdf.set_font('Noto', 'B', 13)
            pdr, pdg, pdb = colors["primary_dark"]
            pdf.set_text_color(pdr, pdg, pdb)
            pdf.cell(effective_w - 6, 8.5, text=h2_text, new_x="LMARGIN", new_y="NEXT", align="L")
            pdf.ln(2)
            i += 1
            continue

        # 三级标题 H3
        if line_s.startswith("### "):
            h3_text = clean_markdown_inline(line_s[4:])
            if pdf.get_y() > pdf.h - 30:
                pdf.add_page()
            pdf.ln(2)
            pdf.set_font('Noto', 'B', 11)
            pdf.set_text_color(30, 41, 59)
            pdf.cell(effective_w, 7, text=h3_text, new_x="LMARGIN", new_y="NEXT", align="L")
            pdf.ln(1)
            i += 1
            continue

        # 引用块 Blockquote (以 > 开头)
        if line_s.startswith(">"):
            quote_text = clean_markdown_inline(re.sub(r'^>\s*', '', line_s))
            if pdf.get_y() > pdf.h - 30:
                pdf.add_page()
            cur_y = pdf.get_y()
            pdf.set_font('Noto', '', 9.5)
            # 计算行高并预留边框
            tmr, tmg, tmb = colors["text_main"]
            pdf.set_text_color(tmr, tmg, tmb)
            plr, plg, plb = colors["primary_light"]
            pdf.set_fill_color(plr, plg, plb)
            # 绘制淡色背景
            pdf.set_x(pdf.l_margin + 2)
            pdf.set_fill_color(plr, plg, plb)
            pdf.set_draw_color(pr, pg, pb)
            pdf.set_line_width(1.0)
            # 引用块左竖条
            pdf.line(pdf.l_margin + 2, cur_y, pdf.l_margin + 2, cur_y + 8)
            pdf.set_x(pdf.l_margin + 6)
            pdf.multi_cell(effective_w - 8, 6.5, text=quote_text)
            pdf.ln(2)
            i += 1
            continue

        # 列表项 (无序列表 - 或 *)
        if re.match(r'^[-*]\s+', line_s):
            bullet_text = clean_markdown_inline(re.sub(r'^[-*]\s+', '', line_s))
            pdf.set_font('Noto', '', 10)
            tmr, tmg, tmb = colors["text_main"]
            pdf.set_text_color(tmr, tmg, tmb)
            # 绘制小圆点/圆角方块
            pdf.set_fill_color(pr, pg, pb)
            pdf.rect(pdf.l_margin + 2, pdf.get_y() + 2.2, 1.8, 1.8, style="F")
            pdf.set_x(pdf.l_margin + 7)
            pdf.multi_cell(effective_w - 7, 6.5, text=bullet_text)
            pdf.ln(1.5)
            i += 1
            continue

        # 列表项 (有序列表 1. 2.)
        m_num = re.match(r'^(\d+)\.\s+', line_s)
        if m_num:
            num_str = m_num.group(1)
            num_text = clean_markdown_inline(line_s[m_num.end():])
            pdf.set_font('Noto', 'B', 9.5)
            pdf.set_text_color(pr, pg, pb)
            pdf.cell(8, 6.5, text=f"{num_str}.", align="L")
            pdf.set_font('Noto', '', 10)
            tmr, tmg, tmb = colors["text_main"]
            pdf.set_text_color(tmr, tmg, tmb)
            pdf.multi_cell(effective_w - 8, 6.5, text=num_text)
            pdf.ln(1.5)
            i += 1
            continue

        # 普通正文段落
        para_text = clean_markdown_inline(line_s)
        pdf.set_font('Noto', '', 10)
        tmr, tmg, tmb = colors["text_main"]
        pdf.set_text_color(tmr, tmg, tmb)
        pdf.multi_cell(effective_w, 6.5, text=para_text)
        pdf.ln(2)
        i += 1

    if in_table:
        flush_table()

    # 确保输出目录存在
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    pdf.output(output_path)
    file_size = os.path.getsize(output_path)
    print(f"SUCCESS: {output_path}, pages={pdf.page_no()}, size={file_size}", flush=True)
    return output_path


def main():
    parser = argparse.ArgumentParser(description="DeepSeek Harness Standard Report PDF Generator")
    parser.add_argument("--input", "-i", help="Path to input markdown or text file")
    parser.add_argument("--text", "-t", help="Inline markdown or text content")
    parser.add_argument("--output", "-o", default="/workspace/report.pdf", help="Output PDF file path")
    parser.add_argument("--title", help="Report document title override")
    parser.add_argument("--subtitle", help="Report document subtitle")
    parser.add_argument("--author", default="", help="Report author / organization")
    parser.add_argument("--date", help="Report date (default: today)")
    parser.add_argument("--theme", default="blue", choices=["blue", "emerald", "slate", "burgundy"], help="Color theme")

    args = parser.parse_args()

    lines = []
    if args.input:
        if not os.path.exists(args.input):
            print(f"ERROR: Input file not found: {args.input}", file=sys.stderr)
            sys.exit(1)
        with open(args.input, "r", encoding="utf-8") as f:
            lines = f.readlines()
    elif args.text:
        lines = args.text.splitlines()
    else:
        # Check stdin
        if not sys.stdin.isatty():
            lines = sys.stdin.readlines()
        else:
            print("ERROR: Either --input, --text or stdin must be provided", file=sys.stderr)
            parser.print_help()
            sys.exit(1)

    try:
        render_report(
            content_lines=lines,
            output_path=args.output,
            title=args.title or "",
            subtitle=args.subtitle or "",
            author=args.author or "",
            date_str=args.date or "",
            theme=args.theme
        )
    except Exception as e:
        print(f"ERROR: Failed to generate PDF: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
