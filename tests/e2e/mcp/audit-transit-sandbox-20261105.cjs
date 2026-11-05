// Replay routing only: no model generation, no external MCP invocation, no business mutation.
const Docker = require('/workspace/apps/backend/execution-control/session-broker/node_modules/dockerode');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const d = new Docker();
const userId = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
const sessionId = 'chat-session-1793862856322-w1dis0xk';
const expires = Math.floor(Date.now()/1000)+600;
const signature = createHmac('sha256', process.env.INTERNAL_API_SHARED_SECRET).update(`${userId}:${expires}`).digest('base64url');
const env = [`DEEPSEEK_API_KEY=sandbox-user-token-${userId}.${expires}.${signature}`, 'DEEPSEEK_BASE_URL=http://ai-orchestrator:3007/ai/proxy/v1'];
const source = `import sys,json,dataclasses
from pathlib import Path
sys.path.insert(0,'/usr/local/bin')
from dsh_modules.skills import get_available_skills
from dsh_modules.skill_router import SkillRouter,SemanticSkillMatcher
from dsh_modules.tool_routing import select_active_tools
from dsh_modules.prompt_builder import build_skills_catalog
prompt='查看公共交通，如果从中星海上名庭到 恒生银行大厦'
skills=get_available_skills()
mcp=[s for s in skills if s.get('source')=='mcp']
matcher=SemanticSkillMatcher(skills)
def route(q):
 r=SkillRouter.route(q,files=[],available_skills=skills,load_skill_context=False)
 tools=select_active_tools(q,r,True,True)
 matches=matcher.match(q)
 return {'query':q,'selectedSkill':r.skill_id,'affinityScore':r.affinity_score,'reasons':r.matched_reasons,'mcpReadOnly':r.mcp_read_only,'tools':[t['function']['name'] for t in tools],'matches':matches[:6],'mcpMatches':[m for m in matches if m[0].startswith('mcp-')]}
paths=[{'path':str(p),'bytes':p.stat().st_size,'mtime':p.stat().st_mtime} for p in Path('/workspace/.dsh').rglob('*${sessionId}*') if p.is_file()]
evidence_path=Path('/workspace/.dsh/sessions/${sessionId}.evidence.json')
evidence=json.loads(evidence_path.read_text())
shape={'type':type(evidence).__name__,'keys':list(evidence)[:20] if isinstance(evidence,dict) else None}
catalog_lines=[]
def walk(item):
 if isinstance(item,str) and ('Available Skills Catalog' in item or 'amap-maps-streamableHTTP' in item):
  catalog_lines.extend(line[:600] for line in item.splitlines() if 'amap-maps-streamableHTTP' in line or 'Available Skills Catalog' in line)
 elif isinstance(item,dict):
  for val in item.values():walk(val)
 elif isinstance(item,list):
  for val in item:walk(val)
walk(evidence)
from dsh_modules.mcp_skill_catalog import read_mcp_skill
from dsh_modules.mcp_tools import execute_mcp_tool
from dsh_modules.mcp_coordinate_plan import coordinate_step
from dsh_modules.mcp_runtime import known_tools, disclosed_contracts
from dsh_modules.mcp_dataflow import bind_user_values
from dsh_modules.mcp_execution import McpExecutionGate
from dsh_modules.tools import get_sandbox_tools
from dsh_modules.tool_result import ToolResult
sid='mcp-243083c4-31a0-44ff-b24f-2acf67029cc4'
bind_user_values(prompt)
gate=McpExecutionGate(sid,prompt)
surface=get_sandbox_tools(allowed_names={'read_skill','list_external_tools','call_external_tool'})
read_mcp_skill(sid)
read_receipt=ToolResult.success(data={},provenance={'tool':'read_skill'})
g1=gate.select(surface,[read_receipt])
trip_receipt=execute_mcp_tool('list_external_tools',{'skill_id':sid,'tool_name':'maps_direction_transit_integrated'}).tool_result
plan1=coordinate_step(prompt,sid,[])
g2=gate.select(surface,[read_receipt,trip_receipt])
geo_receipt=execute_mcp_tool('list_external_tools',{'skill_id':sid,'tool_name':'maps_geo'}).tool_result
plan2=coordinate_step(prompt,sid,[])
g3=gate.select(surface,[read_receipt,trip_receipt,geo_receipt])
print(json.dumps({'dependencyProbe':{'first':plan1,'second':plan2,'gate_steps':[g1,g2,g3],'tools':known_tools(sid),'contracts':[{k:v for k,v in c.items() if k not in ('contractToken',)} for c in disclosed_contracts(sid).values()]}},ensure_ascii=False))
print(json.dumps({'replayedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'skills':mcp,'catalog':build_skills_catalog(mcp),'original':route(prompt),'explicitName':route('用 amap-maps-streamableHTTP '+prompt),'sessionFiles':paths,'savedEvidenceShape':shape,'savedCatalogLines':catalog_lines[:12],'noExternalMcpInvoked':True},ensure_ascii=False))
`;
(async () => {
  const container=d.getContainer(`ops-user-sandbox-${userId}`);
  if(!(await container.inspect()).State.Running)await container.start();
  const exec = await container.exec({ Cmd: ['python3','-c',source], Env: env, User:'sandbox', AttachStdout:true, AttachStderr:true });
  const stream = await exec.start({ Detach:false,Tty:false });
  let stdout='',stderr=''; const {Writable}=require('node:stream');
  d.modem.demuxStream(stream,new Writable({write(c,_,cb){stdout+=c.toString();cb();}}),new Writable({write(c,_,cb){stderr+=c.toString();cb();}}));
  await new Promise((resolve,reject)=>{stream.on('end',resolve);stream.on('error',reject);});
  const info=await exec.inspect();
  const report={exitCode:info.ExitCode,stdout,stderr};
  fs.writeFileSync(process.argv[2]||'/workspace/docs/artifacts/reviews/mcp-transit-routing-replay-2026-11-05.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report)); if(info.ExitCode)process.exitCode=1;
})().catch(()=>{console.error('Sandbox routing replay failed');process.exitCode=1;});
