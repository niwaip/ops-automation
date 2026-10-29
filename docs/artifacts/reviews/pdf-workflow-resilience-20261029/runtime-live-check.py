import json, os, sys
from pathlib import Path
sys.path.insert(0, '/usr/local/bin')
from unittest.mock import patch
# Accept only the signed credential line; launcher diagnostics are not credentials.
tokens=[line.strip() for line in sys.stdin if line.startswith('sandbox-user-token-')]
if len(tokens)!=1: raise RuntimeError('Missing diagnostic credential')
os.environ['DEEPSEEK_API_KEY']=tokens[0]
from dsh_modules.pdf_render_tool import render_pdf
from dsh_modules.pdf_preview_tool import reset_pdf_renders, review_current_pdf_pages, pdf_delivery_result
from dsh_modules.telemetry import TelemetryStats
root=Path('/workspace/.dsh/pdf-engineering-check')
params=json.loads((root/'input.json').read_text())['params'];params['output_path']='diagnostic.pdf'
reset_pdf_renders()
with patch('dsh_modules.pdf_task_contract.bind_pdf_request',side_effect=lambda p,*a,**k:p):
    receipt=render_pdf(params,root,'/opt/dsh/skills',user_prompt='查看今天的bilibili热点，生成pdf ，需要a4 美观，便于阅读').tool_result
assert receipt.is_success,receipt.error_message
telemetry=TelemetryStats()
reviews=review_current_pdf_pages(root,None,telemetry,0)
text,files=pdf_delivery_result()
result={'page_count':receipt.data['page_count'],'reviews':[r.to_dict() for r in reviews],
        'final_text':text,'published':bool(files),'calls':telemetry.calls_ledger}
(root/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'page_count':result['page_count'],'reviews':[r.status for r in reviews],
                  'published':result['published'],'final_text':text},ensure_ascii=False))
assert result['published'],text
