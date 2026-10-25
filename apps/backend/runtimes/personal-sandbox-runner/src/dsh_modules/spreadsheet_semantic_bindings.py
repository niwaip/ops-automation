"""Translate Excel references into domain-neutral field and scope bindings.

Domain validators consume this logical tree, not openpyxl objects or coordinates.
Other storage adapters can provide the same binding protocol.
"""

from .spreadsheet_expression import source_column


def semantic_bindings(expression, workbook, tables):
    if 'aggregate' in expression:
        table = tables[expression['table']]
        column = source_column(workbook, table, expression['column'])
        return {'aggregate': expression['aggregate'],
                'source_header': str(workbook[table['sheet']].cell(table['header_row'], column).value or ''),
                'source_scope': (table['sheet'], tuple(table['selected_rows'])),
                'field_key': (table['sheet'], column)}
    if 'op' in expression:
        return {'op': expression['op'], 'args': [semantic_bindings(arg, workbook, tables)
                                               for arg in expression['args']]}
    # A direct cell can express row-oriented or derived business measures. It is
    # numerically verifiable but not an automatically verified column binding.
    if 'cell' in expression:
        ws = workbook[expression['sheet']]
        addr = expression['cell']
        cell_obj = ws[addr]
        row_label = str(ws.cell(cell_obj.row, 1).value or '')
        col_header = ''
        if tables:
            t = next((t for t in tables.values() if t.get('sheet') == expression['sheet']), None)
            if t and t.get('header_row'):
                col_header = str(ws.cell(t['header_row'], cell_obj.column).value or '')
        return {'kind': 'cell', 'source_header': row_label or col_header,
                'source_scope': (expression['sheet'], (cell_obj.row,)),
                'field_key': (expression['sheet'], cell_obj.column),
                'col_header': col_header}
    return {'kind': 'constant'}
