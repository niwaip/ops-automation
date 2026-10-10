"""Catch incomplete source identities without guessing financial equations."""

import re


def validate_source_identity(item, original):
    relation = item.get('relation_type', 'declared_equation')
    if relation not in {'declared_equation', 'formula_identity', 'component_comparison'}:
        raise ValueError('未知等式关系类型')
    if relation == 'component_comparison':
        return
    left, right = item['left'], item['right']
    if 'cell' not in left or 'cell' not in right or left['sheet'] != right['sheet']:
        return
    ws = original[left['sheet']]
    for component, total in ((left, right), (right, left)):
        formula = str(ws[total['cell']].value or '').replace(' ', '').upper()
        # Deliberately limited to unambiguous additive cell formulas. General
        # formula semantics are not inferred from cached values or captions.
        if not re.fullmatch(r'=(?:\$?[A-Z]+\$?\d+[+-])+\$?[A-Z]+\$?\d+', formula):
            continue
        refs = set(re.findall(r'\$?([A-Z]+)\$?(\d+)', formula))
        addresses = {column+row for column, row in refs}
        if component['cell'].replace('$', '').upper() in addresses and len(addresses) > 1:
            raise ValueError(f"分项不能作为完整恒等式：{ws.title}!{total['cell']}原始公式{formula}；"
                             f"当前仅与组成项{component['cell']}比较。请按公式补齐表达式；"
                             "若用户明确要求分项与合计比较，声明relation_type=component_comparison。")
