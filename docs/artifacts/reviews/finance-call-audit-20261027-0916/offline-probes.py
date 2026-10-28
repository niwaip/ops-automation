"""Read-only audit probes; no model calls, source workbook edits, or service changes."""
import copy
import hashlib
import json
import os
import sys
import tempfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
SRC = ROOT / 'apps/backend/runtimes/personal-sandbox-runner/src'
sys.path.insert(0, str(SRC))
WORKSPACE = ROOT / 'data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace'
SOURCE = WORKSPACE / '.sessions/chat-session-1793063116578-l5zqp8j8/AI能力测试_财务报表.xlsx'
os.environ['DSH_SESSION_ATTACHMENTS'] = SOURCE.name
os.environ['WORKSPACE'] = str(SOURCE.parent)
os.environ['DSH_ANALYSIS_DOMAIN'] = 'finance'

from dsh_modules.tool_result import ToolResult
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.table_semantic_profiler import TableSemanticProfiler
from dsh_modules.report_presentation import render_unverified_guidance
import openpyxl

turn = json.loads((HERE / '1793063812505929086-ad7b66f2181942d9b415ed798ed887c2.json').read_text())
baseline = json.loads((HERE / 'baseline-success-evidence.json').read_text())
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
assert source_hash == next(iter(turn['source_hashes'].values()))
results = {'source_sha256': source_hash, 'scope': 'offline; current native engine; no model calls'}

with tempfile.TemporaryDirectory(prefix='finance-audit-') as temp, ExitStack() as stack:
    stack.enter_context(patch('dsh_modules.analysis_synthesis._can_reach_proxy', return_value=False))
    stack.enter_context(patch('dsh_modules.llm.call_model_proxy', side_effect=AssertionError('Model calls forbidden')))
    stack.enter_context(patch.object(TableSemanticProfiler, '_CACHE_DIR', Path(temp) / 'profiles'))
    stack.enter_context(patch.object(TableSemanticProfiler, '_profile_via_llm', return_value=None))
    judge = stack.enter_context(patch('dsh_modules.task_completeness_judge.judge_task_completeness', return_value=None))
    stack.enter_context(patch('dsh_modules.semantic_filter_judge.judge_filter_conformance', return_value=None))
    bad = []
    for raw in turn['receipts'][:2]:
        receipt = calculate_spreadsheet_analysis(SOURCE, copy.deepcopy(raw['data']['requested_plan']), domain='finance')
        bad.append(receipt.error)
        assert receipt.is_error and receipt.error_message == raw['error']['message']
    results['original_two_plan_errors_reproduced'] = bad

    receipts = [ToolResult(**r) for r in turn['receipts']]
    state_before = analysis_task_state(receipts[:-1], turn['query'])
    context_before = copy.deepcopy(judge.call_args.kwargs)
    state_after = analysis_task_state(receipts, turn['query'])
    context_after = copy.deepcopy(judge.call_args.kwargs)
    assert not state_after['complete'] and state_after['evidence_ids'] == []
    # Dataclass instances are equal by value; the reviewer sees identical inputs
    # even after the final successful bash output supplies all four metrics.
    assert context_before == context_after
    results['successful_bash_ignored_by_gate_and_review_input'] = {
        'complete': state_after['complete'],
        'issue_codes': [i['code'] for i in state_after['issues']],
        'review_inputs_identical_before_after_successful_bash': True,
        'review_execution_plans': context_after['context']['plans'],
        'review_fact_count': len(context_after['facts']),
        'last_bash_stdout': turn['receipts'][-1]['data'],
    }
    guidance = render_unverified_guidance(state_after, turn['query'])
    results['misleading_unexecuted_wording_reproduced'] = '尚未执行对' in guidance
    assert results['misleading_unexecuted_wording_reproduced']

    query_plan = {'query': baseline['receipts'][1]['data']['plan']}
    query_receipt = calculate_spreadsheet_analysis(SOURCE, copy.deepcopy(query_plan), domain='finance')
    ratio_plan = baseline['receipts'][2]['data']['plan']
    ratio_receipt = calculate_spreadsheet_analysis(SOURCE, copy.deepcopy(ratio_plan), domain='finance')
    assert query_receipt.is_success, query_receipt.error
    assert ratio_receipt.is_success, ratio_receipt.error
    valid_state = analysis_task_state([query_receipt, ratio_receipt], turn['query'])
    assert valid_state['complete'], valid_state
    results['legal_native_plan_succeeds_on_same_source'] = {
        'complete': valid_state['complete'], 'issues': valid_state['issues'],
        'facts': query_receipt.data['facts'] + ratio_receipt.data['facts'],
    }
    (HERE / 'legal-query-plan.json').write_text(json.dumps(query_plan, ensure_ascii=False, indent=2))
    (HERE / 'legal-ratio-plan.json').write_text(json.dumps(ratio_plan, ensure_ascii=False, indent=2))
    (HERE / 'offline-native-receipts.json').write_text(json.dumps([query_receipt.to_dict(), ratio_receipt.to_dict()], ensure_ascii=False, indent=2))

raw = openpyxl.load_workbook(SOURCE, data_only=False, read_only=True)
cached = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
results['original_formula_cache'] = {
    f'{sheet}!{coord}': {'formula': raw[sheet][coord].value, 'cached': cached[sheet][coord].value}
    for sheet, coord in [('利润表','B4'), ('利润表','B14'), ('月度经营','B16'), ('月度经营','M16'), ('月度经营','N16')]
}
raw.close()
cached.close()
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
(HERE / 'offline-checks.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps({'checks_passed': 5, 'valid_native_state_complete': valid_state['complete'], 'original_unchanged': True}, ensure_ascii=False))
