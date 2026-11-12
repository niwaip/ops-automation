const {PrismaClient}=require('/workspace/apps/backend/platform/src/generated/prisma');
const fs=require('node:fs');const {randomUUID}=require('node:crypto');
const db=new PrismaClient();
async function main(){
 const admin=await db.user.findUnique({where:{username:'admin'},select:{id:true,username:true,activeOrgId:true}});
 if(!admin)throw Error('admin account not found');
 async function api(path,method='GET',body){const r=await fetch('http://localhost:3001/mcp-integrations/'+path,{method,headers:{'Content-Type':'application/json','x-internal-auth':process.env.INTERNAL_API_SHARED_SECRET,'x-user-id':admin.id,'x-user-role':'admin'},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${JSON.stringify(v)}`);return v;}
 const endpoint='https://learn.microsoft.com/api/mcp';
 let c=(await api('connections')).find(c=>c.ownerUserId===admin.id&&c.scope==='personal'&&c.config.endpoint===endpoint&&c.config.authType==='none');
 if(!c)c=await api('connections','POST',{name:'Microsoft Learn（公开测试）',scope:'personal',transport:'streamable_http',endpoint,authType:'none',timeoutMs:45000});
 const catalog=await api(`connections/${c.id}/discover`,'POST',{});
 const tool=catalog.tools.find(t=>t.name==='microsoft_docs_search');if(!tool)throw Error('Expected official search tool missing');
 const published=await api(`connections/${c.id}/publish`,'POST',{tools:[{name:tool.name,effect:'read',allowedRoles:['employee','manager','admin']}]});
 const args={query:'Azure SQL Database connection pooling best practices'};
 const result=await api(`tools/${published.tools[0].id}/invoke`,'POST',{mode:'personal',arguments:args,requestKey:randomUUID()});
 const report={testedAt:new Date().toISOString(),user:'admin',scope:'personal',endpoint,transport:'streamable_http',authentication:'none',connectionId:c.id,discoveredTools:catalog.tools.map(t=>t.name),publishedTool:tool.name,arguments:args,status:result.status,result:result.result};
 fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-public-admin-verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,result:JSON.stringify(result.result).slice(0,900)}));
 if(result.status!=='completed')throw Error('Public MCP invocation did not complete');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
