"""Read archived receipts; reproduce gate loss without model/network calls."""
import copy
import json
import sys
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent
SRC = ROOT / 'apps/backend/runtimes/personal-sandbox-runner/src'
sys.path.insert(0, str(SRC))

from dsh_modules import analysis_fact_selection as selection
from dsh_modules import analysis_task_state as task_state
from dsh_modules import registered_metric_completion as completion
from dsh_modules.analysis_contract import _contract_from_judge_verdict
from dsh_modules.analysis_request_text import user_instruction
from dsh_modules.tool_result import ToolResult

archive = json.loads((HERE / 'execution-evidence.json').read_text())
verdict = json.loads((HERE / 'contract-judgment.json').read_text())
prompt = user_instruction(archive['query'])
contract = _contract_from_judge_verdict(prompt, verdict, 'finance')
receipts = [ToolResult(**r) for r in archive['receipts']]
source = ROOT / ('data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/'
                 '.sessions/chat-session-1792925510601-ej9n8j4g/AI能力测试_财务报表.xlsx')
for receipt in receipts:
    if receipt.provenance and receipt.provenance.get('file_path'):
        receipt.provenance['file_path'] = str(source)


class Telemetry:
    def record_tool_call(self, *args, **kwargs):
        pass

    def record_execution_result(self, *args, **kwargs):
        pass


results = {}
for label, candidate in [('cached_contract', contract),
                         ('only_has_filters_changed', replace(contract, has_filters=False))]:
    with patch.object(selection, 'build_analysis_contract', return_value=candidate), \
         patch.object(task_state, 'build_analysis_contract', return_value=candidate), \
         patch.object(completion, 'build_analysis_contract', return_value=candidate), \
         patch('dsh_modules.task_completeness_judge.judge_task_completeness', return_value=None), \
         patch('dsh_modules.semantic_filter_judge.judge_filter_conformance', return_value=True) as filter_judge, \
         patch.object(completion, 'calculate_spreadsheet_analysis',
                      return_value=ToolResult.error('probe_only', 'Compilation observed; execution skipped')) as calculate:
        facts = selection.resolve_conforming_facts(receipts, prompt)
        state = task_state.analysis_task_state(receipts, prompt)
        completed = completion.RegisteredMetricCompletion().complete(
            copy.deepcopy(receipts), prompt, Telemetry(), ['aggregate_spreadsheet'])
        plans = [call.args[1] for call in calculate.call_args_list]
        results[label] = {
            'has_filters': candidate.has_filters,
            'metric_row_filter': selection._is_metric_row_filter(
                receipts[-1].data['coverage'][0]['filters'][0], candidate),
            'selected_fact_count': len(facts),
            'issue_codes': [i['code'] for i in state['issues']],
            'missing_metric_names': [m['name'] for m in state['missing_metrics']],
            'filter_judge_calls': filter_judge.call_count,
            'derivation_source_calls': calculate.call_count,
            'compiled_plans': plans,
        }

assert results['cached_contract']['selected_fact_count'] == 0
assert results['cached_contract']['derivation_source_calls'] == 0
assert results['only_has_filters_changed']['selected_fact_count'] == 3
assert results['only_has_filters_changed']['missing_metric_names'] == ['毛利率']
assert results['only_has_filters_changed']['derivation_source_calls'] == 1
sys.path.insert(0, str(ROOT / 'apps/backend/runtimes/personal-sandbox-runner/tests'))
from test_registered_metric_completion_query import RegisteredMetricCompletionQueryTests
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
fixture = RegisteredMetricCompletionQueryTests()
fixture.setUp()
try:
    mixed_plan = copy.deepcopy(receipts[-1].data['requested_plan'])
    mixed_plan['query']['source']['data_range'] = 'A4:D8'
    mixed_plan['calculations'] = [{
        'id': 'gm', 'label': '毛利率', 'metric_id': 'finance.gross_margin',
        'output_unit': '%', 'expression': {'op': 'divide', 'args': [
            {'cell': 'B6', 'sheet': '利润表', 'unit': 'amount'},
            {'cell': 'B4', 'sheet': '利润表', 'unit': 'amount'}]}}]
    mixed = calculate_spreadsheet_analysis(fixture.source_path, mixed_plan, domain='finance')
    assert mixed.is_success, mixed.error
    assert not any(f.get('id') == 'gm' for f in mixed.data['facts'])
    results['mixed_query_calculations'] = {
        'source': 'Disposable numeric test fixture; original workbook untouched',
        'status': mixed.status,
        'returned_fact_count': len(mixed.data['facts']),
        'returned_fact_labels': [f['label'] for f in mixed.data['facts']],
        'gross_margin_calculation_executed': False,
        'query_ir_version': mixed.data.get('query_ir_version'),
    }
finally:
    fixture.tearDown()
results['scope'] = ('Original receipts and cached contract; file path mapped to identical local source. '
                    'Model judges mocked, derivation execution observed but not performed. '
                    'Counterfactual has_filters=False is a diagnostic, not a proposed global fix.')
(HERE / 'offline-probe.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False, indent=2))
