"""Run from broker via start-smart.sh; use a fresh original-sandbox process."""
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sys


def verify_inside():
    import os
    from unittest.mock import patch
    sys.path.insert(0, '/usr/local/bin')
    from dsh_modules.tools import get_sandbox_tools
    from dsh_modules.spreadsheet_analysis_schema import select_analysis_tools, analysis_instructions_for
    from dsh_modules.spreadsheet_analysis import execute_spreadsheet_analysis
    from dsh_modules.analysis_task_state import analysis_task_state
    from dsh_modules.report_presentation import analysis_overview
    from dsh_modules.tool_result import ToolResult

    source = Path('/workspace/工数实绩明细_20261020134124.xlsx')
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    os.environ['DSH_SESSION_ATTACHMENTS'] = source.name
    prompt = '查看 员工 杨烨 的明细数据'
    tools = select_analysis_tools(get_sandbox_tools(), prompt)
    visible = {t['function']['name']: list(t['function']['parameters']['properties']) for t in tools}
    assert set(visible) == {'aggregate_spreadsheet', 'inspect_spreadsheet_structure'}, visible
    assert visible['aggregate_spreadsheet'] == ['file_path', 'query'], visible
    instructions = analysis_instructions_for(prompt)
    assert 'analyze_spreadsheet' not in instructions and '"ref"' not in instructions

    with patch('dsh_modules.llm.call_model_proxy', side_effect=AssertionError('No model calls')), \
         patch('dsh_modules.task_completeness_judge.judge_task_completeness', return_value=None):
        result = execute_spreadsheet_analysis({'file_path': source.name, 'query': {
            'source': {'sheet': '工数实绩明细', 'header_row': 4, 'data_range': 'A5:R278'},
            'where': {'field': '员工姓名', 'op': 'eq', 'value': '杨烨'},
        }}).tool_result
        assert result.is_success, result.error
        rows = result.data['rows']
        assert len(rows) == 6 and all(len(r) == 19 for r in rows), rows
        assert [r['_row'] for r in rows] == [176, 177, 178, 179, 180, 181]
        assert {r['员工编号'] for r in rows} == {'S22014'}
        state = analysis_task_state([result], prompt)
        assert state['complete'], state
        rendered = analysis_overview([result], prompt)
        assert '有偿无偿' in rendered and '工数年月' in rendered and '员工姓名' in rendered

        old_path = Path('/workspace/.dsh/sessions/chat-session-1793102926692-n9aqcd6a.evidence')
        old = json.loads((old_path / '1793103745685792221-db50497e39dd4fccbd08d7cc0d5705db.json').read_text())
        old_state = analysis_task_state([ToolResult(**r) for r in old['receipts']], prompt)
        assert not old_state['complete'], old_state
        assert 'detail_granularity_changed' in [i['code'] for i in old_state['issues']]

    names = ['spreadsheet_query_schema', 'spreadsheet_analysis_schema', 'analysis_delivery_constraints', 'tools', 'agent_loop']
    fingerprints = {n: hashlib.sha256((Path('/usr/local/bin/dsh_modules') / (n + '.py')).read_bytes()).hexdigest()
                    for n in names}
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    print(json.dumps({'visible_tools': visible, 'rows': len(rows), 'original_columns': 18,
                      'row_ids': [r['_row'] for r in rows], 'detail_gate_complete': state['complete'],
                      'original_grouped_gate': old_state, 'source_sha256': before,
                      'source_unchanged': True, 'runtime_hashes': fingerprints,
                      'detail_instructions_chars': len(instructions),
                      'model_requests': 0}, ensure_ascii=False, indent=2))


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
