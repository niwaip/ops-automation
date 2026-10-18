const fs=require('fs'),crypto=require('crypto');
const cp='/workspace/apps/backend/execution-control/control-plane';
const mod=cp+'/dist/apps/backend/execution-control/control-plane/src/modules/execution/adapters/contract/contract-review-orchestrator.js';
const req=require('module').createRequire(mod);const axios=req('axios');const {Logger}=req('@nestjs/common');
const root=__dirname;const execution=JSON.parse(fs.readFileSync(root+'/retry/CT05-ja-txt/execution.json')).data;
const events=JSON.parse(fs.readFileSync(root+'/retry/CT05-ja-txt/events.json'));
const plan=events.map(x=>x.event.data?.deterministicPlan).find(Boolean);
const input={...execution.inputJson};delete input.__promptDebug;
for(const [k,v]of Object.entries(plan.nodes[0].inputBindings||{}))if(v.source==='literal')input[k]=v.value;
const original=axios.post.bind(axios);let seq=0;
axios.post=async function(url,body,...rest){const n=++seq;const start=Date.now();
 try{const response=await original(url,body,...rest);if(String(url).endsWith('/ai/model/call'))fs.writeFileSync(root+'/direct-model-call-'+n+'.json',JSON.stringify({diagnosticOnly:true,notWorkModeE2E:true,request:body,status:response.status,elapsedMs:Date.now()-start,response:response.data},null,2));return response;}
 catch(e){fs.writeFileSync(root+'/direct-model-error-'+n+'.json',JSON.stringify({url,error:e.message,status:e.response?.status,elapsedMs:Date.now()-start},null,2));throw e;}};
const request={requestId:crypto.randomUUID(),executionId:crypto.randomUUID(),stepId:crypto.randomUUID(),skillId:'platform.document.contract-reviewer',input,metadata:{definitionVersion:'1.0.2'}};
req(mod).executeContractReviewOrchestration(request,'reaudit-model-diagnostic-'+Date.now(),new Logger('ReadOnlyAuditDiagnostic')).then(result=>{fs.writeFileSync(root+'/direct-model-diagnostic-result.json',JSON.stringify({diagnosticOnly:true,notWorkModeE2E:true,result},null,2));console.log(JSON.stringify(result.output?.metrics));}).catch(e=>{console.error(e.message);process.exitCode=1;});
