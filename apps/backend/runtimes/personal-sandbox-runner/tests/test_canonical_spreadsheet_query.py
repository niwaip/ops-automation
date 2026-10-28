"""SQL query surface and source-row delivery regressions, without model calls."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import openpyxl

from dsh_modules.analysis_contract import AnalysisContract
from dsh_modules.analysis_delivery_constraints import query_delivery_issues
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.spreadsheet_query_schema import QUERY_TOOL
from dsh_modules.spreadsheet_analysis_schema import select_analysis_tools, analysis_instructions_for
from dsh_modules.tools import get_sandbox_tools


class CanonicalSpreadsheetQueryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.source = Path(self.tmp.name) / 'rows.xlsx'
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = '明细'
        ws.append(['员工姓名', 'WBS编号', '部门', '工数年月', '工数(小时)', '金额(K)', '有偿无偿'])
        for row in [('杨烨', 'IK-001', '甲', '202610', 10, 2, '有偿'),
                    ('杨烨', 'IK-001', '甲', '202611', 20, 4, '无偿'),
                    ('杨烨', 'EX-002', '乙', '202610', 5, 1, '无偿'),
                    ('张三', 'IK-003', '乙', '202610', 40, 8, '有偿')]:
            ws.append(row)
        wb.save(self.source)
        wb.close()
        self.spec = {'sheet': '明细', 'header_row': 1, 'data_range': 'A2:G5'}

    def tearDown(self):
        self.tmp.cleanup()

    def execute(self, query):
        receipt = calculate_spreadsheet_analysis(self.source, {'query': query})
        self.assertTrue(receipt.is_success, receipt.error)
        return receipt

    def test_public_tools_separate_query_from_formula_dialect(self):
        tools = {t['function']['name']: t['function']['parameters'] for t in get_sandbox_tools()}
        query = tools['aggregate_spreadsheet']
        self.assertEqual(set(query['properties']), {'file_path', 'query'})
        self.assertEqual(set(query['required']), {'file_path', 'query'})
        formula = tools['analyze_spreadsheet']
        self.assertEqual(set(formula['properties']), {'file_path', 'tables', 'calculations'})
        self.assertNotIn('query', formula['properties'])

    def test_schema_references_resolve_and_filters_are_structured(self):
        schema = QUERY_TOOL['function']['parameters']
        def visit(node):
            if isinstance(node, dict):
                if '$ref' in node:
                    target = schema
                    for part in node['$ref'].removeprefix('#/').split('/'):
                        target = target[part]
                    self.assertIsInstance(target, dict)
                for value in node.values():
                    visit(value)
            elif isinstance(node, list):
                for value in node:
                    visit(value)
        visit(schema)
        self.assertIn('where_predicate', schema['$defs'])
        self.assertIn('having_predicate', schema['$defs'])
        self.assertFalse(schema['properties']['query']['additionalProperties'])
        json.dumps(schema)  # The actual model-facing payload is serializable.

    def test_pure_detail_turn_only_exposes_query_and_structure_tools(self):
        prompt = '查看员工杨烨的明细数据'
        contract = AnalysisContract(raw_prompt=prompt, is_detail_query=True)
        with patch('dsh_modules.analysis_contract.build_analysis_contract', return_value=contract):
            selected = select_analysis_tools(get_sandbox_tools(), prompt)
        self.assertEqual({t['function']['name'] for t in selected},
                         {'aggregate_spreadsheet', 'inspect_spreadsheet_structure'})
        with patch('dsh_modules.analysis_contract.build_analysis_contract', return_value=contract):
            instructions = analysis_instructions_for(prompt)
        self.assertNotIn('analyze_spreadsheet', instructions)
        self.assertNotIn('"ref"', instructions)
        self.assertIn('省略metrics', instructions)

    def test_where_only_preserves_duplicate_project_rows_and_attributes(self):
        receipt = self.execute({'source': self.spec,
                                'where': {'field': '员工姓名', 'op': 'eq', 'value': '杨烨'}})
        rows = receipt.data['rows']
        self.assertEqual([r['_row'] for r in rows], [2, 3, 4])
        self.assertEqual([r['工数年月'] for r in rows[:2]], ['202610', '202611'])
        self.assertEqual([r['有偿无偿'] for r in rows[:2]], ['有偿', '无偿'])
        self.assertTrue(all(r['员工姓名'] == '杨烨' for r in rows))
        self.assertEqual(len(rows[0]), 8)  # Seven source columns plus row identity.

    def test_sql_pipeline_applies_where_before_having_and_limit(self):
        receipt = self.execute({
            'source': self.spec,
            'where': {'and': [
                {'field': '员工姓名', 'op': 'eq', 'value': '杨烨'},
                {'field': 'WBS编号', 'op': 'not_starts_with', 'values': ['EX-']}]},
            'group_by': ['部门'],
            'metrics': [{'id': 'hours', 'op': 'sum', 'field': '工数(小时)'},
                        {'id': 'records', 'op': 'count_rows'}],
            'having': {'and': [{'metric': 'hours', 'op': 'gt', 'value': 25},
                               {'metric': 'records', 'op': 'gte', 'value': 2}]},
            'order_by': [{'ref': 'hours', 'direction': 'desc'}], 'limit': 1,
        })
        self.assertEqual(len(receipt.data['rows']), 1)
        row = receipt.data['rows'][0]
        self.assertEqual(row['部门'], '甲')
        self.assertEqual(str(row['hours']), '30')
        self.assertEqual(row['records'], 2)

    def test_prefix_boolean_projection_and_distinct_are_still_supported(self):
        receipt = self.execute({'source': self.spec, 'fields': ['WBS编号'], 'distinct': True,
                                'where': {'not': {'field': 'WBS编号', 'op': 'starts_with', 'values': ['EX-']}}})
        self.assertEqual({r['WBS编号'] for r in receipt.data['rows']}, {'IK-001', 'IK-003'})

    def test_grouped_success_cannot_satisfy_pure_detail_request(self):
        prompt = '查看员工杨烨的明细数据'
        receipt = self.execute({'source': self.spec,
                                'where': {'field': '员工姓名', 'op': 'eq', 'value': '杨烨'},
                                'group_by': ['WBS编号'],
                                'metrics': [{'id': 'hours', 'op': 'sum', 'field': '工数(小时)'}]})
        contract = AnalysisContract(raw_prompt=prompt, is_detail_query=True)
        codes = [i['code'] for i in query_delivery_issues([receipt], prompt, contract)]
        self.assertIn('detail_granularity_changed', codes)
        with patch('dsh_modules.analysis_task_state.build_analysis_contract', return_value=contract), \
             patch('dsh_modules.semantic_filter_judge.judge_filter_conformance', return_value=True), \
             patch('dsh_modules.task_completeness_judge.TaskCompletenessJudge.judge_task_completeness', return_value=None):
            state = analysis_task_state([receipt], prompt)
        self.assertFalse(state['complete'])
        self.assertIn('detail_granularity_changed', [i['code'] for i in state['issues']])
        detail = self.execute({'source': self.spec,
                               'where': {'field': '员工姓名', 'op': 'eq', 'value': '杨烨'}})
        self.assertEqual(query_delivery_issues([detail], prompt, contract), [])

    def test_explicit_grouping_and_distinct_do_not_trigger_detail_guard(self):
        receipt = self.execute({'source': self.spec, 'group_by': ['部门'],
                                'metrics': [{'id': 'n', 'op': 'count_rows'}]})
        contract = AnalysisContract(raw_prompt='按部门统计', is_detail_query=True, is_grouped=True)
        self.assertEqual(query_delivery_issues([receipt], contract.raw_prompt, contract), [])

    def test_unrequested_distinct_cannot_drop_source_detail_rows(self):
        prompt = '查看员工杨烨的明细'
        receipt = self.execute({'source': self.spec, 'fields': ['WBS编号'], 'distinct': True,
                                'where': {'field': '员工姓名', 'op': 'eq', 'value': '杨烨'}})
        contract = AnalysisContract(raw_prompt=prompt, is_detail_query=True)
        self.assertIn('detail_granularity_changed',
                      [i['code'] for i in query_delivery_issues([receipt], prompt, contract)])

    def test_legacy_internal_plan_remains_executable(self):
        receipt = calculate_spreadsheet_analysis(self.source, {
            'tables': [{'id': 't', **self.spec, 'filters': [
                {'column': '员工姓名', 'values': ['杨烨']}]}],
            'calculations': [{'id': 'hours', 'label': '工时',
                              'expression': {'aggregate': 'sum', 'table': 't', 'column': '工数(小时)', 'unit': 'duration'}}],
        })
        self.assertTrue(receipt.is_success, receipt.error)
        self.assertEqual(str(receipt.data['facts'][0]['value']), '35')


if __name__ == '__main__':
    unittest.main()
