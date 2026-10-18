"""Re-audit saved raw evidence; does not call a model or trust the runner's verdict alone."""
import collections
import hashlib
import json
import pathlib
import sys

root = pathlib.Path('docs/artifacts/reviews/contract-review-work-2026-10-16')
run = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'run-2026-10-16T15-38-32.384Z'
load = lambda p: json.loads(p.read_text())
records = load(run / 'summary.json')
ledger_path = (run / 'ledger-audit.json') if (run / 'ledger-audit.json').exists() else (root / 'ledger-audit.json')
ledger = load(ledger_path)
by_execution = collections.defaultdict(list)
for row in (ledger.get('calls') or []):
    by_execution[row['execution_id']].append(row)
audited = []
for record in records:
    case_dir = run / record['id']
    request = load(case_dir / 'request.json')
    events = load(case_dir / 'events.json')
    exec_file = case_dir / 'execution.json'
    detail = load(exec_file)['data'] if exec_file.exists() else None
    output = load(case_dir / 'output.json') if (case_dir / 'output.json').exists() else None
    calls = by_execution[record['executionId']] if record.get('executionId') else []
    # Raw trace/model provenance checks, independent from evidence.json assertions.
    checks = {
        'request_is_task_mode': request['config']['mode'] == 'task',
        'request_model_is_top_level_35b': request.get('modelId') == 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af',
        'trace_ends_done': events[-1]['event']['type'] == 'done',
        'execution_identity_matches': (detail['id'] == record['executionId']) if detail else (record['executionId'] is None),
        'request_digest_matches': hashlib.sha256(json.dumps(request, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest() == record['requestDigest'],
    }
    if output:
        indices = [c['clauseIndex'] for c in output['clauses']]
        checks['output_indices_unique'] = len(indices) == len(set(indices))
        checks['metrics_match_output'] = output['metrics']['totalClauses'] == len(indices)
        # Ledger references must cover precisely those clauses marked llmReviewed.
        expected = [c['clauseIndex'] for c in output['clauses'] if c.get('llmReviewed')]
        actual = [ref['clauseIndex'] for row in calls for ref in row['input_refs_json'] if 'clauseIndex' in ref]
        checks['ledger_exactly_covers_reviewed_indices'] = sorted(expected) == sorted(actual)
    audit_status = record['status']
    note = ''
    if record['id'] == 'C05' and records[3]['executionStatus'] != 'waiting_input':
        audit_status = 'blocked'
        note = 'C04 failed instead of waiting; this turn created a new execution, so waiting-input resume cannot be assessed.'
    audited.append({
        'caseId': record['id'], 'rawStatus': record['status'], 'auditStatus': audit_status,
        'executionId': record['executionId'], 'evidenceIntegrity': checks,
        'note': note, 'observedCalls': len(calls),
        'observedTokens': sum(c['input_tokens'] + c['output_tokens'] for c in calls) if calls else None,
        'modelIds': sorted(set(c['model_id'] for c in calls)),
        'failedAssertions': [a for a in record['assertions'] if not a['passed']],
    })
integrity_failures = [(c['caseId'], k) for c in audited for k, v in c['evidenceIntegrity'].items() if not v]
assert not integrity_failures, integrity_failures
summary = {
    'run': str(run), 'auditedCases': audited,
    'rawCounts': dict(collections.Counter(r['status'] for r in records)),
    'auditedCounts': dict(collections.Counter(r['auditStatus'] for r in audited)),
    'evidenceIntegrityFailures': integrity_failures,
    'observedModelIds': sorted(set(r['model_id'] for r in ledger['calls'])),
    'observedCallsIncludingUi': len(ledger['calls']),
    'observedTokensIncludingUi': sum(r['input_tokens'] + r['output_tokens'] for r in ledger['calls']),
    'tokenScope': 'Only rows present in ledger. Missing recognizer calls and timed-out calls are unknown, not zero.',
}
(root / 'audit-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
lines = ['| 用例 | 场景 | 控制面终态 | 耗时(s) | 审计判定 | 失败断言/说明 |', '|---|---|---|---:|---|---|']
for r, a in zip(records, audited):
    failures = '；'.join(x['name'] for x in a['failedAssertions']) or '无'
    if a['auditStatus'] == 'blocked':
        failures = 'C04 未进入等待态，续接前置不成立；实际创建新执行单'
    lines.append(f"| {r['id']} | {r['name']} | {r['executionStatus']} | {r['timing']['totalMs']/1000:.2f} | {a['auditStatus']} | {failures} |")
matrix_text = '\n'.join(lines) + '\n'
(root / 'case-matrix.md').write_text(matrix_text)
if run != root:
    (run / 'audit-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    (run / 'case-matrix.md').write_text(matrix_text)
print(json.dumps({k: v for k, v in summary.items() if k != 'auditedCases'}, ensure_ascii=False, indent=2))

