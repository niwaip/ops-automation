// Explicitly scoped repair of admin's AMap query tools; never prints or replaces a credential.
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const fs = require('node:fs');
const db = new PrismaClient();
(async () => {
  const admin = await db.user.findUnique({ where: { username: 'admin' }, select: { id:true } });
  async function api(path, method='GET', body) {
    const response = await fetch('http://localhost:3001/mcp-integrations/'+path, {method,
      headers:{'Content-Type':'application/json','x-internal-auth':process.env.INTERNAL_API_SHARED_SECRET,'x-user-id':admin.id,'x-user-role':'admin'},
      body:body === undefined ? undefined : JSON.stringify(body)});
    const value=await response.json(); if(!response.ok) throw Error(`MCP configuration request failed (${response.status})`);
    return value;
  }
  const c=(await api('connections')).find(c=>c.scope==='personal'&&c.config.endpoint==='https://mcp.amap.com/mcp');
  if(!c)throw Error('Admin AMap connection missing');
  const catalog=await api(`connections/${c.id}/discover`,'POST',{});
  const names=['maps_direction_transit_integrated','maps_geo','maps_text_search'];
  const chosen=catalog.tools.filter(t=>names.includes(t.name));
  console.log(JSON.stringify({connectionId:c.id,tools:chosen.map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations}))}));
  if(process.argv[2]!=='--apply')return;
  if(chosen.length!==names.length)throw Error('Required AMap query tools missing');
  const current=(await api('tools?mode=personal')).filter(t=>t.connectionId===c.id);
  const transit=current.find(t=>t.remoteName==='maps_direction_transit_integrated');
  if(!transit || transit.effect!=='read')throw Error('Transit must be reviewed and published as read-only first');
  const published=await api(`connections/${c.id}/publish`,'POST',{tools:chosen.map(t=>({name:t.name,effect:'read',
    allowedRoles:current.find(b=>b.remoteName===t.name)?.allowedRoles || ['employee','manager','admin']}))});
  const skills=await api('skills?mode=personal');
  const report={configuredAt:new Date().toISOString(),connectionId:c.id,revisionUnchanged:true,credentialsUnchanged:true,
    before:current.map(t=>({name:t.remoteName,effect:t.effect})),published:published.tools.map(t=>({id:t.id,name:t.remoteName,effect:t.effect})),
    skill:skills.find(s=>s.connectionId===c.id)};
  fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-transit-config-repair-2026-11-05.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
