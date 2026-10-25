"""Verify live-run evidence independently; successful audit may find product failures."""
import hashlib
import json
from decimal import Decimal as D
from pathlib import Path

import openpyxl
from verify_oracle import golden, months, number, summary, close

BASE = Path(__file__).resolve().parent
evidence = {}
results = {}
for p in sorted(BASE.glob('T*-request.json')):
    n = p.name.split('-')[0]
    request = json.loads(p.read_text())
    assert request['modelId'] == 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af'
    assert request['config']['mode'] == 'chat'
    stream = json.loads((BASE / f'{n}-stream.json').read_text())
    assert any(e['type'] == 'done' for e in stream)
    results[n] = next(e for e in stream if e['type'] == 'result')
    evidence[n] = json.loads((BASE / f'{n}-evidence.json').read_text())
    assert evidence[n]['source_hashes']['AI能力测试_财务报表.xlsx'] == summary['source_sha256']

audit = {'overall_data_acceptance': False, 'requests_verified': len(results), 'blockers': [],
         'source_hash': summary['source_sha256']}
facts = [f for r in evidence['T02']['receipts'] if isinstance(r.get('data'), dict)
         for f in r['data'].get('facts', [])]
bad = []
for ident in ('revenue', 'net_profit'):
    f = next(f for f in facts if f['id'] == ident)
    close(f['value'], golden['revenue'] + golden['net_profit'])
    assert D(f['value']) != golden[ident]
    assert set(f['source_cells']) == {'利润表!B4', '利润表!B14'}
    bad.append({'metric': ident, 'actual': f['value'], 'expected': str(golden[ident])})
assert evidence['T02']['verified']
assert '140,058.3' in results['T02']['content']
audit['blockers'].append({'turn': 'T02', 'type': 'WRONG_METRIC_AGGREGATION_ACCEPTED', 'details': bad})

for n in ('T01', 'T03', 'T06'):
    assert '尚未通过' in results[n]['content'] and '重试' in results[n]['content']
audit['safe_failure_turns'] = ['T01', 'T03', 'T06']
audit['metadata_inconsistencies'] = [n for n in audit['safe_failure_turns'] if evidence[n]['verified']]
assert 'V2026-0025' in results['T04']['content'] and '28' in results['T04']['content']
assert '本轮未检查' in results['T04']['content']
audit['reduced_scope_retry_verified'] = True

eqs = next(r['data']['checks'] for r in evidence['T05']['receipts']
           if isinstance(r.get('data'), dict) and r['data'].get('checks'))
for actual, expected in zip(eqs, summary['equations']):
    for a, b in [('left', 'left'), ('right', 'right'), ('residual', 'difference')]:
        close(actual[a], D(expected[b]))
    assert actual['unit'] == '千元' and not actual['passed']
audit['equations_verified'] = len(eqs)

count = 0
for n in ('T07', 'T08'):
    if n not in evidence:
        continue
    data = next(r['data'] for r in evidence[n]['receipts']
                if isinstance(r.get('data'), dict) and r['data'].get('kind') == 'column_comparison')
    assert data['scope']['coverage_verified'] and data['scope']['row_count'] == 12
    for metric in data['evaluated']:
        assert len(metric['rows']) == 12
        for row in metric['rows']:
            m = months[row['group']]
            is_rev = metric['label'] == '营业收入'
            actual = m['revenue' if is_rev else 'net']
            budget = number('预算对比', f"{'B' if is_rev else 'E'}{m['row']}")
            for key, expected in {'left': actual, 'right': budget, 'difference': actual-budget,
                                  'relative_difference': (actual-budget)/abs(budget)}.items():
                close(row['exact'][key], expected)
            count += 1
    for metric in data['results']:
        assert metric['matches'][0]['group'] == ('12月' if metric['label'] == '营业收入' else '7月')
audit['monthly_comparison_rows_verified'] = count
audit['old_wrong_source_now_rejected'] = not json.loads((BASE/'old-source-regression-probe.json').read_text())['old_wrong_source_accepted']

output = BASE/'E2E_finance_interactive_r2_20261025.xlsx'
if output.exists():
    wb = openpyxl.load_workbook(output, data_only=True)
    targets = {'营业收入': ('revenue', 'B4'), '毛利': ('gross_profit', 'B6'),
               '营业利润': ('operating_profit', 'B10'), '净利润': ('net_profit', 'B14')}
    seen = set()
    mismatches = []
    for ws in wb:
        for row in ws.values:
            if not row or row[0] not in targets:
                continue
            ident, cell = targets[row[0]]
            assert isinstance(row[1], (int, float)) and not isinstance(row[1], bool)
            if abs(D(str(row[1])) - golden[ident]) > D('0.000001'):
                mismatches.append({'metric': row[0], 'actual': row[1], 'expected': str(golden[ident])})
            assert row[2] == '千元' and cell in str(row[3])
            seen.add(row[0])
    assert seen == set(targets)
    audit['download_metrics_checked'] = len(seen)
    audit['download_metrics_correct'] = len(seen)-len(mismatches)
    audit['download_sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
    if mismatches:
        audit['blockers'].append({'type': 'WRONG_FINANCIAL_FILE', 'details': mismatches})
else:
    audit['download_state'] = 'No downloadable artifact; classify final safe failure/clarification separately'

history = BASE/'history-after-refresh.json'
if history.exists():
    audit['history_messages'] = len(json.loads(history.read_text())['messages'])
(BASE/'verification.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2))
print(json.dumps(audit, ensure_ascii=False))
