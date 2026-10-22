// Personal-mode clarification and follow-up collector. No expected values/SQL.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const [source,evidenceDir]=process.argv.slice(2);
if(!source||!evidenceDir)throw new Error('Usage: node collect_dialogue.mjs SOURCE EVIDENCE_DIR');
const manifest=JSON.parse(await fs.readFile(path.join(evidenceDir,'clarification-manifest.json'),'utf8'));
const {accessToken}=JSON.parse(await fs.readFile(process.env.QUERY_E2E_AUTH_FILE,'utf8'));
if(!accessToken)throw new Error('Missing test token');
const base=(process.env.QUERY_E2E_BASE_URL||'http://127.0.0.1:3007').replace(/\/$/,'');
const endpoint=new URL(base);
if(!['http:','https:'].includes(endpoint.protocol)||endpoint.username||endpoint.password)throw new Error('Invalid endpoint');
if(endpoint.protocol!=='https:'&&!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error('Remote endpoint requires HTTPS');
const bytes=await fs.readFile(source);
const digest=crypto.createHash('sha256').update(bytes).digest('hex');
if(digest!==manifest.fixture_sha256)throw new Error('Fixture hash mismatch');
const selected=new Set((process.env.QUERY_E2E_IDS||'').split(',').filter(Boolean));
if([...selected].some(id=>!manifest.cases.some(c=>c.id===id)))throw new Error('Unknown scenario');
const runDir=path.join(evidenceDir,`dialogue-api-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(runDir);
const scrub=text=>text.replaceAll(accessToken,'REDACTED').replace(/([?&](?:token|access_token|signature|x-amz-signature|x-amz-credential)=)[^\s"&<>]+/gi,'$1REDACTED');
const save=(name,value)=>fs.writeFile(path.join(runDir,name),scrub(typeof value==='string'?value:JSON.stringify(value,null,2)));
const headers={Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'};
const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const runs=[];
for(const scenario of manifest.cases.filter(c=>!selected.size||selected.has(c.id))){
 const sessionId=`clarify-${scenario.id}-${crypto.randomUUID()}`;
 for(let index=0;index<scenario.turns.length;index++){
  const turn=scenario.turns[index],started=Date.now();
  const record={id:turn.id,scenarioId:scenario.id,sessionId,turn:index+1,fixtureSha256:digest,startedAt:new Date().toISOString(),status:'NEEDS_REVIEW'};
  let raw='';
  try{
   const body={message:turn.prompt,sessionId,config:{mode:'chat',thinking:true,webSearch:false,workspaceSearch:false}};
   if(index===0){
    const form=new FormData();form.append('file',new Blob([bytes],{type:mime}),path.basename(source));
    const upload=await fetch(`${base}/ai/chat/upload`,{method:'POST',headers:{Authorization:headers.Authorization},body:form,signal:AbortSignal.timeout(30000)});
    record.uploadHttpStatus=upload.status;if(!upload.ok)throw new Error(`Upload HTTP ${upload.status}`);
    const uploaded=await upload.json();if(!uploaded.fileId)throw new Error('Missing fileId');
    body.files=[{fileId:uploaded.fileId,fileName:path.basename(source),size:bytes.length,mimeType:mime}];
   }
   await save(`${turn.id}.request.json`,body);
   const response=await fetch(`${base}/ai/chat/stream`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(300000)});
   record.httpStatus=response.status;if(!response.ok)throw new Error(`Stream HTTP ${response.status}`);
   if(!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Expected SSE');
   const decoder=new TextDecoder();for await(const chunk of response.body)raw+=decoder.decode(chunk,{stream:true});raw+=decoder.decode();
   const events=raw.replace(/\r\n/g,'\n').split(/\n\n+/).flatMap(block=>{
    const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return[];try{return[JSON.parse(data)]}catch{return[{type:'parse_error',data}]}
   });
   await save(`${turn.id}.events.json`,events);
   record.done=events.some(e=>e.type==='done');
   record.hasResult=events.some(e=>e.type==='result');
   record.traceIds=[...new Set(events.flatMap(e=>[e.traceId,e.data?.traceId]).filter(Boolean))];
   record.eventTypes=events.reduce((m,e)=>(m[e.type]=(m[e.type]||0)+1,m),{});
   if(!record.done||!record.hasResult||events.some(e=>['error','parse_error'].includes(e.type)))record.status='STREAM_OR_EXECUTION_FAILURE';
   const history=await fetch(`${base}/ai/chat/history/${sessionId}`,{headers,signal:AbortSignal.timeout(30000)});
   record.historyHttpStatus=history.status;await save(`${turn.id}.history.json`,await history.text());
   if(!history.ok)record.status='HISTORY_EVIDENCE_FAILURE';
  }catch(error){record.status='COLLECTION_FAILURE';record.error=String(error)}
  record.seconds=(Date.now()-started)/1000;await save(`${turn.id}.sse.txt`,raw);
  runs.push(record);await save('runs.json',runs);console.log(`${turn.id}: ${record.status} (${record.seconds}s)`);
  // Snapshot the exact turn before the next reply updates the session envelope.
  const workspace=process.env.QUERY_E2E_WORKSPACE;
  if(workspace){
   const statePath=path.join(workspace,'.dsh/sessions',sessionId+'.evidence.json');
   try{const state=JSON.parse(await fs.readFile(statePath,'utf8'));await save(`${turn.id}.evidence.json`,state)}catch{}
  }
  if(record.status==='COLLECTION_FAILURE')break;
 }
}
if(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')!==digest)throw new Error('Source changed');
console.log(`Evidence: ${runDir}; interaction and task outcomes require independent review`);
process.exitCode=runs.some(r=>r.status!=='NEEDS_REVIEW')?1:2;
