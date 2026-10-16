"""Runs real routing and capability selection only; no model/tool execution."""
import contextlib
import hashlib
import io
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

if os.path.exists('/opt/dsh/skills'):
    os.environ.setdefault('DSH_SKILL_DIR', '/opt/dsh/skills')
    ROOT = Path('/usr/local/bin')
    SRC = Path('/usr/local/bin')
    sys.path.insert(0, '/usr/local/bin')
else:
    ROOT = Path(__file__).resolve().parents[3]
    SRC = ROOT / 'apps/backend/runtimes/personal-sandbox-runner/src'
    os.environ['DSH_SKILL_DIR'] = str(ROOT / 'data/shared/dsh-skills')
    os.environ['DSH_CUSTOM_SKILL_DIR'] = str(ROOT / 'data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/knowledge/skills')
    sys.path.insert(0, str(SRC))
from dsh_modules.skills import get_available_skills
from dsh_modules.skill_router import SkillRouter
from dsh_modules.runner import select_active_tools, WEATHER_RE
from dsh_modules.intent_contract import is_network_search_forbidden

CASES = []
SLIDE_UI = ['pptx', 'slides', 'guizang-ppt', 'html-ppt', 'frontend-design', 'web-prototype']
WRITES = ['write_markdown', 'patch_file', 'create_reminders', 'update_reminder', 'delete_reminder']

def add(group, prompt, expected, files=None, history=None, research=False):
    CASES.append(dict(id=f'{group}-{sum(c["group"] == group for c in CASES)+1:02d}',
                      group=group, prompt=prompt, expected=expected,
                      files=files or [], history=history or [], research=research))

def create(group, prompt, skill, ext, files=None):
    add(group, prompt, {'is_generate_intent': True, 'is_search_intent': False,
        'is_research_intent': False, 'skill_in': [skill], 'format_has': [ext]}, files)

def markdown(group, prompt, name, files=None, history=None):
    add(group, prompt, {'is_generate_intent': True, 'is_search_intent': False,
        'skill_not': SLIDE_UI, 'deliverables_has': [name], 'format_not': ['.pptx', '.html']}, files, history)

def readonly(group, prompt, files):
    add(group, prompt, {'is_generate_intent': False, 'is_inspect_intent': True,
        'is_search_intent': False, 'deliverables_empty': True, 'tools_has': ['read_file'],
        'tools_not': WRITES}, files)

# Independent manufacturing and retail tasks.
for group, items in {
    'manufacturing': [('生产日报','按产线统计计划、完成、不良数量'),('来料检验','记录供应商、批次、抽样数量和不良数'),
      ('库存盘点','记录物料编号、账面数量、实盘数量和差异'),('采购比价','比较单价、交期和起订量')],
    'retail': [('门店销售','按门店汇总销售额与订单数'),('退换货','按原因汇总退货与换货数量'),
      ('库存补货','记录现存、安全库存和建议补货量'),('员工排班','安排早晚班、休息和责任人')],
}.items():
    for title, detail in items:
        create(group, f'生成可下载Excel文件“{title}.xlsx”，{detail}。', 'xlsx', '.xlsx')
    for title in (['设备交接','供应商会议纪要','质量整改通知'] if group=='manufacturing' else ['闭店交接','促销活动通知','收银交接']):
        create(group, f'制作一份{title}Word文档，保存为“{title}.docx”。', 'docx', '.docx')
    title = '设备夜班清单' if group=='manufacturing' else '门店巡检清单'
    markdown(group, f'读取上传记录，整理{title}并保存为“{title}.md”，无需HTML/PPT。', title+'.md', ['交接记录.txt'])
    create(group, f'制作3页{title}培训演示文稿，生成原生“{title}.pptx”，不要HTML。', 'pptx', '.pptx')
    create(group, f'将上传的{title}.docx转为可下载PDF文件。', 'pdf', '.pdf', [title+'.docx'])
    readonly(group, '总结上传的日报，只在聊天中回答，不要生成任何文件。', ['日报.xlsx'])
    readonly(group, '检查上传的记录并列出异常，不要修改原文件。', ['记录.docx'])
    readonly(group, '核对上传库存.xlsx中的账面数量与实盘数量，只给出差异。', ['库存.xlsx'])
    readonly(group, '读取上传的采购.csv，统计供应商数量，只在聊天中回答。', ['采购.csv'])
    add(group, '草拟一封催交货邮件，直接在聊天中输出。' if group=='manufacturing' else '草拟一封促销通知邮件，直接在聊天中输出。',
        {'is_generate_intent':False, 'deliverables_empty':True, 'is_search_intent':False, 'skill_not':SLIDE_UI})

for prompt, skill, ext in [
    ('生成会议纪要Word文件“会议.docx”','docx','.docx'),('生成费用报销Excel“费用.xlsx”','xlsx','.xlsx'),
    ('生成员工培训PDF手册“培训.pdf”','pdf','.pdf'),('生成项目汇报原生PPTX“项目.pptx”','pptx','.pptx'),
    ('/word 制作周报','docx','.docx'),('/excel 制作报销表','xlsx','.xlsx'),('/pdf 制作项目说明','pdf','.pdf')]:
    create('general',prompt,skill,ext)
for prompt, filename in [('将周会整理成“行动清单.md”','行动清单.md'),('把客户反馈保存为“客户反馈.md”','客户反馈.md'),
    ('读取上传会议.txt，生成可下载“会议纪要.md”，不要生成PPT或HTML','会议纪要.md')]:
    markdown('general',prompt,filename,['会议.txt'])
for prompt, files in [('查看上传的合同.docx的内容',['合同.docx']),('阅读刚才生成的报告.pdf',['报告.pdf']),
    ('总结生成的库存.xlsx',['库存.xlsx']),('只在聊天中总结附件，不要生成文件',['材料.txt']),
    ('总结这份文档，不用创建任何文件',['文档.docx']),('仅回答上传照片里的商品是什么',['商品.jpg'])]:
    readonly('general',prompt,files)
for prompt in ['总结这段话：今天已完成三项采购审核。','给出简短的会议开场白。','写一封请假邮件，不需要文件。','用Markdown表格比较早班与晚班职责，只在聊天中输出，不生成文件。']:
    add('general',prompt,{'is_generate_intent':False,'deliverables_empty':True,'is_search_intent':False,'skill_not':SLIDE_UI})

# Full old request, not the shortened unit-test paraphrase.
markdown('regression','请只根据上传的设备交接记录整理一份制造业设备夜班交接清单，生成可下载Markdown文件“制造业_M03夜班交接.md”。包含设备状态、巡检事项、异常处置条件、物料余量、安全事项、交接双方；原文里没有的信息标“未提供”，不要自行编造。无需HTML/PPT。', '制造业_M03夜班交接.md',['制造业_设备交接记录.txt'])
create('regression','请读取上传的制造业生产日报，按产线汇总计划数量、完成数量和不良数量，并计算完成率=完成数量/计划数量、不良率=不良数量/完成数量。生成可下载的Excel文件“制造业_生产日报汇总.xlsx”，至少包含“产线汇总”和“原始数据”两个工作表。只需要完成表格和必要说明，不要生成PPT或HTML。','xlsx','.xlsx',['制造业_生产日报.csv'])
create('regression','请制作一份零售门店闭店交接清单，生成可下载Word文件“零售门店闭店交接清单.docx”。内容至少覆盖：现金与收银、冷藏食品温度、货架补货、退换货暂存、设备断电检查、钥匙交接、异常记录；用勾选表格呈现，包含责任人和备注栏。无需长篇说明。','docx','.docx')

# Boundaries: explicit format priority, negative scopes, file actions.
for q,name in [('生成一页Markdown报告“日报.md”','日报.md'),('生成一页PDF报告的摘要，保存为“摘要.md”','摘要.md'),
    ('不需要HTML/PPT，整理交接记录保存为“夜班.md”','夜班.md'),
    ('不要HTML改用Markdown，保存为“巡检.md”','巡检.md'),
    ('不要生成PDF，改为生成“整改.docx”','整改.docx')]:
    if name.endswith('.md'):markdown('boundary',q,name,['交接.txt'])
    else:create('boundary',q,'docx','.docx')
for q,skill,ext in [('不用PPT而是生成Word文档“通知.docx”','docx','.docx'),
    ('不需要HTML只要原生PPTX文件“班组.pptx”','pptx','.pptx'),
    ('不要改动原始Word，另存为“通知_v2.docx”','docx','.docx'),
    ('只生成“库存.xlsx”，不要任何其他文件','xlsx','.xlsx'),
    ('请生成可下载“日报.docx”，不要生成旧格式.doc','docx','.docx'),
    ('生成一页PDF报告，不要HTML','pdf','.pdf')]:create('boundary',q,skill,ext)
for q,files in [('查看“制作说明.docx”',['制作说明.docx']),('总结“生产日报.xlsx”',['生产日报.xlsx']),
    ('查看刚才生成的PPT，别重新生成',['班组.pptx']),('只提取“通知.pdf”的文字，不用Word文档',['通知.pdf'])]:readonly('boundary',q,files)
for q,file,ext in [('把预算从30000改为36000，其他不变',['方案.docx'],'.docx'),
    ('将明天的早班换成晚班',['排班.xlsx'],'.xlsx'),('把交接人李师傅改为王师傅',['交接.md'],'.md')]:
    add('boundary',q,{'tools_any':['patch_file','bash']},file)
add('boundary','／excel 制作门店盘点表',{'is_generate_intent':True,'skill_in':['xlsx'],'format_has':['.xlsx']})

for prefix in ['无需','不需要','不要生成','严禁生成','不用制作','不含']:
    for separator in ['/', '或', '和', '、']:
        markdown('negation',f'生成可下载“交接.md”，{prefix}HTML{separator}PPT。','交接.md',['记录.txt'])

for fmt,skill,name in [('Word','docx','方案.docx'),('Excel','xlsx','销售.xlsx'),('PDF','pdf','报告.pdf'),('Markdown',None,'交接.md')]:
    history=[{'role':'user','content':f'生成可下载{fmt}文件“{name}”，不要HTML/PPT。'}, {'role':'assistant','content':'本次未完成，请重试。'}]
    exp={'is_generate_intent':True,'skill_not':SLIDE_UI}
    if skill:exp.update(skill_in=[skill],format_has=['.'+name.rsplit('.',1)[-1]])
    else:exp['deliverables_has']=[name]
    add('continuation','重新生成',exp,history=history)
    add('continuation','确认生成',exp,history=history)
readonly('continuation','继续总结，不要生成文件',['材料.docx'])

for q,expected,files,toggle in [
 ('深度调研制造业供应链软件，比较常见产品',{'is_research_intent':True},[],False),
 ('/research 零售门店数字化方案',{'is_research_intent':True},[],False),
 ('检查上传的供应商调查报告，不要联网',{'is_search_intent':False,'is_research_intent':False},['报告.docx'],False),
 ('查看今天的铜价和原料价格',{'is_search_intent':True},[],False),
 ('查询最新零售市场动态',{'is_search_intent':True},[],False),
 ('搜索最近的注塑行业展会信息',{'is_search_intent':True},[],False),
 ('生成今日天气PDF报告',{'presearch':True},[],False),
 ('联网查询今日铜价并生成Word报告',{'presearch':True},[],False),
 ('制作Excel报表，不要搜索网络',{'presearch':False},[],False),
 ('制作设备点检Word文档，包含降温检查项',{'presearch':False,'weather':False},[],False),
 ('分析上传库存.xlsx',{'is_inspect_intent':True,'is_research_intent':False},['库存.xlsx'],True),
 ('比较不同的零售补货策略',{'is_research_intent':True},[],True),
]:add('search',q,expected,files,research=toggle)

# Same real attachment form consumed by CLI, plus input format / output format crossing.
for q,files,skill,ext in [
 ('读取采购.xlsx，生成采购说明.docx',['采购.xlsx'],'docx','.docx'),
 ('读取设备.docx，生成培训.pptx',['设备.docx'],'pptx','.pptx'),
 ('读取销售.csv，生成销售汇总.xlsx',['销售.csv'],'xlsx','.xlsx'),
 ('读取销售.csv和说明.txt，生成经营分析.pdf',['销售.csv','说明.txt'],'pdf','.pdf'),
 ('读取通知.pdf，将其中内容保存为通知.docx',['通知.pdf'],'docx','.docx'),
]:create('attachment',q,skill,ext,files)
for q in ['只在聊天中总结附件，不生成文件','生成“交接.md”，无需HTML/PPT']:
    wrapped='【当前轮次用户上传附件】: 交接记录.txt\n用户指令：'+q
    if q.startswith('生成'):markdown('attachment',wrapped,'交接.md',['交接记录.txt'])
    else:readonly('attachment',wrapped,['交接记录.txt'])

readonly('extended','查看刚才生成的交接.md',['交接.md'])
add('extended','读取交接.md并生成Word通知.docx',{'is_generate_intent':True,'format_has':['.docx'],'format_not':['.md']},['交接.md'])
markdown('extended','整理并保存为交接.md','交接.md',['交接.txt'])
markdown('extended','将交接记录保存为“交接.MD”','交接.MD',['交接.txt'])
add('extended','总结上传材料，保存为Markdown文件',{'is_generate_intent':True,'format_has':['.md'],'skill_not':SLIDE_UI},['材料.txt'])
add('extended','将门店销售导出为“销售.csv”',{'is_generate_intent':True,'format_has':['.csv'],'format_not':['.xlsx']})
add('extended','将订单汇总导出为“订单.json”',{'is_generate_intent':True,'format_has':['.json']})
create('extended','Create a Word document checklist.docx. Do not generate HTML or PPT.','docx','.docx')
create('extended','不想要PPT，请制作Word通知.docx','docx','.docx')
add('extended','不要通过微信发送，只生成Word交接.docx',{'is_send_intent':False,'is_generate_intent':True})
add('extended','通过微信发送上传的交接.docx',{'is_send_intent':True,'tools_has':['send_file']},['交接.docx'])
add('extended','查询知识库中的门店盘点流程',{'is_knowledge_intent':True,'tools_has':['scan_knowledge'],'is_search_intent':False})
add('extended','不要任何文件，只用Markdown表格回复班次职责',{'is_generate_intent':False,'deliverables_empty':True,'tools_not':WRITES})
create('extended','Export the attached production data as a PDF report.','pdf','.pdf',['production.xlsx'])
readonly('extended','【当前轮次用户上传附件】: 交接.docx\n用户指令：检查交接内容并列出异常',['交接.docx'])
add('extended','制作一个可交互的HTML门店经营看板',{'is_generate_intent':True,'is_design_intent':True})

def run():
    skills=get_available_skills()
    results=[]
    for case in CASES:
        start=time.perf_counter()
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                routed=SkillRouter.route(case['prompt'],case['history'],skills,case['research'],case['files'])
                actual=vars(routed).copy(); actual.pop('skill_context')
                forbidden_network = is_network_search_forbidden(case['prompt'])
                weather=bool(WEATHER_RE.search(case['prompt'])) and not forbidden_network
                presearch=(case['prompt'].strip().startswith('/search ') or routed.is_search_intent or weather) and not forbidden_network
                # Exact pre-search gate from cmd_run (routing-only, no search performed).
                if ((routed.is_generate_intent or routed.skill_id in {'docx','xlsx','pdf','pptx','html-ppt','guizang-ppt'})
                    and not case['prompt'].strip().startswith('/search ')
                    and not weather
                    and not any(k in case['prompt'] for k in ['联网','搜索','全网查询','最新动态','实时数据'])):
                    presearch=False
                tools=[t['function']['name'] for t in select_active_tools(case['prompt'],routed,presearch,True)]
            actual.update(tools=tools,weather=weather,presearch=presearch)
            failures=[]
            def has_format(ext):return any(d==ext or d.lower().endswith(ext) for d in routed.deliverables)
            for key,val in case['expected'].items():
                checks={'skill_in': lambda: routed.skill_id in val,'skill_not':lambda:routed.skill_id not in val,
                  'format_has':lambda:all(has_format(x) for x in val),'format_not':lambda:all(not has_format(x) for x in val),
                  'deliverables_has':lambda:all(x in routed.deliverables for x in val),
                  'deliverables_empty':lambda:bool(not routed.deliverables)==val,
                  'tools_has':lambda:all(x in tools for x in val),'tools_not':lambda:all(x not in tools for x in val),
                  'tools_any':lambda:any(x in tools for x in val)}
                ok=checks[key]() if key in checks else actual.get(key)==val
                if not ok:failures.append({'check':key,'expected':val,'actual':actual.get(key,routed.skill_id if key.startswith('skill') else routed.deliverables if key.startswith(('format','deliverables')) else tools)})
            results.append({**case,'actual':actual,'failures':failures,'pass':not failures,'elapsed_ms':(time.perf_counter()-start)*1000})
        except Exception as exc:
            results.append({**case,'pass':False,'exception':type(exc).__name__+': '+str(exc)})
    source_hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [SRC/'dsh_modules/skill_router.py',SRC/'dsh_modules/runner.py',SRC/'dsh_modules/prompt_builder.py']}
    metadata=[{k:s.get(k) for k in ['id','name','description','triggers','aliases','deliverables','requires_execution']} for s in skills]
    output={'scope':'real SkillRouter.route + select_active_tools; no model or tool execution',
            'source_hashes':source_hashes,'skills':metadata,'results':results,
            'total':len(results),'passed':sum(r['pass'] for r in results),'failed':sum(not r['pass'] for r in results)}
    path=Path(__file__).with_suffix('.json'); path.write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print(json.dumps({k:output[k] for k in ['total','passed','failed']},ensure_ascii=False))
    for group in dict.fromkeys(c['group'] for c in CASES):
        rows=[r for r in results if r['group']==group]
        print(group,len(rows),sum(r['pass'] for r in rows))
    for r in results:
        if not r['pass']:print(r['id'],r['prompt'],json.dumps(r.get('failures',r.get('exception')),ensure_ascii=False))
    print('saved',path)

if __name__=='__main__':run()
