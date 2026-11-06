// Enable the official server's read-only document fetch capability for the admin test connection.
const {PrismaClient}=require('/workspace/apps/backend/platform/src/generated/prisma');
const db=new PrismaClient();
(async()=>{
 const user=await db.user.findUnique({where:{username:'admin'},select:{id:true}});
 const id='b8886e38-4c6d-4053-86ba-09197d38c9cd';
 const r=await fetch(`http://localhost:3001/mcp-integrations/connections/${id}/publish`,{method:'POST',headers:{'Content-Type':'application/json','x-internal-auth':process.env.INTERNAL_API_SHARED_SECRET,'x-user-id':user.id,'x-user-role':'admin'},body:JSON.stringify({tools:[{name:'microsoft_docs_fetch',effect:'read',allowedRoles:['employee','manager','admin']}]})});
 const v=await r.json();if(!r.ok)throw Error(`Publish failed: ${r.status}`);
 console.log(JSON.stringify({published:v.tools.map(t=>({name:t.remoteName,effect:t.effect}))}));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
