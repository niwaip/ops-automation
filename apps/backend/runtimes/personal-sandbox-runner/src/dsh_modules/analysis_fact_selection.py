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


def _is_metric_row_filter(cond, contract):
    """Return True if a filter condition purely selects requested metric names on a vertical statement table."""
    if not isinstance(cond, dict) or not getattr(contract, 'metrics', None):
        return False
    op = str(cond.get('op', 'in') or 'in').strip().lower()
    if op not in ('in', 'eq', '=', '=='):
        return False
    vals = cond.get('values') or ([cond['value']] if cond.get('value') is not None else [])
    if not vals or not isinstance(vals, list):
        return False
    str_vals = [str(v).strip() for v in vals if v is not None and str(v).strip()]
    if not str_vals:
        return False
    operand_metrics = []
    if getattr(contract, 'domain', None):
        try:
            from .analysis_semantics import derivation_recipes, domain_pack
            pack = domain_pack(contract.domain)
            if pack and hasattr(pack, 'METRICS'):
                recipes = [r for r in derivation_recipes(contract.domain)
                           if any(m.semantic_id == r['metric_id'] for m in contract.metrics)]
                operand_ids = {op for r in recipes for op in r.get('operands', [])}
                operand_metrics = [dm for dm in pack.METRICS if dm['id'] in operand_ids]
        except Exception:
            pass

    for sv in str_vals:
        matched_any_metric = any(
            sv == m.name or any(re.search(alias, sv) for alias in getattr(m, 'aliases', []))
            for m in contract.metrics
        )
        if not matched_any_metric and operand_metrics:
            matched_any_metric = any(
                sv == dm['name'] or any(re.search(p, sv) for p in dm.get('patterns', []))
                for dm in operand_metrics
            )
        if not matched_any_metric:
            return False
    return True


def _is_unsplit_multi_row_conflation(fact, scopes, contract, expression=None):
    """Detect facts that summed multiple distinct 'in'-filtered rows without group_by."""
    if expression and expression.get('op') in ('add', 'subtract', 'multiply', 'divide'):
        # Explicit arithmetic may legitimately read multiple metric rows.
        return False
    if fact.get('group_key') is not None:
        return False
    matched_records = fact.get('matched_records')
    if matched_records is not None and matched_records <= 1:
        return False
    lbl = str(fact.get('label', '') or '').strip()
    unsplit = fact.get('unsplit_filter_values')
    if isinstance(unsplit, dict):
        for _, m_vals in unsplit.items():
            if isinstance(m_vals, list) and len(m_vals) >= 2:
                mentioned = [v for v in m_vals if str(v) in lbl]
                if 0 < len(mentioned) < len(m_vals):
                    return True
                if any(
                    any( str(v) == m.name or any(re.search(alias, str(v)) for alias in getattr(m, 'aliases', []))
                         for m in getattr(contract, 'metrics', []) )
                    for v in m_vals
                ):
                    return True
    for s in scopes:
        for cond in s.get('filters', []):
            if not isinstance(cond, dict):
                continue
            op = str(cond.get('op', 'in') or 'in').strip().lower()
            vals = cond.get('values') if isinstance(cond.get('values'), list) else []
            if op in ('in', '') and len(vals) >= 2 and (matched_records is None or matched_records > 1):
                if _is_metric_row_filter(cond, contract):
                    return True
                str_vals = [str(v).strip() for v in vals if v is not None and str(v).strip()]
                mentioned = [v for v in str_vals if v in lbl]
                if 0 < len(mentioned) < len(str_vals):
                    return True
    return False


def resolve_conforming_facts(receipts, prompt='', scope_decisions=None, model=None, deadline=None):
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
            if metric_item or fact.get('calculation_stage') == 'post_query':
                tids = {plan.get('source', {}).get('table_id', 'detail')}
            # Legacy receipts without a calculation map can bind only a single table.
            if not tids and len(tables) == 1:
                tids = set(tables)
            scopes = [tables[t] for t in sorted(tids) if t in tables]
            if _is_unsplit_multi_row_conflation(fact, scopes, contract, expr):
                continue
            non_metric_filters = [
                (s, c) for s in scopes for c in s.get('filters', [])
                if not _is_metric_row_filter(c, contract)
            ]
            predicates = [_predicate(c, s.get('headers', {})) for s, c in non_metric_filters]
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
        not _is_metric_row_filter(cond, contract) and _matches_prompt_intent(cond, prompt, all_headers)
        for s in [scope for it in items for scope in it[3]]
        for cond in s.get('filters', [])
    )
    review_source_scope = getattr(contract, 'requires_source_scope_review', False)
    has_filter_intent = contract.has_filters or explicit_filter_kw or data_driven_filter or review_source_scope

    # Layer 1: 如果有过滤/切片意图，先由 LLM-as-a-Judge 语义裁判裁决（支持大模型理解复杂否定、同义表述与分类切片）
    if has_filter_intent:
        from .semantic_filter_judge import judge_filter_conformance
        judge_matched = []
        judge_rejected = []
        neutral_filtered = []
        scope_reviews = {}
        for it in items:
            scopes = it[3]
            filters = [
                cond for s in scopes for cond in s.get('filters', [])
                if not _is_metric_row_filter(cond, contract)
            ]
            if filters:
                if review_source_scope:
                    from .analysis_scope_context import source_scope_context, record_scope_decision
                    context = source_scope_context(it[0], scopes, it[4], contract)
                    verdict = judge_filter_conformance(
                        prompt, filters, all_headers, model=model, deadline=deadline,
                        source_context=context)
                    record_scope_decision(scope_decisions, verdict, context, it[0])
                else:
                    verdict = judge_filter_conformance(prompt, filters, all_headers)
                if verdict is True:
                    judge_matched.append(it)
                elif verdict is False:
                    judge_rejected.append(it)
                elif review_source_scope:
                    # A heuristic predicate match cannot prove an unknown period.
                    judge_rejected.append(it)
                else:
                    neutral_filtered.append(it)
            elif contract.has_filters or review_source_scope:
                from .analysis_scope_context import source_scope_context, record_scope_decision
                context = source_scope_context(it[0], scopes, it[4], contract)
                key = json.dumps(context, sort_keys=True, ensure_ascii=False)
                if key not in scope_reviews:
                    scope_reviews[key] = judge_filter_conformance(
                        prompt, [], all_headers, model=model, deadline=deadline,
                        source_context=context)
                verdict = scope_reviews[key]
                record_scope_decision(scope_decisions, verdict, context, it[0])
                if verdict is True:
                    judge_matched.append(it)
                elif verdict is False or review_source_scope:
                    # An unknown source period cannot fall through to the
                    # unfiltered-fact fallback merely because no WHERE exists.
                    judge_rejected.append(it)
        if judge_matched:
            items = judge_matched
        else:
            # 尝试通过确定性规则解析精确要求
            try:
                required = [_predicate(c, all_headers) for c in explicit_filters(prompt, all_headers, categories)]
            except ValueError:
                required = []
            if required:
                items = [it for it in items if it not in judge_rejected and set(it[2]) == set(required)]
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
                elif not contract.has_filters and not explicit_filter_kw:
                    unfiltered_items = [it for it in items if not it[2] and it not in judge_rejected]
                    items = unfiltered_items
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
    # Always preserve registered derivations generated for this turn
    for r in receipts or []:
        if getattr(r, 'is_success', False) and isinstance(getattr(r, 'data', None), dict):
            if (r.provenance or {}).get('execution_origin') == 'registered_derivation':
                for df in r.data.get('facts', []):
                    if df not in facts:
                        facts.append(df)
    return facts
