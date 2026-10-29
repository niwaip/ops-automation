"""Replay an actual model-authored draft; no synthetic writing-model calls."""
import json,time
from pathlib import Path
from dsh_modules.pdf_render_tool import render_pdf
from dsh_modules.pdf_preview_tool import reset_pdf_renders,review_current_pdf_pages,pdf_delivery_result
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.evidence_store import persist_turn_evidence
root=Path('/workspace')
previous=json.loads((root/'.dsh/sessions/pdf-quality-owned-layout-20261029.evidence.json').read_text())
render=[r['data'] for r in previous['receipts'] if isinstance(r.get('data'),dict) and r['data'].get('kind')=='pdf_render'][-1]
source=Path(render['source']).read_text()
folder=root/'pdf-quality-optimized';folder.mkdir(exist_ok=True)
history=root/'.dsh/sessions/pdf-layout-acceptance-20261029.json'
t=TelemetryStats();t.bind_journal(history);reset_pdf_renders();started=time.monotonic()
params={'markdown':source,'output_path':str(folder/'handout.pdf')}
t.checkpoint('tool_started',{'name':'render_pdf','execution_origin':'regression_replay'})
r=render_pdf(params,root,Path('/opt/dsh/skills'),deadline=started+180,user_prompt=previous['query']).tool_result
r.provenance.update(execution_origin='regression_replay')
t.record_tool_call('render_pdf',params,r.status);t.record_execution_result(r)
receipts=[r]
if r.is_success:receipts.extend(review_current_pdf_pages(root,started+180,t,0))
text,files=pdf_delivery_result();t.record_guard('pdf_delivery','accept' if files else 'reject','actual_draft_replay')
verification=persist_turn_evidence(history,{},previous['query'],receipts,t.guard_decisions)
t.set_wall_clock_duration((time.monotonic()-started)*1000)
metrics=json.loads(t.to_metrics_json());t.checkpoint('metrics',metrics)
summary={'input_origin':'actual model draft from pdf-quality-owned-layout-20261029; writer not rerun',
         'verification':verification,'answer':text,'files':files,'metrics':metrics}
(folder/'acceptance.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'verified':verification['verified'],'wallMs':metrics['durationMs'],'calls':metrics['llmInvocations'],
                  'tokens':metrics['tokens'],'answer':text,'errors':[r.error for r in receipts if r.is_error]},ensure_ascii=False))
if not files:raise SystemExit(1)
