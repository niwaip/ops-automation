"""A conflicting second verdict must resolve every initial issue with evidence."""
import json
import re
from typing import Dict, Any, List, Optional


def issues(analysis):
    body = re.split(r'(?m)^\s*(?:\*\*)?(?:REPAIR|FAIL)\b\s*[:：]?', analysis, maxsplit=1)[-1].strip()
    numbered = re.findall(r'(?m)^\s*\d+[.、]\s*(.+)', body)
    return numbered or [body]


def table_issue(analysis):
    m = re.search(r'ISSUES:\s*(\[[\s\S]*?\])', analysis or '')
    if m:
        try:
            items = json.loads(m.group(1))
            if isinstance(items, list) and items:
                return any(
                    isinstance(it, dict) and (
                        it.get('kind') == 'table'
                        or bool(re.search(r'单元格|错列|错行|串列|串行|表头.*缺失|数值归属|列错配', str(it.get('evidence', ''))))
                    )
                    for it in items
                )
        except Exception:
            pass
    cleaned = re.sub(r'(?:见|如|参看|详见)\s*表\s*\d+\s*(?:所示)?|表\s*\d+\s*所示|表格.*?(?:跨页|下一页|翻页|留白|空白)', '', analysis or '')
    return bool(re.search(r'表格|单元格|表\s*[1-9一二三]|错列|错行|总数|数值归属', cleaned))


def confirmation_instruction(initial, is_translation: bool = False):
    initial_items = {str(i): text for i, text in enumerate(issues(initial), 1)}
    if is_translation:
        return (
            '\n\n【独立复核阶段】：请逐项核对下列初审问题是否存在实质缺陷（跨页断行、段落自然延伸属于正常排版，严禁误判为截断）。'
            '\n- 若实质缺陷成立：第一行输出 REPAIR 或 FAIL，并说明。'
            '\n- 若初审问题属于误报或页面无实质缺陷：第一行输出 PASS 即可。'
            '\n初审提出的待核对问题清单：\n' + json.dumps(initial_items, ensure_ascii=False, indent=2)
        )
    return (
        '\n\n【独立复核阶段】：请逐项核对下列初审问题是否存在实质缺陷（跨页断行、段落自然延伸属于正常排版，严禁误判为截断）。'
        '\n- 若实质缺陷成立：第一行输出 REPAIR 或 FAIL，并说明。'
        '\n- 若初审问题属于误报：第一行输出 PASS，下一行紧接着输出 RESOLUTIONS: 并在其后提供 JSON 对象。'
        '\n  格式示例：RESOLUTIONS: {"1": {"status": "refuted", "quote": "初审涉及的文本片段", "evidence": "具体反驳证据（至少15字，说明为何无缺陷）"}}'
        '\n初审提出的待核对问题清单：\n' + json.dumps(initial_items, ensure_ascii=False, indent=2)
    )


def _clean_verdict(analysis: str) -> str:
    m = re.search(r'(?m)^\s*(?:\*\*)?(PASS|FAIL|REPAIR)\b', analysis)
    return m.group(1).upper() if m else ''


def _extract_json_block(text: str) -> Optional[Any]:
    # 1. 尝试匹配代码块内的 JSON
    code_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    candidate_str = code_match.group(1).strip() if code_match else None
    if candidate_str:
        try:
            return json.loads(candidate_str)
        except Exception:
            pass

    # 2. 尝试从文本中截取最外层 { ... } 或 [ ... ]
    for pat in [r'(\{[\s\S]*\})', r'(\[[\s\S]*\])']:
        m = re.search(pat, text)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return None


def _norm_quote(text: str) -> str:
    cleaned = re.sub(r'^[.…·•\-—:："\'“”‘’（）()\[\]【】\s]+|[.…·•\-—:："\'“”‘’（）()\[\]【】\s]+$', '', str(text or ''))
    return re.sub(r'[\s\u3000\t\r\n.…，,。；;：:！!？?（）()\[\]【】"\'“”‘’]+', '', cleaned).lower()


GENERIC_REVIEW_TOKENS = {
    'issue', 'issues', 'problem', 'problems', 'error', 'errors', 'defect', 'defects',
    'fail', 'repair', 'pass', 'table', 'text', 'line', 'lines', 'page', 'pages',
    'content', 'word', 'words', 'item', 'items',
    '问题', '缺陷', '错误', '页面', '文字', '内容', '表格', '排版', '行', '第', '建议', '修改'
}


def _distinctive_tokens(text: str) -> set:
    tokens = re.findall(r'[a-zA-Z0-9_]+|[\u4e00-\u9fff]', str(text or '').lower())
    return {t for t in tokens if t not in GENERIC_REVIEW_TOKENS}


def _has_quote_overlap(quote: str, initial_text: str, min_len: int = 4) -> bool:
    nq = _norm_quote(quote)
    ni = _norm_quote(initial_text)
    if not nq or not ni:
        return False
    dq = _distinctive_tokens(quote)
    di = _distinctive_tokens(initial_text)
    if dq and di:
        return bool(dq & di)
    if nq in ni or ni in nq:
        return True
    window = min(min_len, len(nq), len(ni))
    if window < 2:
        return False
    return any(nq[i:i + window] in ni for i in range(len(nq) - window + 1))


def parse_resolution_records(confirmation: str) -> List[Dict[str, Any]]:
    """Strictly extracts refuted resolution records from RESOLUTIONS or JSON block (never ISSUES)."""
    m_res = re.search(r'RESOLUTIONS\s*:\s*', confirmation or '', re.I)
    m_iss = re.search(r'ISSUES\s*:\s*', confirmation or '', re.I)
    if m_iss and not m_res:
        return []
    part = confirmation[m_res.end():] if m_res else (confirmation or '')

    data = _extract_json_block(part)
    records = []
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, dict):
                rec = dict(v)
                rec.setdefault('_key', str(k))
                records.append(rec)
    elif isinstance(data, list):
        for idx, item in enumerate(data, 1):
            if isinstance(item, dict):
                rec = dict(item)
                rec.setdefault('_key', str(idx))
                records.append(rec)
    return records


def validate_confirmation(initial: str, confirmation: str, is_translation: bool = False) -> None:
    verdict = _clean_verdict(confirmation)
    if not verdict:
        raise ValueError('复核响应格式无效，首行未包含明确裁决(PASS/FAIL/REPAIR)')

    if verdict != 'PASS':
        raise ValueError('复核判定页面仍存在实质缺陷，未通过验收：' + confirmation[:1000])

    if is_translation:
        # 翻译任务：复审判定首行为 PASS 即通过，无需强制要求逐项反驳证据结构体
        return

    expected_issues = issues(initial)
    records = parse_resolution_records(confirmation)

    if not records:
        raise ValueError('复核PASS缺少逐项定位证据，不能覆盖初审拒绝')

    if len(records) < len(expected_issues):
        raise ValueError('复核未覆盖全部初审问题')

    all_initial_text = ' '.join(expected_issues)
    valid_evidences = []
    covered_issues = set()
    for idx, rec in enumerate(records):
        status = str(rec.get('status') or '').strip().lower()
        if status and status not in ('refuted', 'false_positive', 'pass', 'resolved'):
            raise ValueError(f'复核项状态未反驳({status})，不能覆盖初审拒绝')
        if not status and 'status' in rec:
            raise ValueError('复核项状态为空，不能覆盖初审拒绝')
        ev = str(rec.get('evidence') or rec.get('reason') or rec.get('description') or '').strip()
        quote = str(rec.get('quote') or rec.get('anchor') or '').strip()
        if len(ev) < 15:
            continue
        key = str(rec.get('_key', ''))
        # 严格检查反驳证据是否与目标初审问题对齐，禁止用同一个问题的引用冒充另一个问题的反驳
        target_idx = None
        if len(expected_issues) == 1 and (key == '1' or idx == 0):
            target_idx = 0
        elif key.isdigit() and 1 <= int(key) <= len(expected_issues):
            cand_idx = int(key) - 1
            if cand_idx not in covered_issues:
                cand_issue = expected_issues[cand_idx]
                if _has_quote_overlap(quote, cand_issue) or _has_quote_overlap(ev, cand_issue):
                    target_idx = cand_idx
                elif not quote:
                    target_idx = cand_idx
        if target_idx is None:
            for cand_idx, exp in enumerate(expected_issues):
                if cand_idx not in covered_issues:
                    if (quote and _has_quote_overlap(quote, exp)) or (ev and _has_quote_overlap(ev, exp)):
                        target_idx = cand_idx
                        break
        if target_idx is not None:
            covered_issues.add(target_idx)
            valid_evidences.append(rec)

    if len(covered_issues) < len(expected_issues):
        raise ValueError('复核证据过于简略或缺少与初审问题对齐的反驳描述，不能覆盖初审拒绝')
