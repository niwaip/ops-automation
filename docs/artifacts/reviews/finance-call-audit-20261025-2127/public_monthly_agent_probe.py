"""Run the actual dsh planner on a temporary, entirely generated workbook."""
import json
import os
import pathlib
import subprocess
import tempfile
import openpyxl

with tempfile.TemporaryDirectory(prefix='public-monthly-agent-') as temporary:
    root = pathlib.Path(temporary)
    knowledge = root / 'empty-knowledge'
    knowledge.mkdir()
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = '合成经营'
    sheet.append(['2037年月度经营明细'])
    sheet.append(['单位：千元'])
    sheet.append(['月份', '营业收入', '毛利', '毛利率', '营业利润', '净利润'])
    for month in range(1, 13):
        revenue = 90 + month * 10
        margin = .1 if month <= 6 else .5
        sheet.append([f'{month}月', revenue, revenue * margin, margin, revenue * .2, revenue * .1])
    workbook.save(root / 'synthetic.xlsx')
    workbook.close()
    environment = {**os.environ, 'WORKSPACE': temporary, 'KNOWLEDGE_DIR': str(knowledge),
                   'DSH_CUSTOM_SKILL_DIR': str(knowledge / 'skills'),
                   'DSH_SESSION_ATTACHMENTS': '["synthetic.xlsx"]'}
    session = 'public-monthly-generated-acceptance'
    command = ['/usr/local/bin/dsh', 'run', '总结2037年收入、毛利率、营业利润和净利润。',
               '--files', 'synthetic.xlsx', '--session-id', session,
               '--model', 'd13e0d30-87b9-4e87-b96a-d8b1b3cf78af', '--thinking',
               '--reasoning-effort', 'medium', '--timeout', '240', '--no-web-search']
    process = subprocess.run(command, cwd=root, env=environment, text=True, capture_output=True, timeout=270)
    evidence = root / '.dsh' / 'sessions' / (session + '.evidence.json')
    history = root / '.dsh' / 'sessions' / (session + '.json')
    print(json.dumps({'data': 'entirely generated synthetic data', 'exit_code': process.returncode,
                      'stdout': process.stdout, 'stderr': process.stderr,
                      'evidence': json.loads(evidence.read_text()) if evidence.exists() else None,
                      'history': json.loads(history.read_text()) if history.exists() else None},
                     ensure_ascii=False, indent=2), flush=True)
