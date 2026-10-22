import collections,csv,hashlib,json,pathlib,re,sys
root=pathlib.Path('tests/fixtures/contract-compare-20261018');run=pathlib.Path(sys.argv[1]);manifest=json.loads((root/'manifest.json').read_text());norm=lambda v:re.sub(r'\s+','',str(v or ''));results=[]
for c in manifest['cases']:
 for side,f in c['files'].items():
  assert hashlib.sha256((root/f['path']).read_bytes()).hexdigest()==f['sha256'],(c['id'],side,'fixture drift')
for stage in ['full','recovery','domain']:
 for c in manifest['cases']:
  case_dir=run/stage/c['id'];d=run/stage/(c['id']+'.json')
  if stage=='domain':
   if not d.exists():continue
   raw=json.loads(d.read_text());o=raw.get('response',{}).get('output');e={'status':raw.get('status'),'wallMs':raw.get('ms')};ex={}
  else:
   if not (case_dir/'evidence.json').exists():continue
   e=json.loads((case_dir/'evidence.json').read_text());o=json.loads((case_dir/'output.json').read_text()) if (case_dir/'output.json').exists() else None;ex=json.loads((case_dir/'execution.json').read_text()).get('data',{}) if (case_dir/'execution.json').exists() else {}
  row={'stage':stage,'id':c['id'],'name':c['name'],'runnerStatus':e.get('status'),'executionId':e.get('executionId'),'executionStatus':ex.get('status'),'output':bool(o),'bodyGaps':[],'oracleErrors':[],'roundTripErrors':[],'falsePositive':None,'failureNames':[x['name'] for x in e.get('failures',[])],'sourceDrift':e.get('sourceDrift',[]),'wallMs':e.get('wallMs'),'businessCalls':e.get('businessCalls'),'businessModels':e.get('businessModels')}
  if o:
   pairs=o['alignedClauses'];aa=norm(''.join(p.get('sourceClause',{}).get('content','') for p in pairs));bb=norm(''.join(p.get('targetClause',{}).get('content','') for p in pairs))
   for side,body in [('a',aa),('b',bb)]:
    for marker,title,text in c[side]:
     if norm(text) not in body:row['bodyGaps'].append(side+':'+marker)
   for marker,status in c['expected'].items():
    matches=[p for p in pairs if marker in p.get('sourceClause',{}).get('content','') or marker in p.get('targetClause',{}).get('content','')];actual=[p['status'] for p in matches]
    if len(matches)!=1 or (actual[0]!=status and not(c['kind']=='renumber' and actual[0] in ['UNCHANGED','MODIFIED'])):row['oracleErrors'].append({'marker':marker,'expected':status,'actual':actual})
   for p in pairs:
    if p['status']=='MODIFIED':
     tokens=p.get('diffTokens',[])
     for side,omit in [('sourceClause','insert'),('targetClause','delete')]:
      if norm(''.join(t['text'] for t in tokens if t['type']!=omit))!=norm(p[side]['content']):row['roundTripErrors'].append(p['id']+':'+side)
   negative=c['id']=='CMP01' or c['kind'] in ['cross-identical','formatting'];row['falsePositive']=negative and any(p['status']!='UNCHANGED' for p in pairs);row['metrics']=o['metrics'];row['coreDiffPassed']=not(row['bodyGaps'] or row['oracleErrors'] or row['roundTripErrors'] or row['falsePositive'])
   if stage!='domain':
    check=json.loads((case_dir/'artifact-check.json').read_text());html=(case_dir/'artifact.html').read_bytes();row['artifactVerified']=hashlib.sha256(html).hexdigest()==check['sha256'] and check['status']==200
  else:row['coreDiffPassed']=None
  results.append(row)
summary={'fixturePairs':len(manifest['cases']),'fixtureFiles':32,'stages':{stage:{'attempted':len([r for r in results if r['stage']==stage]),'outputs':sum(r['output'] for r in results if r['stage']==stage),'coreDiffPassed':sum(r['coreDiffPassed'] is True for r in results if r['stage']==stage),'runnerCounts':dict(collections.Counter(str(r['runnerStatus']) for r in results if r['stage']==stage))} for stage in ['full','recovery','domain']},'results':results};(run/'audit-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
with(run/'results.csv').open('w',encoding='utf-8-sig',newline='')as f:
 fields=['stage','id','name','runnerStatus','executionStatus','output','coreDiffPassed','businessCalls','businessModels','failureNames','bodyGaps','oracleErrors','wallMs'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader();w.writerows(results)
print(json.dumps(summary['stages'],ensure_ascii=False,indent=2));print('core discrepancies',[(r['stage'],r['id'],r['bodyGaps'],r['oracleErrors'],r['falsePositive']) for r in results if r['coreDiffPassed'] is False])
