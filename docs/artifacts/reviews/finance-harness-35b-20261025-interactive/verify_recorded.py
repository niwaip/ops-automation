"""Independent verification of recorded real-browser turns; no model calls.

An assertion passing means the audit agrees with the evidence, not that the
product passed: known wrong delivery is explicitly recorded as a blocker.
"""
import hashlib
import json
from decimal import Decimal as D
from pathlib import Path

import openpyxl
from verify_oracle import months, number, golden, summary, close

BASE = Path(__file__).resolve().parent


def evidence(n):
    obj = json.loads((BASE / f'T{n:02}-evidence.json').read_text())
    assert obj['source_hashes']['AI能力测试_财务报表.xlsx'] == summary['source_sha256']
    return obj


def result(n):
    stream = json.loads((BASE / f'T{n:02}-stream.json').read_text())
    assert any(e['type'] == 'done' for e in stream)
    return next(e for e in stream if e['type'] == 'result')


checks = {'oracle': summary, 'blockers': []}
assert not evidence(1)['verified']
assert '尚未通过' in result(1)['content']
assert not evidence(3)['verified']
assert '重试' in result(3)['content']
checks['explicit_failure_handling'] = True

e = evidence(2)
facts = [f for r in e['receipts'] for f in (r.get('data') or {}).get('facts', [])]
for ident in ('revenue', 'net_profit'):
    f = next(f for f in facts if f['id'] == ident)
    close(f['value'], golden[ident])
    assert f['unit'] == '千元'
    assert f['source_cells'] == [f"月度经营!{'B16' if ident == 'revenue' else 'N16'}"]
text = result(2)['content'].split('<details>')[0]
assert '`B10`' in text and '`B15`' in text
assert e['verified']
checks['blockers'].append({'turn': 'T02', 'type': 'WRONG_SOURCE_BINDING',
    'actual': ['B10', 'B15'], 'expected': ['月度经营!B16', '月度经营!N16'],
    'amounts_correct': True, 'runtime_verified': True})
assert json.loads((BASE / 'source-binding-probe.json').read_text())['wrong_source_cells_accepted']

text = result(4)['content']
assert '28' in text and 'V2026-0025' in text and '暂不检查' in text
assert '1,475' in text and '千元' in text
rows = [r for r in evidence(4)['receipts'] if any(
    x.get('凭证号') == 'V2026-0025' for x in (r.get('data') or {}).get('rows', []))]
assert rows
checks['reduced_scope_retry_verified'] = True
checks['original_five_rule_task_complete'] = False

eqs = next(r['data']['checks'] for r in evidence(5)['receipts'] if (r.get('data') or {}).get('checks'))
for actual, expected in zip(eqs, summary['equations']):
    for a, b in [('left', 'left'), ('right', 'right'), ('residual', 'difference')]:
        close(actual[a], D(expected[b]))
    assert not actual['passed'] and actual['unit'] == '千元'
checks['equations_verified'] = len(eqs)

count = 0
for n in (7, 8):
    data = next(r['data'] for r in evidence(n)['receipts'] if (r.get('data') or {}).get('kind') == 'column_comparison')
    assert data['scope']['coverage_verified'] and data['scope']['row_count'] == 12
    for metric in data['evaluated']:
        assert len(metric['rows']) == 12
        for row in metric['rows']:
            m = months[row['group']]
            revenue = metric['label'] == '营业收入'
            budget = number('预算对比', f"{'B' if revenue else 'E'}{m['row']}")
            actual = m['revenue' if revenue else 'net']
            for key, target in {'left': actual, 'right': budget, 'difference': actual-budget,
                                'relative_difference': (actual-budget)/abs(budget)}.items():
                close(row['exact'][key], target)
            count += 1
    for metric in data['results']:
        assert metric['matches'][0]['group'] == ('12月' if metric['label'] == '营业收入' else '7月')
checks['monthly_comparison_rows_verified'] = count

output = BASE / 'E2E_finance_interactive_20261025.xlsx'
if output.exists():
    wb = openpyxl.load_workbook(output, data_only=True)
    expected = {'营业收入': ('revenue', 'B4'), '毛利': ('gross_profit', 'B6'),
                '营业利润': ('operating_profit', 'B10'), '净利润': ('net_profit', 'B14')}
    seen = set()
    mismatches = []
    for ws in wb:
        for row in ws.values:
            if row[0] in expected:
                metric, cell = expected[row[0]]
                assert isinstance(row[1], (float, int)) and not isinstance(row[1], bool)
                if abs(D(str(row[1])) - golden[metric]) > D('0.000001'):
                    mismatches.append({'metric': row[0], 'actual': row[1], 'expected': str(golden[metric])})
                assert row[2] == '千元' and cell in str(row[3])
                seen.add(row[0])
            assert str(row[0]).strip() not in ('合计', '总计'), 'Independent KPIs must not be summed'
    assert seen == set(expected)
    checks['download_metrics_verified'] = len(seen) - len(mismatches)
    checks['download_metrics_checked'] = len(seen)
    if mismatches:
        checks['blockers'].append({'turn': 'T09', 'type': 'WRONG_FINANCIAL_DATA_AND_FALSE_SUCCESS',
            'mismatches': mismatches, 'output_formula_count': 0,
            'note': 'Zero formula errors in a literal-only workbook does not verify source financial values'})
    checks['download_sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
else:
    checks['download_metrics_verified'] = 0
    checks['download_state'] = 'No artifact: assess explicit failure/clarification separately'

history = BASE / 'history-after-refresh.json'
if history.exists():
    checks['history_messages_after_refresh'] = len(json.loads(history.read_text())['messages'])
checks['overall_data_acceptance'] = not checks['blockers']
(BASE / 'verification.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2, default=str))
print(json.dumps(checks, ensure_ascii=False, default=str))
