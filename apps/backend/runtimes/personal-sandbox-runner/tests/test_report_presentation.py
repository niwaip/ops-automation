"""Customer report boundaries: concise verified results and inspectable sources."""

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.analysis_contract import build_analysis_contract
from dsh_modules.comparison_delivery import compile_comparison_response
from dsh_modules.comparison_evidence import comparison_evidence_error
from dsh_modules.report_presentation import number, with_sources
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.spreadsheet_analysis_evidence import canonical_response, render_analysis_response
from dsh_modules.table_comparison import calculate_column_comparison
from dsh_modules.tool_result import ToolResult


class ReportPresentationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / '业务数据.xlsx'
        workbook = openpyxl.Workbook(); sheet = workbook.active; sheet.title = '业务'
        sheet.append(['单位', '千元']); sheet.append(['分组', '收入实际', '收入预算', '净利润实际', '净利润预算'])
        sheet.append(['甲', 1400, 1000, 75, 100]); sheet.append(['乙', 800, 1000, 50, 100])
        workbook.save(self.path); workbook.close()

    def tearDown(self):
        self.temp.cleanup()

    def compare(self):
        return calculate_column_comparison(self.path, sheet='业务', data_range='A3:E4', header_row=2,
            group_column='A', comparisons=[
                {'label':'收入', 'left_column':'B', 'right_column':'C'},
                {'label':'净利润', 'left_column':'D', 'right_column':'E'}],
            basis='budget', rank_by='absolute_difference', extreme='max', expected_groups=['甲', '乙'])

    def analysis(self):
        def total(column):
            return {'aggregate':'sum', 'table':'business', 'column':column, 'unit':'amount'}
        return calculate_spreadsheet_analysis(self.path, {'tables':[
            {'id':'business','sheet':'业务','header_row':2,'data_range':'A3:E4'}], 'calculations':[
            {'id':'r','label':'营业收入','metric_id':'finance.revenue','expression':total('B')},
            {'id':'n','label':'净利润','metric_id':'finance.net_profit','expression':total('D')},
            {'id':'m','label':'净利率','metric_id':'finance.net_margin',
             'expression':{'op':'divide','args':[total('D'),total('B')]}}]}, domain='finance')

    def test_compact_report_hides_protocol_and_keeps_requested_metrics_and_exact_audit(self):
        receipt = self.analysis(); self.assertTrue(receipt.is_success, receipt.error)
        output = render_analysis_response(canonical_response([receipt]), [receipt], '总结收入和净利润')
        main, details = output.split('<details>', 1)
        self.assertIn('| 营业收入 | 2,200 千元 |', main)
        self.assertIn('| 净利润 | 125 千元 |', main)
        self.assertNotIn('| 净利率 |', main)
        self.assertNotIn('evidence_id', main); self.assertNotIn(receipt.data['evidence_id'], main)
        self.assertNotIn('语义领域', main); self.assertNotIn('第3至4行', main)
        self.assertIn(receipt.data['evidence_id'], details)
        self.assertIn('业务!A3:E4', details); self.assertIn('核算口径', details)
        self.assertIn('| 净利率 |', details)

    def test_budget_comparison_main_alone_passes_evidence_validation(self):
        receipt = self.compare(); contract = build_analysis_contract('找出收入与净利润偏差最大的分组')
        output, error = compile_comparison_response(contract, [receipt])
        self.assertIsNone(error)
        main, details = output.split('<details>', 1)
        self.assertIn('| 指标 | 分组 | 实际 | 预算 | 差额 | 偏差率 |', main)
        self.assertIn('| 收入 | 甲 | 1,400 | 1,000 | +400 | +40% |', main)
        self.assertIn('| 净利润 | 乙 | 50 | 100 | -50 | -50% |', main)
        self.assertNotIn('左值', main); self.assertNotIn('budget', main)
        self.assertNotIn('来源坐标', main); self.assertNotIn(receipt.data['evidence_id'], main)
        self.assertIn('来源坐标', details); self.assertIn(receipt.data['evidence_id'], details)
        self.assertIsNone(comparison_evidence_error(contract, main, [receipt]))

    def test_main_is_independently_checked_so_audit_cannot_mask_bad_main_projection(self):
        with patch('dsh_modules.comparison_delivery.comparison_overview', return_value='收入在丙最大，净利润也是丙。'):
            output, error = compile_comparison_response(build_analysis_contract('找出收入与净利润偏差最大的分组'), [self.compare()])
        self.assertIsNone(output); self.assertIsNotNone(error)

    def test_pending_failure_stays_visible_outside_details(self):
        receipt = self.analysis(); failed = ToolResult.error('invalid_analysis_plan','未知字段',data={
            'requested_plan':{'calculations':[{'id':'missing','label':'未完成项'}]}})
        output = render_analysis_response(canonical_response([receipt]), [receipt, failed])
        self.assertIn('未知字段', output.split('<details>', 1)[0])

    def test_changed_source_still_rejects_both_report_kinds(self):
        comparison = self.compare(); analysis = self.analysis(); self.path.write_bytes(b'changed')
        self.assertIn('原件已变化', render_analysis_response(canonical_response([analysis]), [analysis]))
        self.assertIsNotNone(compile_comparison_response(build_analysis_contract('找出收入与净利润偏差最大的分组'), [comparison])[1])

    def test_small_nonzero_numbers_and_signs_are_not_erased_by_display_rounding(self):
        self.assertEqual(number('0.000003'), '0.000003')
        self.assertEqual(number('-0.000003'), '-0.000003')
        self.assertEqual(number('12345.6789', signed=True), '+12,345.68')

    def test_source_download_link_is_encoded_and_only_uses_known_root_workspace_paths(self):
        receipt = ToolResult.success(provenance={'file_path':'/workspace/a #中文.xlsx'})
        output = with_sources('正文', '核算口径', [receipt])
        self.assertIn('/api/ai/chat/workspace-files/me/a%20%23%E4%B8%AD%E6%96%87.xlsx', output)
        receipt.provenance['file_path']='/workspace/nested/a.xlsx'
        self.assertNotIn('/api/', with_sources('正文', '核算口径', [receipt]))

    def test_zero_budget_and_ties_remain_visible_and_are_not_business_success_claims(self):
        workbook = openpyxl.load_workbook(self.path)
        workbook['业务']['B4']=600; workbook['业务']['E4']=0
        workbook.save(self.path); workbook.close()
        output, error = compile_comparison_response(build_analysis_contract('找出收入与净利润偏差最大的分组'), [self.compare()])
        self.assertIsNone(error)
        main = output.split('<details>', 1)[0]
        self.assertIn('甲、乙', main); self.assertIn('（并列）', main)
        self.assertIn('不适用（基准为零）', main)
        self.assertIn('-400', main); self.assertIn('+400', main)


if __name__ == '__main__':
    unittest.main()
