"""Generalization checks: source-driven group counts and sample-free summary prompts."""
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import openpyxl
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.analysis_synthesis import synthesize_analysis_summary
from dsh_modules.tool_result import ToolResult


class NoHardcodeContractTests(unittest.TestCase):
    def test_one_real_group_is_complete_but_single_global_total_is_not(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'arbitrary.xlsx'
            book = openpyxl.Workbook(); sheet = book.active; sheet.title = '变动数据'
            for row in [['团队', '金额(元)'], ['独立组', 71.23], ['独立组', -19.41]]:
                sheet.append(row)
            book.save(source); book.close()
            table = {'id': 't', 'sheet': '变动数据', 'header_row': 1, 'data_range': 'A2:B3'}
            total = {'id': 'total', 'label': '总金额', 'expression': {'aggregate': 'sum', 'table': 't', 'column': 'B', 'unit': 'amount'}}
            grouped = {'id': 'group', 'label': '金额', 'expression': {**total['expression'], 'group_by': 'A'}}
            prompt = '按团队分组统计金额(元)，附总计。'
            complete = calculate_spreadsheet_analysis(source, {'tables': [table], 'calculations': [total, grouped]})
            incomplete = calculate_spreadsheet_analysis(source, {'tables': [table], 'calculations': [total]})
            self.assertTrue(analysis_task_state([complete], prompt)['complete'])
            self.assertFalse(analysis_task_state([incomplete], prompt)['complete'])

    def test_numeric_result_literals_are_not_invented_source_fields(self):
        from dsh_modules.analysis_contract import build_analysis_contract
        for literal in ('0成本', '17.35费用', '-8工时'):
            prompt = '统计处理成本(K)和条数，如果没有匹配请返回0条和' + literal + '。'
            self.assertEqual([m.name for m in build_analysis_contract(prompt).metrics], ['处理成本', '条数'])
        self.assertEqual([m.name for m in build_analysis_contract('统计2026年金额和3D工时').metrics], ['2026年金额', '3D工时'])

    def test_optional_profiler_prompt_has_no_fixed_column_classifications(self):
        import json
        from dsh_modules.table_semantic_profiler import TableSemanticProfiler
        headers = {'Z': '自定义费用(元)', 'B': '归属类别'}
        response = {'content': json.dumps({'columns': [
            {'column_letter': 'Z', 'physical_dimension': 'currency', 'declared_unit': '元', 'semantic_role': 'measure'},
            {'column_letter': 'B', 'physical_dimension': 'categorical', 'declared_unit': None, 'semantic_role': 'dimension'}]})}
        with patch('socket.getaddrinfo', return_value=[]), patch('dsh_modules.llm.call_model_proxy', return_value=response) as proxy:
            profiles = TableSemanticProfiler._profile_via_llm('新工作表', headers, [], model_name='test')
        self.assertEqual(set(profiles), set(headers))
        self.assertEqual(profiles['Z'].declared_unit, '元')
        messages = proxy.call_args.kwargs['messages']
        system = messages[0]['content']
        self.assertNotIn('"column_letter": "O"', system)
        self.assertNotIn('"column_letter": "P"', system)
        self.assertEqual(json.loads(messages[1]['content'])['headers'], headers)

    def test_synthesis_system_prompt_does_not_seed_another_workbooks_answers(self):
        receipt = ToolResult.success({'kind': 'spreadsheet_analysis', 'facts': [{'label': '总金额', 'value': '71.23', 'unit': '元'}], 'rules': []}, provenance={'file_path': '/workspace/random.xlsx'})
        with patch('dsh_modules.analysis_synthesis._can_reach_proxy', return_value=True), patch('dsh_modules.llm.call_model_proxy', return_value={'content': '金额为71.23元。'}) as proxy:
            synthesize_analysis_summary('统计金额', [receipt], '', 'fallback', model='test', policy=SimpleNamespace(single_request_timeout=10))
        args = proxy.call_args
        messages = args.args[0] if args.args else args.kwargs.get('messages')
        system = next(m['content'] for m in messages if m['role'] == 'system')
        for seeded in ('FC34000', 'FC45031', '0.43 K', '513.09 K', '1637.4199', '1887.73102'):
            self.assertNotIn(seeded, system)

    def test_analysis_fact_selection_has_no_hardcoded_business_values(self):
        """Rule check: Zero hardcoded business values in fact selection, semantic judge, or task state."""
        import re
        for filename in ('analysis_fact_selection.py', 'semantic_filter_judge.py', 'analysis_task_state.py'):
            source_file = Path(__file__).resolve().parent.parent / 'src' / 'dsh_modules' / filename
            content = source_file.read_text(encoding='utf-8')
            code_only = re.sub(r'#.*', '', content)
            for forbidden in ('"有偿"', "'有偿'", '"无偿"', "'无偿'", '有偿无偿', 'FC34000', 'FC45031', 'SM華南BAS', 'DM華南BAS'):
                self.assertNotIn(forbidden, code_only, f"Forbidden hardcoded term '{forbidden}' found in {filename}")

    def test_multi_round_category_partition_selection_zero_hardcode(self):
        """Zero-hardcoding: arbitrary category partition (自研 / 外包) must converge to refined round."""
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'arbitrary_categories.xlsx'
            book = openpyxl.Workbook()
            sheet = book.active
            sheet.title = '项目明细'
            sheet.append(['部门', '研发模式', '金额(元)'])
            sheet.append(['技术部', '自研', 60.0])
            sheet.append(['技术部', '外包', 40.0])
            book.save(source)
            book.close()

            # Round 1: Coarse unfiltered attempt
            table_raw = {'id': 't_all', 'sheet': '项目明细', 'header_row': 1, 'data_range': 'A2:C3'}
            r_coarse = calculate_spreadsheet_analysis(source, {
                'tables': [table_raw],
                'calculations': [{'id': 'tot_coarse', 'label': '全表金额', 'expression': {'aggregate': 'sum', 'table': 't_all', 'column': 'C', 'unit': 'amount'}}]
            })

            # Round 2: Refined partition into 自研 and 外包
            table_x = {'id': 't_x', 'sheet': '项目明细', 'header_row': 1, 'data_range': 'A2:C3', 'filters': [{'column': 'B', 'values': ['自研'], 'op': 'in'}]}
            table_y = {'id': 't_y', 'sheet': '项目明细', 'header_row': 1, 'data_range': 'A2:C3', 'filters': [{'column': 'B', 'values': ['外包'], 'op': 'in'}]}
            r_refined = calculate_spreadsheet_analysis(source, {
                'tables': [table_x, table_y],
                'calculations': [
                    {'id': 'x_total', 'label': '自研金额合计', 'expression': {'aggregate': 'sum', 'table': 't_x', 'column': 'C', 'unit': 'amount'}},
                    {'id': 'y_total', 'label': '外包金额合计', 'expression': {'aggregate': 'sum', 'table': 't_y', 'column': 'C', 'unit': 'amount'}}
                ]
            })

            from dsh_modules.analysis_fact_selection import resolve_conforming_facts
            prompt = '按照部门分别统计自研和 外包 的金额 合计'
            # Independent of receipt iteration order
            for receipts in ([r_coarse, r_refined], [r_refined, r_coarse]):
                facts = resolve_conforming_facts(receipts, prompt)
                self.assertEqual(len(facts), 2)
                values = {f['label']: f['value'] for f in facts}
                self.assertEqual(values.get('自研金额合计'), '60')
                self.assertEqual(values.get('外包金额合计'), '40')
                self.assertNotIn('全表金额', values)

    def test_audit_session_reproduction_both_paid_and_unpaid_preserved(self):
        """Reproduction of user session chat-session-1792572669074-09bmpzd6: all 13 facts preserved."""
        evidence_path = Path('./data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.dsh/sessions/chat-session-1792572669074-09bmpzd6.evidence/1792577941643112959-fa4bfe00079240e1a76602c737ee7030.json')
        if not evidence_path.exists():
            evidence_path = Path('./data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.dsh/sessions/chat-session-1792572669074-09bmpzd6.evidence.json')
        if not evidence_path.exists():
            return
        import json
        with open(evidence_path, encoding='utf-8') as f:
            ev = json.load(f)

        class MockReceipt:
            def __init__(self, d):
                self.is_success = True
                self.data = d.get('data', {})
                self.provenance = d.get('provenance', {})

        receipts = [MockReceipt(r) for r in ev.get('receipts', [])]
        prompt = ev.get('query')

        from dsh_modules.analysis_fact_selection import resolve_conforming_facts
        facts = resolve_conforming_facts(receipts, prompt)
        self.assertEqual(len(facts), 13)

        fact_map = {f['id']: f['value'] for f in facts}
        self.assertEqual(fact_map.get('paid_total'), '1747125.79000')
        self.assertEqual(fact_map.get('unpaid_total'), '140605.23000')

        # Both paid and unpaid department facts exist
        unpaid_dept_keys = [k for k in fact_map if k.startswith('unpaid_dept__')]
        paid_dept_keys = [k for k in fact_map if k.startswith('paid_dept__')]
        self.assertEqual(len(unpaid_dept_keys), 4)
        self.assertEqual(len(paid_dept_keys), 7)


if __name__ == '__main__':
    unittest.main()
