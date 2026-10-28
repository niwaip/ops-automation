"""Unit tests for RegisteredMetricCompletion with declarative query facts."""

import os
import tempfile
import unittest
import openpyxl
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis
from dsh_modules.registered_metric_completion import RegisteredMetricCompletion
from dsh_modules.analysis_turn import AnalysisTurn
from dsh_modules.analysis_task_state import analysis_task_state


class DummyTelemetry:
    def __init__(self):
        self.tool_calls = []
        self.evidence_decision = None

    def record_tool_call(self, name, plan, status):
        self.tool_calls.append((name, plan, status))

    def record_execution_result(self, res):
        pass

    def record_guard(self, *args, **kwargs):
        pass

    def record_evidence_decision(self, dec):
        self.evidence_decision = dec


class RegisteredMetricCompletionQueryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.source_path = os.path.join(self.temp_dir.name, "finance_statement.xlsx")

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "利润表"
        ws.append(["2026年度利润表（单位：千元）", "", "", ""])
        ws.append(["", "", "", ""])
        ws.append(["项目", "2026实际", "2026预算", "差异"])
        ws.append(["营业收入", 124020, 120000, 4020])
        ws.append(["营业成本", 70576.75, 70000, 576.75])
        ws.append(["毛利", 53443.25, 50000, 3443.25])
        ws.append(["营业利润", 21209.4, 18300, 2909.4])
        ws.append(["净利润", 16038.3, 13950, 2088.3])
        wb.save(self.source_path)
        wb.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_query_facts_require_explicit_gross_margin_calculation(self):
        plan = {
            "query": {
                "source": {"sheet": "利润表", "header_row": 3, "data_range": "A4:D8"},
                "where": {"field": "项目", "op": "in", "values": ["营业收入", "毛利", "营业利润", "净利润"]},
                "group_by": ["项目"],
                "metrics": [{"id": "actual", "label": "2026实际", "field": "2026实际", "op": "sum", "unit": "amount"}]
            }
        }
        res = calculate_spreadsheet_analysis(self.source_path, plan, domain="finance")
        self.assertTrue(res.is_success, res.error)
        self.assertEqual(len(res.data.get("facts", [])), 4)

        prompt = "总结2026年收入、毛利率、营业利润和净利润。"
        evidence = [res]
        sink = DummyTelemetry()
        comp = RegisteredMetricCompletion()

        completed = comp.complete(evidence, prompt, sink, ["aggregate_spreadsheet"])
        self.assertEqual(completed, [])
        self.assertFalse(analysis_task_state(evidence, prompt)['complete'])
        explicit_plan = {**plan, 'calculations': [{
            'id': 'margin', 'label': '2026实际毛利率', 'metric_id': 'finance.gross_margin',
            'output_unit': '%', 'expression': {'op': 'divide', 'args': [
                {'sheet': '利润表', 'cell': 'B6', 'unit': 'amount'},
                {'sheet': '利润表', 'cell': 'B4', 'unit': 'amount'}]}}]}
        explicit = calculate_spreadsheet_analysis(self.source_path, explicit_plan, domain='finance')
        self.assertTrue(explicit.is_success, explicit.error)
        evidence.append(explicit)
        gross_margin_fact = explicit.data['facts'][-1]
        self.assertEqual(gross_margin_fact['metric_id'], 'finance.gross_margin')
        self.assertEqual(gross_margin_fact['unit'], '%')
        self.assertIn('利润表!B4', gross_margin_fact['source_cells'])
        self.assertIn('利润表!B6', gross_margin_fact['source_cells'])
        self.assertAlmostEqual(float(gross_margin_fact['value']), 43.0924, places=2)

        turn = AnalysisTurn(prompt)
        self.assertTrue(turn.may_finish(evidence))

        state = analysis_task_state(evidence, prompt)
        self.assertTrue(state.get("complete"))
        self.assertEqual(len(state.get("issues", [])), 0)

        rendered = turn.render(evidence, "", sink)
        self.assertIn("43.09%", rendered)
        self.assertIn("124,020", rendered)


if __name__ == "__main__":
    unittest.main()
