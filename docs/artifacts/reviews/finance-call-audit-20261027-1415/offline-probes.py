"""Run via docker exec -i <original sandbox> python3 -; no model calls or source edits."""
import copy
import hashlib
import json
import sys
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, '/usr/local/bin')
from dsh_modules.tool_result import ToolResult
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
from dsh_modules.report_presentation import analysis_overview
from dsh_modules.analysis_synthesis import _is_synthesis_grounded, _partition_facts_by_prompt

session = 'chat-session-1793079611033-xilj3v47'
root = Path('/workspace/.dsh/sessions')
turn = json.loads((root / (session + '.evidence.json')).read_text())
history = json.loads((root / (session + '.json')).read_text())
source = Path('/workspace/AI能力测试_财务报表.xlsx')
before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
assert before_hash == turn['source_hashes'][source.name]
receipts = [ToolResult(**r) for r in turn['receipts']]


class AuditTelemetry:
    def record_tool_call(self, *args, **kwargs):
        pass

    def record_execution_result(self, *args, **kwargs):
        pass


results = {'scope': 'offline original sandbox; existing judgment caches; all model calls forbidden',
           'source_sha256': before_hash, 'turn_id': turn['turn_id']}
with patch('dsh_modules.analysis_synthesis._can_reach_proxy', return_value=False), \
        patch('dsh_modules.llm.call_model_proxy', side_effect=AssertionError('Model requests forbidden')):
    state = analysis_task_state(receipts, turn['query'])
    assert state['complete'] and not state['issues']
    results['original_gate_reproduced'] = {'complete': state['complete'], 'issues': state['issues']}

    fresh_evidence = [ToolResult(**copy.deepcopy(turn['receipts'][0]))]
    completed = RegisteredMetricCompletion().complete(
        fresh_evidence, turn['query'], AuditTelemetry(), {'aggregate_spreadsheet'})
    assert len(completed) == 1 and completed[0].is_success
    generated_plan = completed[0].data['plan']
    assert generated_plan == turn['receipts'][1]['data']['plan']
    assert completed[0].data['facts'] == turn['receipts'][1]['data']['facts']
    results['program_generated_and_executed_same_bad_ratio'] = {
        'plan': generated_plan, 'facts': completed[0].data['facts'],
        'execution_origin': completed[0].provenance['execution_origin']}

    overview = analysis_overview(receipts, turn['query'])
    saved_main = history[-1]['content'].split('\n\n<details>')[0]
    assert overview == saved_main
    results['template_exactly_matches_delivered_main'] = True

    required, optional = _partition_facts_by_prompt(receipts, turn['query'])
    results['synthesis_required_facts'] = required
    concise = ('2026年全年：营业收入124,020千元，毛利率43.09%，'
               '营业利润21,209.4千元，净利润16,038.3千元。')
    assert not _is_synthesis_grounded(concise, receipts, prompt=turn['query'])
    results['correct_four_metric_summary_rejected'] = {'candidate': concise, 'accepted': False}
    assert _is_synthesis_grounded(overview, receipts, prompt=turn['query'])
    results['template_with_mislabeled_85_65_accepted'] = True

    # Keep only the difference-based derived margin; the task gate still accepts it.
    counter_plan = copy.deepcopy(generated_plan)
    counter_plan['calculations'] = [counter_plan['calculations'][-1]]
    counter_receipt = calculate_spreadsheet_analysis(source, counter_plan, domain='finance')
    assert counter_receipt.is_success
    counter_state = analysis_task_state([receipts[0], counter_receipt], turn['query'])
    results['counterfactual_only_difference_margin'] = {
        'complete': counter_state['complete'], 'issues': counter_state['issues'],
        'native_receipt': counter_receipt.to_dict()}
    assert counter_state['complete']

actual_margin = Decimal('53443.25') / Decimal('124020') * 100
budget_margin = Decimal('50000') / Decimal('120000') * 100
results['independent_arithmetic'] = {
    'actual_margin_pct': str(actual_margin),
    'budget_margin_pct': str(budget_margin),
    'margin_difference_percentage_points': str(actual_margin - budget_margin),
    'difference_profit_divided_by_difference_revenue_pct': str(Decimal('3443.25') / Decimal('4020') * 100)}
results['source_unchanged'] = hashlib.sha256(source.read_bytes()).hexdigest() == before_hash
assert results['source_unchanged']
results['checks_passed'] = 7
print(json.dumps(results, ensure_ascii=False, indent=2))
