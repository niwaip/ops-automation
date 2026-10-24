"""Real workbook + LibreOffice verification, no LLM or recalculation mocks."""
import hashlib
import json
from pathlib import Path
from dsh_modules.tools import execute_tool
from dsh_modules.spreadsheet_update.tools import harvest_analytical_facts

root=Path.cwd()
source='工数实绩明细_20261020134124.xlsx'
target='工数3Q预实管理.xlsx'
original={n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in (source,target)}
query={'source':{'sheet':'工数实绩明细','header_row':4},
       'where':{'and':[{'field':'工数年月','op':'eq','value':'202610'},
                       {'field':'有偿无偿','op':'eq','value':'有偿'}]},
       'group_by':['部门编号'],
       'metrics':[{'id':'amount_k','field':'金额(K)','op':'sum','unit':'source'}]}
receipt=execute_tool('aggregate_spreadsheet',{'file_path':source,'query':query}).tool_result
assert receipt.is_success, receipt.render_text()
(root/'analysis.json').write_text(receipt.to_json())
harvest_analytical_facts(receipt.data,provenance=receipt.provenance)
plan=execute_tool('plan_spreadsheet_update',{'target_file':target,'period':'202610',
    'section':'有偿','target_kind':'forecast','target_unit':'K','new_sheet':'1023'})
(root/'plan-result.json').write_text(plan.tool_result.to_json())
print('PLAN',str(plan),flush=True)
assert plan.is_success, str(plan)
result=execute_tool('execute_spreadsheet_update',{'plan_id':plan.data['plan_id']})
(root/'execute-result.json').write_text(result.tool_result.to_json())
print('EXECUTE',str(result),flush=True)
assert result.is_success,str(result)
assert all(hashlib.sha256((root/n).read_bytes()).hexdigest()==h for n,h in original.items())
print('INPUTS_PRESERVED',original,flush=True)
