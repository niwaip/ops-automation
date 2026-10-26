"""Audit real-browser records against independent source controls.

Successful script execution verifies the audit, not a product pass.
"""
import json
from decimal import Decimal as D
from pathlib import Path

BASE=Path(__file__).resolve().parent
oracle=json.loads((BASE/'oracle.json').read_text())
results={};evidence={};metrics=[]
for p in sorted(BASE.glob('K*-request.json')):
    label=p.name.removesuffix('-request.json');q=json.loads(p.read_text())
    assert q['modelId']=='d13e0d30-87b9-4e87-b96a-d8b1b3cf78af'
    assert q['config']['mode']=='chat'
    stream=json.loads((BASE/f'{label}-stream.json').read_text())
    assert any(x['type']=='done' for x in stream)
    r=next(x for x in stream if x['type']=='result');results[label]=r
    e=json.loads((BASE/f'{label}-evidence.json').read_text());evidence[label]=e
    assert e['source_hashes']['工数实绩明细_20261020134124.xlsx']==oracle['source_sha256']
    s=r['data']['sandbox'];m=s['metrics']
    metrics.append({'case':label,'trace_id':r['traceId'],'duration_ms':s['durationMs'],
                    'tokens':m.get('tokens',{}).get('total_tokens'),
                    'tool_calls':m.get('toolCallsCount'),'llm_invocations':m.get('llmInvocations'),
                    'tools':[(x['name'],x['status']) for x in m.get('toolCalls',[])]})

def facts(label):
    return [f for r in evidence[label]['receipts'] if isinstance(r.get('data'),dict)
            for f in r['data'].get('facts',[])]
def tables(text):
    return [[s.strip().replace('**','') for s in line.strip().strip('|').split('|')]
            for line in text.splitlines() if line.startswith('|') and not set(line.strip())<=set('|-: ')]

summary_rows=tables(results['K01R']['content'])
assert summary_rows[1]==[oracle['summary']['hours'],oracle['summary']['amount_K']]
assert 'A5:R278' in results['K01R']['content'] and '274' in results['K01R']['content']
employee_rows=[row for row in tables(results['K03']['content']) if row and row[0] in {x['employee'] for x in oracle['employee_top5']}]
assert len(employee_rows)==5
for row,expect in zip(employee_rows,oracle['employee_top5']):
    assert row[0]==expect['employee'] and row[1]==expect['name']
    assert int(row[-3])==expect['count']
    assert D(row[-2])==D(expect['hours']) and D(row[-1])==D(expect['amount_K'])

# A correct zero does not establish that the requested audit was performed.
assert '重复行数' in results['K05']['content'] and '0 条' in results['K05']['content']
assert oracle['full_duplicate_rows']==[]
success=[r['data'] for r in evidence['K05']['receipts']
         if r['status']=='success' and isinstance(r.get('data'),dict)]
assert len(success)==1 and success[0]['plan']['where']=={'field':'客户名称','op':'is_blank'}
assert success[0]['plan']['metrics'][0]['op']=='count_rows'
assert success[0]['coverage'][0]['selected_rows']==oracle['missing_customer_rows']
assert evidence['K05']['verified'] is True

audit={'model_requests_verified':len(results),'summary_values_verified':2,'employee_top5_verified':5,
       'missing_customer_count_verified':32,'blockers':[{'case':'K05','type':'FALSE_AUDIT_COVERAGE',
       'claim':'18列完整重复行已核验为零','actual_execution':'Only customer-name-is-blank count was executed',
       'numeric_zero_matches_oracle':True,'runtime_verified':True}],
       'overall_reliability_acceptance':False,'metrics':metrics,
       'total_tokens':sum(m['tokens'] or 0 for m in metrics),
       'total_execution_ms':sum(m['duration_ms'] for m in metrics)}
output=BASE/'output-verification.json'
if output.exists():
    audit['outputs']=json.loads(output.read_text())
history=BASE/'history-after-refresh.json'
if history.exists():
    audit['history_messages']=len(json.loads(history.read_text())['messages'])
(BASE/'verification.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in audit.items() if k!='metrics'},ensure_ascii=False))
