"""Bound deterministic artifact failures; diagnostic shell success is not recovery."""
import re


def repeated_execution_failure(receipts, limit=3, artifact_task=True):
    counts = {}
    for result in receipts:
        tool = (result.provenance or {}).get('tool')
        data = result.data if isinstance(result.data, dict) else {}
        if result.is_success:
            if tool == 'inspect_pdf_page' and data.get('published') is True:
                counts.clear()
            elif tool == 'render_pdf' and data.get('kind') == 'pdf_render':
                counts = {key: value for key, value in counts.items() if key[0] != 'render_pdf'}
            # bash exit 0 can merely mean help(), ls, or print(); never clear failures.
            continue
        if tool not in ('bash', 'render_pdf') or not result.is_error:
            continue
        message = result.error_message or ''
        if re.search(r'socket timeout|timed out|ECONNRESET|socket hang up', message, re.I):
            continue
        if 'Undefined font:' in message:
            signature = 'undefined_font'
        elif tool == 'render_pdf' and result.error_code == 'pdf_render_failed':
            category = 'render'
            for pattern, name in ((r'^pages\b|pages 数组|markdown.*二选一', 'page_contract'),
                    (r'Unsupported PDF symbol', 'symbol'),
                    (r'Expected (?:at most|at least)', 'page_budget'),
                    (r'font|glyph|replacement characters', 'glyph'),
                    (r'用户内容要求|分页结构', 'content_contract')):
                if re.search(pattern, message, re.I):
                    category = name
                    break
            signature = f'pdf_render_failed:{data.get("stage", "unknown")}:{category}'
        elif artifact_task and re.search(r'\b(?:TypeError|NameError|AttributeError|SyntaxError|IndentationError|ImportError|ModuleNotFoundError|FPDFException)\b', message):
            signature = 'script_execution'
        else:
            continue
        key = (tool, signature if tool == 'render_pdf' else 'script_execution')
        previous = counts.get(key, {'tool': tool, 'error': signature, 'attempts': 0})
        counts[key] = {**previous, 'error': signature, 'attempts': previous['attempts'] + 1}
    repeated = next((failure for failure in counts.values() if failure['attempts'] >= limit), None)
    if repeated:
        return repeated
    total = sum(item['attempts'] for item in counts.values() if item['tool'] == 'render_pdf')
    if total >= limit * 3:
        return {'tool': 'render_pdf', 'error': 'total_failure_budget', 'attempts': total}
    return None
