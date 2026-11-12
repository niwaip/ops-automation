// Controlled read-only live-model verification. Never prints a sandbox token.
const Docker=require('/workspace/apps/backend/execution-control/session-broker/node_modules/dockerode');
const {PrismaClient}=require('/workspace/apps/backend/platform/src/generated/prisma');
const {createHmac,randomUUID}=require('node:crypto');
const fs=require('node:fs');const d=new Docker();const db=new PrismaClient();
(async()=>{
 const user=await db.user.findUnique({where:{username:'admin'},select:{id:true}});
 const exp=Math.floor(Date.now()/1000)+600;
 const sig=createHmac('sha256',process.env.INTERNAL_API_SHARED_SECRET).update(`${user.id}:${exp}`).digest('base64url');
 const env=[`DEEPSEEK_API_KEY=sandbox-user-token-${user.id}.${exp}.${sig}`,'DEEPSEEK_BASE_URL=http://ai-orchestrator:3007/ai/proxy/v1'];
 const startedAt=new Date();const sessionId=`mcp-skill-test-${randomUUID()}`;
 const container=d.getContainer(`ops-user-sandbox-${user.id}`);
 if(!(await container.inspect()).State.Running)await container.start();
 if(process.argv[3]){
  const audit=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  if(audit.session.ownerUserId!==user.id)throw new Error('Seed audit belongs to another user');
  const history=[{role:'user',content:'用Microsoft Learn mcp 查找 azure vpn设置的方法'},{role:'assistant',content:audit.answer}];
  const seed=await container.exec({Cmd:['python3','-c',
   'import json,sys;from pathlib import Path;p=Path("/workspace/.dsh/sessions")/(sys.argv[1]+".json");p.parent.mkdir(parents=True,exist_ok=True);p.write_text(sys.argv[2])',
   sessionId,JSON.stringify(history)],User:'sandbox',AttachStdout:true,AttachStderr:true});
  const seedStream=await seed.start({Detach:false,Tty:false});
  await new Promise((r,j)=>{seedStream.resume();seedStream.on('end',r);seedStream.on('error',j)});
  if((await seed.inspect()).ExitCode!==0)throw new Error('Could not seed isolated verification history');
 }
 const e=await container.exec({Cmd:['dsh','run','用Microsoft Learn mcp 查找 azure vpn设置的方法','--session-id',sessionId,'--web-search','--thinking','--reasoning-effort','medium','--model','default'],Env:env,User:'sandbox',WorkingDir:'/workspace',AttachStdout:true,AttachStderr:true});
 const stream=await e.start({Detach:false,Tty:false});let stdout='',stderr='';
 const {Writable}=require('node:stream');
 d.modem.demuxStream(stream,new Writable({write(c,_,cb){stdout+=c.toString();cb()}}),new Writable({write(c,_,cb){stderr+=c.toString();cb()}}));
 await new Promise((r,j)=>{stream.on('end',r);stream.on('error',j)});
 const info=await e.inspect();
 const calls=await db.mcpInvocation.findMany({where:{userId:user.id,createdAt:{gte:startedAt}},select:{id:true,connectionId:true,bindingId:true,status:true,createdAt:true}});
 const metricsMatch=stdout.match(/<<<DSH_METRICS:len=\d+:(.*?)>>>/s);
 const metrics=metricsMatch?JSON.parse(metricsMatch[1]):null;
 const marker='<<<DSH_FINAL_OUTPUT>>>';
 const answer=stdout.slice(stdout.lastIndexOf(marker)+marker.length).trim();
 const steps=(metrics?.toolCalls||[]).map(c=>c.name);
 const progressiveDisclosureVerified=steps.indexOf('read_skill')>=0&&steps.indexOf('list_external_tools')>steps.indexOf('read_skill')&&steps.indexOf('call_external_tool')>steps.indexOf('list_external_tools');
 const proofVerified=metrics?.guardDecisions?.some(g=>g.guard==='mcp_answer_review'&&g.action==='accept');
 const passed=info.ExitCode===0&&calls.some(c=>c.status==='completed')&&answer.includes('本轮 MCP 检索来源')&&!answer.includes('产出成果库')&&proofVerified&&progressiveDisclosureVerified;
 const report={sessionId,seededHistory:Boolean(process.argv[3]),startedAt,finishedAt:new Date(),exitCode:info.ExitCode,calls,metrics,answer,passed,proofVerified,progressiveDisclosureVerified,stdout,stderr};
 fs.writeFileSync(process.argv[2] || '/workspace/docs/artifacts/reviews/mcp-optimized-live-model-verification-2026-11-05.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({sessionId,exitCode:info.ExitCode,calls,stdoutTail:stdout.slice(-2500),stderrTail:stderr.slice(-600)}));
 if(!passed)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
