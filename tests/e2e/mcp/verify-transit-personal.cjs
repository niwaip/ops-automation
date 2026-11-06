// Real model -> current admin sandbox -> existing MCP gateway -> official AMap read tools.
const Docker=require('/workspace/apps/backend/execution-control/session-broker/node_modules/dockerode');
const {PrismaClient}=require('/workspace/apps/backend/platform/src/generated/prisma');
const {createHmac,randomUUID}=require('node:crypto');
const fs=require('node:fs');const {Writable}=require('node:stream');
const d=new Docker(),db=new PrismaClient();
(async()=>{
 const user=await db.user.findUnique({where:{username:'admin'},select:{id:true}});
 const exp=Math.floor(Date.now()/1000)+600;
 const sig=createHmac('sha256',process.env.INTERNAL_API_SHARED_SECRET).update(`${user.id}:${exp}`).digest('base64url');
 const env=[`DEEPSEEK_API_KEY=sandbox-user-token-${user.id}.${exp}.${sig}`,'DEEPSEEK_BASE_URL=http://ai-orchestrator:3007/ai/proxy/v1'];
 const sessionId=`mcp-transit-test-${randomUUID()}`,startedAt=new Date();
 const query='查看公共交通，如果从中星海上名庭到 恒生银行大厦';
 const container=d.getContainer(`ops-user-sandbox-${user.id}`);
 if(!(await container.inspect()).State.Running)await container.start();
 const e=await container.exec({Cmd:['dsh','run',query,'--session-id',sessionId,'--web-search','--thinking','--reasoning-effort','medium','--model','default'],Env:env,User:'sandbox',WorkingDir:'/workspace',AttachStdout:true,AttachStderr:true});
 const stream=await e.start({Detach:false,Tty:false});let stdout='',stderr='';
 d.modem.demuxStream(stream,new Writable({write(c,_,cb){stdout+=c.toString();cb();}}),new Writable({write(c,_,cb){stderr+=c.toString();cb();}}));
 await new Promise((r,j)=>{stream.on('end',r);stream.on('error',j);});
 const info=await e.inspect();
 const match=stdout.match(/<<<DSH_METRICS:len=\d+:(.*?)>>>/s),metrics=match?JSON.parse(match[1]):null;
 const evidenceExec=await d.getContainer(`ops-user-sandbox-${user.id}`).exec({Cmd:['cat',`/workspace/.dsh/sessions/${sessionId}.evidence.json`],User:'sandbox',AttachStdout:true,AttachStderr:true});
 const evidenceStream=await evidenceExec.start({Detach:false,Tty:false});let evidenceText='';
 d.modem.demuxStream(evidenceStream,new Writable({write(c,_,cb){evidenceText+=c.toString();cb();}}),new Writable({write(c,_,cb){cb();}}));
 await new Promise((r,j)=>{evidenceStream.on('end',r);evidenceStream.on('error',j);});
 const evidence=JSON.parse(evidenceText),ids=new Set();
 function findIds(v){if(Array.isArray(v))v.forEach(findIds);else if(v&&typeof v==='object')for(const[k,item]of Object.entries(v)){if(['invocationId','invocation_id'].includes(k)&&typeof item==='string')ids.add(item);else findIds(item);}}
 findIds(evidence);
 const calls=await db.mcpInvocation.findMany({where:{id:{in:[...ids]},userId:user.id,connectionId:'243083c4-31a0-44ff-b24f-2acf67029cc4',createdAt:{gte:startedAt}},orderBy:{createdAt:'asc'},select:{id:true,bindingId:true,status:true,createdAt:true,result:true}});
 const bindings=await db.mcpToolBinding.findMany({where:{id:{in:calls.map(c=>c.bindingId)}},select:{id:true,remoteName:true}});
 const namedCalls=calls.map(c=>({...c,name:bindings.find(b=>b.id===c.bindingId)?.remoteName}));
 function unpack(result){if(result?.structuredContent)return result.structuredContent;for(const b of result?.content||[])if(b.type==='text'){try{return JSON.parse(b.text);}catch{}}return null;}
 const coordinates=new Set();let coordinateProvenanceVerified=false;
 function collect(v){if(typeof v==='string'&&/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(v))coordinates.add(v.split(',').map(Number).join(','));else if(Array.isArray(v))v.forEach(collect);else if(v&&typeof v==='object')Object.values(v).forEach(collect);}
 for(const c of namedCalls){const raw=unpack(c.result);if(c.name==='maps_direction_transit_integrated'&&c.status==='completed'){
   coordinateProvenanceVerified=Boolean(raw?.origin&&raw?.destination&&coordinates.has(raw.origin.split(',').map(Number).join(','))&&coordinates.has(raw.destination.split(',').map(Number).join(',')));
 }else if(c.status==='completed')collect(raw);}
 const answer=stdout.slice(stdout.lastIndexOf('<<<DSH_FINAL_OUTPUT>>>')+'<<<DSH_FINAL_OUTPUT>>>'.length).trim();
 const steps=metrics?.toolCalls||[];
 const route=metrics?.guardDecisions?.find(g=>g.guard==='mcp_skill_route');
 const originalEntitiesPreserved=answer.includes('恒生银行大厦')&&!answer.includes('前往**上海虹桥');
 const geoBindings=new Set(bindings.filter(b=>b.remoteName==='maps_geo').map(b=>b.id));
 const placeArguments=steps.filter(t=>t.name==='call_external_tool'&&geoBindings.has(t.params?.binding_id)).map(t=>String(t.params.arguments).match(/['"]address['"]:\s*['"]([^'"]*)['"]/)?.[1]);
 const originalPlaceArgumentsVerified=placeArguments.length===2&&placeArguments[0]==='中星海上名庭'&&placeArguments[1]==='恒生银行大厦';
 const dependencyBound=metrics?.guardDecisions?.some(g=>g.guard==='mcp_dependency_step'&&g.action==='bound');
 const passed=info.ExitCode===0&&route?.action==='selected'&&coordinateProvenanceVerified&&originalEntitiesPreserved&&originalPlaceArgumentsVerified&&dependencyBound&&!steps.some(t=>t.name==='web_search')
   &&namedCalls.some(c=>c.name==='maps_direction_transit_integrated'&&c.status==='completed')
   &&namedCalls.some(c=>['maps_geo','maps_text_search'].includes(c.name)&&c.status==='completed')
   &&!answer.includes('尚未取得目标工具')&&!metrics?.guardDecisions?.some(g=>g.guard==='mcp_objective'&&g.action==='incomplete');
 const report={sessionId,query,startedAt,finishedAt:new Date(),exitCode:info.ExitCode,calls:namedCalls,metrics,answer,passed,originalEntitiesPreserved,originalPlaceArgumentsVerified,dependencyBound,coordinateProvenanceVerified,evidenceBoundInvocationIds:[...ids],stdout,stderr};
 fs.writeFileSync(process.argv[2]||'/workspace/docs/artifacts/reviews/mcp-transit-live-verification-2026-11-05.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({sessionId,passed,coordinateProvenanceVerified,exitCode:info.ExitCode,calls:namedCalls.map(({id,name,status})=>({id,name,status})),route,answer,stderrTail:stderr.slice(-500)}));
 if(!passed)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
