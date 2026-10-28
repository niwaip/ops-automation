"""Compile query facts back to exact source expressions without copying values."""

from openpyxl.utils.cell import coordinate_from_string, column_index_from_string, range_boundaries
from .spreadsheet_expression import AMOUNT_SCALE


def bind_query_fact(fact, query, coverage):
    metric = next((m for m in query.get('metrics', [])
                   if fact['id'] == m['id'] or fact['id'].startswith(m['id'] + '__')), None)
    cells = fact.get('source_cells', [])
    if not metric or not cells or metric.get('op') not in ('sum', 'first', 'value', 'min', 'max'):
        return None
    scope = next((c for c in coverage if c['id'] == query.get('source', {}).get('table_id', 'detail')), None)
    if not scope or not scope.get('coverage_complete'):
        return None
    locations = [str(cell).rpartition('!') for cell in cells]
    if any(sheet.strip("'") != scope['sheet'] or not separator for sheet, separator, _ in locations):
        return None
    addresses = [coordinate_from_string(address) for _, _, address in locations]
    columns = {column for column, _ in addresses}
    rows = sorted({row for _, row in addresses})
    a, start, b, end = range_boundaries(scope['data_range'])
    if (len(columns) != 1 or not set(rows) <= set(scope.get('selected_rows', []))
            or not all(start <= row <= end and a <= column_index_from_string(col) <= b
                       for col, row in addresses)):
        return None
    unit = ('amount' if fact.get('unit') in AMOUNT_SCALE else
            'ratio' if fact.get('unit') in ('%', 'ratio', 'rate') else 'number')
    column = next(iter(columns))
    table = {key: scope[key] for key in ('sheet', 'data_range', 'header_row')}
    # A first/min/max of one cell has exactly that cell's value. A multi-row
    # first is not interchangeable with an aggregate and must not be guessed.
    if len(cells) == 1 and (query.get('group_by') or metric['op'] in ('first', 'value')):
        expression = {'sheet': scope['sheet'], 'cell': locations[0][2], 'unit': unit}
        field = (scope['headers'].get(column, column), 'cell', unit)
        selection = (scope['sheet'], scope['headers'].get(column, column))
    elif metric['op'] in ('sum', 'min', 'max'):
        table['row_ids'] = rows
        expression = {'aggregate': metric['op'], 'table': 'query_operand', 'column': column, 'unit': unit}
        field = (column, metric['op'], unit)
        selection = (scope['sheet'], scope['header_row'], tuple(rows))
    else:
        return None
    return {'expression': expression, 'table': table, 'field': field, 'selection': selection}
