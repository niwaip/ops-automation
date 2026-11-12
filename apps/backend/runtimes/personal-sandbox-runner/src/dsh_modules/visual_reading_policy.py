"""Local evidence for enabling visual reading; ordinary documents stay on native text."""

import re
from functools import lru_cache
from pathlib import Path

IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff'}
VISUAL_REQUEST = re.compile(
    r'\bocr\b|扫描件|扫描版|看图|图片内容|图中|识别图片|图片识别|识别图|'
    r'分析图表|解读图表|图表内容|版式|排版|视觉|\bvisual\b|\blayout\b', re.I)
NO_VISUAL = re.compile(r'(?:不要|无需|不需要|禁止|不用|别).{0,8}(?:视觉|OCR|看图|图片识别|识别图片)', re.I)


def user_request(prompt):
    """File names and attachment boilerplate are data, not visual-reading instructions."""
    return re.split(r'用户指令[：:]', prompt or '')[-1].strip()


def attachment_names(prompt, files=None):
    if files is not None:
        return list(files)
    match = re.search(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】:\s*([^（\n]+)', prompt or '')
    return [f.strip() for f in match[1].split(',') if f.strip()] if match else []


@lru_cache(maxsize=128)
def _profile_pdf_cached(path, size, mtime_ns):
    import pdfplumber
    from .pdf_text_cache import quiet_pdfminer_logging, remember_sampled_page
    from .pdf_page_layout import extract_page_evidence

    with quiet_pdfminer_logging(), pdfplumber.open(path) as document:
        count = len(document.pages)
        # Covers alone must not enable vision for an otherwise textual report.
        candidates = list(range(1, count - 1)) if count > 4 else list(range(count))
        indices = candidates if len(candidates) <= 16 else [
            candidates[round(i * (len(candidates) - 1) / 15)] for i in range(16)]
        rows = []
        path_obj = Path(path)
        for index in indices:
            page = document.pages[index]
            evidence = extract_page_evidence(page, index + 1)
            remember_sampled_page(path_obj, index, evidence['native_text'], evidence=evidence)
            rows.append({'page': index + 1, 'text_chars': evidence['text_chars'],
                         'image_coverage': evidence['image_coverage']})
            page.close()
    n = max(1, len(rows))
    scanned = sum(r['image_coverage'] >= .65 and r['text_chars'] < 120 for r in rows) / n
    image_heavy = sum(r['image_coverage'] >= .5 for r in rows) / n
    mode = 'scanned_pdf' if scanned >= .5 else ('image_pdf' if image_heavy >= .5 else 'native_text')
    return {'page_count': count, 'sampled_pages': rows, 'reading_mode': mode,
            'vision_required': mode != 'native_text', 'scanned_page_ratio': scanned,
            'image_dominant_ratio': image_heavy}


def profile_pdf(path):
    """Inspect bounded page samples locally. Parse failures never silently enable a model."""
    p = Path(path)
    try:
        stat = p.stat()
        result = dict(_profile_pdf_cached(str(p.resolve()), stat.st_size, stat.st_mtime_ns))
        # A full read can discover isolated scan/error pages missed by sampling.
        from .pdf_text_cache import get_cached_pdf_document
        document = get_cached_pdf_document(p)
        if document:
            result.update({key: document[key] for key in (
                'page_coverage_complete', 'unread_pages', 'visual_pages', 'layout_status', 'layout_pages')})
            result['vision_required'] = result['vision_required'] or bool(document['visual_pages'])
        return result
    except Exception as error:
        return {'reading_mode': 'unknown', 'vision_required': False,
                'probe_error': type(error).__name__}


def visual_reading_allowed(prompt, files, profiles):
    request = user_request(prompt)
    if NO_VISUAL.search(request):
        return False
    return bool(VISUAL_REQUEST.search(request)
                or any(Path(f).suffix.lower() in IMAGE_SUFFIXES for f in files)
                or any(p.get('vision_required') is True for p in profiles))


def pdf_visual_allowed(path, request=''):
    if NO_VISUAL.search(user_request(request)):
        return False
    return bool(VISUAL_REQUEST.search(user_request(request)) or profile_pdf(path)['vision_required'])


def filter_reading_tools(tools, prompt, skill_res, search_intent, files=None, profiles=None, complete_files=None):
    """Apply after every native tool branch, using structured attachments when supplied."""
    names = attachment_names(prompt, files)
    if profiles is None:
        from .config import WORKSPACE_DIR
        profiles = [profile_pdf(Path(WORKSPACE_DIR) / f) for f in names if Path(f).suffix.lower() == '.pdf']
    denied = set()
    is_visual_allowed = visual_reading_allowed(prompt, names, profiles)
    if not is_visual_allowed:
        denied.add('vision_inspect')
    is_research = bool(getattr(skill_res, 'is_research_intent', False))
    if (names or getattr(skill_res, 'source_formats', [])) and not search_intent and not is_research:
        denied.update({'web_search', 'fetch_page'})
    if (
        complete_files is not None
        and names
        and not search_intent
        and not is_research
        and not getattr(skill_res, 'is_generate_intent', False)
        and not getattr(skill_res, 'requires_execution', False)
        and not getattr(skill_res, 'is_modify_intent', False)
        and not getattr(skill_res, 'is_send_intent', False)
        and not is_visual_allowed
    ):
        is_knowledge = bool(getattr(skill_res, 'is_knowledge_intent', False))
        if not is_knowledge:
            denied.add('scan_knowledge')
        complete_known = {Path(f).name for f in complete_files} | {str(f) for f in complete_files}
        all_complete = all(Path(f).name in complete_known or str(f) in complete_known for f in names)
        # PDF coverage and layout are fallible observations, not capability gates.
        # Keep native page/region review available even for a complete text view.
        all_non_tabular_docs = all(Path(f).suffix.lower() in {'.docx', '.pptx', '.txt', '.md'} for f in names)
        p_low = (prompt or '').lower()
        attached_low = {Path(f).name.lower() for f in names}
        prompt_rest = p_low
        for fn in sorted(attached_low, key=len, reverse=True):
            prompt_rest = prompt_rest.replace(fn, ' ')
        prompt_rest = re.sub(r'https?://\S+', ' ', prompt_rest)
        other_file_refs = re.findall(r'\b[\w.-]+\.(?:pdf|docx?|xlsx?|pptx?|txt|md|csv|json|py)\b', prompt_rest)
        if (
            all_complete
            and all_non_tabular_docs
            and not is_knowledge
            and not getattr(skill_res, 'disclosure_steps', 0)
            and not getattr(skill_res, 'mcp_read_only', False)
            and not other_file_refs
        ):
            denied.add('read_file')
    return [tool for tool in tools if tool.get('function', {}).get('name') not in denied]


def is_attachment_view_complete(fname, extracted, clipped, profiles=None):
    """Returns True when a non-tabular attachment was completely extracted without truncation."""
    if not extracted or not clipped or clipped != extracted:
        return False
    p = Path(fname)
    if p.suffix.lower() not in {'.pdf', '.docx', '.pptx', '.txt', '.md'}:
        return False
    if p.suffix.lower() == '.pdf':
        result = getattr(extracted, 'tool_result', None)
        data = result.data if result and isinstance(result.data, dict) else {}
        # Only structured extraction evidence can establish PDF text coverage.
        # Marker text in an attachment is never an authoritative completeness claim.
        if not data.get('text_complete'):
            return False
    incomplete_markers = (
        '[⚠️ 长文档截断提醒]',
        '[⚠️ 单次字符上限截断提醒]',
        '[⚠️ 文件读取截断]',
        '文件未找到',
        '内容为空',
        '无法解析',
        '提取失败',
        '读取失败',
        '解析失败',
        '受企业安全加密',
        '【图片文件',
        '无直接文本层',
        '未检测到文字内容',
    )
    if any(marker in extracted for marker in incomplete_markers):
        return False
    if p.suffix.lower() == '.pdf' and profiles:
        for prof in profiles:
            pf_name = prof.get('file_name') or prof.get('file') or prof.get('name') or prof.get('path')
            if (not pf_name or Path(str(pf_name)).name == p.name) and prof.get('vision_required'):
                return False
    return True


def reading_guidance(prompt, files, profiles, complete_files=None):
    if not files or not any(Path(f).suffix.lower() == '.pdf' for f in files):
        return ''
    if visual_reading_allowed(prompt, files, profiles):
        return ('\n【附件读取方式】已按图片/扫描内容或用户明确要求开放视觉读取。'
                '有文字层的部分仍优先使用 read_file；优先复核读取状态标注的未读取页，视觉每批最多4页。')
    if any(prof.get('layout_status') == 'review_required' for prof in profiles):
        return ('\n【附件读取方式】已提供原生文字及页码，复杂版面按区域或空间位置保留。'
                '文字覆盖不等于图表/多栏关系已验证；必要时用 read_file(start_page=页码) 或单页bbox复核。'
                '行号续读沿全文件行号；存在未读取页时如实披露，不要反复重读已提供的全文。')
    if complete_files:
        known = {Path(f).name for f in complete_files} | {str(f) for f in complete_files}
        if all(Path(f).name in known or str(f) in known for f in files):
            return ('\n【附件读取方式】当前附件的原生文字已完整提取并注入上方上下文，未发生截断，无需再调用 read_file 读取。'
                    '此标记仅证明文字提取覆盖，不表示事实或图片内容已经验证；需要时仍可按页或区域复核。'
                    '请直接基于上述完整正文通读分析并全面归纳全部章节/模块与关键细节。')
    return ('\n【附件读取方式】当前以原生文本阅读，未默认开放视觉工具。'
            '请用 read_file 的 start_line/end_line 分段补读全文；文本截断不代表需要视觉识别。'
            '归纳前检查章节覆盖范围，未读部分应如实说明。')
