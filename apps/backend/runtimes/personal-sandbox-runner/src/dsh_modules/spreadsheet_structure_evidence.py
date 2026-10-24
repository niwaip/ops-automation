"""Coordinate-preserving label bands across the used sheet, with explicit resource limits."""
import datetime
import re
import time
from .spreadsheet_units import AMOUNT_UNIT_FACTORS


def _period_value(value):
    if isinstance(value,(datetime.date,datetime.datetime)):
        return True
    text=str(value)
    return bool(re.fullmatch(r'\d{6}',text) and 1<=int(text[-2:])<=12)


def collect_label_bands(ws,deadline=None,cell_budget=200000):
    bands=[];units=[];scanned=0
    unit_tokens='|'.join(re.escape(unit) for unit in sorted(set(AMOUNT_UNIT_FACTORS)|{'hours','小时','h'},key=len,reverse=True))
    unit_pattern=re.compile(r'(?:单位|unit)\s*[:：]|[（(](?:'+unit_tokens+r')[)）]',re.I)
    for row in ws.iter_rows():
        if deadline is not None and time.monotonic()>=deadline:
            raise TimeoutError('Structure metadata deadline exceeded')
        scanned+=len(row)
        if scanned>cell_budget:
            return {'label_bands':bands,'unit_declarations':units,'metadata_scan_complete':False}
        filled=[c for c in row if c.value is not None]
        if not filled:
            continue
        for cell in filled:
            if isinstance(cell.value,str) and cell.data_type!='f' and unit_pattern.search(cell.value):
                units.append({'cell':cell.coordinate,'text':cell.value})
        if any(cell.data_type=='f' for cell in filled):
            continue
        if all(isinstance(cell.value,str) or _period_value(cell.value) for cell in filled):
            bands.append({'row':filled[0].row,'cells':{cell.coordinate:str(cell.value) for cell in filled}})
    return {'label_bands':bands,'unit_declarations':units,'metadata_scan_complete':True}
