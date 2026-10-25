"""Replay recorded receipts and controlled contract changes; never call a model.

Run from repository root. The optional second argument is the locally copied,
existing recalculated workbook. Original attachments and receipts stay unchanged.
"""
import copy
import hashlib
import json
import sys
from dataclasses import asdict, replace
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'apps/backend/runtimes/personal-sandbox-runner/src'))

from dsh_modules.analysis_contract import _contract_from_judge_verdict
from dsh_modules.comparison_delivery import compile_comparison_response
from dsh_modules.comparison_evidence import comparison_plan_error, comparison_evidence_error
from dsh_modules.report_presentation import comparison_overview
from dsh_modules.spreadsheet_preflight import profile_spreadsheet_for_planning
from dsh_modules.table_comparison import calculate_column_comparison
from dsh_modules.tool_result import ToolResult


def load(name):
    return json.loads((OUT / name).read_text())


def receipt_from_record(record, source):
    record = copy.deepcopy(record)
    if record.get('provenance', {}).get('file_path'):
        record['provenance']['file_path'] = str(source)
    return ToolResult(**record)


def run(source, recalculated=None):
    original = load('execution-evidence-2244.json')
    later = load('execution-evidence-2247.json')
    prompt = '找出收入与净利润偏差最大的月份。'
    profile = profile_spreadsheet_for_planning(source, prompt)
    headers = list(profile['headers'].values())
    cache_key = hashlib.sha256(
        f"v4::{prompt.casefold()}::{','.join(sorted(headers))}".encode()).hexdigest()
    verdict = load(cache_key + '.json')
    contract = _contract_from_judge_verdict(prompt, verdict, 'finance')
    receipts = [receipt_from_record(r, source) for r in original['receipts']]
    successful = next(r for r in receipts if r.is_success)
    rendered = comparison_overview([successful])
    compiled, original_error = compile_comparison_response(contract, receipts)
    operands_only = replace(contract, metrics=[m for m in contract.metrics if m.semantic_id])
    recovered, recovered_error = compile_comparison_response(operands_only, receipts)
    assert compiled is None and original_error.endswith('：偏差'), original_error
    assert recovered and recovered_error is None, recovered_error

    wrong_answer = rendered.replace('11319.8', '1').replace('11,319.8', '1')
    wrong_answer_error = comparison_evidence_error(operands_only, wrong_answer, [successful])
    changed_hash = copy.deepcopy(successful)
    changed_hash.provenance['workbook_id'] = '0' * 64
    _, changed_hash_error = compile_comparison_response(operands_only, [changed_hash])
    wrong_basis = replace(operands_only, comparison_basis='budget')
    wrong_basis_error = comparison_plan_error(wrong_basis, successful)
    assert wrong_answer_error and changed_hash_error and wrong_basis_error

    evaluated = successful.data['evaluated'][0]['rows']
    signed = max(evaluated, key=lambda r: Decimal(r['exact']['difference']))
    absolute = max(evaluated, key=lambda r: abs(Decimal(r['exact']['difference'])))
    report = {
        'mode': 'offline; original cached intent, original receipts; no model calls',
        'source_hash': hashlib.sha256(source.read_bytes()).hexdigest(),
        'profile': {'primary_sheet': profile['sheet'], 'headers': headers, 'cache_key': cache_key},
        'original_contract': asdict(contract),
        'original_plan_error': comparison_plan_error(contract, successful),
        'original_compilation_error': original_error,
        'operand_only_compilation_error': recovered_error,
        'recovered_answer': recovered,
        'signed_extreme': signed,
        'absolute_extreme': absolute,
        'wrong_answer_rejected': wrong_answer_error,
        'changed_hash_rejected': changed_hash_error,
        'wrong_basis_rejected': wrong_basis_error,
    }
    assert report['source_hash'] in original['source_hashes'].values()
    if recalculated is not None:
        metadata = successful.provenance['calculation']
        assert hashlib.sha256(recalculated.read_bytes()).hexdigest() == metadata['provenance']['output_hash']
        with patch('dsh_modules.table_comparison.get_or_create_recalculated_workbook',
                   return_value=(recalculated, metadata)):
            replay = calculate_column_comparison(source, **successful.data['plan'])
            assert replay.is_success and replay.data['results'] == successful.data['results']
            # Preserve both budget comparisons; this is a counterfactual plan,
            # not evidence that the original 22:44 request selected budget scope.
            budget_plan = copy.deepcopy(later['receipts'][1]['data']['requested_plan'])
            budget_plan.pop('file_path', None)
            budget_plan['basis'] = 'budget'
            budget = calculate_column_comparison(source, **budget_plan)
            assert budget.is_success
        later_prompt = '预算对比sheet 里面 找出收入与净利润偏差最大的月份'
        later_profile = profile_spreadsheet_for_planning(source, later_prompt)
        later_key = hashlib.sha256(
            f"v4::{later_prompt.casefold()}::{','.join(sorted(later_profile['headers'].values()))}".encode()).hexdigest()
        later_contract = _contract_from_judge_verdict(later_prompt, load(later_key + '.json'), 'finance')
        original_budget = copy.deepcopy(budget)
        original_budget.data['basis'] = 'cross_metric'
        later_error = comparison_plan_error(later_contract, original_budget)
        corrected_budget = replace(operands_only, comparison_basis='budget', ranking='absolute')
        budget_response, budget_error = compile_comparison_response(corrected_budget, [budget])
        assert later_error and budget_response and budget_error is None
        report.update({
            'recalculated_output_hash': metadata['provenance']['output_hash'],
            'original_plan_recomputed_identically': True,
            'later_profile': {'sheet': later_profile['sheet'], 'cache_key': later_key},
            'later_contract': asdict(later_contract),
            'later_original_plan_error': later_error,
            'counterfactual_budget_results': budget.data['results'],
            'counterfactual_budget_response': budget_response,
        })
    return report


if __name__ == '__main__':
    default_source = ROOT / 'data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.sessions/chat-session-1792939330927-pgn3ek65/AI能力测试_财务报表.xlsx'
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else default_source
    recalculated = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    with patch('dsh_modules.llm.call_model_proxy', side_effect=AssertionError('Model calls forbidden')), \
         patch('dsh_modules.analysis_synthesis._can_reach_proxy', return_value=False), \
         patch('dsh_modules.semantic_filter_judge.judge_filter_conformance',
               side_effect=AssertionError('Comparison replay should not invoke source-scope judge')):
        print(json.dumps(run(source, recalculated), ensure_ascii=False, indent=2))
