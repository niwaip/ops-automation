import json,pathlib,hashlib,collections,re
out=pathlib.Path(__file__).resolve().parent
run=out.parent/'contract-review-work-2026-10-16/run-2026-10-17T02-31-02.250Z'
load=lambda p:json.loads(p.read_text())
records=load(run/'summary.json'); live=load(out/'live-ledger.json');saved=load(run/'ledger-audit.json')
assert live==saved,'Live ledger differs from saved evidence'
calls=live['calls'];by=collections.defaultdict(list)
for c in calls:by[c['execution_id']].append(c)
rows=[]
for r in records:
 p=run/r['id'];request=load(p/'request.json');events=load(p/'events.json');detail=load(p/'execution.json')['data']if(p/'execution.json').exists()else None;o=load(p/'output.json')if(p/'output.json').exists()else None
 checks={'task_mode':request['config']['mode']=='task','requested_35b':request['modelId']=='d13e0d30-87b9-4e87-b96a-d8b1b3cf78af','request_sha':hashlib.sha256(json.dumps(request,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()==r['requestDigest'],'sse_done':events[-1]['event']['type']=='done'}
 if detail:checks['execution_id']=detail['id']==r['executionId']
 if o:
  expected=[c['clauseIndex']for c in o['clauses']if c.get('llmReviewed')];actual=[x['clauseIndex']for c in by[r['executionId']]for x in c['input_refs_json']if'clauseIndex'in x]
  checks['exact_ledger_coverage']=sorted(expected)==sorted(actual)
  checks['actual_35b']=all(c['model_id']=='qwen36-35b-a3b'for c in by[r['executionId']]) and bool(actual)
  ac=load(p/'artifact-check.json');checks['artifact_sha']=hashlib.sha256((p/'artifact.html').read_bytes()).hexdigest()==ac['sha256']
 assert all(checks.values()),(r['id'],checks)
 rows.append({'id':r['id'],'executionId':r['executionId'],'declaredStatus':r['status'],'integrity':checks,'score':o['metrics']['healthScore']if o else None,'scoreWithinRange':0<=o['metrics']['healthScore']<=100 if o else None,'durationMs':r['timing']['totalMs'],'modelCalls':len(by[r['executionId']])if o else None,'myPosition':o.get('myPosition')if o else None})
env=load(run/'environment.json');fingerprints={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in env['sourceDigests'].items()};assert all(fingerprints.values())
fault=load(out/'fault-jest.json');tests=[a for t in fault['testResults']for a in t['assertionResults']]
render=load(out/'degraded-render.json');metrics=render['request']['input']['metrics'];summary=render['data']['output']['summary']
d={'run':str(run),'declaredPassed':sum(r['status']=='passed'for r in records),'rawEvidenceIntegrityPassed':len(rows),'rows':rows,'sourceDigestsUnchangedSinceRun':fingerprints,'uniqueLedgerCalls':len(calls),'uniquePlans':len(live['plans']),'models':dict(collections.Counter(c['model_id']for c in calls)),'purposes':dict(collections.Counter(c['purpose']for c in calls)),'observedTokens':{'input':sum(c['input_tokens']for c in calls),'output':sum(c['output_tokens']for c in calls)},'faultTests':[{'title':a['title'],'status':a['status']}for a in tests],'degradedRender':{'status':render['status'],'llmReviewedCount':metrics['llmReviewedCount'],'totalClauses':metrics['totalClauses'],'isDegraded':metrics['isDegraded'],'showsHealthy100': '100 分 / 100 分' in summary and '合规良好' in summary,'warningInSummary':any(w in summary for w in metrics['warnings'])}}
(out/'independent-verification.json').write_text(json.dumps(d,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in d.items()if k not in ['rows','faultTests','sourceDigestsUnchangedSinceRun']},ensure_ascii=False,indent=2))
