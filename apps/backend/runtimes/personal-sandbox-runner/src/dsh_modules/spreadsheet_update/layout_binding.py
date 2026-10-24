"""Bind observed labels and keys; no template coordinates, key regexes or scan windows."""
import re
from decimal import Decimal
from openpyxl.utils.cell import range_boundaries
from .result_catalog import normalize_unit
from ..spreadsheet_units import AMOUNT_UNIT_FACTORS


class BindingNeedsInput(ValueError):
    """A business fact is absent from the workbook, so the model cannot guess it."""


def text_value(value):
    return '' if value is None else str(value).strip()


def _effective(ws, row, col):
    cell=ws.cell(row,col)
    if cell.value is not None:
        return text_value(cell.value)
    for merged in ws.merged_cells.ranges:
        if merged.min_row <= row <= merged.max_row and merged.min_col <= col <= merged.max_col:
            return text_value(ws.cell(merged.min_row,merged.min_col).value)
    return ''


def locate(ws, section, period, target_label, source_keys, target_range=None, protected_labels=()):
    bounds=range_boundaries(target_range) if target_range else (1,1,ws.max_column,ws.max_row)
    min_c,min_r,max_c,max_r=bounds
    titles=[cell for row in ws.iter_rows(min_row=min_r,max_row=max_r,min_col=min_c,max_col=max_c)
            for cell in row if text_value(cell.value)==section]
    if len(titles)!=1:
        if section == period:
            candidates=[]
            for row in ws.iter_rows():
                populated=[cell for cell in row if cell.value is not None]
                if len(populated)==1 and isinstance(populated[0].value,str) and populated[0].data_type!='f':
                    cell=populated[0]
                    candidates.append(f'{cell.coordinate}={cell.value}')
            raise ValueError('section 被误填成 period 期间值；section 应是业务区块的独立标题。'
                             '请修改 section，不要反复缩小 target_range；当前工作表实际独立标题候选：'
                             + '；'.join(candidates[:30]))
        if target_range and not titles:
            raise ValueError('target_range 必须包含区块标题、完整表头和关联键列；请省略范围让服务端定位，不能只给目标列')
        raise ValueError(f'区块标题必须唯一：{section}，匹配 {len(titles)} 处；可用 target_range 限定')
    start=titles[0].row
    matches=[cell for row in ws.iter_rows(min_row=start+1,max_row=max_r,min_col=min_c,max_col=max_c)
             for cell in row if text_value(cell.value) in source_keys]
    if not matches:
        raise ValueError('目标区块未发现来源业务键')
    first_match=min(cell.row for cell in matches)
    first_columns={cell.column for cell in matches if cell.row==first_match}
    scores={column:len({text_value(cell.value) for cell in matches if cell.column==column})
            for column in first_columns}
    key_columns={column for column,score in scores.items() if score==max(scores.values())}
    if len(key_columns)!=1:
        raise ValueError('首个业务行的关联键列不唯一')
    key_col=key_columns.pop()
    first=min(cell.row for cell in matches if cell.column==key_col)
    candidates=[]
    for col in range(min_c,max_c+1):
        headers={_effective(ws,row,col) for row in range(start,first)}
        if period in headers and target_label in headers:
            if headers.intersection(protected_labels):
                raise ValueError('目标列属于声明保护的表头')
            candidates.append(col)
    if len(candidates)!=1:
        raise ValueError(f'期间与目标表头不唯一：{period}/{target_label}，匹配 {len(candidates)} 列')
    col=candidates[0]
    # A repeated observed header band starts a separate block, regardless of its name/position.
    key_rows=sorted({cell.row for cell in matches if cell.column==key_col})
    boundary=max_r
    for previous,next_row in zip(key_rows,key_rows[1:]):
        periods=[r for r in range(previous+1,next_row) if _effective(ws,r,col)==period]
        labels=[r for r in range(previous+1,next_row) if _effective(ws,r,col)==target_label]
        if periods and labels:
            boundary=min(min(periods),min(labels))-1
            break
    keys={}
    for row in range(first,boundary+1):
        raw=ws.cell(row,key_col).value
        key=text_value(raw)
        if raw is None or not key:
            continue
        target=ws.cell(row,col)
        if key not in source_keys and target.data_type=='f':
            continue
        if key in keys:
            raise ValueError(f'区块内业务键重复：{key}；请限定 target_range')
        keys[key]=row
    missing=source_keys-keys.keys()
    if missing:
        raise ValueError('来源键未匹配当前区块：'+', '.join(sorted(missing)))
    protected=[]
    for column in range(min_c,max_c+1):
        headers={_effective(ws,row,column) for row in range(start,first)}
        if headers.intersection(protected_labels):
            protected.extend(ws.cell(row,column).coordinate for row in range(first,boundary+1))
    return {'region_id':section,'header_row':first-1,'key_col':key_col,
            'min_row':start,'max_row':boundary,'min_col':min_c,'max_col':max_c,
            'period_columns':{period:col},'department_rows':keys,
            'protected_coordinates':protected},col


def verify_unit(ws, unit, unit_cell=None, confirmation=None):
    """Accept a grounded user declaration or worksheet evidence, never a model guess."""
    aliases=set(AMOUNT_UNIT_FACTORS)|{unit,'hours','小时','h'}
    cells=[ws[unit_cell]] if unit_cell else [cell for row in ws for cell in row]
    found=set()
    for cell in cells:
        value=cell.value
        if not isinstance(value,str) or cell.data_type=='f':
            continue
        tokens=set(re.split(r'[\s:：()（）\[\]]+',value.strip()))
        if unit_cell or value.strip() in aliases or re.search(r'(?:单位|unit)\s*[:：]|[（(]',value,re.I):
            found.update(normalize_unit(token) for token in tokens.intersection(aliases))
    if confirmation:
        confirmed = confirmation['unit']
        if unit is not None and unit != confirmed:
            raise ValueError('规划单位与用户明确确认的目标单位不一致')
        if len(found) == 1 and found != {confirmed}:
            raise BindingNeedsInput('用户确认的目标单位与工作簿声明冲突，请确认适用的单位及范围；本次尚未生成更新文件。')
        return confirmed
    if len(found)!=1 or (unit is not None and found!={unit}):
        raise BindingNeedsInput('目标工作簿未声明可唯一验证的金额单位。请确认应以什么单位更新；本次尚未生成更新文件。')
    return found.pop()
