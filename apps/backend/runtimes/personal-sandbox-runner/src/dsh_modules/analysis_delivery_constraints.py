"""Require execution of requested query stages before marking delivery complete."""

import re
from .analysis_request_text import user_instruction


_COMPARISON = r'(?:大于|小于|高于|低于|超过|至少|不低于|不超过|>=|<=|>|<)\s*(?:等于)?\s*\d'
_LAYOUT = r'(?:排除|去除|剔除|不包含|去掉|忽略)\s*(?:(?:标题|表头|尾注|报表尾注|表尾|汇总行|合计行|空行|注释|说明行|非数据行|物理行)[、，\s和及与]*)+'


def is_empty_query(data):
    return (data.get('query_ir_version') == '1' and data.get('stages', {}).get('final_rows') == 0
            and data.get('rows') == [] and bool(data.get('plan', {}).get('source'))
            and bool(data.get('coverage')) and all(c.get('coverage_complete') for c in data['coverage']))


def _contains_boolean(node, operator):
    if not isinstance(node, dict):
        return False
    if isinstance(node.get(operator), list) and len(node[operator]) >= 2:
        return True
    return any(_contains_boolean(child, operator) for key in ('and', 'or') for child in node.get(key, []))


def group_filter_boolean_matches(prompt, having):
    # Check explicit conjunctions independently of observed results: two
    # different predicates can happen to select the same rows in one workbook.
    clauses = re.findall(r'(?:只保留|仅保留|筛选)((?:(?!只保留|仅保留).)*?的组)', user_instruction(prompt))
    clauses = [c for c in clauses if re.search(_COMPARISON, c)]
    text = ' '.join(clauses)
    text = re.sub(r'大于或等于|小于或等于', '', text)
    if re.search(r'且|并且|同时', text) and not _contains_boolean(having, 'and'):
        return False
    if re.search(r'或者|或', text) and not _contains_boolean(having, 'or'):
        return False
    return True


def has_group_filter(prompt):
    text = user_instruction(prompt)
    return bool(re.search(r'(?:只保留|仅保留|筛选)[^。；;]*' + _COMPARISON + r'[^。；;]*的组', text)
                or re.search(r'(?:分组|组内|每组|各组)[^。；;]*?(?:合计|总额|总数)[^。；;]*' + _COMPARISON, text)
                or re.search(r'\bhaving\b', text, re.I))


def has_row_filter(prompt):
    text = re.sub(_LAYOUT, '', user_instruction(prompt))
    # A restriction before GROUP BY is still WHERE, even if HAVING follows it.
    group = re.search(r'按(?:照)?[^。；;，,]*?(?:分组|汇总|统计)', text)
    if group:
        text = text[:group.start()]
    elif has_group_filter(text):
        return False
    return bool(re.search(r'(?<!不)(?:仅保留|只保留|仅包含|只包含|筛选|过滤|排除)|不包含|剔除|开头|结尾|' + _COMPARISON, text))


def has_distinct_list(prompt):
    return bool(re.search(r'(?:列出|展示|返回|查看|给出)[^。；;]*(?:所有不同|不同的|不重复|去重)|(?:去重|不重复)[^。；;]*(?:列出|展示|返回)', user_instruction(prompt)))


def query_delivery_issues(receipts, prompt, contract):
    """These are execution requirements; a judge cannot promise later rendering."""
    text = user_instruction(prompt)
    wants_having = contract.is_grouped and has_group_filter(text)
    wants_order = bool(re.search(r'升序|降序|order\s+by', text, re.I))
    wants_limit = contract.limit is not None
    wants_distinct = has_distinct_list(text)
    plans = [(r.data.get('plan') or {}, r.data) for r in receipts]
    issues = []
    required = []
    if wants_having:
        required.append(('having', 'group_filter_not_applied', '尚未执行分组后的条件筛选，请用查询计划的 having 对聚合指标筛选。'))
    if wants_order:
        required.append(('order_by', 'ordering_not_applied', '尚未执行请求的排序，请用 order_by 声明完整排序和并列规则。'))
    if wants_limit:
        required.append(('limit', 'ranking_limit_not_applied', '尚未执行请求的截断，请在完成筛选和排序后用 limit 返回所需结果。'))
    if wants_distinct:
        required.append(('distinct', 'distinct_not_applied', '用户要求去重后的取值清单，请执行 distinct 并返回实际取值；字段非空或重复检查不能替代清单。'))
    # Keep the stages in one executed plan; unrelated exploratory calls cannot
    # jointly masquerade as a single WHERE -> HAVING -> ORDER -> LIMIT pipeline.
    eligible = [(p, d) for p, d in plans if all(
        p.get(key) is not None if key == 'limit' else bool(p.get(key))
        for key, _, _ in required)]
    if required and not eligible:
        for key, code, message in required:
            if not any(p.get(key) is not None if key == 'limit' else p.get(key) for p, _ in plans):
                issues.append({'code': code, 'message': message})
        if not issues:
            issues.append({'code': 'query_stages_disconnected', 'message': '筛选、排序和截断分散在不同试算中，请在同一个查询计划中执行后重新校验。'})
    if wants_limit and eligible and not any(
        p.get('limit') == contract.limit and len(d.get('rows', [])) <= contract.limit
        for p, d in eligible
    ):
        issues.append({'code': 'ranking_limit_not_applied', 'message': f'请按请求返回前 {contract.limit} 组，而不是全部分组。'})
    if wants_having and eligible and not any(group_filter_boolean_matches(text, p.get('having')) for p, _ in eligible):
        issues.append({'code': 'group_filter_boolean_incomplete', 'message': '分组筛选遗漏了请求中的且/或组合；即使当前数据恰好得到相同分组，也必须在 having 中执行全部条件后重新校验。'})
    directions = ['asc' if direction == '升序' else 'desc' for direction in re.findall(r'升序|降序', text)]
    if len(directions) > 1 and eligible and not any(
        [o.get('direction', 'asc') for o in p.get('order_by', [])] == directions for p, _ in eligible
    ):
        issues.append({'code': 'ordering_incomplete', 'message': '排序计划遗漏或颠倒了请求中的多级排序（含并列规则），请按指定顺序补齐所有 order_by 项。'})
    if has_row_filter(text) and contract.has_filters and not any(
        any(c.get('filters') for c in d.get('coverage', [])) for _, d in plans
    ):
        issues.append({'code': 'row_filter_not_applied', 'message': '请求包含明细行筛选，但执行范围未带行筛选条件；分组不能代替明细筛选。'})
    return issues
