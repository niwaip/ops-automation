"""Grade observed clarification turns independently from calculation outcomes."""
import argparse
from collections import Counter
import json
from pathlib import Path
from grade_api import extract_primary, compare, stream_contract_complete
from interaction_policy import answer_hash, review_interaction


def main(evidence):
    review_path=evidence/'interaction-reviews.json'
    reviews=json.loads(review_path.read_text()) if review_path.exists() else []
    expected=json.loads((evidence/'dialogue-expected.json').read_text())
    latest={}
    for directory in sorted(evidence.glob('dialogue-api-*')):
        if not (directory/'runs.json').exists(): continue
        for run in json.loads((directory/'runs.json').read_text()): latest[run['id']]=(directory,run)
    cases=[]
    for cid,(directory,run) in sorted(latest.items()):
        path=directory/(cid+'.events.json')
        events=json.loads(path.read_text()) if path.exists() else []
        event=next((e for e in reversed(events) if e.get('type')=='result'),{})
        answer=event.get('content','')
        transport=run.get('done') and run.get('historyHttpStatus')==200
        stream_ok=bool(transport and stream_contract_complete(events))
        state_path=directory/(cid+'.evidence.json')
        state=json.loads(state_path.read_text()) if state_path.exists() else {}
        calls=event.get('data',{}).get('sandbox',{}).get('metrics',{}).get('toolCalls',[])
        native=any(c.get('name') in ('aggregate_spreadsheet','analyze_spreadsheet','bounded_summary_recovery') for c in calls)
        actual=None
        displayed='not_assessed'
        if cid in expected:
            actual,layout=extract_primary(answer,expected[cid])
            displayed='inconclusive' if actual is None else 'pass' if compare(actual,expected[cid]['rows'],False) else 'fail'
        interaction=review_interaction(cid,run['sessionId'],answer,reviews,stream_ok=stream_ok,displayed=displayed)
        row={'id':cid,'session_id':run['sessionId'],'api_dir':str(directory),'answer_sha256':answer_hash(answer),
             'stream_contract':'pass' if stream_ok else 'fail','primary_display':displayed,
             'displayed_rows':actual,'runtime_verified':state.get('verified'),
             'native_query_observed':native,
             'seconds':run['seconds'],'end_to_end':'inconclusive' if stream_ok else 'blocked',**interaction}
        if (row['interaction_outcome']=='grounded_complete_answer' and displayed=='pass'
                and stream_ok and native and state.get('verified') is True
                and run['fixtureSha256'] in (state.get('source_hashes') or {}).values()):
            row.update(end_to_end='pass',task_status='complete')
        cases.append(row)
    report={'turns':len(cases),'scenarios':len({r['session_id'] for r in cases}),
            'interaction_outcomes':dict(Counter(r['interaction_outcome'] for r in cases)),
            'task_status':dict(Counter(r['task_status'] for r in cases)),'cases':cases}
    (evidence/'dialogue-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='cases'},ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('evidence',type=Path)
    main(parser.parse_args().evidence)
