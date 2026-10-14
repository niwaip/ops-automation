"""Fresh business workflow routes; no model, network or sandbox tool execution."""
import ast
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('audit_base',HERE/'intent-routing-audit-2026-10-14.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
from dsh_modules.intent_contract import is_network_search_forbidden
from dsh_modules.planning_phase import build_deliverable_execution_instruction,should_run_planning_phase
from dsh_modules.runtime_policy import RuntimePolicy

cases=[]
def add(id,industry,title,prompt,files,expected,history=None):
    cases.append(dict(id=id,industry=industry,title=title,prompt=prompt,files=files,expected=expected,history=history or []))
def deliver(formats):
    return {'is_generate_intent':True,'format_has':formats,'tools_has':['read_file'],
            'tools_any':['bash','write_markdown','patch_file']}
def read():
    return {'is_generate_intent':False,'deliverables_empty':True,'tools_has':['read_file'],
            'tools_not':['patch_file','write_markdown']}

add('M01','制造业','订单交期风险与客户跟进',
    '请读取订单明细、库存快照和产能说明，判断本周订单是否存在交付风险。按客户列出缺料与产能风险，生成“订单交期风险.xlsx”和“客户跟进计划.docx”；缺失数据标待确认，不要代替我联系客户。',
    ['订单明细.xlsx','库存快照.xlsx','产能说明.txt'],deliver(['.xlsx','.docx']))
add('M02','制造业','来料检验日报',
    '读取来料检验记录，按供应商和物料汇总检验数量与不良数量，生成“来料质量日报.xlsx”，包含异常批次清单；原记录保留。',
    ['来料检验记录.csv'],deliver(['.xlsx']))
add('M03','制造业','质量整改待办',
    '根据整改会议纪要和现场问题记录，提取责任人、措施和截止日期，生成“质量整改行动清单.md”。只用附件事实，缺少责任人标待确认，不要创建日程提醒。',
    ['整改会议纪要.docx','现场问题记录.txt'],deliver(['.md'])|{'format_not':['.html','.pptx'],'is_send_intent':False})
add('M04','制造业','作业指导书转打印版',
    '把上传的装配作业指导书转换为可下载PDF，文件名“装配作业指导书_打印版.pdf”，保留原文内容和原始Word文件。',
    ['装配作业指导书.docx'],deliver(['.pdf'])|{'format_not':['.docx']})
add('M05','制造业','采购报价决策建议',
    '读取供应商报价与采购需求，计算每家供应商的预计采购总额，结合交期列出可选方案。直接在聊天中给出比较结果和缺失信息，不需要生成文件。',
    ['供应商报价.xlsx','采购需求.txt'],read()|{'tools_any':['aggregate_spreadsheet','analyze_spreadsheet','compare_spreadsheet_columns','bash']})
add('M06','制造业','修改客户交期通知',
    '把客户交期通知中的交货日期从2026年10月20日改为2026年10月22日，其他内容保持不变，另存为“客户交期通知_v2.docx”，不要覆盖原件或发给客户。',
    ['客户交期通知.docx'],deliver(['.docx'])|{'is_send_intent':False})
add('M07','制造业','班组下周排班',
    '根据人员名单和排班规则，为下周重新安排早晚班，休假人员不排班，生成“下周班组排班.xlsx”。不清楚的规则标待确认，不要修改人员名单。',
    ['人员名单.xlsx','排班规则.docx'],deliver(['.xlsx']))
add('M08','制造业','设备操作培训演示',
    '根据设备说明书和故障记录制作5页班组培训演示文稿，交付原生PowerPoint文件“设备操作培训.pptx”，包含开机检查、常见故障和停机交接，不要HTML。',
    ['设备说明书.pdf','故障记录.csv'],deliver(['.pptx'])|{'format_not':['.html'],'native_ppt_handoff':True})

add('R01','零售业','门店经营周报与简报',
    '读取本周门店销售和门店基础信息，按门店统计销售额与订单数，生成“门店经营周报.xlsx”，再生成店长阅读用的“门店经营简报.pdf”。不要发布或发送。',
    ['本周门店销售.csv','门店基础信息.xlsx'],deliver(['.xlsx','.pdf'])|{'is_send_intent':False})
add('R02','零售业','门店补货建议',
    '根据销量、现存数量和安全库存，列出缺货风险及建议补货数量，生成“门店补货建议.xlsx”。本次只生成建议，不下采购单。',
    ['门店销量.xlsx','门店库存.xlsx'],deliver(['.xlsx']))
add('R03','零售业','客诉原因归纳',
    '读取本月客诉记录，按原因归类，列出高频问题和需跟进的门店，直接在聊天中回答。不要创建报告文件或向顾客发送消息。',
    ['本月客诉记录.csv'],read()|{'is_send_intent':False})
add('R04','零售业','促销执行方案',
    '根据活动要求和商品清单制作门店促销执行方案，保存为“促销执行方案.docx”，包含准备、陈列、人员分工和复盘安排，不自行填入未提供的折扣。',
    ['活动要求.md','活动商品.xlsx'],deliver(['.docx'])|{'format_not':['.md']})
add('R05','零售业','收银与退款核对',
    '核对收银汇总与退款记录，列出金额差异及缺失单据，只在聊天中给出核对结果，不修改任何记录、不生成文件。',
    ['收银汇总.xlsx','退款记录.csv'],read())
add('R06','零售业','月度经营汇报PPT',
    '根据月度销售、客诉摘要和活动复盘制作6页原生PPTX经营汇报，保存为“门店月度汇报.pptx”，不要HTML，也不要额外生成Word报告。',
    ['月度销售.xlsx','客诉摘要.txt','活动复盘.docx'],deliver(['.pptx'])|{'format_not':['.html','.docx'],'native_ppt_handoff':True})
add('R07','零售业','人员排班调整',
    '将店员排班表中周三王芳的早班调整为晚班，其他员工和日期不变，另存为“店员排班_v2.xlsx”，保留原表。',
    ['店员排班.xlsx'],deliver(['.xlsx']))
add('R08','零售业','店长资料包',
    '读取闭店交接清单和库存差异记录，整理成一个店长可打印的PDF资料包“店长交接资料.pdf”，分别保留交接事项和库存异常，不要联网查资料。',
    ['闭店交接清单.docx','库存差异记录.csv'],deliver(['.pdf'])|{'presearch':False,'tools_not':['web_search','fetch_page']})

add('O01','通用办公','采购审批材料',
    '读取采购申请、供应商报价和预算说明，生成“采购审批说明.docx”和“采购费用明细.xlsx”，供主管审核；没有批准前不要代替我提交审批。',
    ['采购申请.txt','供应商报价.xlsx','预算说明.docx'],deliver(['.docx','.xlsx']))
add('O02','通用办公','多部门会议行动清单',
    '把销售、仓储和生产三个部门的会议记录整理成“跨部门行动清单.md”，列出事项、负责人和截止时间，只依据附件，不生成PPT，不创建提醒。',
    ['销售会议.txt','仓储会议.txt','生产会议.txt'],deliver(['.md'])|{'format_not':['.pptx','.html']})
add('O03','通用办公','合同版本审阅',
    '比较采购合同的原版与修订版，指出交期、付款条件和违约责任的变化，只在聊天中列出差异，不改合同，也不用生成新文件。',
    ['采购合同_原版.docx','采购合同_修订版.docx'],read())
add('O04','通用办公','费用报销检查',
    '根据报销明细和公司的报销标准，列出超限项目及缺失凭据，给出需要补充的材料，只在聊天中回答，不修改报销金额。',
    ['报销明细.xlsx','报销标准.docx'],read())
add('O05','通用办公','原料行情与报价对照',
    '联网查询近期原材料价格，和上传的供应商报价对照，生成“原料报价对照.xlsx”，注明资料来源及查询时间，无法核实的数据标待确认。',
    ['供应商报价.xlsx'],deliver(['.xlsx'])|{'tools_has':['read_file','web_search']})
add('O06','通用办公','客户回复草稿',
    '根据客户投诉和内部处理记录，起草给客户的回复，直接在聊天中输出供我审核，不要通过微信发送，也不要生成附件。',
    ['客户投诉.txt','内部处理记录.docx'],read()|{'is_send_intent':False})
add('O07','通用办公','刚生成的采购说明转PDF',
    '将刚才生成的采购说明.docx转为“采购说明.pdf”，供下载打印，保留Word原版。',
    ['采购说明.docx'],deliver(['.pdf'])|{'format_not':['.docx']},
    [{'role':'user','content':'生成采购说明.docx'},{'role':'assistant','content':'采购说明.docx已生成，可下载。'}])
add('O08','通用办公','整套审批材料失败后重试',
    '重新生成',[],{'is_generate_intent':True,'format_has':['.xlsx','.docx'],'tools_any':['bash','write_markdown']},
    [{'role':'user','content':'根据采购需求生成“采购费用明细.xlsx”和“采购审批说明.docx”，不要HTML。'},
     {'role':'assistant','content':'文件生成未完成，请重试。'}])

runner_path=base.SRC/'dsh_modules/runner.py'
cmd=next(n for n in ast.parse(runner_path.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='cmd_run')
names={'forbidden_network','has_web_search_permission','is_weather_intent','is_search_intent','is_doc_task_without_search_cue'}
nodes=[n for n in cmd.body if (isinstance(n,ast.Assign) and len(n.targets)==1 and isinstance(n.targets[0],ast.Name) and n.targets[0].id in names)
       or (isinstance(n,ast.If) and isinstance(n.test,ast.Name) and n.test.id=='is_doc_task_without_search_cue')]
assert len(nodes)==6
decision=compile(ast.Module(body=nodes,type_ignores=[]),str(runner_path),'exec')
sources=[base.SRC/'dsh_modules'/n for n in ['skill_router.py','runner.py','intent_contract.py','planning_phase.py','skills.py']]
hash_sources=lambda:{str(p.relative_to(base.ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
before=hash_sources();skills=base.get_available_skills();policy=RuntimePolicy();policy.thinking=True

def evaluate(c):
    with contextlib.redirect_stdout(io.StringIO()):
        r=base.SkillRouter.route(c['prompt'],c['history'],skills,False,c['files'])
        state={'prompt':c['prompt'],'skill_res':r,'args':SimpleNamespace(web_search=True),
               'WEATHER_RE':base.WEATHER_RE,'is_network_search_forbidden':is_network_search_forbidden}
        exec(decision,state)
        tools=[t['function']['name'] for t in base.select_active_tools(c['prompt'],r,state['is_search_intent'],state['has_web_search_permission'])]
        should_plan,is_deliverable=should_run_planning_phase(c['prompt'],r,policy,state['has_web_search_permission'],c['files'],'')
        instruction=build_deliverable_execution_instruction(r) if should_plan and is_deliverable else ''
    actual=vars(r).copy();actual.pop('skill_context')
    actual.update(tools=tools,presearch=bool(state['is_search_intent']),should_plan=should_plan,execution_instruction=instruction)
    failures=[]
    for k,v in c['expected'].items():
        if k=='format_has':ok=all(any(d.lower()==f or d.lower().endswith(f) for d in r.deliverables) for f in v)
        elif k=='format_not':ok=not any(any(d.lower()==f or d.lower().endswith(f) for d in r.deliverables) for f in v)
        elif k=='tools_has':ok=all(t in tools for t in v)
        elif k=='tools_any':ok=any(t in tools for t in v)
        elif k=='tools_not':ok=all(t not in tools for t in v)
        elif k=='deliverables_empty':ok=bool(not r.deliverables)==v
        elif k=='native_ppt_handoff':ok=not (instruction and '/workspace/presentation.html' in instruction)
        else:ok=actual.get(k)==v
        if not ok:failures.append({'check':k,'expected':v})
    return {**c,'actual':actual,'pass':not failures,'failures':failures}
results=[evaluate(c) for c in cases]
repeat_changes=[c['id'] for c,r in zip(cases,results) if evaluate(c)['actual']!=r['actual']]
out={'scope':'new business routes, capability selection, contract and execution-handoff instruction only; no model/tool execution',
     'total':len(results),'passed':sum(r['pass'] for r in results),'failed':sum(not r['pass'] for r in results),
     'skills':len(skills),'source_hashes':before,'source_unchanged':before==hash_sources(),'repeat_changes':repeat_changes,'results':results}
assert out['source_unchanged']
HERE.joinpath('office-routing-workflows-2026-10-14.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in out.items() if k not in {'results','source_hashes'}},ensure_ascii=False))
for r in results:
    print(r['id'],r['title'],r['pass'],r['actual']['skill_id'],r['actual']['deliverables'],r['failures'])
