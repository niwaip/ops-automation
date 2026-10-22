"""Fact identity independent of presentation labels and model-generated table IDs."""

import json


def fact_identity(fact, data, provenance):
    data = data or {}
    plan = data.get('plan') or {}
    calcs = plan.get('calculations') or []
    fact_id = str(fact.get('id', ''))
    expression = {}
    if calcs:
        expression = next((c.get('expression', {}) for c in calcs
                           if isinstance(c, dict) and (c.get('id') == fact_id or fact_id.startswith(str(c.get('id', '')) + '__'))), {})
    elif plan.get('metrics'):
        metrics = plan.get('metrics') or []
        m_item = next((m for m in metrics if isinstance(m, dict) and (m.get('id') == fact_id or fact_id.startswith(str(m.get('id', '')) + '__'))), {})
        if m_item:
            expression = {"aggregate": m_item.get("op", "sum"), "column": m_item.get("field", "")}
    elif fact.get('expression'):
        expression = fact.get('expression')

    coverage_list = data.get('coverage') or []
    tables = {c.get('id'): c for c in coverage_list if isinstance(c, dict) and 'id' in c}

    def canonical(value):
        if isinstance(value, list):
            return [canonical(v) for v in value]
        if not isinstance(value, dict):
            return value
        normalized = {k: canonical(v) for k, v in value.items() if k != 'table'}
        if 'table' in value:
            table = tables.get(value['table'], {})
            normalized['scope'] = {k: table.get(k) for k in ('sheet','data_range','selected_rows','filters')}
        return normalized

    calc_id = fact_id.split('__')[0]
    prov = provenance or {}
    query_scope = [{k: c.get(k) for k in ('sheet', 'data_range', 'selected_rows', 'filters')}
                   for c in coverage_list] if plan.get('source') else None
    return json.dumps({'source': prov.get('workbook_id'), 'calc_id': calc_id, 'expression': canonical(expression),
                       'query_scope': query_scope,
                       'unit': fact.get('unit'), 'value': str(fact.get('value')), 'metric_id': fact.get('metric_id'),
                       'group_key': fact.get('group_key')},
                      sort_keys=True, ensure_ascii=False)
