"""Budgeted PDF views and structured coverage, independent of document semantics."""
from __future__ import annotations

import math
import time
import contextlib
from pathlib import Path

from .pdf_text_cache import extract_pdf_document, _format_pages_text
from .tool_result import ToolResult, TextToolOutput


def _page_range(start, end, count):
    def number(value):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError('页码必须是从1开始的整数')
        return value
    first = number(start) if start is not None else 1
    last = number(end) if end is not None else (first if start is not None else count)
    if first > last or last > count:
        raise ValueError(f'页码范围无效：{first}-{last}，文档共{count}页')
    return first, last


def _crop_page(path, page_number, bbox):
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        raise ValueError('bbox 必须是 [x0, top, x1, bottom] 四个PDF坐标')
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in bbox):
        raise ValueError('bbox 坐标必须是有限数值')
    import pdfplumber
    from .pdf_text_cache import quiet_pdfminer_logging, clean_pdf_text
    with quiet_pdfminer_logging(), pdfplumber.open(path) as pdf:
        page = pdf.pages[page_number - 1]
        x0, top, x1, bottom = bbox
        px0, ptop, px1, pbottom = page.bbox
        if not px0 <= x0 < x1 <= px1 or not ptop <= top < bottom <= pbottom:
            raise ValueError(f'bbox 超出页面范围 {list(page.bbox)}')
        return clean_pdf_text(page.crop(tuple(bbox)).extract_text(layout=True) or '',
            preserve_layout=True) or '[该区域未提取到文字，不能据此断言没有图像内容]'


def _summary(doc):
    return {key: doc.get(key) for key in (
        'num_pages', 'extractor', 'version', 'page_coverage_complete',
        'unread_pages', 'visual_pages', 'layout_status', 'layout_pages', 'source_sha256')}


def _read_selected_pages(path, start, end, deadline):
    """A targeted read parses text only for the requested pages, even on a cold cache."""
    import pdfplumber
    from .pdf_page_layout import extract_page_evidence
    from .pdf_text_cache import quiet_pdfminer_logging
    with quiet_pdfminer_logging(), pdfplumber.open(path) as pdf:
        count = len(pdf.pages)
        first, last = _page_range(start, end, count)
        pages = []
        for n in range(first, last + 1):
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError('Task total execution deadline exceeded during selected PDF reading')
            page = pdf.pages[n - 1]
            try:
                pages.append(extract_page_evidence(page, n))
            except TimeoutError:
                raise
            except Exception as error:
                pages.append({'page': n, 'text': '', 'status': 'error',
                              'layout': 'unknown', 'error': type(error).__name__})
            finally:
                with contextlib.suppress(Exception):
                    page.close()
    return {'num_pages': count, 'pages': pages, 'extractor': 'pdfplumber',
        'version': 'targeted-native-v1',
        'page_coverage_complete': all(p['status'] in ('text', 'blank') for p in pages),
        'unread_pages': [p['page'] for p in pages if p['status'] not in ('text', 'blank')],
        'visual_pages': [p['page'] for p in pages if p['status'] == 'needs_visual'],
        'layout_status': 'simple' if all(p['layout'] == 'single_column' for p in pages) else 'review_required',
        'layout_pages': [p['page'] for p in pages if p['layout'] != 'single_column']}, first, last


def read_pdf(path: Path, max_chars=30000, start_line=None, end_line=None,
             start_page=None, end_page=None, bbox=None, deadline=None):
    """One API for pre-injection and read_file; never makes a model/network call."""
    from .office_tools import format_unsliced_document_view, slice_lines_with_char_limit
    try:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError('Task total execution deadline exceeded before PDF reading')
        for value in (start_line, end_line):
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 1):
                raise ValueError('PDF行号必须是从1开始的整数')
        if start_line is not None and end_line is not None and end_line < start_line:
            raise ValueError('PDF结束行号不能小于起始行号')
        if (start_page is not None or end_page is not None or bbox is not None) and (
                start_line is not None or end_line is not None):
            raise ValueError('PDF页码/区域选择与行号切片不能混用')
        if bbox is not None and start_page is None:
            raise ValueError('bbox 读取必须明确指定单个 start_page')
        targeted = start_page is not None or end_page is not None or bbox is not None
        if targeted:
            doc, first, last = _read_selected_pages(path, start_page, end_page, deadline)
        else:
            doc = extract_pdf_document(Path(path), deadline=deadline)
            first, last = 1, doc.get('num_pages', 0)
        if doc.get('error'):
            error = ToolResult.error('pdf_extraction_failed', doc['error'])
            return TextToolOutput(f'PDF 文档解析失败 ({path.name}): {doc["error"]}', error)
        if not doc['num_pages']:
            raise ValueError('PDF未包含可读取页面')
        if bbox is not None and (first != last or start_page is None):
            raise ValueError('bbox 读取必须明确指定单个 start_page')
        if bbox is not None:
            text = f'--- 第 {first} 页，区域 bbox={bbox} ---\n' + _crop_page(path, first, bbox)
        else:
            text = _format_pages_text(doc['pages'])
        metadata = _summary(doc)
        metadata.update(kind='pdf_reading', selected_pages=[first, last], bbox=bbox,
                        coverage_scope='native_text',
                        full_document=first == 1 and last == doc['num_pages'] and bbox is None,
                        selection_coverage_complete=doc['page_coverage_complete'],
                        fact_verified=False)
        metadata['page_coverage_complete'] = metadata['full_document'] and doc['page_coverage_complete']
        notices = []
        if doc['unread_pages']:
            notices.append(f"未完整读取页码={doc['unread_pages'][:20]}（共{len(doc['unread_pages'])}页）")
        if doc['layout_status'] != 'simple':
            notices.append('版面需复核；区域边界/空白仅表示物理布局，不构成语义关系验证')
        prefix = ('【PDF读取状态】' + '；'.join(notices) + '\n') if notices else ''
        budget = max(1, max_chars - len(prefix))
        if start_line is not None or end_line is not None:
            view = slice_lines_with_char_limit(text.splitlines(), len(text.splitlines()),
                start_line, end_line, max_chars=budget, header_label=f'PDF 文档 ({path.name}) 内容切片')
        else:
            view = format_unsliced_document_view(text, max_chars=budget,
                header_label=f'PDF 文档 ({path.name}) 内容提取',
                extra_meta=f'，共 {doc["num_pages"]} 页，本次页码 {first}-{last}')
        truncated = '截断提醒' in view
        if len(view) > budget:
            view = f'【PDF读取预算不足】本次未显示正文，请提高预算或按页/区域缩小范围；start_page={first}。'
            truncated = True
        metadata.update(text_truncated=truncated,
                        text_complete=metadata['full_document'] and not truncated
                        and start_line is None and end_line is None
                        and doc['page_coverage_complete'],
                        safe_to_prune=False)
        rendered = prefix + view
        result = ToolResult(status='success' if metadata['text_complete'] else 'partial',
            data=metadata, provenance={'tool': 'read_file', 'file_path': str(path),
            'extraction_mode': 'native_pdf', 'execution_origin': 'native_extraction'},
            text_representation=rendered)
        return TextToolOutput(rendered, result)
    except TimeoutError:
        raise
    except (ValueError, TypeError) as error:
        result = ToolResult.error('invalid_pdf_selection', str(error))
        return TextToolOutput(f'【PDF读取参数错误】{error}', result)


def record_pdf_reading(fname, output, clipped, profiles, telemetry=None):
    """Transfer real full-extraction evidence to routing and audit telemetry."""
    result = getattr(output, 'tool_result', None)
    data = result.data if result and isinstance(result.data, dict) else None
    if not data or data.get('kind') != 'pdf_reading':
        return
    state = {**data, 'file_name': fname, 'injected_chars': len(clipped),
             'outer_truncated': str(output) != str(clipped)}
    if state['outer_truncated']:
        state.update(text_complete=False, safe_to_prune=False)
    for profile in profiles:
        if Path(str(profile.get('file_name', ''))).name == Path(fname).name:
            profile.update(state)
            if data.get('visual_pages'):
                profile['vision_required'] = True
    if telemetry:
        telemetry.record_guard('pdf_reading', 'inspected', state)
