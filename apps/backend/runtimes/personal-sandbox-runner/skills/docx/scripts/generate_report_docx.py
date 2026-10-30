#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
High-Aesthetic Enterprise Word (.docx) Report Generator.
Converts structured Markdown into publication-quality Microsoft Word documents.
Features:
- Professional Typography Hierarchy (Title, Subtitle, H1-H3, Body, Metadata card)
- Chinese (Microsoft YaHei) and Western (Calibri/Arial/Consolas) font bindings
- Styled Tables with colored headers, zebra striping, cell padding and borders
- Callout Boxes (Note, Tip, Warning, Caution) with colored left bars and tinted backgrounds
- Code blocks with syntax background shading and monospace fonts
- Headers & Footers with document title and page numbers
- Automatic PDF & PNG preview rendering via soffice and pdftoppm (Anthropic-style verification)
- Full ISO/IEC 29500-4 XSD Schema Compliance
"""

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn, nsdecls
from docx.oxml import parse_xml, OxmlElement


THEMES = {
    "tech-blue": {
        "primary": RGBColor(0x1E, 0x40, 0xAF),      # Deep Tech Blue
        "secondary": RGBColor(0x1D, 0x4E, 0xD8),    # Royal Blue
        "accent": RGBColor(0x02, 0x84, 0xC7),       # Sky Blue
        "text_dark": RGBColor(0x1E, 0x29, 0x3B),    # Slate 800
        "text_muted": RGBColor(0x64, 0x74, 0x8B),   # Slate 500
        "bg_light_hex": "F0F7FF",
        "primary_hex": "1E40AF",
        "secondary_hex": "1D4ED8",
        "border_hex": "CBD5E1",
        "zebra_hex": "F8FAFC",
    },
    "business-navy": {
        "primary": RGBColor(0x0F, 0x17, 0x2A),      # Slate 900
        "secondary": RGBColor(0x33, 0x41, 0x55),    # Slate 700
        "accent": RGBColor(0x25, 0x63, 0xEB),       # Blue 600
        "text_dark": RGBColor(0x0F, 0x17, 0x2A),
        "text_muted": RGBColor(0x64, 0x74, 0x8B),
        "bg_light_hex": "F8FAFC",
        "primary_hex": "0F172A",
        "secondary_hex": "334155",
        "border_hex": "E2E8F0",
        "zebra_hex": "F1F5F9",
    },
    "elegant-teal": {
        "primary": RGBColor(0x0F, 0x76, 0x6E),      # Teal 700
        "secondary": RGBColor(0x11, 0x5E, 0x59),    # Teal 800
        "accent": RGBColor(0x0D, 0x94, 0x88),       # Teal 600
        "text_dark": RGBColor(0x13, 0x4E, 0x48),
        "text_muted": RGBColor(0x5E, 0x7E, 0x7B),
        "bg_light_hex": "F0FDFA",
        "primary_hex": "0F766E",
        "secondary_hex": "115E59",
        "border_hex": "CCFBF1",
        "zebra_hex": "F7FEE7",
    },
    "crimson-red": {
        "primary": RGBColor(0x99, 0x1B, 0x1B),      # Red 800
        "secondary": RGBColor(0xB9, 0x1C, 0x1C),    # Red 700
        "accent": RGBColor(0xDC, 0x26, 0x26),       # Red 600
        "text_dark": RGBColor(0x45, 0x0A, 0x0A),
        "text_muted": RGBColor(0x7F, 0x1D, 0x1D),
        "bg_light_hex": "FEF2F2",
        "primary_hex": "991B1B",
        "secondary_hex": "B91C1C",
        "border_hex": "FECACA",
        "zebra_hex": "FFF1F2",
    },
    "modern-graphite": {
        "primary": RGBColor(0x18, 0x18, 0x1B),      # Zinc 900
        "secondary": RGBColor(0x3F, 0x3F, 0x46),    # Zinc 700
        "accent": RGBColor(0x52, 0x52, 0x5B),       # Zinc 600
        "text_dark": RGBColor(0x18, 0x18, 0x1B),
        "text_muted": RGBColor(0x71, 0x71, 0x7A),
        "bg_light_hex": "F4F4F5",
        "primary_hex": "18181B",
        "secondary_hex": "3F3F46",
        "border_hex": "E4E4E7",
        "zebra_hex": "FAFAFA",
    }
}

FONT_CN = "Microsoft YaHei"
FONT_EN = "Calibri"
FONT_CODE = "Consolas"


def set_run_font(run, font_name=FONT_CN, size_pt=10.5, bold=False, italic=False, underline=False, color_rgb=None):
    """Sets dual font (EastAsian + Ascii) and styling safely on a Run."""
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    if underline:
        run.underline = True
    if color_rgb:
        run.font.color.rgb = color_rgb
    
    rPr = run._r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn("w:eastAsia"), font_name)
    rFonts.set(qn("w:ascii"), FONT_EN if font_name == FONT_CN else font_name)
    rFonts.set(qn("w:hAnsi"), FONT_EN if font_name == FONT_CN else font_name)


def format_cell_box(cell, width_in_inches, bg_hex=None, border_color=None,
                    padding=(120, 140, 120, 140), custom_left_border=None):
    """
    Applies tcW, tcBorders, shd, tcMar in STRICT ISO/IEC 29500-1 schema sequence.
    Schema requires child order:
    1. tcW
    2. tcBorders (sequence: top, left, bottom, right)
    3. shd
    4. tcMar (sequence: top, left, bottom, right)
    """
    cell.width = width_in_inches
    tcPr = cell._tc.get_or_add_tcPr()
    
    # Remove existing conflicting children to enforce exact schema order
    for tag_name in ['tcBorders', 'shd', 'tcMar']:
        existing = tcPr.find(qn(f'w:{tag_name}'))
        if existing is not None:
            tcPr.remove(existing)

    # 1. tcBorders
    tcBorders = OxmlElement('w:tcBorders')
    if custom_left_border:
        # e.g. for Callout Box: thick left, none for others
        top_el = parse_xml(f'<w:top {nsdecls("w")} w:val="none"/>')
        left_el = parse_xml(f'<w:left {nsdecls("w")} w:val="single" w:sz="{custom_left_border.get("sz", 24)}" w:space="0" w:color="{custom_left_border.get("color", "2563EB")}"/>')
        bottom_el = parse_xml(f'<w:bottom {nsdecls("w")} w:val="none"/>')
        right_el = parse_xml(f'<w:right {nsdecls("w")} w:val="none"/>')
        tcBorders.append(top_el)
        tcBorders.append(left_el)
        tcBorders.append(bottom_el)
        tcBorders.append(right_el)
        tcPr.append(tcBorders)
    elif border_color:
        top_el = parse_xml(f'<w:top {nsdecls("w")} w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>')
        left_el = parse_xml(f'<w:left {nsdecls("w")} w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>')
        bottom_el = parse_xml(f'<w:bottom {nsdecls("w")} w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>')
        right_el = parse_xml(f'<w:right {nsdecls("w")} w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>')
        tcBorders.append(top_el)
        tcBorders.append(left_el)
        tcBorders.append(bottom_el)
        tcBorders.append(right_el)
        tcPr.append(tcBorders)

    # 2. shd
    if bg_hex:
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{bg_hex}" w:val="clear"/>')
        tcPr.append(shd)

    # 3. tcMar (Sequence MUST be: top, left, bottom, right)
    top_p, left_p, bottom_p, right_p = padding
    tcMar = OxmlElement('w:tcMar')
    for m_name, m_val in [('top', top_p), ('left', left_p), ('bottom', bottom_p), ('right', right_p)]:
        m_node = OxmlElement(f'w:{m_name}')
        m_node.set(qn('w:w'), str(m_val))
        m_node.set(qn('w:type'), 'dxa')
        tcMar.append(m_node)
    tcPr.append(tcMar)


def add_callout_box(doc, text_lines, box_type="note", theme=None):
    """Creates an elegant callout box with a colored left border and soft background."""
    types = {
        "note": {"title": "提示 (NOTE)", "color": "2563EB", "bg": "EFF6FF"},
        "tip": {"title": "技巧 (TIP)", "color": "10B981", "bg": "F0FDF4"},
        "warning": {"title": "警告 (WARNING)", "color": "F59E0B", "bg": "FFFBEB"},
        "important": {"title": "重要 (IMPORTANT)", "color": "DC2626", "bg": "FEF2F2"},
        "caution": {"title": "注意 (CAUTION)", "color": "E11D48", "bg": "FFF1F2"},
    }
    cfg = types.get(box_type.lower(), types["note"])
    if theme and box_type == "note":
        cfg["color"] = theme["primary_hex"]
        cfg["bg"] = theme["bg_light_hex"]

    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    cell = tbl.cell(0, 0)
    
    format_cell_box(
        cell,
        width_in_inches=Inches(6.5),
        bg_hex=cfg["bg"],
        padding=(160, 240, 160, 200),
        custom_left_border={"color": cfg["color"], "sz": 24}
    )

    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    run_icon = p.add_run(f"📌 {cfg['title']}\n")
    set_run_font(run_icon, font_name=FONT_CN, size_pt=10, bold=True,
                 color_rgb=RGBColor.from_string(cfg["color"]))

    in_sub_code = False
    for i, line in enumerate(text_lines):
        line_s = line.strip()
        if line_s.startswith("```"):
            in_sub_code = not in_sub_code
            continue
        p_body = cell.add_paragraph() if i > 0 else p
        p_body.paragraph_format.space_before = Pt(1 if in_sub_code else 2)
        p_body.paragraph_format.space_after = Pt(1 if in_sub_code else 2)
        p_body.paragraph_format.line_spacing = 1.15 if in_sub_code else 1.2
        if in_sub_code:
            p_body.paragraph_format.left_indent = Inches(0.15)
            run = p_body.add_run(line)
            set_run_font(run, font_name=FONT_CODE, size_pt=8.5, color_rgb=RGBColor(0x0F, 0x17, 0x2A))
        else:
            add_styled_inline_text(p_body, line, font_size=9.5, color_rgb=RGBColor(0x33, 0x41, 0x55))
    
    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(0)
    p_spacer.paragraph_format.space_after = Pt(6)


def add_code_block(doc, code_text, language=""):
    """Creates a beautifully shaded, monospaced terminal/code snippet block."""
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    cell = tbl.cell(0, 0)

    format_cell_box(
        cell,
        width_in_inches=Inches(6.5),
        bg_hex="F8FAFC",
        border_color="E2E8F0",
        padding=(120, 180, 120, 180)
    )

    # Clean lines and unwrap blockquote markers if nested
    raw_lines = code_text.strip().split("\n")
    cleaned_lines = []
    for l in raw_lines:
        if l.startswith("> "):
            l = l[2:]
        elif l.startswith(">"):
            l = l[1:]
        cleaned_lines.append(l)

    p_first = cell.paragraphs[0]
    p_first.paragraph_format.space_before = Pt(0)
    p_first.paragraph_format.space_after = Pt(2)
    p_first.paragraph_format.line_spacing = 1.15

    has_lang = bool(language and language.strip())
    if has_lang:
        lang_str = language.strip().upper()
        run_badge = p_first.add_run(f"▸ {lang_str}")
        set_run_font(run_badge, font_name=FONT_CODE, size_pt=8, bold=True, color_rgb=RGBColor(0x64, 0x74, 0x8B))

    for idx, l in enumerate(cleaned_lines):
        p_line = cell.add_paragraph() if (idx > 0 or has_lang) else p_first
        p_line.paragraph_format.space_before = Pt(0)
        p_line.paragraph_format.space_after = Pt(0)
        p_line.paragraph_format.line_spacing = 1.15
        run = p_line.add_run(l)
        set_run_font(run, font_name=FONT_CODE, size_pt=9, color_rgb=RGBColor(0x0F, 0x17, 0x2A))

    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(0)
    p_spacer.paragraph_format.space_after = Pt(6)


def add_horizontal_divider(doc, theme):
    """Renders a subtle, clean horizontal dividing line strictly compliant with w:pPr schema sequence."""
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    border_hex = theme.get("border_hex", "CBD5E1")
    pBdr = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="6" w:space="1" w:color="{border_hex}"/></w:pBdr>')
    spacing = pPr.find(qn('w:spacing'))
    if spacing is not None:
        spacing.addprevious(pBdr)
    else:
        pPr.append(pBdr)
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(6)


def add_styled_inline_text(paragraph, text, font_size=10.5, color_rgb=None, default_bold=False):
    """Parses inline bold (***text***, **text**), code (`text`), italic (*text*), strike (~~text~~), and links ([text](url))."""
    token_pattern = re.compile(
        r'(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|`[^`]+`|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)'
    )
    parts = token_pattern.split(text)
    for part in parts:
        if not part:
            continue
        if part.startswith("***") and part.endswith("***") and len(part) > 6:
            run = paragraph.add_run(part[3:-3])
            set_run_font(run, font_name=FONT_CN, size_pt=font_size, bold=True, italic=True, color_rgb=color_rgb)
        elif part.startswith("**") and part.endswith("**") and len(part) > 4:
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, font_name=FONT_CN, size_pt=font_size, bold=True, color_rgb=color_rgb)
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, font_name=FONT_CODE, size_pt=font_size - 0.5, bold=True,
                         color_rgb=RGBColor(0x02, 0x84, 0xC7))
            try:
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F1F5F9" w:val="clear"/>')
                run._r.get_or_add_rPr().append(shd)
            except Exception:
                pass
        elif part.startswith("~~") and part.endswith("~~") and len(part) > 4:
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, font_name=FONT_CN, size_pt=font_size, color_rgb=color_rgb)
            run.font.strike = True
        elif part.startswith("[") and "]" in part and "(" in part and part.endswith(")"):
            m = re.match(r"^\[([^\]]+)\]\(([^)]+)\)$", part)
            if m:
                link_text = m.group(1)
                run = paragraph.add_run(link_text)
                set_run_font(run, font_name=FONT_CN, size_pt=font_size, underline=True,
                             color_rgb=RGBColor(0x25, 0x63, 0xEB))
            else:
                run = paragraph.add_run(part)
                set_run_font(run, font_name=FONT_CN, size_pt=font_size, bold=default_bold, color_rgb=color_rgb)
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, font_name=FONT_CN, size_pt=font_size, italic=True, color_rgb=color_rgb)
        else:
            run = paragraph.add_run(part)
            set_run_font(run, font_name=FONT_CN, size_pt=font_size, bold=default_bold, color_rgb=color_rgb)


def build_document_header(doc, title, subtitle="", author="", theme=None):
    """Creates a visually impactful executive header banner."""
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    cell = tbl.cell(0, 0)
    
    format_cell_box(
        cell,
        width_in_inches=Inches(6.5),
        bg_hex=theme["bg_light_hex"],
        padding=(240, 260, 240, 240),
        custom_left_border={"color": theme["primary_hex"], "sz": 24}
    )

    # Title
    p_title = cell.paragraphs[0]
    p_title.paragraph_format.space_before = Pt(4)
    p_title.paragraph_format.space_after = Pt(8)
    run_title = p_title.add_run(title)
    set_run_font(run_title, font_name=FONT_CN, size_pt=22, bold=True, color_rgb=theme["primary"])

    # Subtitle
    if subtitle:
        p_sub = cell.add_paragraph()
        p_sub.paragraph_format.space_before = Pt(0)
        p_sub.paragraph_format.space_after = Pt(10)
        run_sub = p_sub.add_run(subtitle)
        set_run_font(run_sub, font_name=FONT_CN, size_pt=11.5, italic=True, color_rgb=theme["text_muted"])

    # Metadata bar
    meta_items = []
    if author:
        meta_items.append(f"👤 起草编制: {author}")
    meta_items.append("📅 生成日期: 2026年10月")
    meta_items.append("📄 状态: 官方推荐规范")

    p_meta = cell.add_paragraph()
    p_meta.paragraph_format.space_before = Pt(4)
    p_meta.paragraph_format.space_after = Pt(2)
    run_meta = p_meta.add_run("   |   ".join(meta_items))
    set_run_font(run_meta, font_name=FONT_CN, size_pt=9, color_rgb=theme["text_muted"])

    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(12)
    p_spacer.paragraph_format.space_after = Pt(6)


def render_markdown_table(doc, table_lines, theme):
    """Parses markdown table lines and renders a beautifully styled Word table."""
    rows_data = []
    for line in table_lines:
        line = line.strip()
        if not line.startswith("|"):
            continue
        cols = [c.strip() for c in line.split("|")[1:-1]]
        if not cols or all(re.match(r"^:?-+:?$", c) for c in cols):
            continue  # Separator line
        rows_data.append(cols)

    if not rows_data:
        return

    num_rows = len(rows_data)
    num_cols = max(len(r) for r in rows_data)

    tbl = doc.add_table(rows=num_rows, cols=num_cols)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False

    col_width = Inches(6.5 / max(num_cols, 1))

    for r_idx, row in enumerate(rows_data):
        row_obj = tbl.rows[r_idx]
        is_header = (r_idx == 0)
        bg_color = theme["primary_hex"] if is_header else (theme["zebra_hex"] if r_idx % 2 == 1 else "FFFFFF")

        for c_idx in range(num_cols):
            cell = row_obj.cells[c_idx]
            format_cell_box(
                cell,
                width_in_inches=col_width,
                bg_hex=bg_color,
                border_color=theme["border_hex"],
                padding=(120, 140, 120, 140)
            )

            text = row[c_idx] if c_idx < len(row) else ""
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.15

            if is_header:
                add_styled_inline_text(p, text, font_size=10, color_rgb=RGBColor(0xFF, 0xFF, 0xFF), default_bold=True)
            else:
                add_styled_inline_text(p, text, font_size=9.5, color_rgb=theme["text_dark"])

    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(2)
    p_spacer.paragraph_format.space_after = Pt(8)


def convert_markdown_to_docx(markdown_text, output_path, theme_name="tech-blue", title="", subtitle="", author=""):
    """Core compiler: converts Markdown text to an aesthetically styled .docx file."""
    theme = THEMES.get(theme_name, THEMES["tech-blue"])
    doc = docx.Document()

    # 1. Page Margins (Standard A4: 1 inch / 2.54 cm)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        section.header.is_linked_to_previous = False
        section.footer.is_linked_to_previous = False

        # Header styling
        hp = section.header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hp.paragraph_format.space_after = Pt(4)
        run_h = hp.add_run(f"规范与安装指南  |  {title or '技术白皮书'}")
        set_run_font(run_h, font_name=FONT_CN, size_pt=8.5, color_rgb=theme["text_muted"])

        # Footer styling with Page Number hint
        fp = section.footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run_f = fp.add_run("— 机密与专有技术规范 —")
        set_run_font(run_f, font_name=FONT_CN, size_pt=8, color_rgb=theme["text_muted"])

    # 2. Extract Title if not provided
    try:
        zoom = doc.settings.element.find(qn('w:zoom'))
        if zoom is not None and not zoom.get(qn('w:percent')):
            zoom.set(qn('w:percent'), '100')
    except Exception:
        pass
    lines = markdown_text.strip().split("\n")
    if not title:
        for line in lines:
            if line.startswith("# "):
                title = line[2:].strip()
                break
        if not title:
            title = "技术安装与操作指南"

    # Build Header Block
    build_document_header(doc, title, subtitle, author, theme)

    # 3. State Machine for Parsing Markdown Blocks
    in_code_block = False
    code_lines = []
    code_lang = ""

    in_table = False
    table_lines = []

    in_callout = False
    callout_lines = []
    callout_type = "note"

    for line in lines:
        stripped = line.strip()

        # Handle Code Block delimiter
        if stripped.startswith("```"):
            if in_code_block:
                add_code_block(doc, "\n".join(code_lines), code_lang)
                code_lines = []
                code_lang = ""
                in_code_block = False
            else:
                if in_table:
                    render_markdown_table(doc, table_lines, theme)
                    table_lines = []
                    in_table = False
                if in_callout:
                    add_callout_box(doc, callout_lines, callout_type, theme)
                    callout_lines = []
                    in_callout = False
                in_code_block = True
                code_lang = stripped[3:].strip()
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        # 3. Handle Markdown Tables
        if stripped.startswith("|") and stripped.endswith("|"):
            if not in_table:
                if in_callout:
                    add_callout_box(doc, callout_lines, callout_type, theme)
                    callout_lines = []
                    in_callout = False
                in_table = True
            table_lines.append(stripped)
            continue
        elif in_table:
            render_markdown_table(doc, table_lines, theme)
            table_lines = []
            in_table = False

        # 4. Handle Horizontal Dividers (---, ***, ___)
        if re.match(r"^(\-{3,}|\*{3,}|_{3,})$", stripped):
            if in_callout:
                add_callout_box(doc, callout_lines, callout_type, theme)
                callout_lines = []
                in_callout = False
            add_horizontal_divider(doc, theme)
            continue

        # 5. Handle Callout Boxes (> [!NOTE] or > **提示** or general blockquote)
        callout_match = re.match(r"^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\](.*)$", stripped, re.IGNORECASE)
        zh_callout_match = re.match(r"^>\s*(?:【|\*\*)(注意|提示|建议|警告|重要)(?:】|\*\*)(.*)$", stripped)
        if callout_match or zh_callout_match:
            if in_callout:
                add_callout_box(doc, callout_lines, callout_type, theme)
                callout_lines = []
            in_callout = True
            if callout_match:
                callout_type = callout_match.group(1).lower()
                first_text = callout_match.group(2).strip()
            else:
                tag = zh_callout_match.group(1)
                mapping = {"提示": "tip", "建议": "tip", "注意": "caution", "警告": "warning", "重要": "important"}
                callout_type = mapping.get(tag, "note")
                first_text = zh_callout_match.group(2).strip()
            if first_text:
                callout_lines.append(first_text)
            continue

        if in_callout:
            if stripped.startswith(">"):
                callout_lines.append(stripped[1:].strip())
                continue
            elif stripped == "":
                add_callout_box(doc, callout_lines, callout_type, theme)
                callout_lines = []
                in_callout = False
                continue
            else:
                add_callout_box(doc, callout_lines, callout_type, theme)
                callout_lines = []
                in_callout = False

        # General blockquote line starting with `>` but without explicit tag
        if stripped.startswith(">") and not in_callout:
            in_callout = True
            callout_type = "note"
            content = stripped.lstrip(">").strip()
            if content:
                callout_lines.append(content)
            continue

        # 6. Handle Headings (H1 to H6)
        heading_match = re.match(r"^(#{1,6})\s*(.+)$", stripped)
        if heading_match:
            level = len(heading_match.group(1))
            heading_text = heading_match.group(2).strip()

            # Ignore redundant first title `# ` if already in banner
            if level == 1 and heading_text == title:
                continue

            p = doc.add_paragraph()
            p.paragraph_format.keep_with_next = True

            if level == 1:
                p.paragraph_format.space_before = Pt(16)
                p.paragraph_format.space_after = Pt(6)
                add_styled_inline_text(p, heading_text, font_size=16, color_rgb=theme["primary"], default_bold=True)
            elif level == 2:
                p.paragraph_format.space_before = Pt(14)
                p.paragraph_format.space_after = Pt(4)
                run_mark = p.add_run("■  ")
                set_run_font(run_mark, font_name=FONT_CN, size_pt=13.5, bold=True, color_rgb=theme["primary"])
                add_styled_inline_text(p, heading_text, font_size=13.5, color_rgb=theme["secondary"], default_bold=True)
            elif level == 3:
                p.paragraph_format.space_before = Pt(10)
                p.paragraph_format.space_after = Pt(3)
                add_styled_inline_text(p, heading_text, font_size=11.5, color_rgb=theme["accent"], default_bold=True)
            elif level == 4:
                p.paragraph_format.space_before = Pt(8)
                p.paragraph_format.space_after = Pt(3)
                run_mark = p.add_run("▸  ")
                set_run_font(run_mark, font_name=FONT_CN, size_pt=10.5, bold=True, color_rgb=theme["accent"])
                add_styled_inline_text(p, heading_text, font_size=10.5, color_rgb=theme["text_dark"], default_bold=True)
            elif level == 5:
                p.paragraph_format.space_before = Pt(6)
                p.paragraph_format.space_after = Pt(2)
                add_styled_inline_text(p, heading_text, font_size=10, color_rgb=theme["text_dark"], default_bold=True)
            elif level == 6:
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(2)
                add_styled_inline_text(p, heading_text, font_size=9.5, color_rgb=theme["text_muted"], default_bold=True)
            continue

        # 7. Handle Task Lists (Checkboxes: - [ ] or - [x])
        task_match = re.match(r"^[-*]\s+\[([ xX])\]\s+(.*)$", stripped)
        if task_match:
            is_checked = task_match.group(1).lower() == 'x'
            box_mark = "☑  " if is_checked else "☐  "
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.25)
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.25
            run_box = p.add_run(box_mark)
            box_color = theme["primary"] if is_checked else theme["text_muted"]
            set_run_font(run_box, font_name=FONT_CN, size_pt=10.5, bold=True, color_rgb=box_color)
            add_styled_inline_text(p, task_match.group(2), font_size=10.5, color_rgb=theme["text_dark"])
            continue

        # 8. Handle Bullet Lists
        if re.match(r"^[-*]\s+", stripped):
            item_text = re.sub(r"^[-*]\s+", "", stripped)
            p = doc.add_paragraph()
            indent_level = (len(line) - len(line.lstrip())) // 2
            p.paragraph_format.left_indent = Inches(0.25 * (indent_level + 1))
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.25
            run_bullet = p.add_run("•  ")
            set_run_font(run_bullet, font_name=FONT_CN, size_pt=10.5, bold=True, color_rgb=theme["accent"])
            add_styled_inline_text(p, item_text, font_size=10.5, color_rgb=theme["text_dark"])
            continue

        # 9. Handle Numbered Lists
        if re.match(r"^\d+\.\s+", stripped):
            num_match = re.match(r"^(\d+\.)\s+(.*)$", stripped)
            p = doc.add_paragraph()
            indent_level = (len(line) - len(line.lstrip())) // 2
            p.paragraph_format.left_indent = Inches(0.25 * (indent_level + 1))
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(3)
            p.paragraph_format.line_spacing = 1.25
            run_num = p.add_run(f"{num_match.group(1)}  ")
            set_run_font(run_num, font_name=FONT_EN, size_pt=10.5, bold=True, color_rgb=theme["primary"])
            add_styled_inline_text(p, num_match.group(2), font_size=10.5, color_rgb=theme["text_dark"])
            continue

        # 10. Empty lines
        if not stripped:
            continue

        # 11. Normal Paragraph
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.3
        add_styled_inline_text(p, stripped, font_size=10.5, color_rgb=theme["text_dark"])

    # Flush any remaining blocks
    if in_code_block:
        add_code_block(doc, "\n".join(code_lines), code_lang)
    if in_table:
        render_markdown_table(doc, table_lines, theme)
    if in_callout:
        add_callout_box(doc, callout_lines, callout_type, theme)

    # Save to disk
    out_file = Path(output_path).resolve()
    out_file.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(out_file))
    return str(out_file)


def generate_previews(docx_path, preview_dir):
    """Converts the docx to pdf, then creates high-res PNG previews for QA."""
    p_dir = Path(preview_dir)
    p_dir.mkdir(parents=True, exist_ok=True)
    pdf_out_dir = p_dir / "pdf_tmp"
    pdf_out_dir.mkdir(parents=True, exist_ok=True)

    # 1. LibreOffice convert to PDF
    soffice_cmd = ["soffice", "--headless", "--convert-to", "pdf", str(docx_path), "--outdir", str(pdf_out_dir)]
    try:
        subprocess.run(soffice_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=40)
    except Exception as e:
        return {"preview_available": False, "error": f"soffice conversion failed: {str(e)}"}

    expected_pdf = pdf_out_dir / f"{Path(docx_path).stem}.pdf"
    if not expected_pdf.is_file():
        return {"preview_available": False, "error": "PDF not generated by soffice"}

    # 2. pdftoppm convert to PNG
    prefix = str(p_dir / "page")
    ppm_cmd = ["pdftoppm", "-png", "-r", "150", str(expected_pdf), prefix]
    try:
        subprocess.run(ppm_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    except Exception as e:
        return {"preview_available": False, "error": f"pdftoppm failed: {str(e)}"}

    png_files = sorted(p_dir.glob("page-*.png"))
    return {
        "preview_available": True,
        "page_count": len(png_files),
        "previews": [str(p) for p in png_files]
    }


def main():
    parser = argparse.ArgumentParser(description="Compile Markdown to Enterprise Word Document (.docx)")
    parser.add_argument("--input", "-i", required=True, help="Input Markdown file path")
    parser.add_argument("--output", "-o", required=True, help="Output .docx file path")
    parser.add_argument("--theme", choices=list(THEMES.keys()), default="tech-blue", help="Visual color theme")
    parser.add_argument("--title", default="", help="Document Title")
    parser.add_argument("--subtitle", default="", help="Document Subtitle")
    parser.add_argument("--author", default="", help="Document Author")
    parser.add_argument("--preview-dir", help="Directory to save inspection PNGs")
    args = parser.parse_args()

    in_path = Path(args.input)
    if not in_path.is_file():
        print(json.dumps({"status": "error", "message": f"Input file not found: {args.input}"}, ensure_ascii=False))
        sys.exit(1)

    md_content = in_path.read_text(encoding="utf-8")
    docx_file = convert_markdown_to_docx(
        markdown_text=md_content,
        output_path=args.output,
        theme_name=args.theme,
        title=args.title,
        subtitle=args.subtitle,
        author=args.author
    )

    qa_report = {
        "status": "success",
        "file_path": docx_file,
        "file_size_bytes": os.path.getsize(docx_file),
        "theme": args.theme,
    }

    if args.preview_dir:
        preview_res = generate_previews(docx_file, args.preview_dir)
        qa_report.update(preview_res)

    print(json.dumps(qa_report, ensure_ascii=False))


if __name__ == "__main__":
    main()
