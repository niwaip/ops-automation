"""Replay all recorded page arguments through the production renderer adapter."""
import json
from pathlib import Path
from unittest.mock import patch
from dsh_modules.pdf_render_tool import render_pdf
root=Path('/out')
results=[]
for i in range(1,4):
    params=json.loads((root/f'attempt-{i}.json').read_text())['params']
    params['output_path']=f'replay-{i}.pdf'
    with patch('dsh_modules.pdf_task_contract.bind_pdf_request',side_effect=lambda p,*a,**k:p):
        response=render_pdf(params,root/f'workspace-{i}', '/audit/apps/backend/runtimes/personal-sandbox-runner/skills')
    receipt=response.tool_result
    results.append(receipt.to_dict())
(root/'replay-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
for i, r in enumerate(results):
    print(r['status'],r.get('error'),r.get('data',{}).get('page_count'))
    assert r['status']==('error' if i == 0 else 'success'), r
assert '有效 JSON 数组' in results[0]['error']['message']
