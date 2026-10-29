"""Replay original content through production pagination; no external news calls."""
import json
from pathlib import Path
from unittest.mock import patch
from dsh_modules.pdf_render_tool import render_pdf
from dsh_modules.pdf_preview_tool import reset_pdf_renders
out=Path('/out')
source=Path('/audit/docs/artifacts/reviews/bilibili-call-audit-20261029-2038')
ids=['d923f08dcf3e42b4949114b6809a7b72','727c0de650df408a97d704bd9d9f41b3','40a60df6c97b479e92aeaafc07a075bf','d588a2e2f463441ab33e57a81f6fde9c']
summary=[]
for i, name in enumerate(ids,1):
    reset_pdf_renders()
    params=json.loads((source/(name+'.json')).read_text())['params']
    params['output_path']=f'replay-{i}.pdf'
    with patch('dsh_modules.pdf_task_contract.bind_pdf_request',side_effect=lambda p,*a,**k:p):
        result=render_pdf(params,out/f'run-{i}','/audit/apps/backend/runtimes/personal-sandbox-runner/skills',
                          user_prompt='查看今天的bilibili热点，生成pdf ，需要a4 美观，便于阅读').tool_result
    assert result.is_success,result.to_dict()
    assert result.data['page_count']<=5,result.data['page_count']
    qa=json.loads(Path(result.data['qa_path']).read_text())
    assert all(p['width_pt']>590 and p['width_pt']<600 for p in qa['pages'])
    summary.append({'attempt':name,'input_items':len(params['pages']),'pages':result.data['page_count'],
                    'valid':qa['valid'],'sha256':qa['sha256'],'previews':qa['previews']})
(out/'replay-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary,ensure_ascii=False,indent=2))
