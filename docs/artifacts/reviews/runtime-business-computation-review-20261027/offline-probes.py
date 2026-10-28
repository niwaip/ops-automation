"""Read-only source review probes; generated fixtures stay in a temporary directory."""
import copy
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'apps/backend/runtimes/personal-sandbox-runner/src'))
import openpyxl
from dsh_modules.tool_result import ToolResult
from dsh_modules.bounded_summary_recovery import recover_summary, export_recovered_summary
from dsh_modules.report_presentation import analysis_overview, number
from dsh_modules.spreadsheet_trends import render_ratio_trends
from dsh_modules.analysis_synthesis import _is_synthesis_grounded, _collect_allowed_numbers, _has_unverified_numbers

results = {}
with patch('dsh_modules.analysis_synthesis._can_reach_proxy', return_value=False), \
        patch('dsh_modules.llm.call_model_proxy', side_effect=AssertionError('No model calls allowed')):
    with tempfile.TemporaryDirectory(prefix='runtime-business-audit-') as temp:
        folder = Path(temp)
        source = folder / 'input.xlsx'
        book = openpyxl.Workbook()
        book.active.title = '明细'
        for row in [('中心', '金额(K)'), ('甲', 7), ('乙', 9)]:
            book.active.append(row)
        book.save(source)
        book.close()
        before = hashlib.sha256(source.read_bytes()).hexdigest()
        prompt = '按中心汇总金额(K)，生成可下载Excel，文件名结果.xlsx。'
        with patch.dict(os.environ, {'DSH_SESSION_ATTACHMENTS': source.name}):
            recovered = recover_summary(prompt, folder)
            assert recovered is not None and recovered.is_success, recovered
            assert recovered.provenance['execution_origin'] == 'bounded_summary_recovery'
            output = export_recovered_summary(recovered, prompt, folder)
            assert output and Path(output).is_file()
        assert hashlib.sha256(source.read_bytes()).hexdigest() == before
        results['runtime_constructs_executes_and_exports_without_model_call'] = {
            'plan': recovered.data['plan'], 'facts': recovered.data['facts'],
            'origin': recovered.provenance['execution_origin'],
            'exported_filename': Path(output).name, 'source_unchanged': True}

    # Isolate the presentation layer after fact selection: no source-engine call.
    facts = [{'id': 'a', 'label': '甲组毛利率', 'group_key': '甲', 'value': '40', 'unit': '%'},
             {'id': 'b', 'label': '乙组毛利率', 'group_key': '乙', 'value': '60', 'unit': '%'}]
    receipt = ToolResult.success(data={'kind': 'spreadsheet_analysis', 'facts': facts}, provenance={})
    with patch('dsh_modules.report_presentation.resolve_conforming_facts', return_value=facts):
        text = analysis_overview([receipt], '各组和总计')
    assert '| **各组总计** | **100%** |' in text
    results['presentation_sums_percentage_facts'] = {'visible_input_facts': facts, 'output': text,
        'method': 'unit probe: fact selection stubbed, real presentation arithmetic'}

    mixed = [{'id': str(i), 'label': label, 'group_key': group, 'value': value, 'unit': '千元'}
             for i, (label, group, value) in enumerate([
                 ('甲组收入', '甲', '1000'), ('甲组净利润', '甲', '100'),
                 ('乙组收入', '乙', '2000'), ('乙组净利润', '乙', '200')])]
    with patch('dsh_modules.report_presentation.resolve_conforming_facts', return_value=mixed):
        text = analysis_overview([receipt], '各组和总计')
    assert '| **各组总计** | **3,300 千元** |' in text
    results['presentation_merges_different_metrics_by_unit'] = {
        'visible_input_facts': mixed, 'output': text,
        'expected_separate_totals': {'收入': '3000', '净利润': '300'},
        'method': 'unit probe: fact selection stubbed, real presentation arithmetic'}

    windows = []
    for months, value in [(list(range(1, 7)), '40'), (list(range(7, 13)), '45')]:
        coverage = {'id': 't', 'sheet': '经营', 'source_months': months,
                    'selected_rows': months, 'headers': {'B': '毛利', 'C': '收入'}}
        calc = {'id': 'margin', 'expression': {'op': 'divide', 'args': [
            {'aggregate': 'sum', 'table': 't', 'column': 'B'},
            {'aggregate': 'sum', 'table': 't', 'column': 'C'}]}}
        windows.append(ToolResult.success(data={'kind': 'spreadsheet_analysis', 'coverage': [coverage],
            'plan': {'calculations': [calc]}, 'facts': [{'id': 'margin', 'value': value, 'unit': '%'}]},
            provenance={'workbook_id': 'fixture'}))
    lines = render_ratio_trends(windows, number)
    assert len(lines) == 1 and '提高5个百分点' in lines[0]
    assert sum(len(r.data['facts']) for r in windows) == 2
    results['presentation_generates_unplanned_period_difference'] = {
        'input_fact_values': ['40%', '45%'], 'output': lines,
        'receipt_fact_count_after_render': 2}

    original = json.loads((ROOT / 'docs/artifacts/reviews/finance-call-audit-20261027-1415/'
                          'chat-session-1793079611033-xilj3v47.evidence.json').read_text())
    raw_receipt = ToolResult(**copy.deepcopy(original['receipts'][0]))
    assert len(raw_receipt.data['facts']) == 12
    assert all(f['unit'] != '%' for f in raw_receipt.data['facts'])
    summary = ('净利润实际16038.3、预算13950、差额2088.3；营业利润实际21209.4、预算18300、'
               '差额2909.4；营业收入实际124020、预算120000、差额4020。'
               '全年毛利率85.65%。')
    allowed_s, allowed_f = _collect_allowed_numbers([raw_receipt], prompt=original['query'])
    assert not _has_unverified_numbers('全年毛利率85.65%', allowed_s, allowed_f)
    assert _is_synthesis_grounded(summary, [raw_receipt], prompt=original['query'])
    results['synthesis_accepts_derived_ratio_without_ratio_tool_receipt'] = {
        'input_fact_count': 12, 'input_percentage_facts': 0, 'candidate': summary,
        'accepted_by_synthesis_grounding': True,
        'limitation': 'synthesis check only; does not claim whole-turn completion would pass without a ratio receipt'}

results['checks_passed'] = 5
print(json.dumps(results, ensure_ascii=False, indent=2))
