// Read-only audit of the actual admin sandbox and persisted MCP registration.
const Docker=require('/workspace/apps/backend/execution-control/session-broker/node_modules/dockerode');
const d=new Docker();
const {createHmac}=require('node:crypto');
const userId='e7fce333-a8f4-4097-9a53-f0a4c729da46';
const exp=Math.floor(Date.now()/1000)+600;
const signature=createHmac('sha256',process.env.INTERNAL_API_SHARED_SECRET).update(`${userId}:${exp}`).digest('base64url');
const env=[`DEEPSEEK_API_KEY=sandbox-user-token-${userId}.${exp}.${signature}`, 'DEEPSEEK_BASE_URL=http://ai-orchestrator:3007/ai/proxy/v1'];
const source=`import sys,json
from pathlib import Path
sys.path.insert(0,'/usr/local/bin')
from dsh_modules.skill_router import SkillRouter
from dsh_modules.skills import get_available_skills
from dsh_modules.tool_routing import select_active_tools
prompt='用Microsoft Learn mcp 查找 azure vpn设置的方法'
skills=get_available_skills()
r=SkillRouter.route(prompt,files=[],available_skills=skills,load_skill_context=False)
tools=select_active_tools(prompt,r,True,True)
from dsh_modules.skills import read_skill
from dsh_modules.prompt_builder import build_skills_catalog
from dsh_modules.runtime_policy import RuntimePolicy
mcp=[s for s in skills if s.get('source')=='mcp']
assert mcp, 'MCP Skill not in current user catalog'
assert r.skill_id=='mcp-b8886e38-4c6d-4053-86ba-09197d38c9cd', 'Router did not select expected MCP Skill'
body=read_skill(r.skill_id)
assert 'inputSchema' not in body
assert 'inputSchema' not in build_skills_catalog(skills)
print(json.dumps({'mcp_catalog_chars':len(build_skills_catalog(mcp)),'skill_body_chars':len(body),'round_budget':RuntimePolicy().determine_max_rounds(prompt,skill_res=r),'prompt':prompt,'selected_skill':r.skill_id,'skills':[{'id':s['id'],'name':s.get('name')} for s in skills],'tools':[t['function']['name'] for t in tools]},ensure_ascii=False))
`;
(async()=>{
 const e=await d.getContainer('ops-user-sandbox-e7fce333-a8f4-4097-9a53-f0a4c729da46').exec({Cmd:['python3','-c',source],Env:env,User:'sandbox',AttachStdout:true,AttachStderr:true});
 const stream=await e.start({Detach:false,Tty:false});d.modem.demuxStream(stream,process.stdout,process.stderr);
 await new Promise((r,j)=>{stream.on('end',r);stream.on('error',j)});
 const info=await e.inspect();if(info.ExitCode)process.exitCode=info.ExitCode;
})().catch(e=>{console.error(e.message);process.exitCode=1});
