import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {login,upload,stream,get,findOutput,save,digest,assertion as a} from './client.mjs';
const fixtureRoot=path.resolve('tests/fixtures/contract-review-multilingual-20261017');
const manifest=JSON.parse(fs.readFileSync(`${fixtureRoot}/manifest.json`));
const out=path.resolve(process.env.CRW_OUTPUT||`docs/artifacts/reviews/contract-review-corpus/run-${new Date().toISOString().replaceAll(':','-')}`);
fs.mkdirSync(out,{recursive:true});
const modelId=process.env.CRW_MODEL_ID||'d13e0d30-87b9-4e87-b96a-d8b1b3cf78af',expectedModel=process.env.CRW_EXPECT_MODEL||'qwen36-35b-a3b';
const concurrency=Math.max(1,Math.min(3,Number(process.env.CRW_CONCURRENCY||2)));
const roles={procurement:'买方',saas:'客户和服务使用方',nda:'信息披露及接收双方',distribution:'经销商',development:'委托开发方',lease:'承租方'};
let jobs=manifest.cases.flatMap(c=>c.files.map(f=>({...c,file:f,id:`${c.caseId}-${path.extname(f.path).slice(1)}`})));
if(process.env.CRW_CASES)jobs=jobs.filter(c=>process.env.CRW_CASES.split(',').includes(c.id));
// Interleave languages and businesses in each format block, retaining paired controls.
jobs.sort((a,b)=>['docx','pdf','txt'].indexOf(path.extname(a.file.path).slice(1))-['docx','pdf','txt'].indexOf(path.extname(b.file.path).slice(1))||a.caseId.localeCompare(b.caseId));
const sourceFiles=['apps/backend/intelligence/ai-orchestrator/src/modules/planner/params/deterministic-param-resolver.service.ts','apps/backend/intelligence/ai-orchestrator/src/modules/chat/document-prober.service.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-llm-review.service.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-compare/contract-ast-parser.service.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-compare/contract-clause-segmenter.util.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-compare/docx-openxml-parser.util.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-type-classifier.service.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-review-engine.service.ts','apps/backend/intelligence/ai-orchestrator/src/modules/planner/binding/multi-node-parameter-binder.service.ts','apps/backend/intelligence/ai-orchestrator/src/modules/recognizer/recognizer.service.ts','builtin-skills/platform.document.contract-reviewer/manifest.yaml','apps/backend/execution-control/control-plane/src/modules/execution/adapters/contract/contract-review-orchestrator.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-review.service.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-review-html-renderer.service.ts'];
const environment={startedAt:new Date().toISOString(),entry:'authenticated upload + POST /ai/chat/stream config.mode=task',modelId,expectedModel,concurrency,caseCount:jobs.length,gitHead:execFileSync('git',['-c','core.fsmonitor=false','rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDigests:Object.fromEntries(sourceFiles.map(f=>[f,digest(fs.readFileSync(f))])),manifestDigest:digest(fs.readFileSync(`${fixtureRoot}/manifest.json`)),coverage:'API E2E with real provider; no browser file picker; topic flags need independent semantic review'};
const sourceSnapshot=()=>Object.fromEntries(sourceFiles.map(f=>[f,digest(fs.readFileSync(f))]));
save(`${out}/environment.json`,environment);save(`${out}/cases.json`,jobs);
let cachedToken=null,tokenExpiresAt=0,tokenPromise=null;
async function getToken(){
 if(cachedToken&&Date.now()<tokenExpiresAt)return cachedToken;
 if(!tokenPromise)tokenPromise=login().then(t=>{cachedToken=t;const claims=JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString());tokenExpiresAt=Math.min(Date.now()+600000,(claims.exp?claims.exp*1000:Date.now()+600000)-60000);return t;}).finally(()=>{tokenPromise=null;});
 return tokenPromise;
}
const records=[];const norm=s=>String(s||'').replace(/\s+/g,'');
async function execute(c){
 const dir=`${out}/${c.id}`;fs.mkdirSync(dir);
 const sourceDigestsAtStart=sourceSnapshot();
 const started=Date.now();let record={id:c.id,caseId:c.caseId,business:c.business,language:c.language,format:path.extname(c.file.path).slice(1),file:c.file.path,fixtureSha256:c.file.sha256,status:'running',startedAt:new Date().toISOString()};
 save(`${dir}/state.json`,record);console.log(`START ${c.id}`);
 try{
  const buffer=fs.readFileSync(path.join(fixtureRoot,c.file.path));if(digest(buffer)!==c.file.sha256)throw Error('Fixture digest mismatch');
  const token=await getToken();const uploadStart=Date.now();const descriptor=await upload(token,buffer,path.basename(c.file.path),c.file.mimeType);record.uploadMs=Date.now()-uploadStart;save(`${dir}/upload.json`,descriptor);
  const message=`请对附件这一份合同进行合同审查，我方为甲方（${roles[c.business]}）。请逐条阅读全部语言的正文，重点检查我方义务、责任、数据或知识产权、付款和退出安排，生成完整合同审查报告。请以中文回复。`;
  const payload={message,sessionId:`corpus-${c.id}-${Date.now()}`,modelId,files:[descriptor],config:{mode:'task',thinking:true,webSearch:false,workspaceSearch:false}};
  const response=await stream(token,payload,dir);record={...record,sessionId:payload.sessionId,executionId:response.executionId,traceIds:response.traceIds,chatMs:response.totalMs,firstEventMs:response.firstEventMs,streamError:response.error};
  let detail=null,usage=null;
  if(response.executionId){detail=await get(token,`/api/executions/${response.executionId}`);save(`${dir}/execution.json`,detail);usage=await get(token,`/api/executions/${response.executionId}/llm-usage`);save(`${dir}/usage.json`,usage);}
  const output=findOutput(detail?.data)||findOutput(response.events.map(e=>e.event));if(output)save(`${dir}/output.json`,output);
  const capabilities=[...new Set([...(detail?.data?.capabilitiesUsed||[]).map(x=>x.id),...response.events.filter(x=>x.event.type==='action').flatMap(x=>x.event.content?.match(/platform\.[a-z._-]+/g)||[])])];
  const checks=[a('upload returned attachment',Boolean(descriptor),null,'UPLOAD'),a('chat HTTP success',[200,201].includes(response.httpStatus),response.httpStatus,'TRANSPORT'),a('SSE finished',!response.error&&response.events.some(x=>x.event.type==='done'),response.error||response.events.at(-1)?.event.type,'TRANSPORT'),a('contract skill executed',capabilities.includes('platform.document.contract-reviewer'),capabilities,'ROUTING'),a('persistent execution succeeded',detail?.data?.status==='succeeded',detail?.data?.status,'STATE'),a('structured output exists',!!output,null,'OUTPUT')];
  record.executionStatus=detail?.data?.status;record.actualCapabilities=capabilities;
  const debug=detail?.data?.inputJson?.__promptDebug||{};const recognizerCalls=(debug.llmCalls||[]).filter(x=>x.stage==='recognizer');
  const recognizerErrors=(debug.notes||[]).filter(x=>/recognizer.*失败/i.test(x));
  record.recognizerModels=[...new Set(recognizerCalls.map(x=>x.modelId))];record.recognizerErrors=recognizerErrors;
  checks.push(a('recognizer no conflicting model or error',recognizerCalls.every(x=>[modelId,expectedModel].includes(x.modelId))&&recognizerErrors.length===0,{observedModels:record.recognizerModels,errors:recognizerErrors},'MODEL_RECOGNIZER'));
  if(output){
   const clauses=output.clauses,m=output.metrics,body=norm(clauses.map(x=>[x.title,x.originalContent].join('\n')).join('\n'));
   const missing=c.contentMarkers.filter(x=>!body.includes(x));checks.push(a('all eight article markers covered',missing.length===0,missing,'PARSE'));
   const sourceGaps=[];
   for(const item of c.expectedObservations)for(const language of c.language==='zh-ja'?['zh','ja']:[c.language]){
    const v=item[language];const content=v.slice(v.indexOf('：')+1);if(!body.includes(norm(content)))sourceGaps.push({marker:item.marker,language});
   }
   checks.push(a('every source article language retained',sourceGaps.length===0,sourceGaps,'PARSE'));
   const ids=clauses.map(x=>x.clauseIndex);checks.push(a('clause indices unique',ids.every(Number.isInteger)&&new Set(ids).size===ids.length,ids,'OUTPUT'));
   checks.push(a('metrics consistent',m.totalClauses===clauses.length&&['HIGH','MEDIUM','LOW','PASS'].every((v,i)=>clauses.filter(x=>x.riskLevel===v).length===m[['highRiskCount','mediumRiskCount','lowRiskCount','passCount'][i]]),m,'OUTPUT'));
   checks.push(a('score in range',Number.isFinite(m.healthScore)&&m.healthScore>=0&&m.healthScore<=100,m.healthScore,'OUTPUT'));
   checks.push(a('semantic review complete',!m.isDegraded&&m.degradedClausesCount===0&&clauses.filter(x=>(x.originalContent||'').trim().length>10).every(x=>x.llmReviewed===true),{reviewed:m.llmReviewedCount,total:m.totalClauses,warnings:m.warnings},'SEMANTIC_COMPLETENESS'));
   checks.push(a('not truncated',m.isTruncated!==true,m.isTruncated,'PARSE'));
   const rows=Array.isArray(usage?.data)?usage.data.filter(x=>x.purpose==='llm_operation'):[];
   checks.push(a('business model ledger present',rows.length>0,rows.length,'OBSERVABILITY'));
   checks.push(a('requested model actually used',rows.length>0&&rows.every(x=>[modelId,expectedModel].includes(x.modelId)),[...new Set(rows.map(x=>x.modelId))],'MODEL'));
   const expectedPosition={procurement:'buyer',saas:'buyer',development:'buyer',lease:'buyer'}[c.business];
   if(expectedPosition)checks.push(a('requested party role retained',output.myPosition===expectedPosition&&output.positionSource==='user_confirmed',{expected:expectedPosition,actual:output.myPosition,source:output.positionSource},'POSITION'));
   const expectedType={procurement:'procurement',nda:'nda',development:'software_development',lease:'lease'}[c.business];
   if(expectedType)checks.push(a('supported business type correct',output.contractType===expectedType,{expected:expectedType,actual:output.contractType},'TYPE_CLASSIFICATION'));
   if(c.caseId==='CT04-zh-ja'){
    const target=clauses.filter(x=>norm([x.title,x.originalContent].join(' ')).includes('CT04-zh-ja-A08'));
    const generated=target.map(x=>[x.riskSummary,x.legalAdvice,...(x.findings||[]).map(f=>[f.riskSummary,f.reason].join(' '))].join(' ')).join(' ');
    const flagged=target.some(x=>['HIGH','MEDIUM','LOW'].includes(x.riskLevel))&&/(付款|支払|期限|账期|支付)/.test(generated)&&/(冲突|不一致|矛盾|不同|不符|差异|相違|食い違)/.test(generated);
    checks.push(a('known bilingual payment conflict flagged',flagged,{levels:target.map(x=>x.riskLevel),generated},'BILINGUAL_CONFLICT'));
   }
   const incomplete=clauses.filter(x=>x.llmReviewed===false&&!x.isBypassed);
   if(incomplete.length)checks.push(a('degraded clauses have structured diagnostic',incomplete.every(x=>x.diagnostics?.validationFailureCode&&x.diagnostics.validationFailureCode!=='UNKNOWN_DEGRADATION'&&x.diagnostics.modelId&&Number.isFinite(x.diagnostics.elapsedMs)&&x.diagnostics.attempt>=1),incomplete.map(x=>({clauseIndex:x.clauseIndex,diagnostics:x.diagnostics})),'DIAGNOSTICS'));
   const semantic=c.expectedObservations.filter(x=>x.observation.startsWith('risk_')||x.observation.startsWith('bilingual_conflict')).map(item=>{
    const matched=clauses.filter(x=>norm([x.title,x.originalContent].join(' ')).includes(item.marker));return {marker:item.marker,topic:item.observation,matchedClauseIndices:matched.map(x=>x.clauseIndex),riskLevels:matched.map(x=>x.riskLevel),hasRiskSignal:matched.some(x=>['HIGH','MEDIUM','LOW'].includes(x.riskLevel)),reviewText:matched.map(x=>({riskSummary:x.riskSummary,legalAdvice:x.legalAdvice,findings:x.findings})),semanticVerdict:'NEEDS_INDEPENDENT_REVIEW'};
   });save(`${dir}/semantic-candidates.json`,semantic);
   record.semanticTopics=semantic.length;record.topicsWithoutRiskSignal=semantic.filter(x=>!x.hasRiskSignal).map(x=>x.topic);record.metrics=m;record.contractType=output.contractType;record.myPosition=output.myPosition;
   let artifact={url:output.artifact?.url,status:null,bytes:0};
   if(artifact.url)try{const r=await fetch(artifact.url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});const b=Buffer.from(await r.arrayBuffer());artifact={...artifact,status:r.status,bytes:b.length,sha256:digest(b),html:/<!doctype html|<html/i.test(b.toString('utf8'))};fs.writeFileSync(`${dir}/artifact.html`,b);}catch(e){artifact.error=e.message;}
   save(`${dir}/artifact-check.json`,artifact);checks.push(a('original artifact URL downloads HTML',artifact.status===200&&artifact.bytes>1000&&artifact.html,artifact,'DELIVERY'));
   record.observedUsage=rows.map(x=>({modelId:x.modelId,inputTokens:x.inputTokens,outputTokens:x.outputTokens}));
  }
  record.previousGateStatus=checks.filter(x=>!['TYPE_CLASSIFICATION','BILINGUAL_CONFLICT','DIAGNOSTICS'].includes(x.category)).every(x=>x.passed)?'passed':'failed';record.assertions=checks;record.failures=checks.filter(x=>!x.passed);record.status=record.failures.length?'failed':'passed';record.semanticStatus=output?'pending_independent_review':'not_assessable';
 }catch(e){record.status='error';record.error=e.message;}
 record.sourceDigestsAtStart=sourceDigestsAtStart;record.sourceDigestsAtEnd=sourceSnapshot();record.sourceDrift=sourceFiles.filter(f=>sourceDigestsAtStart[f]!==record.sourceDigestsAtEnd[f]);
 record.wallMs=Date.now()-started;record.finishedAt=new Date().toISOString();save(`${dir}/evidence.json`,record);save(`${dir}/state.json`,record);records.push(record);save(`${out}/summary.json`,records);console.log(`END ${c.id} ${record.status} ${record.wallMs}ms ${(record.failures||[]).map(x=>x.name).join('; ')} ${record.error||''}`);
}
console.log(`OUTPUT ${out}`);let cursor=0;
await Promise.all(Array.from({length:concurrency},async()=>{while(cursor<jobs.length){const c=jobs[cursor++];await execute(c);}}));
save(`${out}/environment-end.json`,{capturedAt:new Date().toISOString(),sourceDigests:sourceSnapshot(),changedSinceStart:sourceFiles.filter(f=>environment.sourceDigests[f]!==sourceSnapshot()[f])});
save(`${out}/completed.json`,{endedAt:new Date().toISOString(),total:records.length,passed:records.filter(x=>x.status==='passed').length,failed:records.filter(x=>x.status==='failed').length,errors:records.filter(x=>x.status==='error').length});
console.log(`COMPLETE ${out}`);process.exitCode=records.some(x=>x.status!=='passed')?1:0;
