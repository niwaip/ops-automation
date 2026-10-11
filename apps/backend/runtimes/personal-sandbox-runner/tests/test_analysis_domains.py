"""Domain boundaries and stable semantic IDs, without stochastic model calls."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.analysis_contract import build_analysis_contract, required_analysis_capabilities
from dsh_modules.analysis_semantics import (select_domain, runtime_domain, analysis_domain_scope,
                                           domain_plan_context)
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis, execute_spreadsheet_analysis
from dsh_modules.spreadsheet_analysis_evidence import evidence_error


class AnalysisDomainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / '任意非财务文件.xlsx'
        workbook = openpyxl.Workbook()
        ws = workbook.active
        ws.title = '实验记录'
        ws.append(['批次', '投入数量', '合格数量'])
        ws.append(['A', 10, 8])
        ws.append(['B', 30, 24])
        money = workbook.create_sheet('来源字段')
        money.append(['单位', '千元'])
        money.append(['月份', '收入', '毛利', '净利润'])
        money.append(['1月', 100, 40, 10])
        money.append(['2月', 200, 80, 20])
        workbook.save(self.path)
        workbook.close()
        self.table = {'id': 'batch', 'sheet': '实验记录', 'header_row': 1, 'data_range': 'A2:C3'}
        self.money = {'id': 'm', 'sheet': '来源字段', 'header_row': 2, 'data_range': 'A3:D4'}

    def tearDown(self):
        self.tmp.cleanup()

    def measure(self, table, column, unit='number', method='sum'):
        return {'aggregate': method, 'table': table, 'column': column, 'unit': unit}

    def plan(self, label, expression, **extra):
        return {'tables': [self.money], 'calculations': [
            {'id': 'metric', 'label': label, 'expression': expression, **extra}]}

    def test_experiment_uses_same_engine_without_financial_requirements(self):
        plan = {'tables': [self.table], 'calculations': [{
            'id': 'yield', 'label': '批次合格率', 'expression': {'op': 'divide', 'args': [
                self.measure('batch', '合格数量'), self.measure('batch', '投入数量')]}}]}
        result = calculate_spreadsheet_analysis(self.path, plan)
        self.assertTrue(result.is_success, result.error)
        self.assertEqual(result.data['facts'][0]['value'], '80.0')
        self.assertEqual(result.data['semantic_domain']['id'], 'generic')
        contract = build_analysis_contract('查看实验批次表现', domain='generic')
        self.assertEqual(contract.metrics, [])
        self.assertNotIn('profitability', contract.concepts)
        self.assertNotIn('finance.', domain_plan_context('查看实验批次表现', 'generic'))

    def test_financial_semantics_are_an_optional_policy(self):
        plan = self.plan('净利润', self.measure('m', '收入', 'amount'))
        generic = calculate_spreadsheet_analysis(self.path, plan)
        finance = calculate_spreadsheet_analysis(self.path, plan, domain='finance')
        self.assertTrue(generic.is_success)  # Generic mode verifies the declared calculation, not its business label.
        self.assertTrue(finance.is_error)
        self.assertIn('来源字段不一致', finance.error_message)

    def test_registered_metric_id_accepts_alternative_caption_and_checks_binding(self):
        plan = self.plan('本期结果', self.measure('m', '净利润', 'amount'), metric_id='finance.net_profit')
        result = calculate_spreadsheet_analysis(self.path, plan, domain='finance')
        self.assertTrue(result.is_success, result.error)
        response = json.dumps({'evidence_ids': [result.data['evidence_id']], 'hypotheses': []})
        self.assertIsNone(evidence_error(response, [result], '总结净利润'))
        plan['calculations'][0]['expression']['column'] = '收入'
        self.assertTrue(calculate_spreadsheet_analysis(self.path, plan, domain='finance').is_error)

    def test_model_cannot_enable_a_domain_or_use_an_unknown_metric_id(self):
        plan = self.plan('本期结果', self.measure('m', '净利润', 'amount'), metric_id='finance.net_profit')
        self.assertTrue(calculate_spreadsheet_analysis(self.path, plan).is_error)
        plan['calculations'][0]['metric_id'] = 'finance.invented'
        self.assertTrue(calculate_spreadsheet_analysis(self.path, plan, domain='finance').is_error)
        plan['domain'] = 'finance'
        self.assertTrue(calculate_spreadsheet_analysis(self.path, plan).is_error)

    def test_semantic_id_and_caption_cannot_conflict(self):
        plan = self.plan('净利润', self.measure('m', '收入', 'amount'), metric_id='finance.revenue')
        result = calculate_spreadsheet_analysis(self.path, plan, domain='finance')
        self.assertTrue(result.is_error)
        self.assertIn('metric_id', result.error_message)

    def test_ratio_id_checks_sum_scope_and_numerator(self):
        expr = {'op': 'divide', 'args': [self.measure('m', '净利润', 'amount'),
                                          self.measure('m', '收入', 'amount')]}
        plan = self.plan('本期比率', expr, metric_id='finance.net_margin')
        self.assertTrue(calculate_spreadsheet_analysis(self.path, plan, domain='finance').is_success)
        expr['args'][0]['aggregate'] = 'max'
        self.assertTrue(calculate_spreadsheet_analysis(self.path, plan, domain='finance').is_error)

    def test_domain_selection_is_explicit_and_context_does_not_leak(self):
        with patch.dict(os.environ, {'DSH_ANALYSIS_DOMAIN': 'auto'}):
            self.assertEqual(select_domain('解释盈利能力'), 'finance')
            self.assertEqual(select_domain('汇总库存金额'), 'commerce')
            self.assertEqual(select_domain('对比库存金额和净利润'), 'generic')
            self.assertEqual(select_domain('实验记录'), 'generic')
            with analysis_domain_scope('解释盈利能力'):
                self.assertEqual(runtime_domain(), 'finance')
                with analysis_domain_scope('实验记录'):
                    self.assertEqual(runtime_domain(), 'generic')
                self.assertEqual(runtime_domain(), 'finance')
            self.assertEqual(runtime_domain(), 'generic')
        with patch.dict(os.environ, {'DSH_ANALYSIS_DOMAIN': 'generic'}):
            self.assertEqual(build_analysis_contract('解释盈利能力').metrics, [])
        with self.assertRaises(ValueError):
            select_domain('实验记录', 'unknown')

    def test_runtime_adapter_injects_policy_without_a_model_domain_parameter(self):
        params = {'file_path': str(self.path), **self.plan('本期结果', self.measure('m', '净利润', 'amount'),
                                                       metric_id='finance.net_profit')}
        with patch.dict(os.environ, {'DSH_SESSION_ATTACHMENTS': '', 'DSH_ANALYSIS_DOMAIN': 'auto'}), \
             patch('dsh_modules.spreadsheet_analysis.resolve_sandboxed_path', return_value=(self.path, None)):
            with analysis_domain_scope('总结净利润'):
                finance = execute_spreadsheet_analysis(params).tool_result
            generic = execute_spreadsheet_analysis(params).tool_result
        self.assertTrue(finance.is_success, finance.error)
        self.assertTrue(generic.is_error)

    def test_concept_contracts_select_capabilities_in_their_own_domain(self):
        financial = build_analysis_contract('解释盈利能力', domain='finance')
        self.assertEqual(required_analysis_capabilities(financial), {'aggregate_spreadsheet'})
        self.assertEqual(len(financial.metrics), 7)
        quality = build_analysis_contract('检查数据质量', domain='generic')
        self.assertEqual(required_analysis_capabilities(quality), {'validate_spreadsheet_rows'})
        commerce = build_analysis_contract('统计库存金额', domain='commerce')
        self.assertEqual(commerce.metrics[0].semantic_id, 'commerce.inventory_value')
        self.assertNotIn('净利润', commerce.get_metric_names())

    def test_financial_rules_accept_logical_bindings_without_excel_objects(self):
        from dsh_modules.analysis_semantics import validate_domain_calculation
        item = {'label': '本期比率', 'metric_id': 'finance.net_margin'}
        bindings = {'op': 'divide', 'args': [
            {'aggregate': 'sum', 'source_header': '净利润', 'source_scope': ('dataset', (1, 2)),
             'field_key': ('dataset', 'net')},
            {'aggregate': 'sum', 'source_header': '收入', 'source_scope': ('dataset', (1, 2)),
             'field_key': ('dataset', 'revenue')}]}
        validate_domain_calculation(item, bindings, 'finance')
        bindings['args'][1]['source_scope'] = ('dataset', (3, 4))
        with self.assertRaisesRegex(ValueError, '期间不一致'):
            validate_domain_calculation(item, bindings, 'finance')

    def test_commerce_id_cannot_bind_to_a_different_registered_field(self):
        from dsh_modules.analysis_semantics import validate_domain_calculation
        with self.assertRaisesRegex(ValueError, '来源字段不一致'):
            validate_domain_calculation({'label': '本期金额', 'metric_id': 'commerce.order_amount'},
                                       {'aggregate': 'sum', 'source_header': '库存金额'}, 'commerce')


if __name__ == '__main__':
    unittest.main()
