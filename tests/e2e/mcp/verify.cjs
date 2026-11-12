const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const fs = require('node:fs');
const { PrismaClient } = require('/workspace/apps/backend/platform/src/generated/prisma');
const db = new PrismaClient();
const run = process.env.MCP_TEST_RUN;
const tokenEntries = Object.entries(JSON.parse(process.env.MCP_TEST_TOKENS));
const report = { run, assertions: [], limitations: ['Controlled MCP service with real PostgreSQL; no model or production database credentials used.', 'Personal private fixture routing is seeded directly in test data; production personal connections reject private addresses.', 'Gateway and registry integration verified; no full model conversation or browser interaction tested.'] };
const check = (name, fn) => { fn(); report.assertions.push(name); };
const orgIds = [], userIds = [], connections = [], skills = [];
function jwt(id, orgId) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ sub: id, role: 'employee', activeOrgId: orgId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
  return `${h}.${p}.${createHmac('sha256',process.env.JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
async function api(user, path, method='GET', body, expected=200) {
  const r = await fetch(`http://localhost:3016/mcp-integrations/${path}`, { method, headers: { Authorization: `Bearer ${user.jwt}`, 'Content-Type':'application/json' }, body: body===undefined?undefined:JSON.stringify(body) });
  const data = await r.json();
  if (r.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
async function user(role, org) {
  const id=randomUUID(); userIds.push(id);
  await db.user.create({data:{id,username:`mcp-${run}-${role}-${userIds.length}`,passwordHash:'not-a-login-password',role,activeOrgId:org}});
  await db.orgMembership.create({data:{userId:id,orgId:org,status:'active'}});
  return {id,jwt:jwt(id,org)};
}
async function balance(u,binding,mode='work') {
  const v=await api(u,`tools/${binding.id}/invoke`,'POST',{arguments:{},requestKey:randomUUID(),mode},201);
  assert.equal(v.status,'completed',JSON.stringify(v));
  return JSON.parse(v.result.content[0].text);
}

async function main() {
  for(let i=0;i<2;i++){const id=randomUUID();orgIds.push(id);await db.organization.create({data:{id,name:`MCP verification ${run} ${i}`,code:`mcp-${run}-${i}`}});}
  const admin=await user('admin',orgIds[0]), a=await user('employee',orgIds[0]), b=await user('employee',orgIds[0]), outsider=await user('employee',orgIds[1]);
  const config={name:'MCP PostgreSQL verification',scope:'organization',endpoint:'http://mcp-test-fixture:3199/mcp',authType:'bearer',privateHosts:['mcp-test-fixture'],timeoutMs:1500};
  await api(a,'connections','POST',config,403); report.assertions.push('ordinary user cannot configure work connection');
  const c=await api(admin,'connections','POST',config,201);connections.push(c.id);
  await api(outsider,`connections/${c.id}/authorization`,'PUT',{token:tokenEntries[1][0]},403);report.assertions.push('cross-organization authorization rejected');
  for(const [u,t] of [[admin,tokenEntries[0][0]],[a,tokenEntries[0][0]],[b,tokenEntries[1][0]]]) await api(u,`connections/${c.id}/authorization`,'PUT',{token:t});
  const catalog=await api(admin,`connections/${c.id}/discover`,'POST',{},201);
  check('SDK initialize and tools/list against real HTTP MCP service',()=>assert.equal(catalog.tools.length,3));
  const published=await api(admin,`connections/${c.id}/publish`,'POST',{tools:catalog.tools.map(t=>({name:t.name,effect:t.name==='balance'?'read':'write',allowedRoles:['employee','admin']}))},201);
  skills.push(...published.tools.map(t=>`platform.mcp.${t.id}`));
  const get=n=>published.tools.find(t=>t.remoteName===n);
  const skillId=`mcp-${c.id}`;
  const workSkills=await api(a,'skills?mode=work');
  assert.equal(workSkills.find(s=>s.id===skillId).source,'mcp');
  assert.equal(workSkills.find(s=>s.id===skillId).read_only,false);
  assert.ok(!JSON.stringify(workSkills).includes('inputSchema'));
  const detail=await api(a,`skills/${skillId}?mode=work`);
  assert.equal(detail.tools.length,3);assert.ok(!JSON.stringify(detail).includes('inputSchema'));
  const single=await api(a,`disclosure?mode=work&skill_id=${skillId}&tool_name=balance`);
  assert.equal(single.id,get('balance').id);assert.ok(single.inputSchema);
  await api(outsider,`skills/${skillId}?mode=work`,'GET',undefined,404);
  assert.ok(!(await api(a,'skills?mode=personal')).some(s=>s.id===skillId));
  report.assertions.push('MCP Skill metadata, tool index and one contract are disclosed separately with organization/mode isolation');
  await api(admin,`connections/${c.id}/status`,'POST',{disabled:true},201);
  assert.ok(!(await api(a,'skills?mode=work')).some(s=>s.id===skillId));
  await api(admin,`connections/${c.id}/status`,'POST',{disabled:false},201);
  report.assertions.push('disabling connection withdraws its virtual Skill immediately');
  process.env.AUTH_SERVICE_URL='http://localhost:3016';
  const workHandler=require('/workspace/apps/backend/execution-control/control-plane/dist/apps/backend/execution-control/control-plane/src/modules/execution/adapters/mcp/mcp-invoke.handler.js').executeMcpTool;
  const workRead=await workHandler({publishedSkillId:`platform.mcp.${get('balance').id}`,input:{},traceContext:{userId:a.id}},randomUUID());
  assert.equal(workRead.success,true);assert.equal(JSON.parse(workRead.output.result.content[0].text).owner,'user-a');
  const workPending=await workHandler({publishedSkillId:`platform.mcp.${get('credit').id}`,input:{amount:1},traceContext:{userId:a.id}},randomUUID());
  assert.equal(workPending.status,'blocked');
  report.assertions.push('real work handler forwards trusted identity and blocks writes for confirmation');
  {
    const root='/workspace/apps/backend/governance/workbench/dist';
    const Access=require(`${root}/integrations/mcp/mcp-access.service.js`).McpAccessService;
    const Auth=require(`${root}/integrations/mcp/mcp-authorization.service.js`).McpAuthorizationService;
    const Crypto=require(`${root}/credentials/user-credential.crypto.js`).UserCredentialCrypto;
    const Invocation=require(`${root}/integrations/mcp/mcp-invocation.service.js`).McpInvocationService;
    const Runner=require(`${root}/integrations/mcp/mcp-runner.client.js`).McpRunnerClient;
    const access=new Access(db), auth=new Auth(db,access,new Crypto()), runner=new Runner();
    const actor=await access.actor({user:{id:a.id}});let attempts=0;
    const retrying={call:async (...args)=>{attempts++;if(attempts===1)throw Object.assign(new Error('controlled transient'),{category:'timeout',phase:'connect'});return runner.call(...args);}};
    const service=new Invocation(db,access,auth,retrying);
    const recovered=await service.invoke(actor,get('balance').id,{},randomUUID(),'work');
    assert.equal(recovered.status,'completed');assert.equal(attempts,2);
    report.assertions.push('read-only transient failure retries once and returns real remote data');
    let writeAttempts=0;
    const failing=new Invocation(db,access,auth,{call:async()=>{writeAttempts++;throw Object.assign(new Error('controlled timeout'),{category:'timeout',phase:'invoke'});}});
    const staged=await failing.invoke(actor,get('credit').id,{amount:99},randomUUID(),'work');
    const uncertain=await failing.confirm(actor,staged.invocationId);
    assert.equal(uncertain.status,'outcome_unknown');assert.equal(writeAttempts,1);assert.equal(uncertain.phase,'invoke');assert.equal(uncertain.category,'timeout');
    report.assertions.push('write timeout never retries and retains a safe failure phase/category');
  }
  const [ba,bb]=await Promise.all([balance(a,get('balance')),balance(b,get('balance'))]);
  check('concurrent users use independent external identities',()=>{assert.equal(ba.owner,'user-a');assert.equal(bb.owner,'user-b');});
  {
    const queryConfig={...config,name:'Query API Key verification',endpoint:'http://mcp-test-fixture:3199/query-mcp',authType:'api_key',authLocation:'query',queryParameter:'key'};
    await api(a,'connections','POST',queryConfig,403);
    const query=await api(admin,'connections','POST',queryConfig,201);connections.push(query.id);
    const queryCredentials=[[admin,tokenEntries[0][0]],[a,tokenEntries[0][0]],[b,tokenEntries[1][0]]].map(([u,t])=>[u,t+'/+ =?&']);
    for(const [u,t] of queryCredentials)await api(u,`connections/${query.id}/authorization`,'PUT',{token:t});
    const discovered=await api(admin,`connections/${query.id}/discover`,'POST',{},201);
    assert.equal(discovered.tools.length,3);
    assert.ok(discovered.tools.find(t=>t.name==='balance').description.includes('[REDACTED]'));
    const queryPublished=await api(admin,`connections/${query.id}/publish`,'POST',{tools:[{name:'balance',effect:'read',allowedRoles:['employee','admin']}]},201);
    skills.push(...queryPublished.tools.map(t=>`platform.mcp.${t.id}`));
    const [qa,qb]=await Promise.all([balance(a,queryPublished.tools[0]),balance(b,queryPublished.tools[0])]);
    assert.equal(qa.owner,'user-a');assert.equal(qb.owner,'user-b');
    for(const result of [qa,qb]) assert.deepEqual(result.credentialEcho,['[REDACTED]','?key=[REDACTED]','[REDACTED]']);
    const saved=await db.mcpConnectionRevision.findUnique({where:{id:query.revisionId}});
    assert.equal(new URL(saved.config.endpoint).search,'');assert.equal(saved.config.queryParameter,'key');
    const persisted=JSON.stringify({saved,bindings:await db.mcpToolBinding.findMany({where:{connectionId:query.id}}),
      invocations:await db.mcpInvocation.findMany({where:{connectionId:query.id}}),discovered});
    for(const [,t] of queryCredentials){assert.ok(!persisted.includes(t));assert.ok(!persisted.includes(encodeURIComponent(t)));assert.ok(!persisted.includes(new URLSearchParams({key:t}).toString().slice(4)));}
    await api(a,`connections/${query.id}/authorization`,'DELETE');
    await api(a,`tools/${queryPublished.tools[0].id}/invoke`,'POST',{mode:'work',arguments:{},requestKey:randomUUID()},401);
    await api(admin,'connections','POST',{...queryConfig,endpoint:queryConfig.endpoint+'?key=fixture'},400);
    await api(admin,'connections','POST',{...queryConfig,queryParameter:'key&other'},400);
    report.assertions.push('query API Key initializes and invokes through the real SDK; special characters round-trip and concurrent users retain separate identities');
    report.assertions.push('query authentication preserves admin/revocation boundaries and rejects raw URL credentials');
    report.assertions.push('plain and URL-encoded query credentials are absent from discovery, published bindings, connection config and persisted tool results');
  }
  await api(outsider,`tools/${get('balance').id}/invoke`,'POST',{mode:'work',arguments:{},requestKey:randomUUID()},403);report.assertions.push('cross-organization invocation rejected');
  await api(a,`tools/${get('balance').id}/invoke`,'POST',{mode:'personal',arguments:{},requestKey:randomUUID()},403);report.assertions.push('work binding cannot be invoked as personal');
  await api(a,`tools/${get('credit').id}/invoke`,'POST',{mode:'work',arguments:{amount:'invalid'},requestKey:randomUUID()},400);report.assertions.push('input contract rejects wrong parameter type');
  const key=randomUUID();
  const pending=await api(a,`tools/${get('credit').id}/invoke`,'POST',{mode:'work',arguments:{amount:7},requestKey:key},201);
  check('write is not sent before human confirmation',()=>assert.equal(pending.status,'awaiting_confirmation'));
  assert.equal((await balance(a,get('balance'))).total,'0');
  await api(b,`invocations/${pending.invocationId}/confirm`,'POST',{},403);report.assertions.push('other user cannot approve write');
  const written=await api(a,`invocations/${pending.invocationId}/confirm`,'POST',{},201);
  check('confirmed write commits in real PostgreSQL',()=>assert.equal(written.status,'completed'));
  await api(a,`invocations/${pending.invocationId}/confirm`,'POST',{},201);
  await api(a,`tools/${get('credit').id}/invoke`,'POST',{mode:'work',arguments:{amount:7},requestKey:key},201);
  check('confirmation replay and same request key do not duplicate write',()=>assert.equal(written.result.content.length,1));
  assert.equal((await balance(a,get('balance'))).total,'7');assert.equal((await balance(b,get('balance'))).total,'0');
  await api(a,`tools/${get('credit').id}/invoke`,'POST',{mode:'work',arguments:{amount:8},requestKey:key},409);report.assertions.push('idempotency key cannot be rebound to different arguments');
  const lost=await api(a,`tools/${get('credit_response_lost').id}/invoke`,'POST',{mode:'work',arguments:{amount:3},requestKey:randomUUID()},201);
  const unknown=await api(a,`invocations/${lost.invocationId}/confirm`,'POST',{},201);
  check('committed write with lost response is outcome_unknown',()=>assert.equal(unknown.status,'outcome_unknown'));
  await api(a,`invocations/${lost.invocationId}/confirm`,'POST',{},201);
  assert.equal((await balance(a,get('balance'))).total,'10');report.assertions.push('uncertain write is not retried');
  await api(a,`connections/${c.id}/authorization`,'DELETE');
  await api(a,`tools/${get('balance').id}/invoke`,'POST',{mode:'work',arguments:{},requestKey:randomUUID()},401);report.assertions.push('revocation immediately blocks execution');
  await api(a,`connections/${c.id}/authorization`,'PUT',{token:tokenEntries[0][0]});
  const credentials=await db.userCredential.findMany({where:{userId:{in:userIds},purpose:'mcp_transport'}});
  check('tokens are encrypted with fixed masked preview',()=>{for(const cr of credentials){assert.ok(!cr.encryptedData.includes(tokenEntries[0][0]));assert.ok(!JSON.stringify(cr.maskedPreview).includes(tokenEntries[0][0]));}});
  const activeAuthorization=await db.userMcpAuthorization.findUnique({where:{userId_connectionId:{userId:a.id,connectionId:c.id}}});
  const cred=credentials.find(x=>x.id===activeAuthorization.credentialId);
  await db.userCredential.update({where:{id:cred.id},data:{expiresAt:new Date(Date.now()-1000)}});
  await api(a,`tools/${get('balance').id}/invoke`,'POST',{mode:'work',arguments:{},requestKey:randomUUID()},401);report.assertions.push('expired credential is rejected');
  await api(a,`connections/${c.id}/authorization`,'PUT',{token:tokenEntries[0][0]});
  await api(admin,`connections/${c.id}`,'PUT',config);
  await api(a,`tools/${get('balance').id}/invoke`,'POST',{mode:'work',arguments:{},requestKey:randomUUID()},403);report.assertions.push('new endpoint revision invalidates old tools and consent');
  // Personal production policy forbids private addresses; fixture routing is seeded directly for bridge verification.
  const personal=await api(a,'connections','POST',{name:'Personal fixture',scope:'personal',endpoint:'https://example.com/mcp',authType:'bearer'},201);connections.push(personal.id);
  await db.mcpConnectionRevision.update({where:{id:personal.revisionId},data:{config:{...config,headerName:'Authorization',privateHosts:['mcp-test-fixture']}}});
  await api(a,`connections/${personal.id}/authorization`,'PUT',{token:tokenEntries[0][0]});
  await api(b,`connections/${personal.id}`,'PUT',config,403);report.assertions.push('personal connection is owner-only');
  const p=await api(a,`connections/${personal.id}/publish`,'POST',{tools:[{name:'balance',effect:'read'}]},201);
  const Personal=require('/workspace/apps/backend/intelligence/ai-orchestrator/dist/modules/mcp-client/mcp-personal.controller.js').McpPersonalController;
  const bridge=new Personal();
  assert.equal((await api(a,'skills?mode=personal')).find(s=>s.id===`mcp-${personal.id}`).read_only,true);
  const contract=await api(a,`disclosure?skill_id=mcp-${personal.id}&tool_name=balance`);
  await api(a,`sandbox/tools/${p.tools[0].id}/invoke`,'POST',{arguments:{},requestKey:randomUUID()},401);
  await api(a,`sandbox/tools/${p.tools[0].id}/invoke`,'POST',{arguments:{},requestKey:randomUUID(),contractToken:contract.contractToken+'x'},401);
  await api(b,`sandbox/tools/${p.tools[0].id}/invoke`,'POST',{arguments:{},requestKey:randomUUID(),contractToken:contract.contractToken},401);
  report.assertions.push('sandbox calls require a current signed contract receipt bound to the user and tool');
  const parts=contract.contractToken.split('.');const claims=JSON.parse(Buffer.from(parts[0],'base64url'));claims.exp=Date.now()-1000;
  const expiredPayload=Buffer.from(JSON.stringify(claims)).toString('base64url');
  const expiredToken=expiredPayload+'.'+createHmac('sha256',process.env.INTERNAL_API_SHARED_SECRET).update('mcp-contract:'+expiredPayload).digest('base64url');
  await api(a,`sandbox/tools/${p.tools[0].id}/invoke`,'POST',{arguments:{},requestKey:randomUUID(),contractToken:expiredToken},401);
  report.assertions.push('expired contract receipts are rejected');
  const personalResult=await bridge.invoke({user:{id:a.id}},{bindingId:p.tools[0].id,arguments:{},requestKey:randomUUID(),contractToken:contract.contractToken,mode:'work',userId:b.id});
  assert.equal(personalResult.status,'completed');assert.equal(JSON.parse(personalResult.result.content[0].text).owner,'user-a');
  await assert.rejects(bridge.invoke({user:{id:a.id}},{bindingId:get('balance').id,arguments:{},requestKey:randomUUID()}));
  report.assertions.push('personal proxy forwards authenticated actor and cannot override mode or call work bindings');
  assert.equal((await balance(a,p.tools[0],'personal')).owner,'user-a');report.assertions.push('personal mode invokes a real database tool with owner credential');
  const vault=require('/workspace/apps/backend/governance/workbench/dist/credentials/user-credential-vault.service.js');
  const crypto=require('/workspace/apps/backend/governance/workbench/dist/credentials/user-credential.crypto.js');
  const v=new vault.UserCredentialVaultService(db,new crypto.UserCredentialCrypto());
  assert.deepEqual(await v.getUserEnv(a.id),{});
  assert.equal(await v.resolveTestToken('SAVED_KEY',a.id,cred.id), '');
  const redact=require('/workspace/apps/backend/governance/workbench/dist/integrations/mcp/mcp-invocation.service.js').redactTransportSecret;
  const tricky='token'+String.fromCharCode(34,92);
  assert.deepEqual(redact({text:tricky,nested:[tricky]},tricky),{text:'[REDACTED]',nested:['[REDACTED]']});
  report.assertions.push('generic token test cannot export MCP credentials; escaped secrets are redacted');
  await assert.rejects(v.getDecryptedPayload(a.id,cred.id));report.assertions.push('MCP secrets excluded from sandbox environment and generic credential resolver');
  const permission=require('/workspace/apps/backend/registry-release/skill-registry/dist/builtin/permissions/mcp-binding-permission.js');
  assert.equal((await permission.authorizeMcpBinding(db,skills[0],outsider.id,orgIds[1])).authorized,false);report.assertions.push('work capability catalog enforces organization boundary');
  const serialized=JSON.stringify(await db.mcpInvocation.findMany({where:{userId:{in:userIds}}}));
  for(const [t] of tokenEntries)assert.ok(!serialized.includes(t));report.assertions.push('invocation persistence does not contain transport tokens');
  report.passed=true;
} 

main().catch(e=>{report.passed=false;report.error=e.message;process.exitCode=1;}).finally(async()=>{
  const out=process.env.MCP_VERIFICATION_OUTPUT || '/workspace/docs/artifacts/reviews/mcp-outbound-verification-2026-11-05.json';
  fs.mkdirSync(require('node:path').dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await db.mcpInvocation.deleteMany({where:{userId:{in:userIds}}});
  await db.builtinSkill.deleteMany({where:{capabilityKey:{in:skills}}});
  await db.mcpToolBinding.deleteMany({where:{connectionId:{in:connections}}});
  await db.mcpConnection.deleteMany({where:{id:{in:connections}}});
  await db.user.deleteMany({where:{id:{in:userIds}}});await db.organization.deleteMany({where:{id:{in:orgIds}}});
  await db.$disconnect();
});
