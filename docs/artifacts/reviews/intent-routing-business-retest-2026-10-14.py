"""Business routing regression: no model, network request or tool execution."""
import ast
import contextlib
import hashlib
import importlib.util
import io
import json
import statistics
import time
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('base_audit', HERE / 'intent-routing-audit-2026-10-14.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
from dsh_modules.intent_contract import is_network_search_forbidden
from dsh_modules.config import SKILL_DIR

# Keep business cases and previous material defects; omit syntax permutations.
cases = [c for c in base.CASES if c['group'] in {
    'manufacturing', 'retail', 'general', 'regression', 'continuation'
} or c['id'] in {'boundary-16', 'boundary-17', 'boundary-18'}]
previous_guards = json.loads((HERE / 'intent-routing-retest-2026-10-14-guards.json').read_text())
for c in previous_guards['results']:
    if c['id'] in {'G01', 'G02', 'G03', 'G04', 'G05', 'G07'}:
        cases.append({k:c[k] for k in ('id','prompt','history','files','expected') if k in c} | {'group':'previous_material_failures'})
cases.append({'id':'PPT-RETRY','group':'native_ppt_retry',
    'prompt':'重新生成', 'files':[], 'history':[
        {'role':'user','content':'制作一份产品培训原生PPTX，保存为“产品培训.pptx”，不要HTML。'},
        {'role':'assistant','content':'本次生成未完成，请重试。'}],
    'expected':{'is_generate_intent':True,'skill_in':['pptx'],'format_has':['.pptx'],'format_not':['.html']}})

runner_path = base.SRC / 'dsh_modules/runner.py'
runner_tree = ast.parse(runner_path.read_text())
cmd = next(n for n in runner_tree.body if isinstance(n, ast.FunctionDef) and n.name=='cmd_run')
presearch_vars = {'forbidden_network','has_web_search_permission','is_weather_intent','is_search_intent','is_doc_task_without_search_cue'}
decision_nodes=[]
for node in cmd.body:
    if isinstance(node, ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0], ast.Name) and node.targets[0].id in presearch_vars:
        decision_nodes.append(node)
    elif isinstance(node, ast.If) and isinstance(node.test, ast.Name) and node.test.id=='is_doc_task_without_search_cue':
        decision_nodes.append(node)
assert len(decision_nodes)==6, 'runner presearch decision layout changed; recheck extraction'
decision_code=compile(ast.Module(body=decision_nodes,type_ignores=[]),str(runner_path),'exec')
sources=[base.SRC/'dsh_modules'/name for name in ['skill_router.py','intent_contract.py','runner.py','skills.py']]
hash_sources=lambda:{str(p.relative_to(base.ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
initial_hashes=hash_sources()
skills=base.get_available_skills()

def evaluate(case):
    start=time.perf_counter()
    with contextlib.redirect_stdout(io.StringIO()):
        route=base.SkillRouter.route(case['prompt'],case.get('history',[]),skills,
                                     case.get('research',False),case.get('files',[]))
        state={'prompt':case['prompt'],'skill_res':route,'args':SimpleNamespace(web_search=True),
               'WEATHER_RE':base.WEATHER_RE,'is_network_search_forbidden':is_network_search_forbidden}
        exec(decision_code,state)
        tools=[t['function']['name'] for t in base.select_active_tools(
            case['prompt'],route,state['is_search_intent'],state['has_web_search_permission'])]
    actual=vars(route).copy();actual.pop('skill_context')
    actual.update(tools=tools,presearch=bool(state['is_search_intent']),
                  weather=bool(state['is_weather_intent']),forbidden_network=bool(state['forbidden_network']))
    failures=[]
    def has_format(ext):return any(d.lower()==ext.lower() or d.lower().endswith(ext.lower()) for d in route.deliverables)
    for key,value in case['expected'].items():
        values=value if isinstance(value,list) else [value]
        checks={
            'skill_in':lambda:route.skill_id in values,
            'skill_not':lambda:route.skill_id not in values,
            'format_has':lambda:all(has_format(v) for v in values),
            'format_not':lambda:all(not has_format(v) for v in values),
            'deliverables_has':lambda:all(v in route.deliverables for v in values),
            'deliverables_empty':lambda:bool(not route.deliverables)==value,
            'tools_has':lambda:all(v in tools for v in values),
            'tools_not':lambda:all(v not in tools for v in values),
            'tools_any':lambda:any(v in tools for v in values),
        }
        ok=checks[key]() if key in checks else actual.get(key)==value
        if not ok:failures.append({'check':key,'expected':value})
    return {**case,'actual':actual,'pass':not failures,'failures':failures,
            'elapsed_ms':(time.perf_counter()-start)*1000}

results=[evaluate(case) for case in cases]
changed=[]
for case,previous in zip(cases,results):
    repeat=evaluate(case)
    if repeat['actual']!=previous['actual'] or repeat['pass']!=previous['pass']:
        changed.append(case['id'])
output={'scope':'business routing and actual presearch AST decision only; no model/tool execution',
        'skill_directory':SKILL_DIR,'skill_count':len(skills),'source_hashes':initial_hashes,
        'source_unchanged':initial_hashes==hash_sources(),
        'total':len(results),'passed':sum(r['pass'] for r in results),
        'failed':sum(not r['pass'] for r in results),'repeat_changed':changed,'results':results}
assert output['source_unchanged'],'source changed during test, rerun'
HERE.joinpath('intent-routing-business-retest-2026-10-14.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in output.items() if k not in {'results','source_hashes'}},ensure_ascii=False))
for group in dict.fromkeys(c['group'] for c in cases):
    rows=[r for r in results if r['group']==group]
    print(group,len(rows),sum(r['pass'] for r in rows))
for r in results:
    if not r['pass']:
        print(r['id'],r['prompt'],json.dumps({k:r['actual'][k] for k in ['skill_id','is_generate_intent','is_inspect_intent','is_send_intent','deliverables','presearch','tools']},ensure_ascii=False),r['failures'])
