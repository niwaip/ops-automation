"""Source-scope judging and query/calculation integration regressions."""

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.analysis_gate_review import revalidate_review
from dsh_modules.report_presentation import analysis_overview
from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
from dsh_modules.semantic_filter_judge import SemanticFilterJudge
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis


class Telemetry:
    def record_tool_call(self, *args, **kwargs):
        pass

    def record_execution_result(self, *args, **kwargs):
        pass


class SemanticScopeQueryStageTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.source = Path(directory.name) / 'statement.xlsx'
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = '经营数据'
        sheet.append(['单位：千元'])
        sheet.append([])
        sheet.append(['科目', '2026实际', '2025实际'])
        sheet.append(['营业收入', 1200, 900])
        sheet.append(['成本', 840, 700])
        sheet.append(['毛利', 360, 200])
        sheet.append(['营业利润', 180, 100])
        sheet.append(['净利润', 120, 80])
        workbook.save(self.source)
        workbook.close()
        self.prompt = '总结2026年收入、毛利率、营业利润和净利润。'
        self.query = {
            'source': {'sheet': sheet.title, 'header_row': 3, 'data_range': 'A4:C8'},
            'where': {'field': '科目', 'op': 'in',
                      'values': ['营业收入', '毛利', '营业利润', '净利润']},
            'group_by': ['科目'],
            'metrics': [{'id': 'actual', 'label': '实际值', 'op': 'sum',
                         'field': '2026实际', 'unit': 'amount'}],
        }
        self.verdict = {
            'task_type': 'tabular_compute', 'is_grouped': False,
            'metrics': ['营业收入', '毛利率', '营业利润', '净利润'],
            'filter_conditions': ["月份 = '2026年' 或 包含 '2026' 的周期"],
            'period': '2026',
        }
        self.reply = {'content': json.dumps({'matched': True, 'request_period': '2026',
                                            'source_period': '2026', 'reason': '取数列限定了请求期间'})}
        for target, value in [
            ('dsh_modules.analysis_contract._resolve_available_headers', ['月份', '营业收入', '毛利率']),
            ('dsh_modules.semantic_contract_judge.judge_contract_intent', self.verdict),
            ('dsh_modules.analysis_synthesis._can_reach_proxy', True),
            ('dsh_modules.task_completeness_judge.judge_task_completeness', None),
        ]:
            patcher = patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)
        cache = patch.object(SemanticFilterJudge, '_CACHE_DIR', Path(directory.name) / 'judgments')
        cache.start()
        self.addCleanup(cache.stop)
        model = patch('dsh_modules.llm.call_model_proxy', side_effect=lambda *a, **kw: self.reply)
        self.model = model.start()
        self.addCleanup(model.stop)

    def receipt(self, plan=None):
        result = calculate_spreadsheet_analysis(
            self.source, plan or {'query': copy.deepcopy(self.query)}, domain='finance')
        self.assertTrue(result.is_success, result.error)
        return result

    def margin(self, expression=None):
        return {'id': 'margin', 'label': '毛利率', 'metric_id': 'finance.gross_margin',
                'output_unit': '%', 'expression': expression or {'op': 'divide', 'args': [
                    {'sheet': '经营数据', 'cell': 'B6', 'unit': 'amount'},
                    {'sheet': '经营数据', 'cell': 'B4', 'unit': 'amount'}]}}

    def test_real_semantic_contract_keeps_amounts_and_accepts_explicit_margin(self):
        evidence = [self.receipt()]
        state = analysis_task_state(evidence, self.prompt)
        self.assertEqual([m['name'] for m in state['missing_metrics']], ['毛利率'])
        self.assertNotIn('unsolicited_filter_applied', [i['code'] for i in state['issues']])
        self.assertEqual(self.model.call_count, 1)
        completed = RegisteredMetricCompletion().complete(
            evidence, self.prompt, Telemetry(), ['aggregate_spreadsheet'])
        self.assertEqual(completed, [])
        explicit = self.receipt({'query': copy.deepcopy(self.query), 'calculations': [self.margin()]})
        evidence.append(explicit)
        self.assertEqual(float(explicit.data['facts'][-1]['value']), 30)
        self.assertTrue(analysis_task_state(evidence, self.prompt)['complete'])
        context = json.loads(self.model.call_args.kwargs['messages'][-1]['content'].split(
            '【实际来源绑定 Source context】:\n')[1].split('\n\n')[0])
        self.assertEqual(context['bindings'][0]['bound_headers'], {'B': '2026实际'})
        self.assertEqual(self.model.call_count, 1)

    def test_wrong_period_is_judged_from_used_column_and_not_accepted(self):
        self.query['metrics'][0]['field'] = '2025实际'
        self.reply = {'content': json.dumps({'matched': False, 'request_period': '2026',
                                            'source_period': '2025', 'reason': '实际取数来自不同期间'})}
        state = analysis_task_state([self.receipt()], self.prompt)
        self.assertFalse(state['complete'])
        self.assertIn('source_scope_mismatch', [i['code'] for i in state['issues']])
        payload = self.model.call_args.kwargs['messages'][-1]['content']
        self.assertIn('"C": "2025实际"', payload)
        self.assertNotIn('"B": "2026实际"', payload)
        self.assertNotIn('"2026实际"', payload)

    def test_unknown_judgment_is_not_reported_as_unsolicited_filter(self):
        self.reply = {'content': json.dumps({'matched': None, 'reason': '无法确认'})}
        state = analysis_task_state([self.receipt()], self.prompt)
        codes = [i['code'] for i in state['issues']]
        self.assertIn('source_scope_unverified', codes)
        self.assertNotIn('unsolicited_filter_applied', codes)
        self.assertFalse(state['complete'])

    def test_llm_period_is_checked_without_a_business_filter_requirement(self):
        self.verdict['filter_conditions'] = []
        self.query['metrics'][0]['field'] = '2025实际'
        self.reply = {'content': json.dumps({'matched': False, 'request_period': '2026',
                                            'source_period': '2025', 'reason': '实际列期间不符合请求'})}
        state = analysis_task_state([self.receipt()], self.prompt)
        self.assertFalse(state['complete'])
        self.assertIn('source_scope_mismatch', [i['code'] for i in state['issues']])

    def test_business_predicate_cannot_bypass_unknown_period_review(self):
        self.query['where'] = {'and': [self.query['where'],
                                      {'field': '2025实际', 'op': 'gt', 'value': 0}]}
        self.reply = {'content': '{"matched":null,"reason":"scope uncertain"}'}
        state = analysis_task_state([self.receipt()], self.prompt)
        self.assertFalse(state['complete'])
        self.assertIn('source_scope_unverified', [i['code'] for i in state['issues']])

    def test_mixed_query_executes_calculations_and_keeps_combined_evidence(self):
        result = self.receipt({'query': self.query, 'calculations': [self.margin()]})
        margin = next(f for f in result.data['facts'] if f.get('metric_id') == 'finance.gross_margin')
        self.assertEqual(float(margin['value']), 30)
        self.assertEqual(set(margin['source_cells']), {'经营数据!B4', '经营数据!B6'})
        self.assertEqual(margin['calculation_stage'], 'post_query')
        self.assertEqual(len(result.data['facts']), 5)
        self.assertEqual(result.data['plan']['calculations'][0]['id'], 'margin')
        self.assertTrue(analysis_task_state([result], self.prompt)['complete'])
        self.verdict['task_type'] = 'tabular_query'
        overview = analysis_overview([result], self.prompt)
        self.assertIn('毛利率', overview)
        self.assertIn('30%', overview)

    def test_mixed_query_supports_unambiguous_fact_references(self):
        first = self.receipt()
        ids = {f['group_key']: f['id'] for f in first.data['facts']}
        expression = {'op': 'divide', 'args': [{'ref': ids['毛利']}, {'ref': ids['营业收入']}]}
        result = self.receipt({'query': self.query, 'calculations': [self.margin(expression)]})
        self.assertEqual(float(result.data['facts'][-1]['value']), 30)

    def test_calculation_cannot_read_a_row_excluded_by_query(self):
        calculation = self.margin({'cell': 'B5', 'sheet': '经营数据', 'unit': 'amount'})
        calculation.pop('metric_id')
        calculation['label'] = '金额'
        calculation['output_unit'] = 'source'
        result = calculate_spreadsheet_analysis(
            self.source, {'query': self.query, 'calculations': [calculation]}, domain='finance')
        self.assertTrue(result.is_error)
        self.assertIn('查询最终结果之外', result.error_message)

    def test_invalid_calculation_does_not_return_query_success(self):
        invalid = self.margin({'ref': 'undefined'})
        result = calculate_spreadsheet_analysis(
            self.source, {'query': self.query, 'calculations': [invalid]}, domain='finance')
        self.assertTrue(result.is_error)
        self.assertIn('查询后计算失败', result.error_message)

    def test_calculation_cannot_read_a_group_removed_by_limit(self):
        query = copy.deepcopy(self.query)
        query['limit'] = 1
        result = calculate_spreadsheet_analysis(
            self.source, {'query': query, 'calculations': [self.margin()]}, domain='finance')
        self.assertTrue(result.is_error)
        self.assertIn('查询最终结果之外', result.error_message)

    def test_scope_cache_includes_bound_headers_and_workbook(self):
        context = {'workbook_id': 'one', 'bindings': [{'bound_headers': {'B': '本期'}}]}
        first = SemanticFilterJudge._cache_path('汇总本期', [], {'B': '本期'}, context)
        context['bindings'][0]['bound_headers']['B'] = '上期'
        second = SemanticFilterJudge._cache_path('汇总本期', [], {'B': '本期'}, context)
        self.assertNotEqual(first, second)
        context['workbook_id'] = 'two'
        self.assertNotEqual(second, SemanticFilterJudge._cache_path('汇总本期', [], {'B': '本期'}, context))

    def test_string_boolean_from_judge_is_unknown(self):
        self.reply = {'content': '{"matched":"false","reason":"malformed"}'}
        self.assertIsNone(SemanticFilterJudge.judge_filter_conformance(
            self.prompt, [], source_context={'workbook_id': 'one'}))

    def test_other_measures_cannot_dismiss_a_missing_derived_measure(self):
        receipt = self.receipt()
        issue = {'code': 'required_metrics_missing', 'metrics': [{'name': '毛利率'}]}
        verdict = {'action': 'recheck', 'category': 'gate_false_positive',
                   'dismissed_issue_codes': ['required_metrics_missing'],
                   'supporting_fact_ids': [receipt.data['facts'][0]['id']]}
        remaining, reviewed = revalidate_review(
            [issue], verdict, [receipt], receipt.data['facts'])
        self.assertEqual(remaining, [issue])
        self.assertFalse(reviewed['complete'])


if __name__ == '__main__':
    unittest.main()
