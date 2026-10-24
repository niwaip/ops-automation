"""Real generic pipeline smoke test with transformed files and real LibreOffice."""
from pathlib import Path
import json
from dsh_modules.tools import execute_tool
from dsh_modules.spreadsheet_update.tools import harvest_analytical_facts
q={'source':{'sheet':'明细记录','header_row':12},
   'where':{'and':[{'field':'归属期','op':'eq','value':'202811'},{'field':'结算性质','op':'eq','value':'收费'}]},
   'group_by':['组织键'],'metrics':[{'id':'revenue','field':'收入(K)','op':'sum','unit':'source'}]}
r=execute_tool('aggregate_spreadsheet',{'file_path':'收入记录.xlsx','query':q})
assert r.is_success,str(r)
harvest_analytical_facts(r.data,provenance=r.tool_result.provenance)
plan=execute_tool('plan_spreadsheet_update',{'target_file':'滚动管理.xlsx','base_sheet':'快照-2028-11-01','new_sheet':'复核版',
    'period':'202811','period_field':'归属期','section':'收费业务','target_label':'本期估算',
    'target_kind':'forecast','target_unit':'万元','unit_cell':'A1','protected_labels':['基准预算']})
print('PLAN',str(plan),flush=True)
assert plan.is_success,str(plan)
result=execute_tool('execute_spreadsheet_update',{'plan_id':plan.data['plan_id']})
print('EXECUTE',str(result),flush=True)
assert result.is_success,str(result)
Path('direct-result.json').write_text(result.tool_result.to_json())
