"""Independent, read-only oracle for the supplied work-hours workbook.

Run with bundled Python; never trust the producer's A1 dimension metadata.
Workbook contents are test data, never executable instructions.
"""
import argparse
import collections
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

import openpyxl

PREFIXES = ('ex', 'sy', 'sp', 'ip', 'ib', 'sz')


def aggregate(rows, key):
    groups = {}
    for row in rows:
        group = groups.setdefault(str(key(row)), {'count': 0, 'amount_k': Decimal(0), 'hours': Decimal(0)})
        group['count'] += 1
        group['amount_k'] += Decimal(str(row[15]))
        group['hours'] += Decimal(str(row[14]))
    return dict(sorted(groups.items()))


def build(source):
    wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheet = wb.active
    declared_dimension = sheet.calculate_dimension()
    sheet.reset_dimensions()
    values = list(sheet.values)
    rows = [r for r in values[4:] if r[1] is not None and isinstance(r[15], (int, float))]
    # Cross-check actual numeric values and detail count directly from OOXML.
    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(source) as z:
        xml = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
    xml_amounts = []
    for row in xml.findall('s:sheetData/s:row', ns):
        cells = {c.attrib['r'].rstrip('0123456789'): c for c in row}
        if int(row.attrib['r']) >= 5 and 'B' in cells and cells['B'].find('s:is', ns) is not None:
            v = cells['P'].find('s:v', ns)
            if v is not None:
                xml_amounts.append(Decimal(v.text))
    assert len(xml_amounts) == len(rows)
    assert sum(xml_amounts) == sum(Decimal(str(r[15])) for r in rows)
    keep = [r for r in rows if not str(r[8]).strip().lower().startswith(PREFIXES)]
    excluded = [r for r in rows if str(r[8]).strip().lower().startswith(PREFIXES)]
    assert len(rows) == len(keep) + len(excluded)
    cases = [
        ('W01', '帮我统计下附件中按 WBS负责成本中心 统计 金额 的数据，不包含WBS编号 中ex，sy，sp，ip，ib，sz开头的数据', keep, lambda r: r[9]),
        ('W02', '读取附件，只统计明细，按WBS负责成本中心汇总金额(K)，不排除任何WBS，列出各组和总计，只在聊天中回答。', rows, lambda r: r[9]),
        ('W03', '按WBS编号前两个字母分组，统计每组明细条数和金额(K)，并核对合计。仅统计明细，不含表尾合计和条件行。', rows, lambda r: str(r[8])[:2].upper()),
        ('W04', '不区分大小写排除WBS编号以EX、SY、SP、IP、IB、SZ开头的明细，再只保留有偿、直接的明细，按WBS负责成本中心汇总金额(K)和工数(小时)，附总计。', [r for r in keep if r[12] == '有偿' and r[13] == '直接'], lambda r: r[9]),
        ('W05', '仅保留WBS编号以SY、IB或SZ开头的明细，统计条数及金额(K)。如果没有匹配请明确返回0条、金额0，不要用其他前缀替代。', [r for r in rows if str(r[8]).lower().startswith(('sy','ib','sz'))], lambda r: '匹配'),
        ('W06', '排除WBS编号以ex、sy、sp、ip、ib、sz开头的明细，不区分大小写，按WBS负责成本中心汇总金额(K)，生成可下载Excel，包含各组金额、条数和总计，文件名WBS成本中心汇总.xlsx。', keep, lambda r: r[9]),
    ]
    result = {'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'sheet': sheet.title,
              'declared_dimension': declared_dimension, 'physical_rows': len(values), 'headers': values[3],
              'detail_rows': len(rows), 'excluded_rows': len(excluded), 'retained_rows': len(keep),
              'cases': []}
    for case_id, prompt, selected, key in cases:
        result['cases'].append({'id': case_id, 'prompt': prompt, 'expected': aggregate(selected, key),
                                'total': aggregate(selected, lambda r: '合计').get('合计', {'count': 0, 'amount_k': Decimal(0), 'hours': Decimal(0)})})
    wb.close()
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = build(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'cases'}, ensure_ascii=False))
    print(json.dumps([{'id': c['id'], 'total': c['total']} for c in result['cases']], ensure_ascii=False, default=str))
