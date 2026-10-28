"""Tests for query predicate robustness and gate relaxation fixes."""

import unittest
from pathlib import Path
import sys
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from dsh_modules.query_predicates import eval_row_predicate, eval_having_predicate
from dsh_modules.analysis_turn import AnalysisTurn


class TestQueryPredicateAndGuardRelaxation(unittest.TestCase):
    def test_eq_with_single_values_list(self):
        """Regression test for 19:19 audit: op='eq' with values=['杨烨'] should match."""
        row = {"员工姓名": "杨烨", "部门": "華東MIS"}
        node = {"field": "员工姓名", "op": "eq", "values": ["杨烨"]}
        self.assertTrue(eval_row_predicate(node, row))

        node_mismatch = {"field": "员工姓名", "op": "eq", "values": ["张三"]}
        self.assertFalse(eval_row_predicate(node_mismatch, row))

    def test_eq_with_multi_values_list_falls_back_to_in(self):
        """When model sends multiple values with eq, treat as 'in'."""
        row = {"员工姓名": "杨烨"}
        node = {"field": "员工姓名", "op": "eq", "values": ["李四", "杨烨"]}
        self.assertTrue(eval_row_predicate(node, row))

    def test_eq_with_whitespace_and_case_tolerance(self):
        """Strings should match with whitespace stripping and case insensitivity by default."""
        row1 = {"员工姓名": " 杨烨 "}
        node1 = {"field": "员工姓名", "op": "eq", "value": "杨烨"}
        self.assertTrue(eval_row_predicate(node1, row1))

        row2 = {"code": "MIS"}
        node2 = {"field": "code", "op": "eq", "values": ["mis"]}
        self.assertTrue(eval_row_predicate(node2, row2))

    def test_in_with_singular_value(self):
        """When model uses 'value' instead of 'values' for 'in', it should work."""
        row = {"员工姓名": "杨烨"}
        node = {"field": "员工姓名", "op": "in", "value": "杨烨"}
        self.assertTrue(eval_row_predicate(node, row))

    def test_ne_with_values_list(self):
        """op='ne' with values list."""
        row = {"员工姓名": "杨烨"}
        node1 = {"field": "员工姓名", "op": "ne", "values": ["张三"]}
        self.assertTrue(eval_row_predicate(node1, row))

        node2 = {"field": "员工姓名", "op": "ne", "values": ["杨烨"]}
        self.assertFalse(eval_row_predicate(node2, row))

    def test_having_with_values_list(self):
        """HAVING predicate with values list."""
        metrics = {"total_hours": 90.0}
        node = {"metric": "total_hours", "op": "gte", "values": [80.0]}
        self.assertTrue(eval_having_predicate(node, metrics))

        node_fail = {"metric": "total_hours", "op": "lt", "values": [50.0]}
        self.assertFalse(eval_having_predicate(node_fail, metrics))

    def test_format_value_and_number_non_numeric_safety(self):
        """format_value and number should gracefully return original strings on non-numeric input."""
        from dsh_modules.spreadsheet_analysis_evidence import format_value
        from dsh_modules.report_presentation import number

        self.assertEqual(format_value("杨烨"), "杨烨")
        self.assertEqual(format_value("IK-S63048"), "IK-S63048")
        self.assertEqual(format_value(""), "")
        self.assertEqual(format_value(None), "")
        self.assertEqual(format_value("123.456"), "123.456")

        self.assertEqual(number("杨烨"), "杨烨")
        self.assertEqual(number(None), "")
        self.assertEqual(number("1234.56"), "1,234.56")

    def test_may_finish_allows_clarification(self):
        """may_finish should return True when the model text is a clarification."""
        turn = AnalysisTurn(prompt="分析附件数据", model="test-model")
        mock_evidence = [MagicMock(is_success=True, data={"kind": "spreadsheet_analysis", "evidence_id": "ev1"})]
        
        clarification_text = "请问您希望统计的【毛利率】是指综合毛利率还是分部门毛利率？原表格中未包含该字段。"
        self.assertTrue(turn.may_finish(mock_evidence, reply_text=clarification_text))


if __name__ == "__main__":
    unittest.main()
