"""Local original-plan arithmetic replay; all semantic/model calls are stubbed."""
import hashlib
import json
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, '/usr/local/bin')
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.analysis_contract import _contract_from_judge_verdict
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.report_presentation import analysis_overview

root = Path('/workspace')
archive = json.loads((root / '.dsh/sessions/chat-session-1792934775808-slhu8cei.evidence.json').read_text())
source = root / 'AI能力测试_财务报表.xlsx'
plan = archive['receipts'][-1]['data']['requested_plan']
verdict = json.loads((root / '.dsh/cache/contract_judgments/a0a51769d272cfc5bc83e41e21bcee9908a5a2c85d40f785dbc48c76a811d29a.json').read_text())
prompt = '总结2026年收入、毛利率、营业利润和净利润。'
contract = _contract_from_judge_verdict(prompt, verdict, 'finance')
with patch('dsh_modules.analysis_synthesis._can_reach_proxy', return_value=False), \
     patch('dsh_modules.llm.call_model_proxy', side_effect=AssertionError('offline replay forbids model calls')), \
     patch('dsh_modules.semantic_filter_judge.judge_filter_conformance', return_value=True), \
     patch('dsh_modules.task_completeness_judge.judge_task_completeness', return_value=None), \
     patch('dsh_modules.analysis_task_state.build_analysis_contract', return_value=contract), \
     patch('dsh_modules.analysis_fact_selection.build_analysis_contract', return_value=contract), \
     patch('dsh_modules.report_presentation.build_analysis_contract', return_value=contract):
    replay = calculate_spreadsheet_analysis(source, plan, domain='finance')
    assert replay.is_success, replay.error
    state = analysis_task_state([replay], prompt)
    invalid = calculate_spreadsheet_analysis(source, archive['receipts'][1]['data']['requested_plan'], domain='finance')
    output = {'mode': 'offline arithmetic replay; intent reused from old cache; source judge stubbed true',
              'source_hash': hashlib.sha256(source.read_bytes()).hexdigest(),
              'original_failed_plan_now_succeeds': replay.is_success,
              'facts': replay.data['facts'], 'state_with_stubbed_scope': state,
              'rendered_with_stubbed_scope': analysis_overview([replay], prompt),
              'old_average_plan_now_rejected': invalid.is_error, 'average_error': invalid.error}
    assert state['complete'], state
    assert invalid.is_error, 'average plan must not pass'
    print(json.dumps(output, ensure_ascii=False, indent=2), flush=True)
