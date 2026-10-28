"""Run from broker via start-smart.sh; use a fresh original-sandbox process."""
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sys


def verify_inside():
    import tempfile, shutil
    from unittest.mock import patch
    sys.path.insert(0,'/usr/local/bin')
    from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
    from dsh_modules.spreadsheet_chart_delivery import SpreadsheetChartDelivery
    from dsh_modules.spreadsheet_chart_renderer import validate_bar_chart
    from dsh_modules.telemetry import TelemetryStats
    source=Path('/workspace/工数实绩明细_20261020134124.xlsx')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    old=json.loads(Path('/workspace/.dsh/sessions/chat-session-1793107293434-lr4uyhir.evidence/1793107368597734218-dd2dd737c2fe47b7bb93cbfea124ee91.json').read_text())
    with tempfile.TemporaryDirectory(prefix='final-chart-native-') as tmp:
        root=Path(tmp); copy=root/source.name; shutil.copyfile(source,copy)
        stale='old shared index';(root/'index.html').write_text(stale)
        with patch('dsh_modules.llm.call_model_proxy',side_effect=AssertionError('no model request')):
            receipt=calculate_spreadsheet_analysis(copy,old['receipts'][-1]['data']['requested_plan'])
            assert receipt.is_success,receipt.error
            receipt.provenance['file_path']=str(copy)
            flow=SpreadsheetChartDelivery(root,'native-final')
            telemetry=TelemetryStats()
            assert flow.publish(receipt,'按部门统计金额合计，不包含ex、sy、sp、ip、ib、sz开头的数据，然后生成柱状图',telemetry),flow.error
            assert validate_bar_chart(flow.published.read_text(),flow.dataset)
            assert (root/'index.html').read_text()==stale
            assert len(flow.dataset['points'])==7
            print(json.dumps({'html':flow.published.read_text(),'dataset':flow.dataset,'manifest':flow.state,'guards':telemetry.guard_decisions,'source_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==before,'runtime_hashes':{n:hashlib.sha256((Path('/usr/local/bin/dsh_modules')/(n+'.py')).read_bytes()).hexdigest() for n in ['agent_loop','runner','spreadsheet_chart_renderer','spreadsheet_chart_delivery','artifact_exporter','html_report_fallback','completion_evaluator']}},ensure_ascii=False))


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
