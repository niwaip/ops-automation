"""Audit independent fixture manifests without rewriting the benchmark verdict."""
import json,pathlib,re,sys
fixtures=pathlib.Path(sys.argv[1]);run=pathlib.Path(sys.argv[2]);norm=lambda x:re.sub(r'\s+','',str(x or ''));rows=[]
for c in json.loads((fixtures/'manifest.json').read_text())['cases']:
 p=run/c['id']
 if not(p/'evidence.json').exists():continue
 e=json.loads((p/'evidence.json').read_text());x=json.loads((p/'execution.json').read_text()).get('data',{});o=json.loads((p/'output.json').read_text());ps=o['alignedClauses'];errors=[]
 for side,field in [('a','sourceClause'),('b','targetClause')]:
  body=norm(''.join(v.get(field,{}).get('content','') for v in ps))
  for marker,title,text in c[side]:
   if norm(text) not in body:errors.append({'kind':'missing_body','side':side,'marker':marker,'expectedText':text})
 for marker,expected in c['expected'].items():
  pairs=[v for v in ps if marker in json.dumps(v.get('sourceClause',{}),ensure_ascii=False) or marker in json.dumps(v.get('targetClause',{}),ensure_ascii=False)]
  if len(pairs)!=1 or pairs[0]['status']!=expected:errors.append({'kind':'wrong_diff','marker':marker,'expected':expected,'actual':[v['status'] for v in pairs]})
 for v in ps:
  a=v.get('sourceClause',{}).get('titleJa');b=v.get('targetClause',{}).get('titleJa')
  if v['status']=='UNCHANGED' and a and b and norm(a)!=norm(b):errors.append({'kind':'changed_secondary_heading_marked_unchanged','pairId':v['id'],'a':a,'b':b})
 rows.append({'id':c['id'],'executionId':e.get('executionId'),'executionStatus':x.get('status'),'reviewStatus':o.get('reviewStatus'),'runnerStatus':e['status'],'passed':x.get('status')=='succeeded' and not errors and o.get('reviewStatus')=='complete','errors':errors,'metrics':o['metrics']})
(run/'variant-audit.json').write_text(json.dumps({'results':rows,'passed':sum(x['passed'] for x in rows),'total':len(rows)},ensure_ascii=False,indent=2));print(json.dumps(rows,ensure_ascii=False,indent=2))
