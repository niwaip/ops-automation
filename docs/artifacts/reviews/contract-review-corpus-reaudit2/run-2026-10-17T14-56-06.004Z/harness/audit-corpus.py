"""Independently audit saved E2E evidence, including legitimate failed executions."""
import collections,csv,datetime,hashlib,json,os,re,statistics,sys
from pathlib import Path
run=Path(sys.argv[1]);root=Path(os.environ.get('CRW_FIXTURE_ROOT','tests/fixtures/contract-review-multilingual-20261017'))
load=lambda p,default=None:json.loads(p.read_text()) if p.exists() else default
norm=lambda s:re.sub(r'\s+','',str(s or ''))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
cases={c['caseId']:c for c in load(root/'manifest.json')['cases']}
records=load(run/'summary.json');results=[];semantic=[]
expected_types={'procurement':'procurement','nda':'nda','development':'software_development','lease':'lease'}
for record in records:
 case=cases[record['caseId']];d=run/record['id']
 request=load(d/'request.json',{});execution=load(d/'execution.json',{}).get('data',{})
 if not isinstance(execution,dict):execution={}
 output=load(d/'output.json',{});usage=load(d/'usage.json',{}).get('data',[])
 if not isinstance(usage,list):usage=[]
 artifact=load(d/'artifact-check.json',{});events=load(d/'events.json',[])
 clauses=output.get('clauses',[]);metrics=output.get('metrics',{})
 body=norm('\n'.join(c.get('title','')+'\n'+c.get('originalContent','') for c in clauses))
 missing=[m for m in case['contentMarkers'] if m not in body]
 file=next(f for f in case['files'] if f['path']==record['file'])
 rows=[u for u in usage if u.get('purpose')=='llm_operation']
 integrity={'fixture_digest':sha(root/record['file'])==file['sha256'],'task_mode':request.get('config',{}).get('mode')=='task' if request else None,'requested_35b':request.get('modelId')=='d13e0d30-87b9-4e87-b96a-d8b1b3cf78af' if request else None,'identity':execution.get('id')==record.get('executionId') if execution else None,'done':events[-1]['event']['type']=='done' if events else None,'actual_model_35b':all(u['modelId']=='qwen36-35b-a3b' for u in rows) if rows else False if output else None,'artifact_digest':sha(d/'artifact.html')==artifact.get('sha256') if (d/'artifact.html').exists() else False if output else None}
 debug=execution.get('inputJson',{}).get('__promptDebug',{});notices=debug.get('notes',[])
 recognizer_models=sorted(set(x.get('modelId','unknown') for x in debug.get('llmCalls',[]) if x.get('stage')=='recognizer'))
 plan=next((x['event'].get('data',{}).get('deterministicPlan') for x in events if x['event'].get('data',{}).get('deterministicPlan')),None)
 bindings=plan['nodes'][0].get('inputBindings',{}) if plan and plan.get('nodes') else {}
 for item in case['expectedObservations']:
  if item['observation'].startswith(('risk_','bilingual_conflict')):
   matched=[c for c in clauses if item['marker'] in norm(c.get('title','')+' '+c.get('originalContent',''))]
   semantic.append({'case':record['id'],'marker':item['marker'],'expectedTopic':item['observation'],'sourcePresent':bool(matched),'riskLevels':[c['riskLevel'] for c in matched],'hasRiskSignal':any(c['riskLevel']!='PASS' for c in matched),'texts':[{'summary':c.get('riskSummary'),'advice':c.get('legalAdvice'),'source':c.get('originalContent')} for c in matched],'verdict':'NOT_FULL_LEGAL_ACCURACY_EVAL'})
 result={'id':record['id'],'caseId':record['caseId'],'business':record['business'],'language':record['language'],'format':record['format'],'executionId':record.get('executionId'),'status':record['status'],'previousGateStatus':record.get('previousGateStatus',record['status']),'executionStatus':execution.get('status'),'failureReason':execution.get('failureReason') or record.get('error'),'outputPresent':bool(output),'integrity':integrity,'missingMarkers':missing,'markerCoverage':8-len(missing),'totalClauses':len(clauses),'semanticReviewed':metrics.get('llmReviewedCount'),'degraded':metrics.get('isDegraded'),'warnings':metrics.get('warnings',[]),'contractType':output.get('contractType'),'expectedType':expected_types.get(record['business']),'typeMatches':output.get('contractType')==expected_types[record['business']] if output and record['business'] in expected_types else None,'position':output.get('myPosition'),'positionSource':output.get('positionSource'),'recognizerModels':recognizer_models,'recognizerErrors':[n for n in notices if 'recognizer' in n and '失败' in n],'plannedTypeBinding':bindings.get('contractType'),'plannedPositionBinding':bindings.get('myPosition'),'chatMs':record.get('chatMs',0),'uploadMs':record.get('uploadMs',0),'wallMs':record.get('wallMs',0),'calls':len(rows),'inputTokens':sum(u['inputTokens'] for u in rows),'outputTokens':sum(u['outputTokens'] for u in rows),'diagnostics':[{'clauseIndex':c['clauseIndex'],**c.get('diagnostics',{})} for c in clauses if c.get('diagnostics')],'sourceDrift':record.get('sourceDrift',[]),'failureNames':[c['name'] for c in record.get('failures',[])]}
 results.append(result)
failures=[(r['id'],k) for r in results for k,v in r['integrity'].items() if v is False]
start=min(datetime.datetime.fromisoformat(r['startedAt'].replace('Z','+00:00')) for r in records);end=max(datetime.datetime.fromisoformat(r['finishedAt'].replace('Z','+00:00')) for r in records)
summary={'cases':len(results),'runnerCounts':dict(collections.Counter(r['status'] for r in results)),'previousGateCounts':dict(collections.Counter(r['previousGateStatus'] for r in results)),'executionCounts':dict(collections.Counter(r['executionStatus'] for r in results)),'byFormat':{f:{'total':sum(r['format']==f for r in results),'runnerPassed':sum(r['format']==f and r['status']=='passed' for r in results),'sourceCovered':sum(r['format']==f and not r['missingMarkers'] for r in results),'outputAbsent':sum(r['format']==f and not r['outputPresent'] for r in results)} for f in ['docx','pdf','txt']},'provenanceFailures':failures,'businessModel':'qwen36-35b-a3b','observedBusinessCalls':sum(r['calls'] for r in results),'observedInputTokens':sum(r['inputTokens'] for r in results),'observedOutputTokens':sum(r['outputTokens'] for r in results),'degradedCases':[r['id'] for r in results if r['degraded']],'recognizerErrorCases':sum(bool(r['recognizerErrors']) for r in results),'knownTypeMismatches':[r['id'] for r in results if r['typeMatches'] is False],'knownTypeUnassessed':[r['id'] for r in results if r['expectedType'] and r['typeMatches'] is None],'elapsedMinutes':(end-start).total_seconds()/60,'chatMedianMs':statistics.median(r['chatMs'] for r in results),'chatMaxMs':max(r['chatMs'] for r in results),'results':results}
(run/'audit-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));(run/'semantic-audit-candidates.json').write_text(json.dumps(semantic,ensure_ascii=False,indent=2))
lines=['| 用例 | 执行单 | 终态 | 正文标记 | 识别类型 | 立场来源 | 降级 | 耗时秒 | 增强门禁 |','|---|---|---|---|---|---|---|---:|---|']
for r in sorted(results,key=lambda x:x['id']):lines.append(f"| {r['id']} | {r['executionId']} | {r['executionStatus']} | {r['markerCoverage']}/8 | {r['contractType']} | {r['positionSource']} | {r['degraded']} | {r['chatMs']/1000:.2f} | {r['status']} |")
(run/'case-matrix.md').write_text('\n'.join(lines)+'\n')
with (run/'results.csv').open('w',encoding='utf-8-sig',newline='') as f:
 fields=['id','business','language','format','executionId','status','previousGateStatus','executionStatus','outputPresent','markerCoverage','totalClauses','contractType','position','positionSource','degraded','chatMs','calls','inputTokens','outputTokens','failureReason'];writer=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');writer.writeheader();writer.writerows(sorted(results,key=lambda x:x['id']))
print(json.dumps({k:v for k,v in summary.items() if k!='results'},ensure_ascii=False,indent=2))
if failures:raise SystemExit('Evidence integrity failure')
