// Explicitly inject an empty first review; subsequent MCP read and model repair are real.
const Docker = require('/workspace/apps/backend/execution-control/session-broker/node_modules/dockerode');
const {PrismaClient} = require('/workspace/apps/backend/platform/src/generated/prisma');
const {createHmac, randomUUID} = require('node:crypto');
const {Writable} = require('node:stream');
const fs = require('node:fs');
const docker = new Docker(); const db = new PrismaClient();
const python = String.raw`
import json,sys,time
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'/usr/local/bin')
from dsh_modules import mcp_runtime as runtime
from dsh_modules.mcp_skill_catalog import available_mcp_skills,read_mcp_skill
from dsh_modules.mcp_tools import execute_mcp_tool
from dsh_modules import mcp_answer_review as review
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.evidence_store import persist_turn_evidence
from dsh_modules.runtime_policy import RuntimePolicy
skill='mcp-b8886e38-4c6d-4053-86ba-09197d38c9cd'
assert next(s for s in available_mcp_skills() if s['id']==skill)['read_only'] is True
read_mcp_skill(skill)
runtime.configure_steps(skill)
stats=TelemetryStats();started=time.monotonic()
history=Path('/workspace/.dsh/sessions')/(sys.argv[1]+'.json')
stats.bind_journal(history)
evidence=[]
def setup_call(name,params):
    result=execute_mcp_tool(name,params,deadline=time.monotonic()+30)
    receipt=result.tool_result
    evidence.append(receipt)
    stats.record_tool_call(name,params,'success' if receipt.is_success else 'error')
    stats.record_execution_result(receipt)
    assert receipt.is_success
    return receipt
contract=setup_call('list_external_tools',{'skill_id':skill,'tool_name':'microsoft_docs_search'})
setup_call('call_external_tool',{'binding_id':contract.data['id'],'arguments':{'query':'Azure VPN gateway setup configuration guide official tutorial'}})
actual_review=review.structured_decision
attempts=[]
def inject_first(*args,**kwargs):
    attempts.append(args[1])
    if len(attempts)==1:
        return {'claims':[]}
    return actual_review(*args,**kwargs)
with patch.object(review,'structured_decision',side_effect=inject_first):
    answer=review.review_mcp_answer('', '用Microsoft Learn mcp 查找 azure vpn设置的方法',evidence,
        'default',RuntimePolicy(),stats,time.monotonic()+45,readonly_skill_id=skill)
verification=persist_turn_evidence(history,{},'Explicit empty-review fault injection',evidence,stats.guard_decisions)
metrics=json.loads(stats.to_metrics_json())
recovery=[g for g in stats.guard_decisions if g['guard']=='mcp_review_recovery']
accepted=[g for g in stats.guard_decisions if g['guard']=='mcp_answer_review' and g['action']=='accept']
passed=(len(attempts)==2 and any(g['action']=='completed' for g in recovery)
    and any(g['reason']['attempt']==2 for g in accepted)
    and len([t for t in metrics['toolCalls'] if t['name']=='call_external_tool'])==2)
result={'sessionId':sys.argv[1],'faultInjection':'first review forced to empty claims; subsequent MCP and model are real',
    'passed':passed,'durationMs':round((time.monotonic()-started)*1000,2),'metrics':metrics,'answer':answer,
    'verification':verification,'invocationIds':[(r.provenance or {}).get('invocation_id') for r in evidence
        if r.is_success and (r.provenance or {}).get('invocation_id')]}
print('<<<REVIEW_VERIFICATION>>>'+json.dumps(result,ensure_ascii=False))
`;
(async () => {
  const user = await db.user.findUnique({where:{username:'admin'},select:{id:true}});
  const exp = Math.floor(Date.now()/1000)+600;
  const sig = createHmac('sha256',process.env.INTERNAL_API_SHARED_SECRET).update(`${user.id}:${exp}`).digest('base64url');
  const container = docker.getContainer(`ops-user-sandbox-${user.id}`);
  if (!(await container.inspect()).State.Running) await container.start();
  const sessionId = `mcp-review-recovery-test-${randomUUID()}`;
  const exec = await container.exec({Cmd:['python3','-c',python,sessionId],User:'sandbox',
    Env:[`DEEPSEEK_API_KEY=sandbox-user-token-${user.id}.${exp}.${sig}`,'DEEPSEEK_BASE_URL=http://ai-orchestrator:3007/ai/proxy/v1'],
    AttachStdout:true,AttachStderr:true});
  const stream = await exec.start({Detach:false,Tty:false}); let stdout='',stderr='';
  docker.modem.demuxStream(stream,new Writable({write(c,_,cb){stdout+=c;cb();}}),new Writable({write(c,_,cb){stderr+=c;cb();}}));
  await new Promise((resolve,reject)=>{stream.on('end',resolve);stream.on('error',reject);});
  const marker='<<<REVIEW_VERIFICATION>>>';
  if (!stdout.includes(marker)) throw new Error(`Verification did not return evidence: ${stderr.slice(-500)}`);
  const result = JSON.parse(stdout.slice(stdout.lastIndexOf(marker)+marker.length).trim());
  result.calls = await db.mcpInvocation.findMany({where:{id:{in:result.invocationIds},userId:user.id},
    select:{id:true,bindingId:true,status:true,createdAt:true}});
  result.exitCode = (await exec.inspect()).ExitCode;
  result.passed = result.passed && result.exitCode===0 && result.calls.length===2 && result.calls.every(c=>c.status==='completed');
  fs.writeFileSync('/workspace/docs/artifacts/reviews/mcp-review-recovery-live-verification-2026-11-05.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({passed:result.passed,sessionId,durationMs:result.durationMs,calls:result.calls,
    reviews:result.metrics.guardDecisions.filter(g=>g.guard==='mcp_answer_review'||g.guard==='mcp_review_recovery')}));
  if (!result.passed) process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
