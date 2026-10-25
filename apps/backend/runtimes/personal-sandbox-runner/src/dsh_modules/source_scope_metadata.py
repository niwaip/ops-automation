"""Read bounded layout evidence and preserve explicit source-row selections."""

from datetime import date, datetime
from openpyxl.utils.cell import range_boundaries


def select_bound_rows(item, rows):
    selected = item.get('row_ids')
    if selected is None:
        return rows
    if (not isinstance(selected, list) or len(selected) > 200000
            or any(type(row) is not int for row in selected)
            or len(set(selected)) != len(selected) or not set(selected) <= set(rows)):
        raise ValueError('row_ids必须是声明业务范围与过滤结果内的不重复真实行号')
    return sorted(selected)


def attach_source_labels(workbook, coverage):
    """Labels are read from the verified workbook, never supplied by a model."""
    for scope in coverage:
        ws = workbook[scope['sheet']]
        left, _, right, _ = range_boundaries(scope['data_range'])
        header = scope['header_row']
        labels = []
        for row in ws.iter_rows(min_row=max(1, header - 20), max_row=header - 1,
                                min_col=left, max_col=min(right, left + 31)) if header > 1 else []:
            for cell in row:
                if isinstance(cell.value, str) and cell.value.strip() and cell.data_type != 'f':
                    labels.append({'cell': cell.coordinate, 'text': cell.value[:300]})
        scope['source_labels'] = labels[:40]
        rows = scope.get('selected_rows', [])
        row_labels = []
        # Retain both ends for larger ranges; mark this as a sample explicitly.
        sample = rows if len(rows) <= 24 else rows[:12] + rows[-12:]
        for row in sample:
            for col in range(left, min(right, left + 7) + 1):
                cell = ws.cell(row, col)
                if cell.data_type == 'f':
                    continue
                if isinstance(cell.value, (str, date, datetime)) and str(cell.value).strip():
                    row_labels.append({'cell': cell.coordinate, 'text': str(cell.value)[:160]})
        scope['selected_row_labels'] = row_labels[:192]
        scope['row_labels_complete'] = len(rows) <= 24
