"""Run from broker via start-smart.sh; use a fresh original-sandbox process."""
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sys


def verify_inside():
    import os
    import shutil
    import subprocess
    import tempfile
    sys.path.insert(0, '/usr/local/bin')
    from dsh_modules.telemetry import extract_dsh_markers
    source=Path('/workspace/工数实绩明细_20261020134124.xlsx')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix='chart-delivery-smoke-') as tmp:
        root=Path(tmp)
        shutil.copyfile(source,root/source.name)
        (root/'knowledge').mkdir()
        stale='<!DOCTYPE html><html><body><table><tr><td>561.75345</td></tr></table></body></html>'
        (root/'index.html').write_text(stale)
        os.utime(root/'index.html',(1,1))
        env=dict(os.environ,WORKSPACE=tmp,WORKSPACE_DIR=tmp,KNOWLEDGE_DIR=str(root/'knowledge'),PYTHONDONTWRITEBYTECODE='1')
        prompt='按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，然后生成柱状图'
        run=subprocess.run(['dsh','run',prompt,'--session-id','chart-delivery-smoke','--files',source.name,'--no-thinking','--timeout','100'],env=env,text=True,capture_output=True,timeout=115)
        assert run.returncode==0,run.stdout[-10000:]+run.stderr[-2000:]
        manifests=list(root.glob('.sessions/chart-delivery-smoke/runs/*/manifest.json'))
        assert len(manifests)==1,run.stdout[-12000:]
        manifest=json.loads(manifests[0].read_text())
        assert manifest['status']=='published',str(manifest)+run.stdout[-12000:]
        target=Path(manifest['file_path'])
        dataset=json.loads((manifests[0].parent/'inputs/verified-data.json').read_text())
        from dsh_modules.spreadsheet_chart_renderer import validate_bar_chart
        assert validate_bar_chart(target.read_text(),dataset)
        assert len(dataset['points'])==7,dataset
        assert (root/'index.html').read_text()==stale
        assert not any(d.get('guard')=='deliverable_contract' and d.get('action')=='reject' for d in json.loads(extract_dsh_markers(run.stdout,'METRICS')[-1][0]).get('guardDecisions',[])) if extract_dsh_markers(run.stdout,'METRICS') else True
        metrics=extract_dsh_markers(run.stdout,'METRICS')
        print(json.dumps({'original_source_unchanged':hashlib.sha256(source.read_bytes()).hexdigest()==before,'original_source_sha256':before,'shared_stale_index_unchanged':True,'manifest':manifest,'dataset':dataset,'html':target.read_text(),'stdout':run.stdout,'stderr':run.stderr,'runtime_hashes':{n:hashlib.sha256((Path('/usr/local/bin/dsh_modules')/(n+'.py')).read_bytes()).hexdigest() for n in ['agent_loop','runner','spreadsheet_chart_renderer','spreadsheet_chart_delivery','artifact_exporter','html_report_fallback','completion_evaluator']}},ensure_ascii=False))


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')


def verify_from_broker():
    c = DockerConnection('localhost', timeout=150)
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
