"""Read-only numeric verification of the observed W06 workbook layout."""
import hashlib
import json
from pathlib import Path
from decimal import Decimal
import sys
import openpyxl

root = Path(sys.argv[1])
expected = json.loads((root / 'expected.json').read_text())['cases'][5]
source = root / 'WBS成本中心汇总.xlsx'
wb = openpyxl.load_workbook(source, data_only=True)
formulas = openpyxl.load_workbook(source, data_only=False)
sheet = wb['成本中心工数汇总']
rows = list(sheet.values)
actual = {r[1]: {'count': r[2], 'amount_k': str(r[3])} for r in rows[4:14]}
assert set(actual) == set(expected['expected'])
for key, value in actual.items():
    assert value['count'] == expected['expected'][key]['count'], key
    assert Decimal(value['amount_k']) == Decimal(expected['expected'][key]['amount_k']), key
assert sheet['C15'].value == expected['total']['count']
assert Decimal(str(sheet['D15'].value)) == Decimal(expected['total']['amount_k'])
formula_checks = []
for row in formulas[sheet.title]:
    for cell in row:
        if cell.data_type == 'f':
            cached = sheet[cell.coordinate]
            assert cached.value is not None and cached.data_type != 'e'
            formula_checks.append({'cell': cell.coordinate, 'formula': cell.value, 'cached': cached.value})
assert abs(sum(sheet[f'E{r}'].value for r in range(5, 15)) - 1) < 1e-12
result = {'file_verdict': 'PASS', 'groups': actual, 'count': sheet['C15'].value,
          'amount_k': sheet['D15'].value, 'formulas': formula_checks,
          'duplicate_identical': source.read_bytes() == (root / '名WBS成本中心汇总.xlsx').read_bytes(),
          'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
(root / 'export-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k,v in result.items() if k not in ('groups','formulas')}, ensure_ascii=False))
wb.close()
formulas.close()
