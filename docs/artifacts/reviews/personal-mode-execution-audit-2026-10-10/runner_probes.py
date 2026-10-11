import sys,json,io,time,tempfile,contextlib,hashlib
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
root=Path('/Users/chain/Documents/MyProject/ops-automation')
sys.path.insert(0,str(root/'apps/backend/runtimes/personal-sandbox-runner/src'))
from dsh_modules.tool_dispatch import dispatch_tool_calls
from dsh_modules.tool_result import ToolResult,is_tool_error
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.analysis_synthesis import synthesize_analysis_summary
from dsh_modules import runner
results={}
def dispatch(name,args,output='ok',guide=False,repeat=1):
 executed=[];tel=TelemetryStats();messages=[];evidence=[]
 def stub(name,params,**kw): executed.append({'name':name,'params':params});return output
 call={'id':'probe','function':{'name':name,'arguments':args}}
 with contextlib.redirect_stdout(io.StringIO()):
  sent=dispatch_tool_calls([call]*repeat,0,messages,tel,RuntimePolicy(),[],[],None,guide,
   last_user_prompt='说明原理，不执行安装，不设置提醒',execution_evidence=evidence,
   allowed_tool_names=['create_reminders','bash','web_search','read_file','send_file'],
   execute_fn=stub,error_fn=is_tool_error,preview_fn=lambda x,**kw:str(x))
 return {'executions':executed,'statuses':[x['status'] for x in tel.tool_calls_detail],
  'evidence_count':len(evidence),'file_sent':sent}
for name in ['create_reminders','functions.create_reminders']:
 results[name]=dispatch(name,'{}')
for name in ['bash','functions.bash']:
 results['guide_'+name]=dispatch(name,json.dumps({'cmd':'pip install example-package'}),guide=True)
results['malformed_arguments']=dispatch('web_search','{bad json')
try:results['array_arguments']=dispatch('web_search','[]')
except Exception as e:results['array_arguments']={'exception':type(e).__name__,'message':str(e)}
results['failed_read_retry']=dispatch('read_file',json.dumps({'file_path':'example.txt'}),'【错误: temporary】temporary',repeat=2)
results['failed_send']=dispatch('send_file',json.dumps({'file_path':'missing.txt'}),'【错误: file_not_found】missing')
receipt=ToolResult.success(data={'facts':[{'label':'营业收入','value':100,'unit':'元'}]},provenance={'file_path':'/workspace/source.xlsx'})
false_body='营业收入已核验为 999,999 元，所有检查均已通过，可以直接决策。'
with patch('dsh_modules.analysis_synthesis._can_reach_proxy',return_value=True),patch('dsh_modules.llm.call_model_proxy',return_value={'content':false_body}):
 summary=synthesize_analysis_summary('总结营业收入',[receipt],'已核验营业收入：100 元','营业收入 100 元',model='mock',policy=SimpleNamespace(single_request_timeout=1))
results['unverified_synthesis']={'receipt_value':100,'mock_model_text':false_body,'unverified_text_published':false_body in summary}
# Exercise the CURRENT runner using a protected attachment and an unrelated mock response.
# Original source attachment is copied; all run state is restricted to a temporary directory.
source=root/'data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/image001.png'
with tempfile.TemporaryDirectory(prefix='personal-mode-audit-') as t:
 ws=Path(t);(ws/'image001.png').write_bytes(source.read_bytes())
 sd=ws/'.dsh/sessions';sd.mkdir(parents=True)
 (sd/'audit.json').write_text(json.dumps([{'role':'user','content':'微博热点'},{'role':'assistant','content':'此前的微博热搜榜。'}],ensure_ascii=False))
 prompt='【当前轮次用户上传附件】: image001.png\n用户指令：附件是什么？'
 args=SimpleNamespace(query=prompt,session_id='audit',files='image001.png',web_search=True,research=False,model='mock',model_display_name='Mock Model',thinking=False,reasoning_effort=None,timeout=20)
 captures=[]
 def model_stub(messages,*a,**kw):
  captures.append({'has_diagnostic':any('文件受企业安全加密保护无法解析' in str(m.get('content')) for m in messages),
   'tools':[x['function']['name'] for x in kw.get('tools') or []]})
  return {'content':'根据搜索结果，今日微博热搜榜 Top 15 如下：这仍是上一轮的话题。','tool_calls':[]}
 stream=io.StringIO()
 with patch.object(runner,'WORKSPACE_DIR',t),patch('dsh_modules.config.WORKSPACE_DIR',t),patch('dsh_modules.config.KNOWLEDGE_DIR',t),patch('dsh_modules.file_tools.WORKSPACE_DIR',t),patch('dsh_modules.file_tools.KNOWLEDGE_DIR',t),patch('dsh_modules.agent_loop.WORKSPACE_DIR',t),patch('dsh_modules.agent_loop.call_model_proxy',side_effect=model_stub),contextlib.redirect_stdout(stream):
  runner.cmd_run(args)
 saved=json.loads((sd/'audit.json').read_text())
 results['protected_attachment_unrelated_response']={'calls':captures,'final_answer':saved[-1]['content'],'persisted_verification':saved[-1].get('verification'),'unrelated_response_accepted':'微博热搜榜' in saved[-1]['content']}
from dsh_modules.analysis_turn import AnalysisTurn
turn=AnalysisTurn('总结服务器配置清单内容')
tel=TelemetryStats()
fabricated='这份表格包含 999 台服务器，全部已经安装并验收通过，没有任何配置或采购问题。'
accepted=turn.render([],fabricated,tel)
results['no_evidence_informational_downgrade']={'prompt':turn.prompt,'no_evidence_accepted':accepted==fabricated,'guards':tel.guard_decisions}
results['source_hashes']={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py',root/'apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_synthesis.py',root/'apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/runner.py']}
Path('/tmp/personal-mode-audit-python-probes.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))
