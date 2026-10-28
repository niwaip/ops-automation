"""Run from broker via start-smart.sh; use a fresh original-sandbox process."""
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sys


def verify_inside():
    sys.path.insert(0,'/usr/local/bin')
    from unittest.mock import patch
    from dsh_modules.tool_result import ToolResult
    from dsh_modules.spreadsheet_update.presentation import render_published_update
    from dsh_modules.summary_context import build_summary_messages
    source=Path('/workspace/工数实绩明细_20261020134124.xlsx')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    turn=json.loads(Path('/workspace/.dsh/sessions/chat-session-1793146331804-xd8bs1c0.evidence/1793146519409899670-ccdf75cf506049b3b02cfd5c3a97ad47.json').read_text())
    receipts=[ToolResult(**r) for r in turn['receipts']]
    with patch('dsh_modules.llm.call_model_proxy',side_effect=AssertionError('No summary model calls')):
        text=render_published_update(receipts,'/workspace')
        assert text and '2.87059' in text and '1028' in text,text
        context=build_summary_messages('更新预测', [{'role':'system','content':'x'*1000000}],receipts)
        assert len(str(context))<22000
    assert hashlib.sha256(source.read_bytes()).hexdigest()==before
    print(json.dumps({'verified_receipt_rendered_without_model':True,'preserved_warning':True,'source_unchanged':True,'summary_input_chars':sum(len(m['content']) for m in context),'runtime_hashes':{n:hashlib.sha256((Path('/usr/local/bin/dsh_modules')/(n+'.py')).read_bytes()).hexdigest() for n in ['agent_loop','final_answer','summary_context']}},ensure_ascii=False,indent=2))


class DockerConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect('/var/run/docker.sock')


def verify_from_broker():
    c = DockerConnection('localhost', timeout=60)
    c.request('POST', '/containers/ops-user-sandbox-e7fce333-a8f4-4097-9a53-f0a4c729da46/start')
    started=c.getresponse(); assert started.status in (204,304), started.read(); started.read()
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
