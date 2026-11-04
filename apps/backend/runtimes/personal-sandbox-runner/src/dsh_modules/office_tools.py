"""
Office document extraction tools for DeepSeek Harness (dsh):
Word (.docx) paragraph & comment parsing, Excel (.xlsx) sheet & cell extraction,
and PDF (.pdf) page text & image structure parsing.
"""

import os
import zipfile
import re
from pathlib import Path
from typing import Optional, Union
from xml.etree import ElementTree as ET

# ----------------- Excel 解析与格式化下沉至 excel_tools 模块 -----------------
from .excel_tools import (
    extract_xlsx_text,
    _format_excel_cell,
    _format_float_lossless,
    _has_uncalculated_formulas,
    _is_catalog_query,
    _get_or_create_recalculated_xlsx,
    RECALC_CACHE_VERSION,
    EXCEL_ERRORS,
)


def extract_document_outline(lines: list, max_headings: int = 15) -> str:
    """
    Extracts structural outline / TOC from text lines to help models navigate large documents.
    Matches markdown headers (#), numeric chapters (1. Introduction, 1.1), Chinese chapters (第一章, 一、),
    academic paper standard headers (Abstract, Contents, References, Algorithm).
    """
    top_level = []
    sub_level = []
    top_pat = re.compile(
        r'^(?:#\s+[^\n]+|[0-9]+\.\s+[A-Z][a-zA-Z0-9\s\-,:]{2,50}$|第[0-9一二三四五六七八九十]+章[\s\S]{0,30}$|Abstract$|Contents$|References$)',
        re.IGNORECASE
    )
    sub_pat = re.compile(
        r'^(?:##\s+[^\n]+|[0-9]+\.[0-9]+(?:\.[0-9]+)*\.?\s+[A-Z][a-zA-Z0-9\s\-,:]{2,50}$|Algorithm\s+\d+[:\s][^\n]+)',
        re.IGNORECASE
    )

    for idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or len(stripped) > 80:
            continue
        # Avoid duplicate index listing if document already has a literal table of contents block
        if 25 < idx < 90 and len(lines) > 23 and 'contents' in lines[23].lower():
            continue
        if top_pat.match(stripped):
            clean_h = re.sub(r'(\s*\.\s*){3,}\s*\d*$', '', stripped)
            top_level.append(f"  • L{idx + 1}: {clean_h}")
        elif sub_pat.match(stripped) and len(sub_level) < 12:
            clean_h = re.sub(r'(\s*\.\s*){3,}\s*\d*$', '', stripped)
            sub_level.append(f"    - L{idx + 1}: {clean_h}")

    combined = top_level + sub_level
    if combined:
        return "\n\n📑 [文档核心结构索引 (可指定行号范围切片阅读)]:\n" + "\n".join(combined[:max_headings])
    return ""


def slice_lines_with_char_limit(
    lines: list,
    total_lines: int,
    start_line: Optional[int],
    end_line: Optional[int],
    max_chars: int = 30000,
    header_label: str = "切片内容",
    line_prefix: str = "L"
) -> str:
    """
    Slices document lines safely adhering to character limit without chopping lines mid-word.
    Generates honest header showing actual displayed range vs requested range, and provides
    clear next-step pagination hint when truncated.
    """
    s_idx = max(0, (start_line or 1) - 1)
    req_e_idx = min(total_lines, end_line if end_line is not None else total_lines)

    if s_idx >= total_lines or s_idx >= req_e_idx:
        return f"【{header_label}（起始行超出有效范围: 第 {s_idx + 1} 行，文档总行数: {total_lines} 行）】"

    safety_margin = 450
    content_budget = max(1000, max_chars - safety_margin)

    accumulated = []
    curr_chars = 0
    actual_e_idx = s_idx

    for idx in range(s_idx, req_e_idx):
        line_item = f"{line_prefix}{idx + 1}: {lines[idx]}"
        line_len = len(line_item) + 1
        if accumulated and (curr_chars + line_len > content_budget):
            break
        accumulated.append(line_item)
        curr_chars += line_len
        actual_e_idx = idx + 1

    body = "\n".join(accumulated)

    if actual_e_idx < req_e_idx:
        header = f"【{header_label}（请求范围: 第 {s_idx + 1} 至 {req_e_idx} 行，实际展示: 第 {s_idx + 1} 至 {actual_e_idx} 行，共 {total_lines} 行）】:\n"
        hint = (
            f"\n\n[⚠️ 单次字符上限截断提醒]: 已达到单次返回字符上限 ({max_chars} 字符)，本次完整展示至第 {actual_e_idx} 行。第 {actual_e_idx + 1} 至 {req_e_idx} 行未在本次输出。"
            f"\n💡 [接力读取建议]: 如需继续阅读未展示内容，请在下次调用时指定: start_line={actual_e_idx + 1}, end_line={req_e_idx}"
        )
        return header + body + hint
    else:
        header = f"【{header_label}（第 {s_idx + 1} 至 {actual_e_idx} 行，共 {total_lines} 行）】:\n"
        return header + body


def format_unsliced_document_view(
    raw_text: str,
    max_chars: int = 30000,
    header_label: str = "内容提取",
    extra_meta: str = ""
) -> str:
    """
    Formats an un-sliced document view. If length exceeds max_chars, cleanly truncates at line boundary,
    appends a document outline index if available, and gives precise start_line guidance.
    """
    if len(raw_text) <= max_chars:
        prefix = f"【{header_label}{extra_meta}】:\n"
        return prefix + raw_text

    lines = raw_text.splitlines()
    total_lines = len(lines)
    safety_margin = 600
    content_budget = max(1000, max_chars - safety_margin)

    accumulated = []
    curr_chars = 0
    for idx, line in enumerate(lines):
        line_len = len(line) + 1
        if accumulated and (curr_chars + line_len > content_budget):
            break
        accumulated.append(line)
        curr_chars += line_len

    displayed_lines = len(accumulated)
    body = "\n".join(accumulated)
    outline = extract_document_outline(lines)

    meta_str = f"（已展示前 {displayed_lines} 行，共 {total_lines} 行{extra_meta}）"
    header = f"【{header_label}{meta_str}】:\n"

    hint = (
        f"\n\n[⚠️ 长文档截断提醒]: 文档文本总长 {len(raw_text)} 字符 / {total_lines} 行，已完整展示前 {displayed_lines} 行。{outline}"
        f"\n💡 [接力读取建议]: 可直接指定行号进行切片阅读，推荐下一次调用: read_file(start_line={displayed_lines + 1}, end_line={min(total_lines, displayed_lines + 800)})，或调用 bash 执行 `grep -n '关键词'` 精准定位。"
    )
    return header + body + hint


def extract_docx_text(
    p: Path,
    max_chars: int = 30000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> str:
    """Extracts text from Word documents (.docx) using standard library zipfile + xml without external dependencies"""
    try:
        with zipfile.ZipFile(p) as z:
            xml = z.read("word/document.xml").decode("utf-8")
        root = ET.fromstring(xml)
        texts = []
        for item in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
            t = "".join(n.text or "" for n in item.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"))
            if t.strip():
                texts.append(t.strip())
        content = "\n".join(texts)
        # 自动生成同名 .txt 文件，方便后续其他命令或用户查看
        for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
            tp = p.parent / txt_name
            if not tp.exists():
                try:
                    tp.write_text(content, encoding="utf-8")
                except Exception:
                    pass
        if start_line is not None or end_line is not None:
            return slice_lines_with_char_limit(
                texts,
                total_lines=len(texts),
                start_line=start_line,
                end_line=end_line,
                max_chars=max_chars,
                header_label=f"Word 文档 ({p.name}) 切片内容",
                line_prefix="P"
            )
        return format_unsliced_document_view(
            content,
            max_chars=max_chars,
            header_label=f"Word 文档 ({p.name}) 内容提取",
            extra_meta=f"，共 {len(texts)} 个段落"
        )
    except Exception as e:
        return f"Word 文档提取失败 ({p.name}): {e}"


def extract_pdf_text(
    p: Path,
    max_chars: int = 30000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> str:
    """Extracts text from PDF documents (.pdf) using pypdf and cached text files"""
    txt_sibling = p.parent / f"{p.name}.txt"
    if not txt_sibling.exists():
        txt_sibling = p.parent / f"{p.stem}.txt"
    if txt_sibling.exists():
        try:
            raw_pdf_txt = txt_sibling.read_text(encoding="utf-8", errors="ignore")
            p_lines = raw_pdf_txt.splitlines()
            if start_line is not None or end_line is not None:
                return slice_lines_with_char_limit(
                    p_lines,
                    total_lines=len(p_lines),
                    start_line=start_line,
                    end_line=end_line,
                    max_chars=max_chars,
                    header_label=f"PDF 文档 ({p.name}) 提取文本切片",
                    line_prefix="L"
                )
            return format_unsliced_document_view(
                raw_pdf_txt,
                max_chars=max_chars,
                header_label=f"PDF 文档 ({p.name}) 提取文本"
            )
        except Exception:
            pass
    try:
        import pypdf
        reader = pypdf.PdfReader(str(p))
        num_pages = len(reader.pages)
        pages_text = []
        has_images = False
        for i, page in enumerate(reader.pages):
            txt = (page.extract_text() or "").strip()
            if txt:
                pages_text.append(f"--- 第 {i+1} 页 ---\n{txt}")
            if getattr(page, "images", None) and len(page.images) > 0:
                has_images = True
        combined_text = "\n\n".join(pages_text).strip()
        if combined_text:
            for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                tp = p.parent / txt_name
                if not tp.exists():
                    try:
                        tp.write_text(combined_text, encoding="utf-8")
                    except Exception:
                        pass
            p_lines = combined_text.splitlines()
            if start_line is not None or end_line is not None:
                return slice_lines_with_char_limit(
                    p_lines,
                    total_lines=len(p_lines),
                    start_line=start_line,
                    end_line=end_line,
                    max_chars=max_chars,
                    header_label=f"PDF 文档 ({p.name}) 内容切片",
                    line_prefix="L"
                )
            return format_unsliced_document_view(
                combined_text,
                max_chars=max_chars,
                header_label=f"PDF 文档 ({p.name}) 内容提取",
                extra_meta=f"，共 {num_pages} 页"
            )
        elif has_images:
            return f"【PDF 文档 ({p.name}) 概要】: 共 {num_pages} 页，文档属于扫描版或图片型 PDF（包含嵌入图片对象，无直接文本层）。"
        else:
            return f"【PDF 文档 ({p.name}) 概要】: 共 {num_pages} 页，文档为空或未检测到文字内容。"
    except Exception as e:
        return f"PDF 文档解析失败 ({p.name}): {e}"


def extract_pptx_text(
    p: Path,
    max_chars: int = 30000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> str:
    """Extracts text from PowerPoint presentations (.pptx) using python-pptx or standard library zipfile + xml"""
    # 1. 优先尝试使用 python-pptx（若环境预装）
    try:
        from pptx import Presentation
        prs = Presentation(str(p))
        slides_text = []
        for idx, slide in enumerate(prs.slides, 1):
            slide_lines = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        txt = para.text.strip()
                        if txt:
                            slide_lines.append(txt)
            if slide_lines:
                slides_text.append(f"--- 第 {idx} 页 ---\n" + "\n".join(slide_lines))
            else:
                slides_text.append(f"--- 第 {idx} 页 (无文字或纯图) ---")
        combined_text = "\n\n".join(slides_text).strip()
        if combined_text:
            for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                tp = p.parent / txt_name
                if not tp.exists():
                    try:
                        tp.write_text(combined_text, encoding="utf-8")
                    except Exception:
                        pass
            p_lines = combined_text.splitlines()
            if start_line is not None or end_line is not None:
                return slice_lines_with_char_limit(
                    p_lines,
                    total_lines=len(p_lines),
                    start_line=start_line,
                    end_line=end_line,
                    max_chars=max_chars,
                    header_label=f"PPT 文档 ({p.name}) 内容切片",
                    line_prefix="L"
                )
            return format_unsliced_document_view(
                combined_text,
                max_chars=max_chars,
                header_label=f"PowerPoint 演示文稿 ({p.name}) 内容提取",
                extra_meta=f"，共 {len(prs.slides)} 页"
            )
    except Exception:
        pass

    # 2. 兜底方案：使用标准库 zipfile + xml 直接解析（零外部依赖，100% 稳妥）
    try:
        with zipfile.ZipFile(p) as z:
            slide_files = [f for f in z.namelist() if f.startswith("ppt/slides/slide") and f.endswith(".xml")]
            def slide_num(f):
                m = re.search(r'slide(\d+)\.xml', f)
                return int(m.group(1)) if m else 9999
            slide_files.sort(key=slide_num)

            slides_text = []
            for idx, sf in enumerate(slide_files, 1):
                xml_data = z.read(sf).decode("utf-8")
                root = ET.fromstring(xml_data)
                texts = []
                for node in root.iter():
                    if node.tag.endswith("}t") and node.text and node.text.strip():
                        texts.append(node.text.strip())
                if texts:
                    slides_text.append(f"--- 第 {idx} 页 ---\n" + "\n".join(texts))
                else:
                    slides_text.append(f"--- 第 {idx} 页 (无文字或纯图) ---")

            combined_text = "\n\n".join(slides_text).strip()
            if combined_text:
                for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                    tp = p.parent / txt_name
                    if not tp.exists():
                        try:
                            tp.write_text(combined_text, encoding="utf-8")
                        except Exception:
                            pass
                p_lines = combined_text.splitlines()
                if start_line is not None or end_line is not None:
                    return slice_lines_with_char_limit(
                        p_lines,
                        total_lines=len(p_lines),
                        start_line=start_line,
                        end_line=end_line,
                        max_chars=max_chars,
                        header_label=f"PPT 文档 ({p.name}) 内容切片",
                        line_prefix="L"
                    )
                return format_unsliced_document_view(
                    combined_text,
                    max_chars=max_chars,
                    header_label=f"PowerPoint 演示文稿 ({p.name}) 内容提取",
                    extra_meta=f"，共 {len(slide_files)} 页"
                )
            else:
                return f"【PPT 文档 ({p.name}) 概要】: 共 {len(slide_files)} 页，文档为空或未检测到文字内容。"
    except Exception as e:
        return f"PowerPoint 演示文稿提取失败 ({p.name}): {e}"
