"""Run from broker via start-smart.sh; use a fresh original-sandbox process."""
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sys


def verify_inside():
    from collections import defaultdict, Counter
    from decimal import Decimal
    import openpyxl
    from unittest.mock import patch
    import tempfile
    sys.path.insert(0, '/usr/local/bin')
    from dsh_modules.html_report_fallback import materialize_requested_html
    from dsh_modules.artifact_exporter import ArtifactExporter
    source = Path('/workspace/工数实绩明细_20261020134124.xlsx')
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    wb = openpyxl.load_workbook(source, read_only=False, data_only=True)
    ws = wb['工数实绩明细']
    sums = defaultdict(Decimal); paid = defaultdict(Decimal); counts=Counter(); excluded=Counter()
    for row in ws.iter_rows(min_row=5,max_row=278,values_only=True):
        dep=row[3]
        if row[12]=='有偿': paid[dep]+=Decimal(str(row[14] or 0))
        code=str(row[8] or '').strip().lower()
        if code.startswith(('ex','sy','sp','ip','ib','sz')):
            excluded[code[:2]]+=1
            continue
        sums[dep]+=Decimal(str(row[15] or 0)); counts[dep]+=1
    chart=json.loads(Path('/workspace/.dsh/sessions/chat-session-1793107293434-lr4uyhir.evidence/1793107368597734218-dd2dd737c2fe47b7bb93cbfea124ee91.json').read_text())
    bill=json.loads(Path('/workspace/.dsh/sessions/chat-session-1793105865040-jzoas4r7.evidence/1793106851041661547-292c14f550ba42718d06dc024afcc6ad.json').read_text())
    rows=chart['receipts'][-1]['data']['rows']
    assert {r['部门名称']:Decimal(r['amount']) for r in rows}==dict(sums)
    assert {r['部门名称']:r['records'] for r in rows}==dict(counts)
    brows=bill['receipts'][-1]['data']['rows']
    assert {r['部门名称']:Decimal(r['paid_hours_total']) for r in brows}==dict(paid)
    bad=chart['receipts'][0]['data']['requested_plan']['query']
    try: json.loads(bad)
    except json.JSONDecodeError as e: malformed=str(e)
    else: raise AssertionError('expected malformed JSON')
    warning='> ⚠️ **【重要提示：目标交付物尚未生成落盘】**\n> 目标文件（`.html`）尚未在沙箱内完成物理落盘，请根据下方说明补充条件或重试生成。\n\n按请求执行后的结果如下：\n\n|部门名称|金额合计(K)|\n|---|---|\n'+''.join('|'+r['部门名称']+'|'+r['amount']+'|\n' for r in rows)
    prompt='按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，然后生成柱状图'
    with tempfile.TemporaryDirectory(prefix='chart-audit-') as tmp:
        out,created=materialize_requested_html(prompt,warning,tmp,is_design_intent=True)
        assert created and out
        html=Path(out).read_text()
        final,files=ArtifactExporter.export_html(warning,False,tmp,is_design_intent=True,prompt=prompt)
        assert '交互式页面已生成完毕' in final
        assert '目标交付物尚未生成落盘' in html
        assert all(tag not in html.lower() for tag in ['<script','<svg','<canvas','<img'])
        fallback={'created_warning_html':created,'success_banner_despite_warning':True,'chart_present':False,'exported_file_count':len(files)}
    assert hashlib.sha256(source.read_bytes()).hexdigest()==before
    names=['spreadsheet_query_schema','spreadsheet_analysis_schema','html_report_fallback','artifact_exporter','planning_phase','llm','telemetry','deliverable_contract','runner']
    print(json.dumps({'source_sha256':before,'source_unchanged':True,'original_rows':274,'included_rows':sum(counts.values()),'excluded_rows':sum(excluded.values()),'excluded_prefix_counts':dict(excluded),'department_amounts_K':{k:str(v) for k,v in sums.items()},'amount_total_K':str(sum(sums.values())),'chart_receipt_equals_independent_oracle':True,'department_paid_hours':{k:str(v) for k,v in paid.items()},'paid_hours_total':str(sum(paid.values())),'billable_receipt_equals_independent_oracle':True,'malformed_query_error':malformed,'fallback_reproduction':fallback,'runtime_hashes':{n:hashlib.sha256((Path('/usr/local/bin/dsh_modules')/(n+'.py')).read_bytes()).hexdigest() for n in names}},ensure_ascii=False,indent=2))


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')


def verify_from_broker():
    c = DockerConnection('localhost', timeout=60)
    body = {'AttachStdout': True, 'AttachStderr': True,
            'User': 'sandbox', 'WorkingDir': '/workspace',
            'Env': ['PYTHONDONTWRITEBYTECODE=1'],
            'Cmd': ['python3', '-c', Path(__file__).read_text(), '--inside']}
    c.request('POST', '/containers/ops-user-sandbox-e7fce333-a8f4-4097-9a53-f0a4c729da46/exec',
              json.dumps(body), {'Content-Type': 'application/json'})
    response = c.getresponse()
    data = json.loads(response.read())
    assert response.status == 201, data
    identifier = data['Id']
    c.request('POST', '/exec/' + identifier + '/start', json.dumps({'Detach': False, 'Tty': True}),
              {'Content-Type': 'application/json'})
    response = c.getresponse()
    output = response.read().decode()
    c.request('GET', '/exec/' + identifier + '/json')
    status = json.loads(c.getresponse().read())
    assert status['ExitCode'] == 0, output
    print(output)


if __name__ == '__main__':
    verify_inside() if '--inside' in sys.argv else verify_from_broker()
