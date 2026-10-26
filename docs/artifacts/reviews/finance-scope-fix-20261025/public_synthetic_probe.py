"""Validate only generated public test data through the configured model proxy."""
import copy
import json
import os
import sys
import tempfile
import time
from dataclasses import asdict
from pathlib import Path
import openpyxl

with tempfile.TemporaryDirectory(prefix='public-scope-test-') as temp:
    os.environ['WORKSPACE'] = temp
    os.environ['DSH_SESSION_ATTACHMENTS'] = '["public-synthetic.xlsx"]'
    sys.path.insert(0, '/usr/local/bin')
    from dsh_modules.analysis_contract import build_analysis_contract
    from dsh_modules.analysis_task_state import analysis_task_state
    from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
    from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
    from dsh_modules.semantic_filter_judge import SemanticFilterJudge
    from dsh_modules.semantic_contract_judge import SemanticContractJudge
    from dsh_modules.task_completeness_judge import TaskCompletenessJudge
    root = Path(temp)
    for cls in [SemanticFilterJudge, SemanticContractJudge, TaskCompletenessJudge]:
        cls._CACHE_DIR = root / cls.__name__
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = '合成报表'
    ws.append(['完全合成测试数据；单位：千元'])
    ws.append([])
    ws.append(['科目', '2037实际', '2036实际'])
    for row in [('营业收入', 1200, 900), ('成本', 840, 700), ('毛利', 360, 200),
                ('营业利润', 180, 100), ('净利润', 120, 80)]:
        ws.append(row)
    source = root / 'public-synthetic.xlsx'
    wb.save(source)
    wb.close()
    prompt = '总结2037年收入、毛利率、营业利润和净利润。附件为完全合成测试数据。'
    deadline = time.monotonic() + 150
    contract = build_analysis_contract(prompt)
    query = {'source': {'sheet': ws.title, 'header_row': 3, 'data_range': 'A4:C8'},
             'where': {'field': '科目', 'op': 'in',
                       'values': ['营业收入', '毛利', '营业利润', '净利润']},
             'group_by': ['科目'],
             'metrics': [{'id': 'actual', 'label': '实际值', 'op': 'sum',
                          'field': '2037实际', 'unit': 'amount'}]}
    class Telemetry:
        def record_tool_call(self, *a, **kw):
            pass
        def record_execution_result(self, *a, **kw):
            pass
    result = {'data': 'entirely generated public test data', 'contract': asdict(contract)}
    try:
        receipt = calculate_spreadsheet_analysis(source, {'query': query}, deadline, domain='finance')
        assert receipt.is_success, receipt.error
        evidence = [receipt]
        result['before'] = analysis_task_state(evidence, prompt, deadline=deadline)
        completed = RegisteredMetricCompletion().complete(
            evidence, prompt, Telemetry(), ['aggregate_spreadsheet'], deadline)
        result['completed'] = [r.to_dict() for r in completed]
        result['after'] = analysis_task_state(evidence, prompt, deadline=deadline)
        assert len(completed) == 1 and completed[0].is_success, 'auto completion unavailable'
        derived = completed[0].data['plan']
        mixed = calculate_spreadsheet_analysis(source, {'query': query, 'tables': derived['tables'],
            'calculations': derived['calculations']}, deadline, domain='finance')
        assert mixed.is_success, mixed.error
        result['mixed_state'] = analysis_task_state([mixed], prompt, deadline=deadline)
        result['facts'] = mixed.data['facts']
        wrong = copy.deepcopy(query)
        wrong['metrics'][0]['field'] = '2036实际'
        wrong_receipt = calculate_spreadsheet_analysis(source, {'query': wrong}, deadline, domain='finance')
        result['wrong_period_state'] = analysis_task_state([wrong_receipt], prompt, deadline=deadline)
        assert result['after']['complete'] and result['mixed_state']['complete'], 'positive case rejected'
        assert 'source_scope_mismatch' in [i['code'] for i in result['wrong_period_state']['issues']], 'wrong period was not rejected by scope review'
        result['passed'] = True
    except Exception as error:
        result['error'] = str(error)
        result['passed'] = False
    result['judgments'] = {cls.__name__: [json.loads(p.read_text()) for p in cls._CACHE_DIR.glob('*.json')]
                          for cls in [SemanticFilterJudge, SemanticContractJudge, TaskCompletenessJudge]}
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
