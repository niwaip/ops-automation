const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const Redis=require('/workspace/apps/backend/intelligence/ai-orchestrator/node_modules/ioredis');
const uid='e7fce333-a8f4-4097-9a53-f0a4c729da46';
const workspace=`/workspace/data/users/${uid}/workspace`;
const root='/workspace/docs/artifacts/reviews/shared-skill-admission-20261022';
const headers={'x-user-id':uid,'x-internal-auth':process.env.INTERNAL_API_SHARED_SECRET||process.env.INTERNAL_API_SECRET};
const fileName='工数实绩明细_20261020134124.xlsx',filePath=path.join(workspace,fileName);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
(async()=>{
 const before=hash(filePath), form=new FormData();
 form.append('file',new Blob([fs.readFileSync(filePath)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),fileName);
 const up=await fetch('http://127.0.0.1:3007/ai/chat/upload',{method:'POST',headers,body:form});assert(up.ok);const file={...await up.json(),source:'upload'};
 const tests=[
 {name:'implicit-threshold',message:'按 部门编号统计 各个部分的金额 合计超过500k的部门 有哪些',amount:'677.58544',rows:274,matched:1,llm:2},
 {name:'explicit-threshold',message:'使用部门别有偿统计，按部门编号统计金额合计超过500k的部门有哪些',amount:'561.75345',rows:253,matched:1,llm:2},
 {name:'explicit-fast',message:'使用部门别有偿统计，只要表格，无需解读',amount:'1637.41990',rows:253,llm:2},
 ];
 const redis=new Redis({host:process.env.REDIS_HOST||'redis',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD});const results=[];
 try{for(const test of tests.filter(t=>!process.env.ONLY_CASE||t.name===process.env.ONLY_CASE)){
  const sessionId=`shared-skill-v3-${test.name}-20261022`,start=Date.now();
  const response=await fetch('http://127.0.0.1:3007/ai/chat/stream',{method:'POST',headers:{...headers,'content-type':'application/json'},signal:AbortSignal.timeout(120000),body:JSON.stringify({sessionId,message:test.message,clientMessageId:sessionId+'-u',clientAssistantMessageId:sessionId+'-a',modelId:'d13e0d30-87b9-4e87-b96a-d8b1b3cf78af',config:{mode:'chat',webSearch:false,thinking:false},files:[file]})});assert(response.ok);
  const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',events=[];
  for(;;){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});const lines=pending.split('\n');pending=lines.pop();for(const line of lines){if(!line.startsWith('data:'))continue;try{const e=JSON.parse(line.slice(5).trim());if(e.type==='done'||e.content||e.data?.isDelta)events.push({type:e.type,content:e.content,isDelta:e.data?.isDelta,ms:Date.now()-start})}catch{}}}
  const s=JSON.parse(await redis.get('chat_session:'+sessionId));const a=s.history.filter(h=>h.role==='assistant').pop();
  const trace=a.metadata.executionTrace,metrics=trace.metrics;
  const hp=path.join(workspace,'.dsh/sessions',sessionId+'.json');const history=JSON.parse(fs.readFileSync(hp));const v=history.filter(h=>h.role==='assistant').pop().verification||{verified:false};
  const archive=v.turn_id?JSON.parse(fs.readFileSync(hp.replace(/\.json$/,'.evidence')+'/'+v.turn_id+'.json')):{receipts:[]};
  const accepted=archive.receipts.filter(r=>r.status==='success').pop();
  const result={test,sessionId,elapsedMs:Date.now()-start,answer:a.content,trace,verification:v,receipt:accepted?.data,events};results.push(result);fs.writeFileSync(path.join(root,'live-results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({case:test.name,elapsedMs:result.elapsedMs,verified:v.verified,modelCalls:metrics.llmInvocations,guards:metrics.guardDecisions,answer:a.content}));
  assert.equal(before,hash(filePath));assert.equal(v.verified,true);const intent=metrics.guardDecisions.find(g=>g.guard==='task_intent'&&g.action==='accept').reason;assert.equal(intent.output_mode,'conversation');assert.deepEqual(intent.artifact_types,[]);if(test.matched)assert(a.content.includes('FC45031'));assert(metrics.llmInvocations>=2&&metrics.llmInvocations<=10);
  assert(metrics.guardDecisions.some(g=>(g.guard==='personal_skill_review'||g.guard==='spreadsheet_evidence')&&g.action==='accept'));
  if(test.matched){assert.equal(accepted.data.rows.length,test.matched);assert.equal((accepted.data.rows[0]['部门编号']||accepted.data.rows[0].group_key),'FC45031');assert.equal(accepted.data.stages.where_rows,test.rows);assert.equal(accepted.data.plan.having.op,'gt');const metric=accepted.data.plan.metrics.find(m=>m.op==='sum').id;assert.equal(Number(accepted.data.rows[0][metric]),Number(test.amount));}
  else {assert.equal(accepted.data.included_rows??accepted.data.stages.where_rows,test.rows);if(accepted.data.rows){const metric=accepted.data.plan.metrics.find(m=>m.op==='sum').id;const scaled=s=>{const [a,b='']=String(s).split('.');return BigInt(a)*100000n+BigInt(b.padEnd(5,'0'))};assert.equal(accepted.data.rows.reduce((v,r)=>v+scaled(r[metric]),0n),scaled(test.amount));}}
 }}finally{await redis.quit()}
 console.log('ALL_LIVE_CASES_PASSED');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
