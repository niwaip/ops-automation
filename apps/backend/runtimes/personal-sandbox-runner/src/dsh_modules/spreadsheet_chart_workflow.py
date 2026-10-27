"""Agent-loop side of standard bar chart delivery: salvage, script cross-check and failure presentation.

Trust boundary: script (bash) output may serve as a *hint* and as an independent
cross-check, but only an ``aggregate_spreadsheet`` receipt accepted by
``verified_chart_receipt`` can ever be rendered and published.
"""
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import time
from typing import Optional, Tuple, List

from .spreadsheet_chart_delivery import verified_chart_receipt

# Tool argument errors: the engine itself is available, the model only needs to fix parameters.
PARAMETER_ERROR_CODES = frozenset({
    'source_unavailable', 'source_outside_session_scope', 'invalid_arguments', 'invalid_sheet_selection',
})
SCRIPT_TOOLS = ('bash', 'sh', 'python')
SALVAGE_MIN_SECONDS = 8
SALVAGE_MAX_ATTEMPTS = 2
_NUMBER = re.compile(r'-?\d+(?:,\d{3})*(?:\.\d+)?')

_ERROR_REASONS = {
    'source_unavailable': '专用聚合工具调用缺少或写错了文件路径参数',
    'source_outside_session_scope': '专用聚合工具引用的文件不是本会话附件',
    'invalid_arguments': '工具参数不是合法的 JSON 对象',
    'invalid_sheet_selection': '指定的工作表不存在',
    'invalid_analysis_plan': '聚合计划参数校验未通过',
    'invalid_query_plan': '聚合查询参数校验未通过',
    'tool_not_available': '模型尝试调用了本轮未开放的工具',
    'chart_requires_grouped_query': '聚合结果没有分组维度，无法绘制柱状图',
    'chart_metric_ambiguous': '存在多个求和指标，无法确定要绘制哪一个',
    'chart_unit_ambiguous': '指标单位不唯一',
    'chart_has_no_matching_rows': '筛选后没有匹配的数据行',
    'chart_non_numeric_value': '指标中存在非数值结果',
    'chart_source_changed_or_outside_workspace': '原始表格在核算后发生了变化',
    'chart_source_changed': '原始表格在核算后发生了变化',
}
_SUGGESTIONS = {
    'source_unavailable': '直接重试本指令，或在指令中明确文件名（例如“对 xxx.xlsx 按部门统计…”）。',
    'source_outside_session_scope': '请确认附件已上传到当前会话后重试。',
    'chart_metric_ambiguous': '请明确要绘制的指标，例如“按部门统计金额合计并生成柱状图”。',
    'chart_requires_grouped_query': '请说明按哪个字段分组，例如“按部门”。',
    'chart_has_no_matching_rows': '请检查筛选条件是否过严（例如前缀大小写、字段名）。',
    'chart_unit_ambiguous': '请说明指标单位或只选择一个金额列。',
}
_DEFAULT_SUGGESTION = '可直接重试本指令；若仍失败，请补充分组字段、指标列名与筛选条件。'


def is_parameter_error(code):
    return code in PARAMETER_ERROR_CODES


def _tool(receipt):
    return (getattr(receipt, 'provenance', None) or {}).get('tool') or ''


def script_outputs(evidence):
    """Text produced by model scripts, including stdout preserved inside failed executions."""
    texts = []
    for receipt in evidence or []:
        if _tool(receipt) not in SCRIPT_TOOLS:
            continue
        text = receipt.data if isinstance(receipt.data, str) else (receipt.error_message or '')
        if text:
            texts.append(str(text))
    return texts


def _decimal(text):
    try:
        return Decimal(text.replace(',', ''))
    except InvalidOperation:
        return None


def _matches(printed, expected):
    """Exact numeric equality, or equality at the precision the script printed."""
    if printed == expected:
        return True
    exponent = printed.as_tuple().exponent
    if not isinstance(exponent, int) or exponent >= 0:
        return False
    return expected.quantize(Decimal(1).scaleb(exponent)) == printed


def cross_check_with_scripts(dataset, evidence):
    """Compares runtime-verified chart points with numbers the model's scripts printed."""
    texts = script_outputs(evidence)
    if not texts:
        return {'status': 'absent'}
    lines = [line for text in texts for line in text.splitlines()]
    found, mismatched = 0, []
    for point in dataset['points']:
        label_pattern = re.compile(r'(?<![\w/])' + re.escape(point['label']) + r'(?![\w/])')
        candidates = [line for line in lines if label_pattern.search(line)]
        if not candidates:
            continue
        found += 1
        expected = Decimal(point['value'])
        numbers = [n for line in candidates for n in (_decimal(m) for m in _NUMBER.findall(label_pattern.sub(' ', line))) if n is not None]
        if not any(_matches(n, expected) for n in numbers):
            mismatched.append(point['label'])
    total = len(dataset['points'])
    if not found:
        status = 'absent'
    elif mismatched:
        status = 'mismatch'
    elif found == total:
        status = 'match'
    else:
        status = 'partial'
    return {'status': status, 'found': found, 'total': total, 'mismatched': mismatched}


def _source_hint(evidence):
    """Latest real file path and table region the model already observed in this turn."""
    hint = {}
    for receipt in reversed(evidence or []):
        if not receipt.is_success:
            continue
        provenance = receipt.provenance or {}
        if provenance.get('file_path') and 'file_path' not in hint:
            hint['file_path'] = provenance['file_path']
        data = receipt.data if isinstance(receipt.data, dict) else {}
        if data.get('kind') == 'spreadsheet_structure' and 'source' not in hint:
            for sheet in data.get('sheets') or []:
                region = next(iter(sheet.get('data_region_candidates') or []), None)
                if region:
                    hint['source'] = {'sheet': sheet.get('sheet'), 'header_row': region.get('header_row'),
                                      'data_range': region.get('data_range')}
                    break
    return hint


def salvage_instruction(evidence):
    hint = _source_hint(evidence)
    lines = ['【运行时图表抢救】柱状图尚未通过运行时核验。本轮只开放 aggregate_spreadsheet，请立即调用一次完成核算：',
             '- 必须同时提交 file_path 与 query；query 内包含 source（sheet/header_row/data_range）、where（用户要求的筛选）、group_by（分组字段）、metrics（op=sum 的指标）。',
             '- 图表由运行时根据该回执自动渲染与验收，不要生成 HTML。']
    if hint.get('file_path'):
        lines.append(f'- file_path 使用：{hint["file_path"]}')
    if hint.get('source'):
        lines.append(f'- 已探测到的数据区域：{json.dumps(hint["source"], ensure_ascii=False)}')
    if script_outputs(evidence):
        lines.append('- 脚本中已采用的筛选与分组口径可直接沿用；运行时会把核算结果与脚本输出交叉核对。')
    return '\n'.join(lines)


def salvage_chart_delivery(delivery, *, messages, tools, prompt, evidence, telemetry, deadline,
                           call_model, dispatch, model=None):
    """Bounded extra rounds restricted to the aggregation engine; returns True only after publishing."""
    aggregate_tools = [t for t in tools or [] if t.get('function', {}).get('name') == 'aggregate_spreadsheet']
    if not aggregate_tools or delivery.published:
        return False
    for attempt in range(1, SALVAGE_MAX_ATTEMPTS + 1):
        if deadline is not None and deadline - time.monotonic() < SALVAGE_MIN_SECONDS:
            telemetry.record_guard('chart_salvage', 'skip', {'reason': 'insufficient_time', 'attempt': attempt})
            return False
        messages.append({'role': 'user', 'content': salvage_instruction(evidence)})
        try:
            response = call_model(messages, aggregate_tools)
        except Exception as error:  # A salvage failure must never mask the original failure.
            telemetry.record_guard('chart_salvage', 'error', {'attempt': attempt, 'error': str(error)})
            return False
        telemetry.record_llm_response(response, is_first_round=False, purpose='chart_salvage')
        calls = list(response.get('tool_calls') or []) if isinstance(response, dict) else []
        calls = [c for c in calls if c.get('function', {}).get('name') == 'aggregate_spreadsheet'][:1]
        if not calls:
            telemetry.record_guard('chart_salvage', 'reject', {'attempt': attempt, 'reason': 'no_aggregate_call'})
            continue
        messages.append({'role': 'assistant', 'content': None, 'tool_calls': calls})
        dispatch(calls)
        receipt = verified_chart_receipt(evidence, prompt, model, deadline)
        if not receipt:
            telemetry.record_guard('chart_salvage', 'reject', {'attempt': attempt, 'reason': 'not_verified'})
            continue
        if delivery.publish(receipt, prompt, telemetry):
            delivery.cross_check = cross_check_with_scripts(delivery.dataset, evidence)
            telemetry.record_guard('chart_cross_check', delivery.cross_check['status'], delivery.cross_check)
            telemetry.record_guard('chart_salvage', 'published', {'attempt': attempt})
            return True
        return False
    return False


def _clean_reply(reply_text):
    text = re.sub(r'```html[\s\S]*?(?:```|$)', '', reply_text or '', flags=re.I)
    text = re.sub(r'<(?:!DOCTYPE|html)[\s\S]*?(?:</html>|$)', '', text, flags=re.I)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text[:1500]


def _verified_rows_table(evidence, limit=20):
    """Engine-computed rows (task may still be incomplete); never script output."""
    for receipt in reversed(evidence or []):
        data = receipt.data if isinstance(receipt.data, dict) else {}
        if not (receipt.is_success and data.get('kind') == 'spreadsheet_analysis' and data.get('rows')):
            continue
        plan = data.get('plan') or {}
        columns = list(plan.get('group_by') or []) + [m.get('id') for m in plan.get('metrics') or [] if m.get('id')]
        if not columns:
            return ''
        rows = data['rows'][:limit]
        out = ['| ' + ' | '.join(columns) + ' |', '|' + '---|' * len(columns)]
        out += ['| ' + ' | '.join(str(row.get(c, '')) for c in columns) + ' |' for row in rows]
        return '\n'.join(out)
    return ''


def failure_presentation(delivery, evidence, reply_text='', unverified_file=None):
    """Keeps the fail-closed headline, but carries reasons, engine-verified partial data and next steps.

    When unverified_file is provided (P2 fallback), surfaces a clear download link with
    explicit warnings, without inlining raw HTML into the chat text.
    """
    parts = [delivery.presentation()]

    if unverified_file is not None and Path(unverified_file).is_file():
        file_path = Path(unverified_file)
        display_name = file_path.name
        parts.append(
            f"> ⚠️ **未核验图表文件已降级交付**：检测到模型在工作区生成了图表文件，已通过基础静态安全检查，提供下载供排查参考。\n"
            f"> **注意：该图表未通过运行时数据一致性核验，数值与口径可能存在偏差，请以原表格核算事实为准。**\n"
            f">\n"
            f"> 📥 **[下载未核验图表](/api/ai/chat/workspace-files/me/{display_name})** (仅供参考，未通过官方数据核验)"
        )

    codes = []
    if delivery.error in _ERROR_REASONS:
        codes.append(delivery.error)
    for receipt in evidence or []:
        code = receipt.error_code if receipt.is_error else None
        if code in _ERROR_REASONS and code not in codes:
            codes.append(code)
    reasons = [f'- {_ERROR_REASONS[c]}（{c}）' for c in codes[:4]]
    if script_outputs(evidence) and not unverified_file:
        reasons.append('- 模型通过脚本得到了计算结果，但脚本产物不经运行时核验，未作为正式图表发布')
    if reasons:
        parts.append('**原因：**\n' + '\n'.join(reasons))
    table = _verified_rows_table(evidence)
    if table:
        parts.append('**已由计算引擎得到的中间结果（任务核验未闭环，仅供参考）：**\n\n' + table)
    reply = _clean_reply(reply_text)
    if reply:
        parts.append('**模型说明：**\n' + reply)
    suggestion = next((_SUGGESTIONS[c] for c in codes if c in _SUGGESTIONS), _DEFAULT_SUGGESTION)
    parts.append('**建议：**' + suggestion)
    return '\n\n'.join(parts)


class SafeHTMLChecker(HTMLParser):
    """Zero-dependency parser that enforces strict offline presentation constraints."""
    def __init__(self):
        super().__init__()
        self.is_safe = True
        self.unsafe_reason = None
        self.disallowed_tags = {'iframe', 'object', 'embed', 'frame', 'frameset', 'meta'}

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        if tag_lower in self.disallowed_tags:
            self.is_safe = False
            self.unsafe_reason = f'disallowed_tag_{tag_lower}'
            return
        for k, v in attrs:
            k_lower = k.lower()
            v_str = str(v or '').strip().lower()
            if k_lower.startswith('on'):
                self.is_safe = False
                self.unsafe_reason = f'event_attribute_{k_lower}'
                return
            if k_lower in ('src', 'href') and (v_str.startswith('http://') or v_str.startswith('https://') or v_str.startswith('//') or v_str.startswith('javascript:')):
                self.is_safe = False
                self.unsafe_reason = f'external_or_unsafe_{k_lower}'
                return


def is_safe_unverified_html(path: Path) -> bool:
    """Verifies that an unverified HTML deliverable is offline, clean and has no executable XSS vectors."""
    try:
        if not path.is_file():
            return False
        size = path.stat().st_size
        if size < 20 or size > 2 * 1024 * 1024:
            return False
        text = path.read_text(encoding='utf-8', errors='ignore')
        checker = SafeHTMLChecker()
        checker.feed(text)
        if not checker.is_safe:
            return False
        if re.search(r'\b(?:document\.cookie|localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|eval\s*\()\b', text, re.I):
            return False
        return True
    except Exception:
        return False


def find_candidate_unverified_html(workspace: Path, start_ts: float) -> Optional[Path]:
    """Finds newly created HTML chart files in workspace produced by bash scripts during this turn."""
    if not workspace.is_dir():
        return None
    candidates = []
    for item in workspace.glob('*.html'):
        if not item.is_file():
            continue
        name = item.name.lower()
        if name.startswith('unverified-') or name.startswith('chart-'):
            continue
        try:
            mtime = item.stat().st_mtime
            if mtime < (start_ts - 5):
                continue
            if not is_safe_unverified_html(item):
                continue
            # Score candidates: preferential match for chart-related names
            score = 10 if any(k in name for k in ('柱状图', '图表', 'chart', 'bar')) else 1
            candidates.append((score, mtime, item))
        except OSError:
            continue
    if not candidates:
        return None
    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    return candidates[0][2]


def materialize_unverified_chart_fallback(delivery, workspace: Path, start_ts: float, telemetry) -> Tuple[Optional[Path], Optional[str]]:
    """P2: Safely clones candidate script-generated HTML as an unverified downloadable attachment."""
    candidate = find_candidate_unverified_html(workspace, start_ts)
    if not candidate:
        return None, None
    clean_name = candidate.name
    target_name = f'unverified-chart-{delivery.session_id}-{delivery.turn_id}-{clean_name}'
    target_path = workspace / target_name
    try:
        shutil.copy2(candidate, target_path)
        telemetry.record_guard('chart_delivery', 'unverified_fallback', {
            'file_path': str(target_path),
            'source_file': clean_name,
            'session_id': delivery.session_id,
            'turn_id': delivery.turn_id
        })
        return target_path, clean_name
    except Exception as e:
        telemetry.record_guard('chart_delivery', 'unverified_fallback_failed', {'error': str(e)})
        return None, None
