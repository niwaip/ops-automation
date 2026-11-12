const fs=require('node:fs');const Redis=require('/workspace/apps/backend/intelligence/ai-orchestrator/node_modules/ioredis');
const {PrismaClient}=require('/workspace/apps/backend/platform/src/generated/prisma');
const redis=new Redis({host:process.env.REDIS_HOST||'redis',port:Number(process.env.REDIS_PORT||6379),password:process.env.REDIS_PASSWORD});const db=new PrismaClient();
(async()=>{
 const session=JSON.parse(await redis.get('chat_session:chat-session-1793845500138-bq8e9zrz'));
 const assistant=session.history.find(x=>x.role==='assistant' && String(x.timestamp).startsWith('2026-11-05T02:57:') && x.content.startsWith('本轮 MCP 已返回相关资料'));
 if(!assistant)throw new Error('Target assistant message not found; refusing to mix turns');
 const calls=await db.mcpInvocation.findMany({where:{userId:session.session.ownerUserId,createdAt:{gte:new Date('2026-11-05T02:56:00Z'),lt:new Date('2026-11-05T02:58:00Z')}},orderBy:{createdAt:'asc'}});
 const connection=await db.mcpConnection.findUnique({where:{id:'b8886e38-4c6d-4053-86ba-09197d38c9cd'}});
 const rev=await db.mcpConnectionRevision.findUnique({where:{id:connection.activeRevisionId}});
 const bindings=await db.mcpToolBinding.findMany({where:{connectionId:connection.id},select:{id:true,remoteName:true,effect:true}});
 const report={session:session.session,answer:assistant.content,answerTime:assistant.timestamp,trace:assistant.metadata?.executionTrace,calls,connection:{id:connection.id,name:connection.name,endpoint:rev.config.endpoint},bindings};
 fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-review-audit-evidence-2026-11-05-1057.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({answer:report.answer,answerTime:report.answerTime,trace:report.trace,calls:calls.map(c=>({id:c.id,createdAt:c.createdAt,updatedAt:c.updatedAt,status:c.status,resultCode:c.result?.code,isError:c.result?.isError,textChars:JSON.stringify(c.result).length})),connection:report.connection,bindings}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>{redis.disconnect();db.$disconnect()});
