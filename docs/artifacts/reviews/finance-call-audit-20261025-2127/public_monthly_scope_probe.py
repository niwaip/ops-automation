"""Real-model scope verification using only generated synthetic workbook data."""
import copy
import json
import os
import sys
import tempfile
import time
from pathlib import Path
import openpyxl

with tempfile.TemporaryDirectory(prefix='public-monthly-probe-') as temporary:
    os.environ['WORKSPACE'] = temporary
    os.environ['KNOWLEDGE_DIR'] = temporary + '/empty-knowledge'
    os.environ['DSH_SESSION_ATTACHMENTS'] = '["synthetic.xlsx"]'
    sys.path.insert(0, '/usr/local/bin')
    from dsh_modules.analysis_contract import build_analysis_contract
    from dsh_modules.analysis_task_state import analysis_task_state
    from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
    from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
    from dsh_modules.semantic_contract_judge import SemanticContractJudge
    from dsh_modules.semantic_filter_judge import SemanticFilterJudge
    from dsh_modules.task_completeness_judge import TaskCompletenessJudge
    from dsh_modules.report_presentation import analysis_overview
    root = Path(temporary)
    for cls in (SemanticContractJudge, SemanticFilterJudge, TaskCompletenessJudge):
        cls._CACHE_DIR = root / cls.__name__
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = '合成经营'
    sheet.append(['2037年月度经营明细（完全合成测试数据）'])
    sheet.append(['单位：千元'])
    sheet.append(['月份', '营业收入', '毛利', '毛利率', '营业利润', '净利润'])
    for month in range(1, 13):
        revenue = 90 + month * 10
        margin = .1 if month <= 6 else .5
        sheet.append([f'{month}月', revenue, revenue * margin, margin, revenue * .2, revenue * .1])
    source = root / 'synthetic.xlsx'
    workbook.save(source)
    workbook.close()
    query = {'source': {'sheet': sheet.title, 'header_row': 3, 'data_range': 'A4:F15'},
             'group_by': [], 'metrics': [
                 {'id': identifier, 'label': label, 'field': label, 'op': 'sum', 'unit': 'amount'}
                 for identifier, label in [('revenue', '营业收入'), ('gross_profit', '毛利'),
                                            ('operating_profit', '营业利润'), ('net_profit', '净利润')]]}
    calculation = {'id': 'gross_margin', 'label': '毛利率', 'output_unit': '%',
                   'expression': {'op': 'divide', 'args': [{'ref': 'gross_profit'}, {'ref': 'revenue'}]}}
    prompt = '总结2037年收入、毛利率、营业利润和净利润。'
    deadline = time.monotonic() + 240
    output = {'data': 'entirely generated synthetic data', 'passed': False}
    class Telemetry:
        def record_tool_call(self, *args, **kwargs):
            pass
        def record_execution_result(self, *args, **kwargs):
            pass
    try:
        from dataclasses import asdict
        output['contract'] = asdict(build_analysis_contract(prompt))
        receipt = calculate_spreadsheet_analysis(source, {'query': query, 'calculations': [calculation]}, deadline, domain='finance')
        assert receipt.is_success, receipt.error
        output['mixed_facts'] = receipt.data['facts']
        output['mixed_state'] = analysis_task_state([receipt], prompt, deadline=deadline)
        output['rendered'] = analysis_overview([receipt], prompt)
        evidence = [calculate_spreadsheet_analysis(source, {'query': query}, deadline, domain='finance')]
        completed = RegisteredMetricCompletion().complete(evidence, prompt, Telemetry(), ['aggregate_spreadsheet'], deadline)
        output['completion_results'] = [result.to_dict() for result in completed]
        output['completed_state'] = analysis_task_state(evidence, prompt, deadline=deadline)
        wrong_workbook = openpyxl.load_workbook(source)
        wrong_workbook.active['A1'] = '2036年月度经营明细（完全合成测试数据）'
        wrong_workbook.save(source)
        wrong_workbook.close()
        wrong = calculate_spreadsheet_analysis(source, {'query': query, 'calculations': [calculation]}, deadline, domain='finance')
        assert wrong.is_success, wrong.error
        output['wrong_title_state'] = analysis_task_state([wrong], prompt, deadline=deadline)
        bad_query = copy.deepcopy(query)
        bad_query['metrics'].append({'id': 'avg_margin', 'label': '毛利率', 'field': '毛利率', 'op': 'dec_avg', 'unit': 'ratio'})
        bad = calculate_spreadsheet_analysis(source, {'query': bad_query}, deadline, domain='finance')
        output['average_rejected'] = bad.is_error
        output['average_error'] = bad.error
        assert output['mixed_state']['complete'], 'mixed monthly execution rejected'
        assert len(completed) == 1 and completed[0].is_success and output['completed_state']['complete'], 'monthly auto completion rejected'
        assert 'source_scope_mismatch' in [issue['code'] for issue in output['wrong_title_state']['issues']], 'wrong title period accepted'
        assert bad.is_error, 'monthly average incorrectly accepted'
        output['passed'] = True
    except Exception as error:
        output['error'] = str(error)
    output['judgments'] = {cls.__name__: [json.loads(path.read_text()) for path in cls._CACHE_DIR.glob('*.json')]
                           for cls in (SemanticContractJudge, SemanticFilterJudge, TaskCompletenessJudge)}
    print(json.dumps(output, ensure_ascii=False, indent=2), flush=True)
