"""Validate declared temporal captions against actual grouping values.

This is a reusable period vocabulary, not a question-to-answer lookup. Unknown
business semantics remain visible as plan labels and source definitions.
"""

import datetime as dt
import re
from .spreadsheet_expression import source_column


def month_value(value):
    if isinstance(value, (dt.date, dt.datetime)):
        return value.month
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 12:
        return value
    match = re.fullmatch(r"(?:\d{4}[-/年])?(\d{1,2})(?:月)?", str(value).strip())
    if match and 1 <= int(match[1]) <= 12:
        return int(match[1])
    return None


def table_months(workbook, table):
    ws = workbook[table['sheet']]
    columns = [col for col, header in table['headers'].items()
               if re.fullmatch(r"月份|月度|月|日期|month|date", header.strip(), re.I)]
    if len(columns) != 1:
        return None
    col = source_column(workbook, table, columns[0])
    values = [month_value(ws.cell(row, col).value) for row in table['selected_rows']]
    return sorted(set(values)) if values and all(v is not None for v in values) else None


def declared_months(label):
    if re.search(r"上半年|(?<![A-Za-z0-9])H1(?![A-Za-z0-9])", label, re.I): return set(range(1, 7))
    if re.search(r"下半年|(?<![A-Za-z0-9])H2(?![A-Za-z0-9])", label, re.I): return set(range(7, 13))
    q = re.search(r"(?<![A-Za-z0-9])Q([1-4])(?![A-Za-z0-9])|第([一二三四1-4])季度", label, re.I)
    if q:
        number = int(q[1]) if q[1] else '一二三四'.find(q[2])+1 if q[2] in '一二三四' else int(q[2])
        return set(range(number*3-2, number*3+1))
    span = re.search(r"(?<!\d)(\d{1,2})\s*[-—~至]\s*(\d{1,2})月", label)
    if span and 1 <= int(span[1]) <= int(span[2]) <= 12:
        return set(range(int(span[1]), int(span[2])+1))
    months = re.findall(r"(?<!\d)(\d{1,2})月", label)
    return {int(v) for v in months if 1 <= int(v) <= 12} or None


def aggregate_leaves(expression):
    if 'aggregate' in expression:
        yield expression
    for arg in expression.get('args', []):
        yield from aggregate_leaves(arg)


def validate_caption(item, workbook, tables):
    expected = declared_months(item['label'])
    leaves = list(aggregate_leaves(item['expression']))
    windows = [tables[leaf['table']].get('source_months') for leaf in leaves]
    known = [set(v) for v in windows if v]
    if expected and not known:
        expr=item['expression']
        if 'cell' in expr:
            month=month_value(workbook[expr['sheet']].cell(workbook[expr['sheet']][expr['cell']].row,1).value)
            if month:known=[{month}]
        if not known:raise ValueError('指标期间无法从来源分组核验，请声明真实月份范围/过滤条件')
    if expected and known:
        is_change = bool(re.search(r"变化|增减|增长|差额|差值|对比|change|growth|difference", item['label'], re.I))
        if (not is_change and any(v != expected for v in known)) or (is_change and not any(v == expected for v in known)):
            raise ValueError(f"指标标签期间与来源不一致：{item['label']}；实际月份{sorted(set.union(*known))}。请修正范围/过滤或标签。")
