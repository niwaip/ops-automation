"""Real-model admission tests with ephemeral metadata, never installing user skills."""
import json,sys,time
from types import SimpleNamespace
sys.path.insert(0,'/usr/local/bin')
from dsh_modules.skill_admission import admit_skill, AdmissionClarification
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats

cases=[
 {'name':'wrong-business-defaults', 'request':'记录：甲部门已审批10，乙部门未审批20。汇总全部记录，不按审批状态过滤，只在聊天中回答',
  'catalog':[{'id':'limited-ledger-73','name':'限定范围汇总','description':'仅统计已审批记录的金额'}],
  'candidate':'limited-ledger-73','bodies':{'limited-ledger-73':'只保留审批状态为已审批的记录，再汇总金额；不适用于全量口径。'}},
 {'name':'alternative-writing', 'request':'说明：每周周一巡检，发现异常即登记。将这段说明整理成两个段落，不要制作演示文稿。',
  'catalog':[{'id':'slide-styler-91','name':'演示文稿排版','description':'生成幻灯片演示文件'},
             {'id':'freeform-notes-82','name':'简短说明整理','description':'将说明文字整理为简短段落，不生成演示文稿'}],
  'candidate':'slide-styler-91','bodies':{'slide-styler-91':'编写并导出幻灯片。','freeform-notes-82':'根据用户给定的说明文字整理简短段落，在聊天中回答，不输出文件。'}},
 {'name':'consult-not-execution', 'request':'解释invoice-review-67是干什么的，不要执行审批。',
  'catalog':[{'id':'invoice-review-67','name':'发票审批','description':'读取发票后执行审批记录更新'}],
  'candidate':'invoice-review-67','bodies':{'invoice-review-67':'提取发票信息，完成核验后更新审批记录。执行会改变审批状态。'}},
 {'name':'new-skill-no-code-branch', 'request':'用contract-digest-8f整理这段条款中的义务：甲方每月交付报告，乙方五日内确认。在聊天中列出即可。',
  'catalog':[{'id':'contract-digest-8f','name':'条款义务提炼','description':'从输入条款提炼各方义务，在聊天中输出'}],
  'candidate':'contract-digest-8f','bodies':{'contract-digest-8f':'从用户提供的条款中提炼明确约定的义务和主体，不引入额外约定，在对话中列出。'}},
]
results=[]
for case in cases:
 telemetry=TelemetryStats();start=time.monotonic()
 try:
  route=admit_skill(case['request'],[],[],SimpleNamespace(skill_id=case['candidate']),
                  'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af',RuntimePolicy(),telemetry,start+75,
                  available_skills=case['catalog'],read_body=lambda i:case['bodies'][i])
 except AdmissionClarification as error:
  if case['name'] != 'consult-not-execution': raise
  intent=next(g['reason'] for g in telemetry.guard_decisions if g['guard']=='task_intent' and g['action']=='accept')
  assert intent['task_mode']=='consult'
  results.append({'case':case['name'],'outcome':'clarify_without_execution','question':str(error),
                 'model_calls':telemetry.llm_invocations,'guards':telemetry.guard_decisions})
  continue
 except Exception:
  print('FAILED_CASE='+json.dumps({'case':case['name'],'guards':telemetry.guard_decisions},ensure_ascii=False),flush=True)
  raise
 decision=route.admission
 if case['name']=='wrong-business-defaults':assert not decision['use_default_rules']
 if case['name']=='alternative-writing':assert route.skill_id!='slide-styler-91'
 if case['name']=='consult-not-execution':assert decision['task_mode']=='consult'
 if case['name']=='new-skill-no-code-branch':assert route.skill_id=='contract-digest-8f'
 assert decision['output_mode']=='conversation'
 results.append({'case':case['name'],'decision':decision,'model_calls':telemetry.llm_invocations,
                 'elapsed_ms':round((time.monotonic()-start)*1000),'guards':telemetry.guard_decisions})
 print('CASE_RESULT='+json.dumps(results[-1],ensure_ascii=False),flush=True)
print('GENERIC_RESULT='+json.dumps(results,ensure_ascii=False),flush=True)
