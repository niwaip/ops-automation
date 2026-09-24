"""
Office document extraction tools for DeepSeek Harness (dsh):
Word (.docx) paragraph & comment parsing, Excel (.xlsx) sheet & cell extraction,
and PDF (.pdf) page text & image structure parsing.
"""

import os
import zipfile
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET


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
            total_p = len(texts)
            s_idx = max(0, (start_line or 1) - 1)
            e_idx = min(total_p, end_line if end_line is not None else total_p)
            sliced = [f"P{s_idx + 1 + i}: {t}" for i, t in enumerate(texts[s_idx:e_idx])]
            return f"【Word 文档 ({p.name}) 切片内容（第 {s_idx + 1} 至 {e_idx} 段落，共 {total_p} 段落）】:\n" + "\n".join(sliced)[:max_chars]
        if len(content) > max_chars:
            hint = (
                f"\n\n[⚠️ Word 文档截断提醒]: 文档提取总长 {len(content)} 字符 / {len(texts)} 段落，已展示前 {max_chars} 字符。"
                f"\n💡 [通用建议]: 可指定 start_line 与 end_line（例如 start_line={max_chars // 100}）分页切片读取，或直接查阅已自动生成的同名 .txt 文件]"
            )
            return f"【Word 文档 ({p.name}) 内容提取，共 {len(texts)} 个段落】:\n" + content[:max_chars] + hint
        return f"【Word 文档 ({p.name}) 内容提取，共 {len(texts)} 个段落】:\n" + content
    except Exception as e:
        return f"Word 文档提取失败 ({p.name}): {e}"


def extract_xlsx_text(
    p: Path,
    max_chars: int = 30000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None
) -> str:
    """Extracts text from Excel spreadsheets (.xlsx) using standard library zipfile + xml"""
    try:
        with zipfile.ZipFile(p) as z:
            shared_strings = []
            if "xl/sharedStrings.xml" in z.namelist():
                ss_root = ET.fromstring(z.read("xl/sharedStrings.xml"))
                for si in ss_root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"):
                    shared_strings.append("".join(t.text or "" for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")))
            rows = []
            sheet_files = sorted([n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")])
            for sheet_name in sheet_files[:3]:
                sheet_root = ET.fromstring(z.read(sheet_name))
                for row in sheet_root.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row"):
                    row_vals = []
                    for c in row.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c"):
                        v = c.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v")
                        t = c.get("t")
                        val = v.text if v is not None and v.text else ""
                        if t == "s" and val.isdigit() and int(val) < len(shared_strings):
                            val = shared_strings[int(val)]
                        if val:
                            row_vals.append(val)
                    if row_vals:
                        rows.append(" | ".join(row_vals))
        content = "\n".join(rows)
        for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
            tp = p.parent / txt_name
            if not tp.exists():
                try:
                    tp.write_text(content, encoding="utf-8")
                except Exception:
                    pass
        if start_line is not None or end_line is not None:
            total_r = len(rows)
            s_idx = max(0, (start_line or 1) - 1)
            e_idx = min(total_r, end_line if end_line is not None else total_r)
            sliced = [f"Row {s_idx + 1 + i}: {r}" for i, r in enumerate(rows[s_idx:e_idx])]
            return f"【Excel 表格 ({p.name}) 切片数据（第 {s_idx + 1} 至 {e_idx} 行，共 {total_r} 行）】:\n" + "\n".join(sliced)[:max_chars]
        if len(content) > max_chars:
            hint = (
                f"\n\n[⚠️ Excel 表格截断提醒]: 表格提取总长 {len(content)} 字符 / {len(rows)} 行，已展示前 {max_chars} 字符。"
                f"\n💡 [通用建议]: 可指定 start_line 与 end_line 分页切片读取表格行，或使用 python 工具加载指定单元格区域]"
            )
            return f"【Excel 表格 ({p.name}) 数据提取，共 {len(rows)} 行】:\n" + content[:max_chars] + hint
        return f"【Excel 表格 ({p.name}) 数据提取，共 {len(rows)} 行】:\n" + content
    except Exception as e:
        return f"Excel 表格提取失败 ({p.name}): {e}"


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
            if start_line is not None or end_line is not None:
                p_lines = raw_pdf_txt.splitlines()
                s_idx = max(0, (start_line or 1) - 1)
                e_idx = min(len(p_lines), end_line if end_line is not None else len(p_lines))
                sliced = [f"L{s_idx + 1 + i}: {line}" for i, line in enumerate(p_lines[s_idx:e_idx])]
                return f"【PDF 文档 ({p.name}) 提取文本切片（第 {s_idx + 1} 至 {e_idx} 行，共 {len(p_lines)} 行）】:\n" + "\n".join(sliced)[:max_chars]
            if len(raw_pdf_txt) > max_chars:
                hint = (
                    f"\n\n[⚠️ PDF 文档截断提醒]: 文档文本总长 {len(raw_pdf_txt)} 字符，已展示前 {max_chars} 字符。"
                    f"\n💡 [通用建议]: 可指定 start_line 与 end_line 分页切片读取，或直接查阅已缓存的同名 .txt 文件]"
                )
                return f"【PDF 文档 ({p.name}) 提取文本】:\n" + raw_pdf_txt[:max_chars] + hint
            return f"【PDF 文档 ({p.name}) 提取文本】:\n" + raw_pdf_txt
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
            if start_line is not None or end_line is not None:
                p_lines = combined_text.splitlines()
                s_idx = max(0, (start_line or 1) - 1)
                e_idx = min(len(p_lines), end_line if end_line is not None else len(p_lines))
                sliced = [f"L{s_idx + 1 + i}: {line}" for i, line in enumerate(p_lines[s_idx:e_idx])]
                return f"【PDF 文档 ({p.name}) 内容切片（第 {s_idx + 1} 至 {e_idx} 行，共 {len(p_lines)} 行）】:\n" + "\n".join(sliced)[:max_chars]
            if len(combined_text) > max_chars:
                hint = (
                    f"\n\n[⚠️ PDF 文档截断提醒]: 文档文本总长 {len(combined_text)} 字符 / {num_pages} 页，已展示前 {max_chars} 字符。"
                    f"\n💡 [通用建议]: 可指定 start_line 与 end_line 分页切片读取，或直接查阅已缓存的同名 .txt 文件]"
                )
                return f"【PDF 文档 ({p.name}) 内容提取，共 {num_pages} 页】:\n" + combined_text[:max_chars] + hint
            return f"【PDF 文档 ({p.name}) 内容提取，共 {num_pages} 页】:\n" + combined_text
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
            if start_line is not None or end_line is not None:
                p_lines = combined_text.splitlines()
                s_idx = max(0, (start_line or 1) - 1)
                e_idx = min(len(p_lines), end_line if end_line is not None else len(p_lines))
                sliced = [f"L{s_idx + 1 + i}: {line}" for i, line in enumerate(p_lines[s_idx:e_idx])]
                return f"【PPT 文档 ({p.name}) 内容切片（第 {s_idx + 1} 至 {e_idx} 行，共 {len(p_lines)} 行）】:\n" + "\n".join(sliced)[:max_chars]
            if len(combined_text) > max_chars:
                hint = (
                    f"\n\n[⚠️ PPT 演示文稿截断提醒]: 演示文稿文本总长 {len(combined_text)} 字符 / {len(prs.slides)} 页，已展示前 {max_chars} 字符。"
                    f"\n💡 [通用建议]: 可指定 start_line 与 end_line 分页切片读取，或直接查阅已缓存的同名 .txt 文件]"
                )
                return f"【PowerPoint 演示文稿 ({p.name}) 内容提取，共 {len(prs.slides)} 页】:\n" + combined_text[:max_chars] + hint
            return f"【PowerPoint 演示文稿 ({p.name}) 内容提取，共 {len(prs.slides)} 页】:\n" + combined_text
    except Exception:
        pass

    # 2. 兜底方案：使用标准库 zipfile + xml 直接解析（零外部依赖，100% 稳妥）
    try:
        import re
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
                if start_line is not None or end_line is not None:
                    p_lines = combined_text.splitlines()
                    s_idx = max(0, (start_line or 1) - 1)
                    e_idx = min(len(p_lines), end_line if end_line is not None else len(p_lines))
                    sliced = [f"L{s_idx + 1 + i}: {line}" for i, line in enumerate(p_lines[s_idx:e_idx])]
                    return f"【PPT 文档 ({p.name}) 内容切片（第 {s_idx + 1} 至 {e_idx} 行，共 {len(p_lines)} 行）】:\n" + "\n".join(sliced)[:max_chars]
                if len(combined_text) > max_chars:
                    hint = (
                        f"\n\n[⚠️ PPT 演示文稿截断提醒]: 演示文稿文本总长 {len(combined_text)} 字符 / {len(slide_files)} 页，已展示前 {max_chars} 字符。"
                        f"\n💡 [通用建议]: 可指定 start_line 与 end_line 分页切片读取，或直接查阅已缓存的同名 .txt 文件]"
                    )
                    return f"【PowerPoint 演示文稿 ({p.name}) 内容提取，共 {len(slide_files)} 页】:\n" + combined_text[:max_chars] + hint
                return f"【PowerPoint 演示文稿 ({p.name}) 内容提取，共 {len(slide_files)} 页】:\n" + combined_text
            else:
                return f"【PPT 文档 ({p.name}) 概要】: 共 {len(slide_files)} 页，文档为空或未检测到文字内容。"
    except Exception as e:
        return f"PowerPoint 演示文稿提取失败 ({p.name}): {e}"
