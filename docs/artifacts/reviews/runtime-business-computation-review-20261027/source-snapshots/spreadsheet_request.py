"""Resolve explicit summary requests against real headers; never invent source fields."""

import re
from .analysis_contract import build_analysis_contract


def normalized(value):
    return re.sub(r'\s+', '', str(value)).casefold()


def prefix_requirement(prompt, headers):
    match = re.search(r'([A-Za-z]{1,8}(?:[\s,，、/]+(?:或)?[A-Za-z]{1,8}|或[A-Za-z]{1,8})*)\s*开头', prompt)
    if not match:
        return None
    values = re.findall(r'[A-Za-z]+', match.group(1))
    before = normalized(prompt[:match.start()])
    columns = [(before.rfind(normalized(h)), len(normalized(h)), c) for c, h in headers.items()
               if normalized(h) and normalized(h) in before]
    if not columns:
        raise ValueError('前缀筛选缺少明确来源列')
    column = max(columns)[2]
    context = prompt[:match.start()]
    if re.search(r'不排除[^，,。；;]*$', context):
        return None
    exclude_matches = [m for w in ('排除', '不包含', '剔除', '去除', '不以', '不要', '过滤掉', '去掉', '跳过', '不要包含', '非')
                       for m in re.finditer(re.escape(w), context)]
    exclude_spans = {idx for m in exclude_matches for idx in range(m.start(), m.end())}
    exclude = max((m.start() for m in exclude_matches), default=-1)

    include_matches = [m for w in ('仅保留', '只保留', '保留', '仅统计', '只包含', '仅包含', '包含', '只要', '只选', '限定', '仅限', '只看', '只查', '限定为')
                       for m in re.finditer(re.escape(w), context) if m.start() not in exclude_spans]
    include = max((m.start() for m in include_matches), default=-1)
    if max(exclude, include) < 0:
        # 启发式放宽：当用户明确指出了前缀且未出现任何排除/否定语义时，默认视为正向筛选，避免硬编码词表遗漏抛出异常
        op = 'prefix'
    else:
        op = 'exclude_prefix' if exclude > include else 'prefix'
    return {'column': column, 'op': op,
            'prefixes': list(dict.fromkeys(v.casefold() for v in values)), 'case_sensitive': False}


def explicit_filters(prompt, headers, categories=None):
    filters = []
    prefix = prefix_requirement(prompt, headers)
    if prefix:
        filters.append(prefix)
    # Literal low-cardinality conditions are accepted only after an explicit restriction verb.
    for clause in re.findall(r'(?:只保留|仅保留|筛选出|只包含|仅包含|只要|限定为|仅限)\s*([^，,。；;]+)', prompt):
        for column, values in (categories or {}).items():
            chosen = [v for v in values if isinstance(v, str) and v.strip()
                      and len(v) <= 64 and v in clause and v not in str(headers.get(column, ''))]
            # Headers often concatenate both alternatives, e.g. "有偿无偿".
            if not chosen:
                chosen = [v for v in values if isinstance(v, str) and v.strip() and len(v) <= 64
                          and v in clause and normalized(headers.get(column, '')) not in normalized(clause)]
            if chosen:
                filters.append({'column': column, 'values': chosen})
    return filters



def restrictions_are_bounded(prompt, headers, categories):
    """Every restriction verb must bind a supported predicate, not just one of them."""
    prefix = re.search(r'([A-Za-z]{1,8}(?:[\s,，、/]+(?:或)?[A-Za-z]{1,8}|或[A-Za-z]{1,8})*)\s*开头', prompt)
    verbs = list(re.finditer(r'(?<!不)排除|不包含|剔除|去除|只保留|仅保留|筛选出|仅统计|只包含|仅包含|只要|限定为|仅限', prompt))
    prefix_owner = None
    if prefix:
        preceding = [v for v in verbs if v.end() <= prefix.start()]
        prefix_owner = preceding[-1].start() if preceding else None
    for verb in verbs:
        if verb.start() == prefix_owner:
            continue
        tail = prompt[verb.end():]
        if verb.group() == '仅统计' and re.match(r'\s*明细', tail):
            continue
        if verb.group() not in ('只保留', '仅保留', '筛选出', '只包含', '仅包含', '只要', '限定为', '仅限'):
            return False
        clause = re.split(r'[，,。；;]', tail, 1)[0]
        chosen = explicit_filters(verb.group() + clause, headers, categories)
        if not chosen:
            return False
        remainder = clause
        literals = [str(v) for f in chosen for v in f.get('values', [])]
        for literal in sorted(literals, key=len, reverse=True):
            remainder = remainder.replace(literal, '')
        for column in {f['column'] for f in chosen}:
            remainder = remainder.replace(str(headers.get(column, '')), '')
        if re.sub(r'[\s、及和与且的明细记录数据为是：:（）()]+', '', remainder):
            return False
    return True


def summary_request(prompt, headers, categories=None):
    """Return a bounded, unambiguous sum/count/group plan specification or decline."""
    if re.search(r'同比|环比|平均|均值|比率|占比|最大|最小|大于|小于|等于|不为|非空|为空|去重|排序|前\d+名|区间|截至|截止|之后|之前|[<>≤≥=]|\d{4}年', prompt):
        return None
    contract = build_analysis_contract(prompt)
    if contract.domain != 'generic' or not contract.metrics:
        return None
    metrics = []
    for metric in contract.metrics:
        name = re.sub(r'^(?:总计|总|合计)', '', metric.name)
        if any(word in name for word in ('条数', '记录数', '笔数', '行数', '计数')):
            metrics.append({'name': '条数', 'column': next(iter(headers)), 'aggregate': 'count', 'unit': 'number'})
            continue
        if metric.expected_type != 'number':
            return None
        exact = [c for c, h in headers.items() if normalized(re.sub(r'[（(].*?[)）]', '', h)) == normalized(name)]
        matches = exact or [c for c, h in headers.items() if normalized(name) in normalized(h)]
        if len(matches) != 1:
            return None
        metrics.append({'name': name, 'column': matches[0], 'aggregate': 'sum', 'unit': 'number'})
    unique = {m['name']: m for m in metrics}
    group = None
    group_match = re.search(r'按\s*([^，,。；;]+?)(?:分组|汇总|统计|分类|求和)', prompt)
    if contract.is_grouped or group_match:
        group_text = normalized(group_match.group(1) if group_match else contract.group_dimension or '')
        candidates = [c for c, h in headers.items() if normalized(h) in group_text]
        if len(candidates) != 1:
            return None
        group = candidates[0]
        prefix = re.search(r'前([一二两三四五六七八九十\d]+)个?(?:字母|字符|位)', group_text)
        if prefix:
            numbers = dict(zip('一二三四五六七八九十', range(1, 11)), 两=2)
            value = prefix.group(1)
            length = int(value) if value.isdigit() else numbers.get(value)
            if not length or not 1 <= length <= 32:
                return None
            group = {'column': group, 'prefix_length': length}
    try:
        filters = explicit_filters(prompt, headers, categories)
    except ValueError:
        return None
    # Only explicit prefix and literal category restrictions are supported here.
    if re.search(r'(?:筛选|保留|排除|不包含|剔除|去除|仅统计)', prompt) and not filters:
        if not re.search(r'不排除|仅统计明细', prompt):
            return None
    if contract.has_filters and not filters:
        return None
    if not restrictions_are_bounded(prompt, headers, categories):
        return None
    return {'metrics': list(unique.values()), 'group_by': group, 'filters': filters}
