"""Execute declared post-query calculations through the existing source engine."""

import copy
from .query_fact_binding import bind_query_fact


def execute_query_calculations(result, plan, query, source, deadline, domain, execute):
    """Every derived source must belong to the query's returned facts."""
    if plan.get('checks') or plan.get('rules') or plan.get('profile_tables'):
        raise ValueError('query混合计划暂只支持calculations；checks/rules/profile_tables请单独执行')
    calculations = plan.get('calculations', [])
    if not isinstance(calculations, list) or len(calculations) > 64:
        raise ValueError('calculations必须是预算内的JSON数组')
    if not calculations:
        return query
    derived = copy.deepcopy({'tables': plan.get('tables', []), 'calculations': calculations})
    fact_ids = {f['id'] for f in result.facts}
    metric_ids = {m['id'] for m in query.get('metrics', [])}
    if any(c.get('id') in fact_ids | metric_ids for c in calculations):
        raise ValueError('派生计算ID与查询事实或度量ID冲突，请使用唯一ID')
    bindings = {}
    used_table_ids = {t['id'] for t in derived['tables']}
    operand_tables = {}
    for fact in result.facts:
        binding = bind_query_fact(fact, query, result.coverage)
        if not binding:
            continue
        bindings[fact['id']] = binding

    def expand(value):
        if isinstance(value, dict):
            if set(value) == {'ref'} and value['ref'] in fact_ids:
                if value['ref'] not in bindings:
                    raise ValueError('该查询事实无法还原为受支持的精确来源表达式，请提供显式来源计算')
                binding = bindings[value['ref']]
                expression = copy.deepcopy(binding['expression'])
                if 'table' in expression:
                    key = repr(binding['table'])
                    if key not in operand_tables:
                        identifier = 'query_operand_' + str(len(operand_tables))
                        while identifier in used_table_ids:
                            identifier += '_'
                        used_table_ids.add(identifier)
                        operand_tables[key] = {**binding['table'], 'id': identifier}
                    expression['table'] = operand_tables[key]['id']
                return expression
            return {k: expand(v) for k, v in value.items()}
        if isinstance(value, list):
            return [expand(v) for v in value]
        return value

    derived = expand(derived)
    derived['tables'].extend(operand_tables.values())
    # Namespace table IDs so combined coverage preserves both stages.
    used = {c['id'] for c in result.coverage}
    aliases = {}
    for index, table in enumerate(derived['tables']):
        identifier = 'post_query_t' + str(index)
        while identifier in used:
            identifier += '_'
        used.add(identifier)
        aliases[table['id']] = identifier
        table['id'] = identifier

    def bind_tables(value):
        if isinstance(value, dict):
            return {k: aliases.get(v, v) if k in ('table', 'table_id') and isinstance(v, str)
                    else bind_tables(v) for k, v in value.items()}
        if isinstance(value, list):
            return [bind_tables(v) for v in value]
        return value

    derived['calculations'] = bind_tables(derived['calculations'])
    receipt = execute(source, derived, deadline, domain=domain)
    if not receipt.is_success:
        raise ValueError('查询后计算失败：' + str(receipt.error_message))
    allowed_cells = {cell for fact in result.facts for cell in fact.get('source_cells', [])}
    calculated_cells = set(receipt.data.get('visited_cells', []))
    if not calculated_cells <= allowed_cells:
        raise ValueError('查询后计算引用了查询最终结果之外的来源；请先查询所需的操作数')
    if any(f['id'] in fact_ids for f in receipt.data['facts']):
        raise ValueError('查询后计算事实ID冲突')
    result.facts.extend({**f, 'calculation_stage': 'post_query'} for f in receipt.data['facts'])
    result.coverage.extend(receipt.data.get('coverage', []))
    result.visited_cells = sorted(set(result.visited_cells) | calculated_cells)
    return {**query, 'tables': receipt.data['plan'].get('tables', []),
            'calculations': receipt.data['plan']['calculations']}
