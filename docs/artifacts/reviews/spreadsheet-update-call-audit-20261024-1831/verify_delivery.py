"""Read-only, independent audit of the captured inputs and actual delivery.

Run with the bundled Python runtime. Does not import the application or save workbooks.
"""
import datetime
import hashlib
import json
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils.datetime import to_excel

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalized(value, epoch):
    if isinstance(value, (datetime.datetime, datetime.date)):
        return to_excel(value, epoch)
    return value


def same_value(left, right, epoch):
    left, right = normalized(left, epoch), normalized(right, epoch)
    if isinstance(left, (float, int)) and isinstance(right, (float, int)):
        return abs(Decimal(str(left)) - Decimal(str(right))) <= Decimal('0.000000001')
    return left == right


def compare_sheet(source, output, allowed=()):
    semantic_diffs, storage_diffs, font_changes = [], [], []
    formula_count = 0
    for row in source:
        for cell in row:
            other = output[cell.coordinate]
            if cell.data_type == 'f':
                formula_count += 1
            if cell.value != other.value:
                storage_diffs.append(cell.coordinate)
            if cell.coordinate not in allowed and not same_value(cell.value, other.value, source.parent.epoch):
                semantic_diffs.append({'cell': cell.coordinate, 'before': str(cell.value), 'after': str(other.value)})
            if cell.value is not None and cell.font.name != other.font.name:
                font_changes.append({'cell': cell.coordinate, 'before': cell.font.name, 'after': other.font.name})
    return {
        'unexpected_value_or_formula_changes': semantic_diffs,
        'storage_value_differences': storage_diffs,
        'formula_count': formula_count,
        'nonempty_cell_font_name_changes': font_changes,
        'merged_ranges_preserved': {str(x) for x in source.merged_cells.ranges} == {str(x) for x in output.merged_cells.ranges},
    }


def main():
    target = ROOT / '工数3Q预实管理.xlsx'
    detail = ROOT / '工数实绩明细_20261020134124.xlsx'
    delivery = ROOT / '工数3Q预实管理_1023_14.xlsx'
    evidence = json.loads((ROOT / 'evidence.json').read_text())
    receipt = json.loads((ROOT / 'run_fdc43e9cb329/receipt.json').read_text())
    plan = json.loads((ROOT / 'run_fdc43e9cb329/plan.json').read_text())
    base = load_workbook(target, data_only=False)
    output = load_workbook(delivery, data_only=False)
    cached = load_workbook(delivery, data_only=True)
    source = load_workbook(detail, data_only=True)
    ws = source['工数实绩明细']
    headers = {c.value: c.column for c in ws[4] if c.value is not None}
    totals, records, directness = defaultdict(Decimal), Counter(), Counter()
    excluded = []
    for row in range(5, ws.max_row + 1):
        get = lambda name: ws.cell(row, headers[name]).value
        if str(get('工数年月')) != '202610' or get('有偿无偿') not in ('有偿', '无偿'):
            excluded.append(row)
            continue
        category, code = get('有偿无偿'), get('部门编号')
        totals[category, code] += Decimal(str(get('金额(K)')))
        records[category, code] += 1
        directness[category, get('直接间接')] += 1

    comparisons, expected_cells, missing_keys = [], {}, {}
    for category, bounds in [('有偿', (5, 18)), ('无偿', (26, 39))]:
        keys = {base['1019'].cell(row, 2).value: row for row in range(bounds[0], bounds[1] + 1)
                if str(base['1019'].cell(row, 2).value).startswith('FC')}
        missing_keys[category] = sorted(code for code in keys if (category, code) not in totals)
        for (cat, code), value in totals.items():
            if cat != category:
                continue
            coordinate = f'C{keys[code]}'
            expected_cells[coordinate] = value
            actual = output['1023'][coordinate].value
            comparisons.append({'section': cat, 'code': code, 'coordinate': coordinate,
                                'records': records[cat, code], 'expected': str(value), 'actual': str(actual),
                                'matches': abs(Decimal(str(actual)) - value) <= Decimal('0.000000001'),
                                'changed_from_source': not same_value(base['1019'][coordinate].value, actual, base.epoch)})
    formula_errors, missing_caches, formula_count = [], [], 0
    for sheet in output:
        for row in sheet:
            for cell in row:
                value = cached[sheet.title][cell.coordinate]
                if cell.data_type == 'f':
                    formula_count += 1
                    if value.value is None:
                        missing_caches.append(f'{sheet.title}!{cell.coordinate}')
                if value.data_type == 'e':
                    formula_errors.append({'cell': f'{sheet.title}!{cell.coordinate}', 'value': value.value})
    original_check = compare_sheet(base['1019'], output['1019'])
    new_check = compare_sheet(base['1019'], output['1023'], expected_cells)
    result = {
        'method': 'Independent Decimal aggregation and openpyxl readback; no application imports, model calls or workbook writes',
        'hashes': {p.name: digest(p) for p in (target, detail, delivery)},
        'input_hashes_match_execution_evidence': all(digest(ROOT / name) == sha for name, sha in evidence['source_hashes'].items()),
        'output_hash_matches_published_receipt': digest(delivery) == receipt['output_hash'],
        'sheet_names': output.sheetnames,
        'detail_records': sum(records.values()),
        'detail_rows_excluded_by_period_and_category': excluded,
        'category_totals': {category: str(sum((v for (cat, _), v in totals.items() if cat == category), Decimal(0))) for category in ('有偿', '无偿')},
        'category_record_counts': {category: sum(n for (cat, _), n in records.items() if cat == category) for category in ('有偿', '无偿')},
        'category_directness': [{'category': cat, 'directness': direct, 'count': count} for (cat, direct), count in directness.items()],
        'cell_checks': comparisons,
        'actual_changed_target_values': sum(x['changed_from_source'] for x in comparisons),
        'all_target_keys_without_source': missing_keys,
        'retained_unmatched_values': {
            category: {code: output['1023'].cell(next(row for row in range(5 if category == '有偿' else 26, 19 if category == '有偿' else 40) if base['1019'].cell(row, 2).value == code), 3).value
                       for code in keys}
            for category, keys in missing_keys.items()
        },
        'plan_warning_missing_keys': {category: sorted(set(keys) - set(next(x['department_rows'] for x in plan['semantic_bindings']['region_specs'] if x['region_id'] == category))) for category, keys in missing_keys.items()},
        'historical_sheet_check': original_check,
        'new_sheet_check': new_check,
        'date_headers': {coordinate: str(output['1023'][coordinate].value) for coordinate in ('C2', 'C23')},
        'formula_count': formula_count, 'missing_formula_caches': missing_caches, 'cached_errors': formula_errors,
        'cached_totals': {coordinate: cached['1023'][coordinate].value for coordinate in ('C19', 'C40')},
        'receipt_requirement_coverages': receipt['requirement_coverages'],
        'receipt_evidence_refs': receipt['evidence_refs'],
    }
    result['numeric_and_formula_checks_pass'] = (
        result['input_hashes_match_execution_evidence'] and result['output_hash_matches_published_receipt']
        and all(x['matches'] for x in comparisons) and not formula_errors and not missing_caches
        and not original_check['unexpected_value_or_formula_changes']
        and not new_check['unexpected_value_or_formula_changes'])
    (ROOT / 'independent-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k not in ('cell_checks', 'historical_sheet_check', 'new_sheet_check')}, ensure_ascii=False, indent=2))
    print('font changes: historical', len(original_check['nonempty_cell_font_name_changes']), 'new', len(new_check['nonempty_cell_font_name_changes']))
    assert result['numeric_and_formula_checks_pass']


if __name__ == '__main__':
    main()
