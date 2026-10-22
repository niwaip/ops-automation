"""Select source-bound facts by the requested predicates, independent of call order."""

import json
import hashlib
import re
from .analysis_contract import build_analysis_contract
from .spreadsheet_fact_identity import fact_identity
from .spreadsheet_request import explicit_filters, normalized
from .analysis_request_text import user_instruction
from .analysis_delivery_constraints import has_group_filter, has_row_filter, group_filter_boolean_matches, is_empty_query, has_distinct_list


def request_fingerprint(prompt, workbook_id):
    return hashlib.sha256((prompt + '\0' + str(workbook_id)).encode()).hexdigest()


def authoritative_receipts(receipts, prompt):
    native = [r for r in receipts if getattr(r, 'is_success', False)
              and isinstance(getattr(r, 'data', None), dict)
              and (r.data.get('facts') or is_empty_query(r.data))
              and (r.provenance or {}).get('execution_origin') != 'bounded_summary_recovery']
    if native:
        contract = build_analysis_contract(prompt)
        if contract.limit is not None or has_group_filter(prompt) or has_distinct_list(prompt) or re.search(r'升序|降序', prompt):
            candidates = [r for r in native if r.data.get('query_ir_version') and
                          (not has_group_filter(prompt) or r.data.get('plan', {}).get('having')) and
                          group_filter_boolean_matches(prompt, r.data.get('plan', {}).get('having')) and
                          (contract.limit is None or r.data.get('plan', {}).get('limit') == contract.limit) and
                          (not has_distinct_list(prompt) or r.data.get('plan', {}).get('distinct')) and
                          (not re.search(r'升序|降序', prompt) or r.data.get('plan', {}).get('order_by'))]
            if candidates:
                # Later corrected execution supersedes exploratory group totals.
                latest = {}
                for receipt in candidates:
                    latest[(receipt.provenance or {}).get('workbook_id')] = receipt
                return list(latest.values())
        return native
    compiled = [r for r in receipts if isinstance(getattr(r, 'data', None), dict)
                and r.data.get('request_fingerprint') == request_fingerprint(prompt, (r.provenance or {}).get('workbook_id'))
                and (r.provenance or {}).get('execution_origin') == 'bounded_summary_recovery']
    return compiled or receipts


def _column(column, headers):
    key = str(column or '')
    return normalized(headers.get(key.upper(), key))


_PROMPT_INTENT_STOP_CHARS = frozenset('的了和与在各每按中及是个有一')


def _matches_prompt_intent(cond, prompt, headers=None):
    """
    Check if a filter condition is grounded in the user's prompt (Data-driven condition overlap).
    Zero-hardcoding: operates purely on the candidate condition's values/prefixes/column and the prompt.
    """
    clean_p = prompt.casefold()
    p_nospace = re.sub(r'\s+', '', clean_p)
    for key in ('values', 'prefixes', 'exclude_prefixes', 'exclude_values', 'value'):
        vals = cond.get(key) or []
        if isinstance(vals, (str, int, float)):
            vals = [vals]
        for v in vals:
            sv = str(v).strip().casefold()
            if not sv:
                continue
            v_nospace = re.sub(r'\s+', '', sv)
            if len(v_nospace) >= 2:
                if v_nospace in p_nospace:
                    return True
            else:
                if sv in _PROMPT_INTENT_STOP_CHARS:
                    continue
                if sv.isascii():
                    if re.search(r'(?:^|[^\da-zA-Z])' + re.escape(sv) + r'(?:$|[^\da-zA-Z])', clean_p):
                        return True
                else:
                    if sv in clean_p:
                        return True
    return False


def _predicate(condition, headers):
    col = condition.get('column') or condition.get('field')
    op = condition.get('op', '')
    val = condition.get('value')
    vals = condition.get('values') or ([val] if val is not None else [])
    if 'exclude_prefixes' in condition or op in ('exclude_prefix', 'exclude_prefixes', 'not_prefix'):
        kind, values = 'exclude_prefix', condition.get('exclude_prefixes') or condition.get('prefixes') or vals
    elif 'prefixes' in condition or op in ('prefix', 'starts_with', 'startswith'):
        kind, values = 'prefix', condition.get('prefixes') or vals
    elif 'exclude_values' in condition or op in ('not_in', 'ne', '!='):
        kind, values = 'not_in', condition.get('exclude_values') or vals
    elif op in ('ends_with', 'endswith'):
        kind, values = 'ends_with', vals
    elif op in ('contains', 'contains_text'):
        kind, values = 'contains', vals
    elif op in ('gt', 'gte', 'lt', 'lte', 'between'):
        kind, values = op, vals or [condition.get('min'), condition.get('max')]
    else:
        kind, values = 'in', vals
    case_sensitive = bool(condition.get('case_sensitive', False))
    clean_vals = [str(v) if case_sensitive else str(v).casefold() for v in values if v is not None]
    return _column(col, headers), kind, frozenset(clean_vals)


def _tables_in(expression):
    if not isinstance(expression, dict):
        return set()
    result = {expression['table']} if expression.get('table') else set()
    for arg in expression.get('args', []):
        result.update(_tables_in(arg))
    return result


def resolve_conforming_facts(receipts, prompt=''):
    prompt = user_instruction(prompt)
    contract = build_analysis_contract(prompt)
    items = []
    all_headers, categories = {}, {}
    for receipt in authoritative_receipts(receipts or [], prompt):
        if not getattr(receipt, 'is_success', False) or not isinstance(receipt.data, dict):
            continue
        data, provenance = receipt.data, receipt.provenance or {}
        plan = data.get('plan') or data  # Legacy fixtures are accepted; native receipts use plan.
        tables = {t['id']: dict(t) for t in plan.get('tables', [])}
        for scope in data.get('coverage', []):
            tables.setdefault(scope['id'], {}).update(scope)
        for table in tables.values():
            all_headers.update(table.get('headers', {}))
            for cond in table.get('filters', []):
                categories.setdefault(cond.get('column'), set()).update(cond.get('values', []))
        calculations = plan.get('calculations', []) or []
        metrics_list = plan.get('metrics', []) or []
        for fact in data.get('facts', []):
            cid = str(fact.get('id', ''))
            calc = next((c for c in calculations if cid == c['id'] or cid.startswith(c['id'] + '__')), {})
            metric_item = next((m for m in metrics_list if cid == m['id'] or cid.startswith(m['id'] + '__')), {})
            expr = calc.get('expression') or metric_item
            tids = _tables_in(expr) if calc else set()
            # Legacy receipts without a calculation map can bind only a single table.
            if not tids and len(tables) == 1:
                tids = set(tables)
            scopes = [tables[t] for t in sorted(tids) if t in tables]
            predicates = [_predicate(c, s.get('headers', {})) for s in scopes for c in s.get('filters', [])]
            try:
                identity = fact_identity(fact, data, provenance)
            except (KeyError, TypeError):
                identity = json.dumps([provenance.get('workbook_id'), fact, scopes], sort_keys=True, default=str)
            items.append((fact, identity, predicates, scopes, provenance.get('workbook_id'), expr))
    if not items:
        return []
    # Prefix columns must be resolved from real headers, never from an invented sheet/field.
    LAYOUT_TRIMMING_PATTERN = r'(?:排除|去除|剔除|不包含|去掉|忽略)\s*(?:(?:标题|表头|尾注|报表尾注|表尾|汇总行|合计行|空行|注释|说明行|非数据行|物理行)[、，\s和及与]*)+'
    business_filter_prompt = re.sub(LAYOUT_TRIMMING_PATTERN, '', prompt)
    explicit_filter_kw = bool(re.search(
        r'(?:只包含|仅包含|(?<!不)排除|不包含|剔除|去除|开头|结尾|只要|除了|去掉|限定|筛选|过滤|仅保留|只保留|大于|小于|高于|低于|超过|在.*之间)',
        business_filter_prompt
    ))
    data_driven_filter = any(
        _matches_prompt_intent(cond, prompt, all_headers)
        for s in [scope for it in items for scope in it[3]]
        for cond in s.get('filters', [])
    )
    has_filter_intent = contract.has_filters or explicit_filter_kw or data_driven_filter

    # Layer 1: 如果有过滤/切片意图，先由 LLM-as-a-Judge 语义裁判裁决（支持大模型理解复杂否定、同义表述与分类切片）
    if has_filter_intent:
        from .semantic_filter_judge import judge_filter_conformance
        judge_matched = []
        judge_rejected = []
        neutral_filtered = []
        for it in items:
            scopes = it[3]
            filters = [cond for s in scopes for cond in s.get('filters', [])]
            if filters:
                verdict = judge_filter_conformance(prompt, filters, all_headers)
                if verdict is True:
                    judge_matched.append(it)
                elif verdict is False:
                    judge_rejected.append(it)
                else:
                    neutral_filtered.append(it)
        if judge_matched:
            items = judge_matched
        else:
            # 尝试通过确定性规则解析精确要求
            try:
                required = [_predicate(c, all_headers) for c in explicit_filters(prompt, all_headers, categories)]
            except ValueError:
                required = []
            if required:
                items = [it for it in items if set(it[2]) == set(required)]
            elif neutral_filtered:
                aligned_filtered = [
                    it for it in neutral_filtered
                    if it not in judge_rejected and any(
                        _matches_prompt_intent(c, prompt, all_headers)
                        for s in it[3] for c in s.get('filters', [])
                    )
                ]
                items = aligned_filtered if aligned_filtered else [it for it in neutral_filtered if it not in judge_rejected]
            else:
                filtered_items = [it for it in items if it[2] and it not in judge_rejected]
                if filtered_items:
                    items = filtered_items
                else:
                    # 组过滤 (HAVING) 兜底：若 prompt 包含的是针对分组/聚合后指标的过滤（而非底表单行过滤），
                    # 且事实本身为原生分组聚合事实（无底表行过滤），应予保留，不因缺少行级谓词而清空
                    if has_group_filter(prompt) and not has_row_filter(prompt):
                        items = [it for it in items if it not in judge_rejected]
                    else:
                        items = []
    elif contract.domain == 'generic':
        # 用户未请求过滤：优先采纳无过滤事实；若全为带过滤事实且未显式禁止过滤，做宽松兼容
        unfiltered = [it for it in items if not it[2]]
        if unfiltered:
            items = unfiltered
        elif not re.search(r'不排除|全表|全部数据|整表|无需过滤|不进行过滤|不筛选', prompt):
            items = items
        else:
            items = []
    seen, facts = set(), []
    for fact, identity, predicates, scopes, source, expr in items:
        if identity in seen:
            continue
        seen.add(identity)
        facts.append(fact)
    metrics = contract.metrics
    if metrics:
        selected = [f for f in facts if any(
            (f.get('metric_id') == m.semantic_id if f.get('metric_id') and m.semantic_id else
             any(re.search(alias, str(f.get('label', ''))) for alias in m.aliases)) for m in metrics)]
        if selected:
            facts = selected
    if any(f.get('matched_records', 1) for f in facts):
        facts = [f for f in facts if f.get('matched_records') != 0]
    return facts
