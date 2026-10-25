"""Regression for the monthly-column query and post-query aggregate path."""

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import openpyxl

from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
from dsh_modules.report_presentation import render_unverified_guidance
from dsh_modules.semantic_filter_judge import SemanticFilterJudge
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis


class Telemetry:
    def record_tool_call(self, *args, **kwargs):
        pass

    def record_execution_result(self, *args, **kwargs):
        pass


class MonthlyQueryScopeTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.source = Path(directory.name) / 'synthetic.xlsx'
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = '合成经营表'
        sheet.append(['2037年月度经营明细'])
        sheet.append(['单位：千元'])
        sheet.append(['月份', '营业收入', '毛利', '毛利率', '营业利润', '净利润', '部门'])
        for month in range(1, 13):
            revenue = 90 + month * 10
            margin = .1 if month <= 6 else .5
            sheet.append([f'{month}月', revenue, revenue * margin, margin,
                          revenue * .2, revenue * .1, '甲' if month % 2 else '乙'])
        workbook.save(self.source)
        workbook.close()
        self.prompt = '总结2037年收入、毛利率、营业利润和净利润。'
        self.query = {
            'source': {'sheet': sheet.title, 'header_row': 3, 'data_range': 'A4:G15'},
            'group_by': [],
            'metrics': [{'id': identifier, 'label': label, 'field': label,
                         'op': 'sum', 'unit': 'amount'}
                        for identifier, label in [('revenue', '营业收入'), ('gross_profit', '毛利'),
                                                  ('operating_profit', '营业利润'), ('net_profit', '净利润')]],
        }
        verdict = {'task_type': 'tabular_compute', 'is_grouped': False,
                   'metrics': ['营业收入', '毛利率', '营业利润', '净利润'],
                   'period': '2037', 'filter_conditions': []}
        self.reply = {'content': '{"matched":true,"request_period":"2037","source_period":"2037","reason":"同表标题和月份限定请求期间"}'}
        for target, value in [
            ('dsh_modules.analysis_contract._resolve_available_headers', ['月份', '营业收入', '毛利率']),
            ('dsh_modules.semantic_contract_judge.judge_contract_intent', verdict),
            ('dsh_modules.analysis_synthesis._can_reach_proxy', True),
            ('dsh_modules.task_completeness_judge.judge_task_completeness', None),
        ]:
            patcher = patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(SemanticFilterJudge, '_CACHE_DIR', Path(directory.name) / 'cache')
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher = patch('dsh_modules.llm.call_model_proxy', side_effect=lambda *a, **kw: self.reply)
        self.model = patcher.start()
        self.addCleanup(patcher.stop)

    def execute(self, calculations=None, query=None):
        plan = {'query': copy.deepcopy(query or self.query)}
        if calculations:
            plan['calculations'] = calculations
        result = calculate_spreadsheet_analysis(self.source, plan, domain='finance')
        self.assertTrue(result.is_success, result.error)
        return result

    def margin(self, numerator='gross_profit', denominator='revenue'):
        return {'id': 'gross_margin', 'label': '毛利率', 'output_unit': '%',
                'expression': {'op': 'divide', 'args': [{'ref': numerator}, {'ref': denominator}]}}

    def test_multi_cell_query_refs_execute_exact_aggregates(self):
        result = self.execute([self.margin()])
        facts = {f['id']: f for f in result.data['facts']}
        self.assertEqual(float(facts['revenue']['value']), 1860)
        self.assertEqual(float(facts['gross_profit']['value']), 630)
        self.assertAlmostEqual(float(facts['gross_margin']['value']), 33.8709677419)
        self.assertEqual(len(facts['gross_margin']['source_cells']), 24)
        self.assertTrue(analysis_task_state([result], self.prompt)['complete'])
        for call in self.model.call_args_list:
            system, user = [message['content'] for message in call.kwargs['messages']]
            self.assertIn('不负责指标是否齐全', system)
            self.assertIn('2037年月度经营明细', user)
            self.assertIn('12月', user)
            self.assertIn('period_and_filters_only', user)
            self.assertNotIn(self.prompt, user)

    def test_registered_completion_uses_multi_row_query_operands(self):
        evidence = [self.execute()]
        before = analysis_task_state(evidence, self.prompt)
        self.assertEqual([m['name'] for m in before['missing_metrics']], ['毛利率'])
        completed = RegisteredMetricCompletion().complete(
            evidence, self.prompt, Telemetry(), ['aggregate_spreadsheet'])
        self.assertEqual(len(completed), 1)
        self.assertTrue(completed[0].is_success, completed[0].error)
        self.assertAlmostEqual(float(completed[0].data['facts'][0]['value']), 33.8709677419)
        self.assertTrue(analysis_task_state(evidence, self.prompt)['complete'])

    def test_monthly_ratio_average_cannot_bypass_domain_validator(self):
        self.query['metrics'].append({'id': 'gross_margin', 'label': '毛利率', 'field': '毛利率',
                                      'op': 'dec_avg', 'unit': 'ratio'})
        result = calculate_spreadsheet_analysis(self.source, {'query': self.query}, domain='finance')
        self.assertTrue(result.is_error)
        self.assertIn('期间比率应使用汇总分子/汇总分母', result.error_message)

    def test_noncontiguous_where_rows_are_not_widened_by_ref(self):
        self.query['where'] = {'field': '部门', 'op': 'eq', 'value': '甲'}
        result = self.execute([self.margin()])
        margin = result.data['facts'][-1]
        self.assertAlmostEqual(float(margin['value']), 34)
        self.assertEqual(set(margin['source_cells']),
                         {f'合成经营表!{col}{row}' for col in ('B', 'C') for row in (4, 6, 8, 10, 12, 14)})

    def test_grouped_refs_preserve_only_having_limit_survivor(self):
        self.query.update({'group_by': ['部门'], 'having': {'metric': 'revenue', 'op': 'gt', 'value': 0},
                           'order_by': [{'ref': 'revenue', 'direction': 'desc'}], 'limit': 1})
        first = self.execute()
        numerator = next(f['id'] for f in first.data['facts'] if f['id'].startswith('gross_profit'))
        denominator = next(f['id'] for f in first.data['facts'] if f['id'].startswith('revenue'))
        result = self.execute([self.margin(numerator, denominator)])
        self.assertAlmostEqual(float(result.data['facts'][-1]['value']), 33.75)
        self.assertEqual(set(result.data['facts'][-1]['source_cells']),
                         {f'合成经营表!{col}{row}' for col in ('B', 'C') for row in (5, 7, 9, 11, 13, 15)})

    def test_cross_group_ratio_is_rejected(self):
        self.query['group_by'] = ['部门']
        facts = self.execute().data['facts']
        numerator = next(f['id'] for f in facts if f['id'].startswith('gross_profit') and f['group_key'] == '甲')
        denominator = next(f['id'] for f in facts if f['id'].startswith('revenue') and f['group_key'] == '乙')
        result = calculate_spreadsheet_analysis(self.source,
            {'query': self.query, 'calculations': [self.margin(numerator, denominator)]}, domain='finance')
        self.assertTrue(result.is_error)
        self.assertIn('期间不一致', result.error_message)

    def test_unknown_scope_diagnostic_preserves_executed_status(self):
        self.reply = {'content': '{"matched":null,"reason":"证据不足"}'}
        state = analysis_task_state([self.execute([self.margin()])], self.prompt)
        self.assertFalse(state['complete'])
        self.assertTrue(all(m.get('execution_evidence_exists') for m in state['missing_metrics']))
        rendered = render_unverified_guidance(state, self.prompt)
        self.assertIn('已有', rendered)
        self.assertIn('尚未通过来源或口径核验', rendered)
        self.assertNotIn('尚未执行对', rendered)

    def test_title_period_is_source_bound_and_can_be_rejected(self):
        workbook = openpyxl.load_workbook(self.source)
        workbook.active['A1'] = '2036年月度经营明细'
        workbook.save(self.source)
        workbook.close()
        self.reply = {'content': '{"matched":false,"request_period":"2037","source_period":"2036","reason":"原件标题期间与请求不符"}'}
        state = analysis_task_state([self.execute()], self.prompt)
        self.assertIn('source_scope_mismatch', [i['code'] for i in state['issues']])
        payload = self.model.call_args.kwargs['messages'][-1]['content']
        self.assertIn('2036年月度经营明细', payload)
        self.assertIn('"cell": "A1"', payload)

    def test_judge_boolean_cannot_override_its_identified_period_conflict(self):
        self.reply = {'content': '{"matched":true,"request_period":"2037","source_period":"2036","reason":"期间冲突"}'}
        state = analysis_task_state([self.execute()], self.prompt)
        self.assertIn('source_scope_mismatch', [i['code'] for i in state['issues']])

    def test_missing_source_period_is_unverified(self):
        self.reply = {'content': '{"matched":true,"reason":"looks good"}'}
        state = analysis_task_state([self.execute()], self.prompt)
        self.assertIn('source_scope_unverified', [i['code'] for i in state['issues']])

    def test_partial_scope_rejection_is_explained_as_scope_failure(self):
        def judge(*args, **kwargs):
            payload = kwargs['messages'][-1]['content']
            context = json.loads(payload.split('【实际来源绑定 Source context】:\n')[1].split('\n\n')[0])
            headers = context['bindings'][0]['bound_headers']
            if headers == {'F': '净利润'}:
                return {'content': '{"matched":false,"request_period":"2037","source_period":"2036","reason":"期间不符"}'}
            return self.reply
        self.model.side_effect = judge
        state = analysis_task_state([self.execute([self.margin()])], self.prompt)
        self.assertEqual([m['name'] for m in state['missing_metrics']], ['净利润'])
        self.assertIn('source_scope_mismatch', [i['code'] for i in state['issues']])
        self.assertNotIn('尚未执行对', render_unverified_guidance(state, self.prompt))

    def test_verified_single_source_ratio_can_be_read_without_aggregation(self):
        self.query['metrics'] = [{'id': 'margin', 'label': '毛利率', 'field': '毛利率',
                                  'op': 'value', 'unit': 'ratio', 'output_unit': '%'}]
        self.query['source']['data_range'] = 'A4:G4'
        receipt = self.execute()
        self.assertEqual(float(receipt.data['facts'][0]['value']), 10)


if __name__ == '__main__':
    unittest.main()
