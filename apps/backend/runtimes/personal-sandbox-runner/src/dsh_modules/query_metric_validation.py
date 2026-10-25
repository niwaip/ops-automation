"""Apply the existing domain validation hooks to query aggregates too."""

from .analysis_semantics import validate_domain_calculation


def validate_query_metrics(result, query, domain):
    scope = result.coverage[0]
    headers = scope.get('headers', {})
    for metric in query.get('metrics', []):
        if metric.get('op') in ('count', 'count_rows', 'count_distinct'):
            continue
        field = metric.get('field')
        column = next((col for col, header in headers.items() if col == field or header == field), None)
        if column is None:
            continue  # The query executor validates unresolved fields.
        validate_domain_calculation(
            {**metric, 'label': metric.get('label', metric['id'])},
            {'aggregate': metric['op'], 'source_header': headers[column],
             'source_scope': (scope['sheet'], tuple(scope.get('selected_rows', []))),
             'single_source_value': metric['op'] in ('first', 'value') and all(
                 len(fact.get('source_cells', [])) == 1 and fact.get('matched_records') == 1
                 for fact in result.facts if fact['id'] == metric['id']
                 or fact['id'].startswith(metric['id'] + '__')),
             'field_key': (scope['sheet'], column)}, domain)
