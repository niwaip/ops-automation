import collections,hashlib,json,pathlib,re
out=pathlib.Path(__file__).resolve().parent
root=out.parent/'contract-review-work-2026-10-16'
runs=[root/'run-2026-10-17T03-44-43.260Z',root/'run-2026-10-17T03-48-59.508Z']
load=lambda p:json.loads(p.read_text())
ledger=load(out/'live-ledger.json');by=collections.defaultdict(list)
for row in ledger['calls']:by[row['execution_id']].append(row)
rows=[];fingerprints=[]
for run in runs:
 env=load(run/'environment.json');fp={f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==d for f,d in env['sourceDigests'].items()};assert all(fp.values());fingerprints.append({'run':str(run),'checks':fp})
 for record in load(run/'summary.json'):
  p=run/record['id'];req=load(p/'request.json');ev=load(p/'events.json');o=load(p/'output.json');detail=load(p/'execution.json')['data'];ac=load(p/'artifact-check.json');calls=by[record['executionId']]
  expected=[c['clauseIndex']for c in o['clauses']if c.get('llmReviewed')];actual=[r['clauseIndex']for c in calls for r in c['input_refs_json']if'clauseIndex'in r]
  checks={'request_sha':hashlib.sha256(json.dumps(req,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()==record['requestDigest'],'task_mode':req['config']['mode']=='task','requested_model':req['modelId']=='d13e0d30-87b9-4e87-b96a-d8b1b3cf78af','execution_id':detail['id']==record['executionId'],'sse_done':ev[-1]['event']['type']=='done','actual_model':bool(calls)and all(c['model_id']=='qwen36-35b-a3b'for c in calls),'ledger_bijection':sorted(expected)==sorted(actual),'artifact_sha':hashlib.sha256((p/'artifact.html').read_bytes()).hexdigest()==ac['sha256'],'score_range':0<=o['metrics']['healthScore']<=100}
  assert all(checks.values()),(record['id'],checks)
  rows.append({'id':record['id'],'executionId':record['executionId'],'declaredStatus':record['status'],'checks':checks,'metrics':o['metrics'],'myPosition':o['myPosition'],'totalMs':record['timing']['totalMs'],'calls':len(calls)})
fault=load(out/'fault-jest.json');tests=[{'name':t['title'],'status':t['status']}for r in fault['testResults']for t in r['assertionResults']]
render=load(out/'degraded-render.json');o=render['data']['output'];summary=o['summary'];html=o['htmlReport'];checks={'http_ok':render['status']==200,'summary_warning':'不可作完整合规评价'in summary and '降级'in summary,'no_healthy_claim':'合规良好'not in summary,'warning_details':all(w in summary for w in render['request']['input']['metrics']['warnings']),'html_warning_banner':'大模型语义审查部分降级警示 (Review Degraded Warning)'in html};assert all(checks.values())
d={'runs':[str(p)for p in runs],'verifiedCases':rows,'sourceFingerprints':fingerprints,'uniquePlans':len(ledger['plans']),'uniqueModelCalls':len(ledger['calls']),'actualModels':dict(collections.Counter(c['model_id']for c in ledger['calls'])),'recordedTokens':{'input':sum(c['input_tokens']for c in ledger['calls']),'output':sum(c['output_tokens']for c in ledger['calls'])},'faultTests':tests,'renderVerification':checks}
(out/'independent-verification.json').write_text(json.dumps(d,ensure_ascii=False,indent=2))
print(json.dumps({'verifiedE2e':len(rows),'plans':d['uniquePlans'],'calls':d['uniqueModelCalls'],'models':d['actualModels'],'faultResults':dict(collections.Counter(t['status']for t in tests)),'render':checks},ensure_ascii=False,indent=2))
# Keep log evidence scoped to the retest windows; later shared-stack activity is unrelated.
p=out/'runtime-excerpts.log';ls=p.read_text().splitlines();p.write_text('\n'.join(l for l in ls if '2026-10-17T03:40:'<=l.split(' | ',1)[-1]<='2026-10-17T03:58:03Z' if ' | 'in l)+'\n')
