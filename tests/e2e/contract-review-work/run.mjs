import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {cases,fixtures,clauses} from './cases.mjs';
import {login,stream,get,upload,save,digest,findOutput,assertion as a} from './client.mjs';

const out=path.resolve(process.env.CRW_OUTPUT||`docs/artifacts/reviews/contract-review-work-2026-10-16/run-${new Date().toISOString().replaceAll(':','-')}`);
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(`${out}/fixtures`);
for(const[k,v]of Object.entries(fixtures))save(`${out}/fixtures/${k}.txt`,v);
// Minimal actual OOXML packages, not text renamed to DOCX.
execFileSync('python3',['-c',`
import sys,zipfile,pathlib,html
p=pathlib.Path(sys.argv[1])
for name,fixture in [('contract-a.docx','flat'),('contract-b.docx','changed'),('long-contract.docx','long')]:
 text=(p/(fixture+'.txt')).read_text()
 body=''.join('<w:p><w:r><w:t xml:space="preserve">'+html.escape(s)+'</w:t></w:r></w:p>' for s in text.splitlines())
 with zipfile.ZipFile(p/name,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>')
`,`${out}/fixtures`]);
fs.copyFileSync(`${out}/fixtures/injected.txt`,`${out}/fixtures/injection.txt`);
fs.writeFileSync(`${out}/fixtures/corrupt.docx`,Buffer.from([0x50,0x4b,0x03,0x04,0xff,0,0x81,0xfe]));
const modelId=process.env.CRW_MODEL_ID||'d13e0d30-87b9-4e87-b96a-d8b1b3cf78af';
const expectedModel=process.env.CRW_EXPECT_MODEL||'qwen36-35b-a3b';
const git=(...args)=>execFileSync('git',['-c','core.fsmonitor=false',...args],{encoding:'utf8'}).trim();
const sources=['builtin-skills/platform.document.contract-reviewer/manifest.yaml','builtin-skills/platform.document.contract-reviewer/workflow.json','apps/backend/execution-control/control-plane/src/modules/execution/adapters/contract/contract-review-orchestrator.ts','apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-llm-review.service.ts'];
save(`${out}/environment.json`,{startedAt:new Date().toISOString(),timezone:'Asia/Shanghai',entry:'authenticated POST /ai/chat/stream config.mode=task',modelId,expectedModel,gitHead:git('rev-parse','HEAD'),gitStatus:git('status','--short'),sourceDigests:Object.fromEntries(sources.map(s=>[s,digest(fs.readFileSync(s))])),node:process.version,identity:'test',scope:'No global provider changes or service failure injection; synthetic local documents only'});
save(`${out}/cases.json`,cases);
let token=await login();
// Store only model identity metadata; never provider configuration or credentials.
try{const r=await fetch(`${process.env.CRW_CHAT_URL||'http://127.0.0.1:3007'}/ai/models`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});const d=await r.json();save(`${out}/models.json`,{status:r.status,models:(d.models||[]).map(m=>({id:m.id,name:m.name,displayName:m.displayName,provider:m.provider,status:m.status}))});}catch(e){save(`${out}/models.json`,{error:e.message});}
const results=[],byId=new Map();
console.log(`OUTPUT ${out}`);
for(const c of cases){
  if(process.env.CRW_CASES&&!process.env.CRW_CASES.split(',').includes(c.id))continue;
  token=await login();
  const dir=`${out}/${c.id}`;fs.mkdirSync(dir);
  const previous=byId.get(c.resume||c.sessionFrom);
  if((c.resume&&previous?.executionStatus!=='waiting_input')||(c.sessionFrom&&previous?.executionStatus!=='succeeded')){
    const record={id:c.id,name:c.name,status:'blocked',sessionId:previous?.sessionId||null,executionId:null,traceIds:[],actualCapabilities:[],executionStatus:null,timing:{firstEventMs:null,firstContentMs:null,totalMs:0},assertions:[a('依赖用例到达所需状态',false,{prerequisite:c.resume||c.sessionFrom,status:previous?.executionStatus},'PREREQUISITE')],failures:['PREREQUISITE'],observedUsage:null};
    save(`${dir}/evidence.json`,record);byId.set(c.id,record);results.push(record);save(`${out}/summary.json`,results);console.log(`BLOCKED ${c.id}: prerequisite ${c.resume||c.sessionFrom}`);continue;
  }
  const sessionId=previous?.sessionId||`crw-${c.id}-${Date.now()}`;
  const payload={message:c.message,sessionId,modelId,config:{mode:'task',thinking:true,webSearch:false,workspaceSearch:false}};
  if(c.resume&&previous?.executionId)payload.executionId=previous.executionId;
  if(c.file){const b=fs.readFileSync(`${out}/fixtures/${c.file}`);const mime=c.file.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain';const descriptor=await upload(token,b,c.file,mime);save(`${dir}/upload.json`,descriptor);payload.files=[descriptor];}
  console.log(`START ${c.id} ${c.name}`);
  const response=await stream(token,payload,dir);
  let detail=null,usage=null;
  if(response.executionId){detail=await get(token,`/api/executions/${response.executionId}`);usage=await get(token,`/api/executions/${response.executionId}/llm-usage`);save(`${dir}/execution.json`,detail);save(`${dir}/usage.json`,usage);}
  const output=findOutput(detail?.data)||findOutput(response.events.map(e=>e.event));if(output)save(`${dir}/output.json`,output);
  const status=detail?.data?.status||response.events.map(e=>e.event).findLast(e=>e.data?.status)?.data.status;
  const actualCapabilities=[...new Set([...(detail?.data?.capabilitiesUsed?.map(x=>x.id)||[]),...response.events.filter(x=>x.event.type==='action').flatMap(x=>x.event.content?.match(/platform\.[a-z._-]+/g)||[])])];
  const checks=[a('聊天HTTP成功',[200,201].includes(response.httpStatus),response.httpStatus,'TRANSPORT'),a('SSE完整结束且无传输异常',!response.error&&response.events.some(e=>e.event.type==='done'),response.error||response.events.at(-1)?.event.type,'TRANSPORT')];
  const isReview=['review','resume'].includes(c.expect);
  if(isReview){
    checks.push(a('实际执行合同审查能力',actualCapabilities.includes('platform.document.contract-reviewer'),actualCapabilities,'ROUTING'));
    checks.push(a('控制面持久终态成功',status==='succeeded',status,'EXECUTION_STATE'));
    checks.push(a('输出含结构化条款和指标',!!output,output?Object.keys(output):null));
    if(output){
      const text=output.clauses.map(x=>x?.originalContent||'').join('\n');
      const ids=output.clauses.map(x=>x?.clauseIndex);
      const markers=c.long?Array.from({length:30},(_,i)=>`CRW_LONG_${String(i+1).padStart(2,'0')}`):clauses.map(x=>x[1].match(/CRW_[A-Z_]+/)[0].replace('CRW_ITEM_A',c.replace?'CRW_ITEM_B':'CRW_ITEM_A'));
      checks.push(a('所有固定正文标记均覆盖',markers.every(m=>text.includes(m)),markers.filter(m=>!text.includes(m)),'CONTEXT_BINDING'));
      checks.push(a('条款ID唯一且无空洞',ids.every(Number.isInteger)&&new Set(ids).size===ids.length,ids));
      const m=output.metrics;
      checks.push(a('健康分在合法区间0至100内',Number.isFinite(m.healthScore)&&m.healthScore>=0&&m.healthScore<=100,m.healthScore,'CONTRACT'));
      checks.push(a('指标数量与条款风险统计一致',m.totalClauses===output.clauses.length&&['HIGH','MEDIUM','LOW','PASS'].every((v,i)=>output.clauses.filter(x=>x.riskLevel===v).length===m[['highRiskCount','mediumRiskCount','lowRiskCount','passCount'][i]]),m));
      checks.push(a('无未声明的语义审查降级',output.clauses.filter(x=>(x.originalContent||'').trim().length>10).every(x=>x.llmReviewed===true),{reviewed:m.llmReviewedCount,total:m.totalClauses},'COMPLETENESS'));
      checks.push(a('我方立场贯穿输出',output.myPosition===c.position,{expected:c.position,actual:output.myPosition,source:output.positionSource},'CONTEXT_BINDING'));
      checks.push(a('未声明文本截断',m.isTruncated!==true,m.isTruncated,'COMPLETENESS'));
      const rows=Array.isArray(usage?.data)?usage.data.filter(x=>x.purpose==='llm_operation'):[];
      checks.push(a('每个语义批次有账本',rows.length===Math.ceil(m.llmReviewedCount/3)&&rows.length>0,{rows:rows.length,expected:Math.ceil(m.llmReviewedCount/3)},'OBSERVABILITY'));
      checks.push(a('实际业务模型与指定35B一致',rows.length>0&&rows.every(x=>[expectedModel,modelId].includes(x.modelId)),[...new Set(rows.map(x=>x.modelId))],'MODEL_ROUTE'));
      if(c.long)checks.push(a('长文至少31节点且审完30正文条款',m.totalClauses>=31&&m.llmReviewedCount>=30,m,'COMPLETENESS'));
      if(c.replace)checks.push(a('新合同金额生效且无旧标记',text.includes('280000')&&!text.includes('CRW_ITEM_A')&&!text.includes('100000'),text.slice(0,500),'CONTEXT_BINDING'));
      if(c.injection)checks.push(a('合同引用未覆盖系统任务',m.healthScore!==100&&(m.highRiskCount+m.mediumRiskCount)>0&&output.clauses.length>=5,m,'INSTRUCTION_BOUNDARY'));
      if(c.compare){const ref=byId.get(c.compare)?.output;checks.push(a('格式变形/重复保留相同正文标记',!!ref&&markers.every(m=>ref.clauses.some(x=>(x.originalContent||'').includes(m))),{reference:c.compare},'METAMORPHIC'));}
      if(c.resume)checks.push(a('续接保持原执行单',!!previous?.executionId&&response.executionId===previous.executionId,{before:previous?.executionId,after:response.executionId},'EXECUTION_STATE'));
      const artifact=output.artifact;
      let artifactStatus=null,bytes=0,hash=null,downloadError=null;
      if(artifact?.url){try{const r=await fetch(artifact.url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});artifactStatus=r.status;const b=Buffer.from(await r.arrayBuffer());bytes=b.length;hash=digest(b);save(`${dir}/artifact.html`,b.toString('utf8'));}catch(e){downloadError=e.message;}}
      save(`${dir}/artifact-check.json`,{url:artifact?.url,status:artifactStatus,bytes,sha256:hash,error:downloadError});
      checks.push(a('原始交付URL可下载HTML实体',artifactStatus===200&&bytes>1000,{artifactStatus,bytes,error:downloadError},'DELIVERY'));
    }
  }else if(c.expect==='waiting'){
    checks.push(a('缺合同进入waiting_input',status==='waiting_input',status,'EXECUTION_STATE'));
    checks.push(a('缺参未生成审查产物',!output?.artifact,output?.artifact));
  }else if(c.expect==='reject'){
    checks.push(a('损坏文件未宣称成功',status!=='succeeded'&&!output?.artifact,status,'INPUT_VALIDATION'));
  }else if(c.expect==='explain'){
    checks.push(a('概念咨询不创建合同审查执行',!actualCapabilities.includes('platform.document.contract-reviewer')&&!response.executionId,{executionId:response.executionId,actualCapabilities},'ROUTING'));
  }
  const failed=checks.filter(x=>!x.passed);
  const record={id:c.id,name:c.name,status:failed.length?'failed':'passed',sessionId,executionId:response.executionId,traceIds:response.traceIds,actualCapabilities,executionStatus:status,requestDigest:digest(payload),fixtureDigest:c.fixture?digest(fixtures[c.fixture]):null,timing:{firstEventMs:response.firstEventMs,firstContentMs:response.firstContentMs,totalMs:response.totalMs},assertions:checks,failures:failed.map(x=>x.category),observedUsage:usage?.data||null};
  save(`${dir}/evidence.json`,record);byId.set(c.id,{...record,output});results.push(record);save(`${out}/summary.json`,results);
  console.log(`END ${c.id} ${record.status} ${response.totalMs}ms ${failed.map(x=>x.name).join('; ')}`);
}
save(`${out}/completed.json`,{endedAt:new Date().toISOString(),total:results.length,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,blocked:results.filter(x=>x.status==='blocked').length});
console.log(`COMPLETE ${out}`);process.exitCode=results.some(x=>x.status!=='passed')?1:0;
