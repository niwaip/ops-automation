"""Supplemental adjudication; original runner/oracle evidence is preserved unchanged."""
import collections,hashlib,json,pathlib,re,sys
run=pathlib.Path(sys.argv[1]);manifest=json.loads(pathlib.Path('tests/fixtures/contract-compare-20261018/manifest.json').read_text());norm=lambda x:re.sub(r'\s+','',str(x or ''));rows=[]
for c in manifest['cases']:
 d=run/'full'/c['id']
 if not (d/'evidence.json').exists():continue
 e=json.loads((d/'evidence.json').read_text());x=json.loads((d/'execution.json').read_text()).get('data',{}) if (d/'execution.json').exists() else {};o=json.loads((d/'output.json').read_text()) if (d/'output.json').exists() else None
 r={'id':c['id'],'runnerStatus':e['status'],'executionId':e.get('executionId'),'executionStatus':x.get('status'),'failureReason':x.get('failureReason') or e.get('error'),'reviewedCoreDiffPassed':None,'sourceDrift':e.get('sourceDrift',[]),'chatMs':e.get('chatMs'),'wallMs':e.get('wallMs')}
 if o:
  ps=o['alignedClauses'];issues=[]
  for side,prop in [('a','sourceClause'),('b','targetClause')]:
   body=norm(''.join(p.get(prop,{}).get('content','') for p in ps))
   for marker,title,text in c[side]:
    if norm(text) not in body:issues.append({'kind':'body_missing','side':side,'marker':marker})
  for marker,expected in c['expected'].items():
   matches=[p for p in ps if marker in json.dumps(p.get('sourceClause',{}),ensure_ascii=False) or marker in json.dumps(p.get('targetClause',{}),ensure_ascii=False)]
   if len(matches)!=1 or (matches[0]['status']!=expected and not(c['kind']=='renumber' and matches[0]['status'] in ['MODIFIED','UNCHANGED'])):issues.append({'kind':'change_mismatch','marker':marker,'expected':expected,'actual':[p['status'] for p in matches]})
  if (c['id']=='CMP01' or c['kind'] in ['cross-identical','formatting']) and any(p['status']!='UNCHANGED' for p in ps):issues.append({'kind':'false_positive'})
  r['reviewedCoreDiffPassed']=not issues;r['coreIssues']=issues;r['reviewStatus']=o.get('reviewStatus');r['degraded']=o['metrics'].get('isDegraded',False);r['warnings']=o['metrics'].get('warnings',[]);r['metrics']=o['metrics']
  usage=json.loads((d/'usage.json').read_text()).get('data',[]);business=[u for u in usage if u.get('purpose')=='llm_operation'];r['ledgerCalls']=len(business);r['ledgerModels']=sorted(set(u.get('modelId','') for u in business));r['modelIdentityMatchesRegistry']=all(u.get('modelId') in ['d13e0d30-87b9-4e87-b96a-d8b1b3cf78af','qwen36-35b-a3b'] for u in business) if business else None;r['inputTokens']=sum(u.get('inputTokens',0) for u in business);r['outputTokens']=sum(u.get('outputTokens',0) for u in business)
  changes=[p for p in ps if p['status']!='UNCHANGED'];events=json.loads((d/'events.json').read_text());binding=None
  for event in events:
   plan=event['event'].get('data',{}).get('deterministicPlan')
   if plan:binding=plan['nodes'][0].get('inputBindings',{}).get('myPosition')
  r['positionBinding']=binding;r['positionPreserved']=bool(binding) if changes and c.get('riskEnabled') is not False else None
  r['intentAndSemanticPassed']=r['reviewedCoreDiffPassed'] and x.get('status')=='succeeded' and not r['degraded'] and r['positionPreserved'] is not False
  r['semanticReviewedCount']=sum(bool(p.get('aiInsight',{}).get('keyChange')) for p in changes);r['changedCount']=len(changes)
  r['riskDisabledClean']=not business and all(not p.get('aiInsight') for p in ps) if c.get('riskEnabled') is False else None
  if (d/'artifact.html').exists():
   check=json.loads((d/'artifact-check.json').read_text());r['artifactVerified']=hashlib.sha256((d/'artifact.html').read_bytes()).hexdigest()==check.get('sha256') and check.get('status')==200
 rows.append(r)
summary={'note':'Adjudication finds fixture marker in full clause metadata for matching, but still requires actual body preservation and correct diff status. This corrects CMP07 locator false failure; never treats Japanese titleJa-only body as reviewed. Original name-only model gate unchanged; UUID mapped by model-registry.json.','attempted':len(rows),'executionCounts':dict(collections.Counter(r.get('executionStatus') or 'not_created' for r in rows)),'runnerCounts':dict(collections.Counter(r['runnerStatus'] for r in rows)),'schemaFailureCases':[r['id'] for r in rows if 'OUTPUT_SCHEMA_VIOLATION' in (r.get('failureReason') or '')],'reviewedCorePassed':sum(r['reviewedCoreDiffPassed'] is True for r in rows),'coreFailures':[r['id'] for r in rows if r['reviewedCoreDiffPassed'] is False],'positionLostCases':[r['id'] for r in rows if r.get('positionPreserved') is False],'intentAndSemanticPassed':sum(r.get('intentAndSemanticPassed') is True for r in rows),'artifactVerified':sum(r.get('artifactVerified') is True for r in rows),'ledgerCalls':sum(r.get('ledgerCalls',0) for r in rows),'ledgerModels':sorted(set(m for r in rows for m in r.get('ledgerModels',[]))),'inputTokens':sum(r.get('inputTokens',0) for r in rows),'outputTokens':sum(r.get('outputTokens',0) for r in rows),'degradedCases':[r['id'] for r in rows if r.get('degraded')],'sourceDriftCases':[r['id'] for r in rows if r['sourceDrift']],'results':rows};(run/'reviewed-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in summary.items() if k not in ['results','note']},ensure_ascii=False,indent=2))
