"""Check business tables against the independent oracle, never SSE done alone."""
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import re
import sys


def number(value):
    value = value.replace('*', '').replace(',', '').replace('`', '').strip()
    return Decimal(value)


def equal_display(actual, expected):
    precision = max(0, -actual.as_tuple().exponent)
    return actual == Decimal(expected).quantize(Decimal(1).scaleb(-precision), rounding=ROUND_HALF_UP)


def check(case, text):
    # Source summaries in collapsed details must not substitute for an answer.
    text = text.split('<details>')[0]
    tables = []
    current = []
    for line in text.splitlines() + ['']:
        if line.strip().startswith('|'):
            current.append([c.strip().replace('**', '') for c in line.strip().strip('|').split('|')])
        elif current:
            tables.append(current)
            current = []
    failures = []
    for table in tables:
        header = table[0]
        amount = next((i for i,v in enumerate(header) if '金额' in v), None)
        if amount is None:
            continue
        count = next((i for i,v in enumerate(header) if any(s in v for s in ('条数','记录数','笔数'))), None)
        hours = next((i for i,v in enumerate(header) if '工数' in v or '小时' in v), None)
        rows = {r[0].replace('`', '').strip(): r for r in table[2:] if r}
        if not set(case['expected']).issubset(rows):
            continue
        extra = [key for key in rows if re.fullmatch(r'FC\d{5}|[A-Z]{2}', key) and key not in case['expected']]
        if extra:
            failures.append(f'Unexpected groups: {extra}')
        for key, expected in case['expected'].items():
            row = rows[key]
            try:
                actual_amount = number(row[amount])
                if -actual_amount.as_tuple().exponent < 2 or not equal_display(actual_amount, expected['amount_k']):
                    failures.append(f'{key}: amount mismatch')
                if count is not None and number(row[count]) != expected['count']:
                    failures.append(f'{key}: count mismatch')
                if case['id'] in ('W03',) and count is None:
                    failures.append(f'{key}: missing count')
                if case['id'] == 'W04' and (hours is None or not equal_display(number(row[hours]), expected['hours'])):
                    failures.append(f'{key}: hours missing/mismatch')
            except (IndexError, ArithmeticError):
                failures.append(f'{key}: invalid numeric cell')
        if case['id'] in ('W02', 'W03', 'W04'):
            total = next((r for k,r in rows.items() if k in ('总计','合计','总和')), None)
            if total is None or not equal_display(number(total[amount]), case['total']['amount_k']):
                failures.append('Missing/mismatched total amount')
        return failures
    return ['No complete business summary table in final answer']


if __name__ == '__main__':
    root = Path(sys.argv[1])
    cases = json.loads((root / 'expected.json').read_text())['cases']
    runs = {r['id']: r for r in json.loads((root / 'runs.json').read_text())}
    verdicts = []
    for case in cases:
        if case['id'] not in runs:
            verdicts.append({'id': case['id'], 'verdict': 'NOT_RUN'})
            continue
        run = runs[case['id']]
        if case['id'] in ('W05', 'W06'):
            verdicts.append({'id': case['id'], 'verdict': 'MANUAL_REVIEW_REQUIRED'})
            continue
        failures = check(case, (root / f"{case['id']}.answer.txt").read_text())
        if not run['done'] or run['errors'] or run.get('transportError'):
            failures.append('Transport/stream failure')
        verdicts.append({'id': case['id'], 'verdict': 'FAIL' if failures else 'PASS', 'failures': failures})
    (root / 'table-verdicts.json').write_text(json.dumps(verdicts, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(verdicts, ensure_ascii=False, indent=2))
    sys.exit(1 if any(v['verdict'] != 'PASS' for v in verdicts) else 0)
