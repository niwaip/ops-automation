"""Fact identity independent of presentation labels and model-generated table IDs."""

import json


def fact_identity(fact, data, provenance):
    expression = next(c['expression'] for c in data['plan']['calculations'] if c['id']==fact['id'])
    tables = {c['id']: c for c in data['coverage']}

    def canonical(value):
        if isinstance(value, list):
            return [canonical(v) for v in value]
        if not isinstance(value, dict):
            return value
        normalized = {k: canonical(v) for k, v in value.items() if k != 'table'}
        if 'table' in value:
            table = tables[value['table']]
            normalized['scope'] = {k: table[k] for k in ('sheet','data_range','selected_rows')}
        return normalized

    return json.dumps({'source':provenance.get('workbook_id'), 'expression':canonical(expression),
                       'unit':fact['unit'], 'value':str(fact['value']), 'metric_id':fact.get('metric_id')},
                      sort_keys=True,ensure_ascii=False)
