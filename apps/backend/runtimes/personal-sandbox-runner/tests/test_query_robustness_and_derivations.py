"""Unit tests for spreadsheet query robustness, string deserialization, and operator support."""

import json
from decimal import Decimal
from pathlib import Path
import sys
import tempfile
import unittest
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.query_contract import CANONICAL_AGGREGATES, validate_query_plan
from dsh_modules.query_executor import execute_query_plan
from dsh_modules.spreadsheet_analysis import calculate_spreadsheet_analysis, execute_spreadsheet_analysis
from dsh_modules.spreadsheet_plan import normalize_plan


class QueryRobustnessAndDerivationsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.source_path = Path(self.temp_dir.name) / "test_finance.xlsx"

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "利润表"
        ws.append(["2026年度利润表", "", ""])
        ws.append(["", "", ""])
        ws.append(["项目", "2026实际", "2026预算"])
        ws.append(["营业收入", 124020, 120000])
        ws.append(["营业成本", 70576.75, 70000])
        ws.append(["毛利", 53443.25, 50000])
        ws.append(["营业利润", 21209.4, 20000])
        ws.append(["净利润", 16038.3, 15000])

        wb.save(self.source_path)
        wb.close()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_canonical_aggregates_includes_value_and_first(self):
        self.assertIn("value", CANONICAL_AGGREGATES)
        self.assertIn("val", CANONICAL_AGGREGATES)
        self.assertIn("first", CANONICAL_AGGREGATES)

    def test_op_value_and_first_execution(self):
        wb = openpyxl.load_workbook(self.source_path)
        q_spec = {
            "source": {
                "sheet": "利润表",
                "header_row": 3,
                "data_range": "A4:C8",
            },
            "where": {
                "field": "项目",
                "op": "eq",
                "value": "营业收入",
            },
            "metrics": [
                {
                    "id": "rev_val",
                    "field": "2026实际",
                    "op": "value",
                    "unit": "元",
                },
                {
                    "id": "rev_first",
                    "field": "2026实际",
                    "op": "first",
                    "unit": "元",
                },
            ],
        }
        res = execute_query_plan(wb, q_spec, lambda: None, "元")
        self.assertEqual(len(res.rows), 1)
        self.assertEqual(res.rows[0]["rev_val"], "124020")
        self.assertEqual(res.rows[0]["rev_first"], "124020")
        wb.close()

    def test_query_string_with_trailing_comma_and_whitespace(self):
        # Emulate LLM passing query as a serialized JSON string with trailing comma
        query_str = json.dumps({
            "source": {
                "sheet": "利润表",
                "header_row": 3,
                "data_range": "A4:C8",
            },
            "where": {
                "field": "项目",
                "op": "in",
                "values": ["营业收入", "毛利"],
            },
            "group_by": ["项目"],
            "metrics": [
                {
                    "id": "actual",
                    "field": "2026实际",
                    "op": "sum",
                    "unit": "元",
                }
            ],
        }) + " ,  \n"

        plan = {
            "query": query_str,
        }
        result = calculate_spreadsheet_analysis(self.source_path, plan, domain="finance")
        self.assertTrue(result.is_success, result.error)
        data = result.data
        self.assertEqual(len(data["facts"]), 2)
        fact_keys = {f["group_key"] for f in data["facts"]}
        self.assertEqual(fact_keys, {"营业收入", "毛利"})

    def test_query_malformed_string_fallback_to_calculations(self):
        # Query is completely unparseable junk, but calculations exist
        plan = {
            "tables": [
                {
                    "id": "t1",
                    "sheet": "利润表",
                    "header_row": 3,
                    "data_range": "A4:C8",
                    "filters": [{"column": "项目", "values": ["营业收入"]}],
                }
            ],
            "calculations": [
                {
                    "id": "total_rev",
                    "label": "营业收入",
                    "expression": {"aggregate": "sum", "table": "t1", "column": "2026实际"},
                    "output_unit": "元",
                }
            ],
            "query": "{malformed_not_json}},,",
        }
        result = calculate_spreadsheet_analysis(self.source_path, plan, domain="generic")
        self.assertTrue(result.is_success, result.error)
        self.assertEqual(len(result.data["facts"]), 1)
        self.assertEqual(result.data["facts"][0]["id"], "total_rev")

    def test_query_malformed_string_without_calculations_raises_clean_error(self):
        plan = {
            "query": "{malformed_not_json}},,",
        }
        result = calculate_spreadsheet_analysis(self.source_path, plan, domain="generic")
        self.assertFalse(result.is_success)
        self.assertIn("query 必须为有效字典对象", result.error["message"])
        # Crucially: it must NOT raise "dictionary update sequence element #0 has length 1"
        self.assertNotIn("dictionary update sequence", result.error["message"])

    def test_query_without_metrics_merges_calculations(self):
        # Query specifies source and where, but metrics are in calculations
        plan = {
            "tables": [
                {
                    "id": "t1",
                    "sheet": "利润表",
                    "header_row": 3,
                    "data_range": "A4:C8",
                }
            ],
            "query": {
                "source": {
                    "sheet": "利润表",
                    "header_row": 3,
                    "data_range": "A4:C8",
                },
                "where": {
                    "field": "项目",
                    "op": "eq",
                    "value": "营业收入",
                },
            },
            "calculations": [
                {
                    "id": "total_rev",
                    "label": "2026实际收入",
                    "expression": {"aggregate": "sum", "column": "2026实际"},
                    "output_unit": "元",
                }
            ],
        }
        result = calculate_spreadsheet_analysis(self.source_path, plan, domain="generic")
        self.assertTrue(result.is_success, result.error)
        self.assertEqual(len(result.data["facts"]), 1)
        self.assertEqual(result.data["facts"][0]["value"], "124020")

    def test_operator_shorthand_normalization(self):
        raw_plan = {
            "tables": [{"id": "t1", "sheet": "Sheet1", "data_range": "A1:B5", "header_row": 1}],
            "calculations": [
                {"id": "c1", "label": "C1", "expression": {"aggregate": "sum", "column": "B", "table": "t1"}},
                {"id": "c2", "label": "C2", "expression": {"multiply": [{"ref": "c1"}, {"constant": 2}]}},
                {"id": "c3", "label": "C3", "expression": {"divide": [{"ref": "c2"}, {"ref": "c1"}]}},
            ],
        }
        norm, changes = normalize_plan(raw_plan)
        c2_expr = norm["calculations"][1]["expression"]
        self.assertEqual(c2_expr["op"], "multiply")
        self.assertEqual(len(c2_expr["args"]), 2)
        c3_expr = norm["calculations"][2]["expression"]
        self.assertEqual(c3_expr["op"], "divide")
        self.assertEqual(len(c3_expr["args"]), 2)

    def test_query_result_preserves_semantic_domain(self):
        plan = {
            "query": {
                "source": {
                    "sheet": "利润表",
                    "header_row": 3,
                    "data_range": "A4:C8",
                },
                "where": {
                    "field": "项目",
                    "op": "in",
                    "values": ["营业收入", "毛利", "营业利润", "净利润"],
                },
                "group_by": ["项目"],
                "metrics": [
                    {
                        "id": "actual",
                        "label": "2026年实际",
                        "field": "2026实际",
                        "op": "value",
                        "unit": "元",
                    }
                ],
            }
        }
        res = calculate_spreadsheet_analysis(self.source_path, plan, domain="finance")
        self.assertTrue(res.is_success, res.error)
        self.assertEqual(res.data.get("semantic_domain"), {"id": "finance", "version": "1"})


if __name__ == "__main__":
    unittest.main()
