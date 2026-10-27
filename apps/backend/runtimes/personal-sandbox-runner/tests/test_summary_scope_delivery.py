"""Regression cases derived from failed real personal-mode runs, using independent fixtures."""
import hashlib
import json
import os
import sys
import tempfile
import time
import unittest
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.analysis_fact_selection import resolve_conforming_facts
from dsh_modules.bounded_summary_recovery import recover_summary, export_recovered_summary
from dsh_modules.workbook_delivery import generated_workbook_totals, inspect_generated_workbook, quarantine_invalid_deliverables
from dsh_modules.delivery_reconciliation import reconcile_delivery_presentation
from dsh_modules.report_presentation import render_unverified_guidance
from dsh_modules.spreadsheet_request import summary_request


class SummaryScopeDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def workbook(self, name, rows, sheet='明细'):
        path = self.root / name
        book = openpyxl.Workbook()
        book.active.title = sheet
        for row in rows:
            book.active.append(row)
        book.save(path)
        book.close()
        return path

    def receipt(self, source, filters):
        table = {'id': 't', 'sheet': '明细', 'header_row': 1, 'data_range': 'A2:C4', 'filters': filters}
        return calculate_spreadsheet_analysis(source, {'tables': [table], 'calculations': [
            {'id': 'total', 'label': '总金额', 'expression': {'aggregate': 'sum', 'table': 't', 'column': 'C', 'unit': 'amount'}},
            {'id': 'groups', 'label': '分组金额', 'expression': {'aggregate': 'sum', 'table': 't', 'column': 'C', 'unit': 'amount', 'group_by': 'B'}}]})

    def test_native_scope_is_independent_of_order_and_rejects_extra_filter(self):
        source = self.workbook('raw.xlsx', [['项目编号', '责任中心', '金额(K)'], ['EX1', 'A', 10], ['ZZ1', 'A', 20], ['YY1', 'B', 30]])
        base = self.receipt(source, [])
        filtered = self.receipt(source, [{'column': 'A', 'op': 'exclude_prefix', 'prefixes': ['EX']}])
        narrower = self.receipt(source, [{'column': 'A', 'op': 'exclude_prefix', 'prefixes': ['EX']}, {'column': 'B', 'values': ['A']}])
        prompt = '排除项目编号以EX开头的记录，按责任中心分组统计金额(K)，附总计。'
        for receipts in ([base, filtered, narrower], [narrower, filtered, base]):
            facts = resolve_conforming_facts(receipts, prompt)
            self.assertEqual([f['value'] for f in facts if f['id'] == 'total'], ['50'])
            self.assertTrue(analysis_task_state(receipts, prompt)['complete'])
        self.assertEqual(resolve_conforming_facts([base], prompt), [])
        no_filter = '按责任中心分组统计金额(K)，不排除任何项目，附总计。'
        self.assertEqual([f['value'] for f in resolve_conforming_facts([filtered, base], no_filter) if f['id'] == 'total'], ['60'])

    def test_totals_use_headers_for_integer_zero_reordered_and_units(self):
        for amount in (1000, 0):
            for rows in ([['中心', '金额(K)', '条数'], ['A', amount, 20], ['总计', amount, 20]],
                         [['中心', '条数', '金额(K)'], ['A', 20, amount], ['总计', 20, amount]]):
                path = self.workbook('result.xlsx', rows)
                totals = generated_workbook_totals(path)
                self.assertEqual(totals['amount'], Decimal(amount))
                self.assertEqual(totals['count'], 20)
        self.workbook('result.xlsx', [['中心', '金额(K)', '条数'], ['A', 1000, 20], ['总计', 1000, 20]])
        text = '总金额：1,000.00 K'
        self.assertEqual(reconcile_delivery_presentation(text, self.root), text)
        text_yuan = '总金额：100.00 万元'
        self.assertEqual(reconcile_delivery_presentation(text_yuan, self.root), text_yuan)

    def test_ambiguous_amount_headers_are_not_authoritative(self):
        path = self.workbook('result.xlsx', [['中心', '预算金额(K)', '实际金额(K)'], ['总计', 10, 20]])
        self.assertIsNone(generated_workbook_totals(path))

    def test_bad_formula_dependency_blocks_send_and_root_auto_discovery(self):
        source = self.workbook('source.xlsx', [['编号', '金额'], ['X', 10]])
        bad = self.workbook('bad.xlsx', [['中心', '金额(K)'], ['总计', "=SUM('Missing'!A1:A2)"]])
        original = source.read_bytes()
        self.assertFalse(inspect_generated_workbook(bad)['valid'])
        from dsh_modules import file_tools
        with patch.dict(os.environ, {'DSH_SESSION_ATTACHMENTS': 'source.xlsx'}), patch.object(file_tools, 'resolve_sandboxed_path', return_value=(bad, None)):
            self.assertTrue(file_tools.send_workspace_file(str(bad)).startswith('发送失败'))
            text, outbounds, rejected = quarantine_invalid_deliverables(self.root, time.time() - 1,
                '文件已就绪 [bad.xlsx](/workspace/bad.xlsx)', [json.dumps({'filePath': str(bad), 'fileName': bad.name})])
        self.assertEqual(len(rejected), 1)
        self.assertFalse(bad.exists())
        self.assertEqual(outbounds, [])
        self.assertNotIn('已就绪', text)
        self.assertTrue(Path(rejected[0]['preserved_path']).is_file())
        self.assertEqual(source.read_bytes(), original)

    def test_runtime_summary_recovery_never_executes_or_exports(self):
        source = self.workbook('input.xlsx', [['中心', '金额(K)'], ['甲', 7], ['乙', 9]])
        before = source.read_bytes()
        with patch.dict(os.environ, {'DSH_SESSION_ATTACHMENTS': source.name}):
            receipt = recover_summary('按中心汇总金额(K)，生成可下载Excel，文件名结果.xlsx。', self.root)
        self.assertIsNone(receipt)
        self.assertFalse((self.root / '结果.xlsx').exists())
        self.assertEqual(source.read_bytes(), before)

    def test_explicit_prefix_grouping_is_rendered_without_dictionary_lookup_error(self):
        source = self.workbook('input.xlsx', [['项目编号', '金额(K)'], ['AB10', 7], ['AB20', 9], ['XY1', 3]])
        prompt = '按项目编号前两个字母分组，统计每组条数和金额(K)，附总计。'
        group = {'column': 'A', 'prefix_length': 2}
        table = {'id': 't', 'sheet': '明细', 'header_row': 1, 'data_range': 'A2:B4'}
        calculations = []
        for cid, column, unit, op in [('amount', 'B', 'amount', 'sum'), ('count', 'A', 'count', 'count')]:
            expr = {'aggregate': op, 'table': 't', 'column': column, 'unit': unit}
            label = '金额' if cid == 'amount' else '条数'
            calculations.extend([{'id': 'total_' + cid, 'label': '总' + label, 'expression': expr},
                {'id': cid, 'label': label, 'expression': {**expr, 'group_by': group}}])
        receipt = calculate_spreadsheet_analysis(source, {'tables': [table], 'calculations': calculations})
        self.assertTrue(receipt.is_success, receipt.error)
        self.assertTrue(analysis_task_state([receipt], prompt)['complete'])
        from dsh_modules.analysis_turn import AnalysisTurn
        from dsh_modules.telemetry import TelemetryStats
        text = AnalysisTurn(prompt).render([receipt], '', TelemetryStats())
        self.assertIn('AB 金额', text)
        self.assertIn('前2个字符', text)
        self.assertIn('19', text)

    def test_attachment_banner_cannot_trigger_an_implicit_export(self):
        source = self.workbook('input.xlsx', [['中心', '金额(K)'], ['A', 7], ['B', 9]])
        before = source.read_bytes()
        prompt = '【当前轮次用户上传附件】: input.xlsx\n用户指令：按中心汇总金额(K)，生成可下载Excel，文件名结果.xlsx。'
        with patch.dict(os.environ, {'DSH_SESSION_ATTACHMENTS': source.name}):
            self.assertIsNone(recover_summary(prompt, self.root))
            self.assertIsNone(export_recovered_summary(None, prompt, self.root))
        self.assertEqual(source.read_bytes(), before)
        self.assertFalse((self.root / '结果.xlsx').exists())

    def test_explicit_category_and_zero_match_queries_are_computed(self):
        source = self.workbook('input.xlsx', [['项目编号', '有偿无偿', '金额(K)'], ['AA', '有偿', 7], ['BB', '无偿', 9]])
        for where, expected in [({'field': '有偿无偿', 'op': 'eq', 'value': '有偿'}, ['1', '7']),
                                ({'field': '项目编号', 'op': 'starts_with', 'value': 'ZZ'}, ['0', '0'])]:
            receipt = calculate_spreadsheet_analysis(source, {'query': {
                'source': {'sheet': '明细', 'header_row': 1, 'data_range': 'A2:C3'}, 'where': where,
                'metrics': [{'id': 'count', 'op': 'count_rows'},
                            {'id': 'amount', 'op': 'sum', 'field': '金额(K)', 'unit': 'source'}]}})
            self.assertTrue(receipt.is_success, receipt.error)
            self.assertEqual([str(f['value']) for f in receipt.data['facts']], expected)

    def test_ambiguous_or_unsupported_requests_decline(self):
        headers = {'A': '编号', 'B': '金额(K)', 'C': '预算金额(K)', 'D': '金额(元)'}
        self.assertIsNone(summary_request('统计金额。', headers))
        self.assertIsNone(summary_request('仅保留金额大于10的记录，统计金额(K)。', headers))
        self.assertIsNone(summary_request('排除EX开头的记录，统计金额(K)。', headers))
        fields = {'A': '项目编号', 'B': '中心', 'C': '金额(K)'}
        self.assertIsNone(summary_request('排除项目编号以EX开头的记录，再排除中心A，统计金额(K)。', fields))

    def test_unknown_source_does_not_claim_column_missing(self):
        state = analysis_task_state([], '统计金额。')
        metric_issue = next(i for i in state['issues'] if i['code'] == 'required_metrics_missing')
        self.assertEqual(metric_issue['metrics'][0]['source_column_status'], 'unknown')
        text = render_unverified_guidance(state, '统计金额。', '')
        self.assertNotIn('原始文件缺少', text)
        self.assertIn('尚未', text)


if __name__ == '__main__':
    unittest.main()
