import fs from 'node:fs';
import {login,get,save,findOutput} from './client.mjs';
const root='docs/artifacts/reviews/contract-review-work-2026-10-16';
const token=await login();
const id='da61bcd3-30ee-478c-aea8-275cce988a92';
const detail=await get(token,`/api/executions/${id}`);const usage=await get(token,`/api/executions/${id}/llm-usage`);
save(`${root}/ui-execution.json`,detail);save(`${root}/ui-usage.json`,usage);
const output=findOutput(detail.data);save(`${root}/ui-audit.json`,{executionId:id,selectedModelInUi:'qwen36-35b-a3b',requestedPosition:'seller',status:detail.data?.status,actualPosition:output?.myPosition,positionSource:output?.positionSource,ledgerModels:Array.isArray(usage.data)?[...new Set(usage.data.map(x=>x.modelId))]:null,metrics:output?.metrics});
// Explicit provider control: isolates availability from work-mode parameter propagation.
const t=Date.now();let data,status;
try{const r=await fetch('http://127.0.0.1:3007/ai/model/call',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({modelId:'d13e0d30-87b9-4e87-b96a-d8b1b3cf78af',prompt:'请只输出 JSON 数组 [{"probe":"CRW_35B_CONTROL"}]，不要附加解释。',temperature:0.1,seed:42,responseFormat:'json_array',includeDebug:true}),signal:AbortSignal.timeout(120000)});status=r.status;data=await r.json();}catch(e){data={error:e.message};}
save(`${root}/provider-control.json`,{kind:'direct provider control, NOT Work E2E',status,durationMs:Date.now()-t,data});
console.log(JSON.stringify({ui:JSON.parse(fs.readFileSync(`${root}/ui-audit.json`)),provider:{status,actualModel:data?.actualModel,actualModelId:data?.actualModelId,error:data?.error||data?.message,durationMs:Date.now()-t}},null,2));
