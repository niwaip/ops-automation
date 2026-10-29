"""Replay an actual model-authored draft; no synthetic writing-model calls."""
import json,time
from pathlib import Path
from dsh_modules.pdf_render_tool import render_pdf
from dsh_modules.pdf_preview_tool import reset_pdf_renders,review_current_pdf_pages,pdf_delivery_result
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.evidence_store import persist_turn_evidence
root=Path('/workspace')
previous=json.loads((root/'.dsh/sessions/pdf-quality-verification-20261029.evidence.json').read_text())
events=[json.loads(line) for line in next((root/'.dsh/sessions/pdf-quality-verification-20261029.events').glob('*.jsonl')).read_text().splitlines()]
completed=[e for e in events if e['event']=='tool_completed' and e['data']['status']=='success' and e['data']['provenance']['tool']=='render_pdf'][-1]
started=[e for e in events if e['event']=='tool_started' and e['data'].get('name')=='render_pdf' and e['timestamp_ns']<completed['timestamp_ns']][-1]
attempts=[p for p in (root/'.dsh/pdf-attempts').glob('*.json') if started['timestamp_ns']-1000000000 <= p.stat().st_mtime_ns <= completed['timestamp_ns']+1000000000]
raw=json.loads(max(attempts,key=lambda p:p.stat().st_mtime_ns).read_text())
source=raw['raw_markdown']
folder=root/'pdf-quality-final';folder.mkdir(exist_ok=True)
history=root/'.dsh/sessions/pdf-final-acceptance-20261029.json'
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
summary={'input_origin':'actual model draft from pdf-quality-verification-20261029; writer not rerun',
         'verification':verification,'answer':text,'files':files,'metrics':metrics}
(folder/'acceptance.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({'verified':verification['verified'],'wallMs':metrics['durationMs'],'calls':metrics['llmInvocations'],
                  'tokens':metrics['tokens'],'answer':text,'errors':[r.error for r in receipts if r.is_error]},ensure_ascii=False))
if not files:raise SystemExit(1)
