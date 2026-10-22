"""
Tests for SemanticFilterJudge and relaxed filter resolution.
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))

from dsh_modules.analysis_contract import build_analysis_contract
from dsh_modules.analysis_fact_selection import resolve_conforming_facts
from dsh_modules.analysis_turn import AnalysisTurn
from dsh_modules.semantic_filter_judge import SemanticFilterJudge, judge_filter_conformance
from dsh_modules.spreadsheet_request import prefix_requirement, explicit_filters
from dsh_modules.tool_result import ToolResult


class SemanticFilterJudgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache_dir = Path(self.tmp.name)
        SemanticFilterJudge._CACHE_DIR = self.cache_dir

    def test_judge_conformance_with_mocked_llm_and_cache(self):
        prompt = "只要WBS以EX、SY开头的明细，汇总金额"
        filters = [{"column": "WBS编号", "op": "prefix", "prefixes": ["ex", "sy"]}]
        headers = {"A": "WBS编号", "B": "金额"}

        mock_reply = {
            "content": json.dumps({"matched": True, "reason": "Filters match user requested prefixes."})
        }

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy", return_value=mock_reply) as mock_proxy:
            # First invocation calls LLM
            res1 = judge_filter_conformance(prompt, filters, headers)
            self.assertTrue(res1)
            self.assertEqual(mock_proxy.call_count, 1)

            # Second invocation hits disk cache, no LLM call
            res2 = judge_filter_conformance(prompt, filters, headers)
            self.assertTrue(res2)
            self.assertEqual(mock_proxy.call_count, 1)

    def test_judge_conformance_negative_verdict(self):
        prompt = "排除WBS以EX开头的明细"
        # Candidate filter did positive match instead of exclude
        filters = [{"column": "WBS编号", "op": "prefix", "prefixes": ["ex"]}]
        headers = {"A": "WBS编号", "B": "金额"}

        mock_reply = {
            "content": json.dumps({"matched": False, "reason": "User requested exclude but filter included."})
        }

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy", return_value=mock_reply):
            res = judge_filter_conformance(prompt, filters, headers)
            self.assertFalse(res)

    def test_judge_conformance_fallback_when_offline(self):
        prompt = "只要WBS以EX开头的明细"
        filters = [{"column": "WBS编号", "op": "prefix", "prefixes": ["ex"]}]

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=False):
            res = judge_filter_conformance(prompt, filters)
            self.assertIsNone(res)

    def test_user_reported_case_filter_resolution_and_group_cleaning(self):
        prompt = (
            "帮我统计下附件中按 部门编号的分组统计的金额 的数据， "
            "只包含WBS编号 中ex，sy，sp，ip，ib，sz开头的数据"
        )
        headers = {
            "A": "会计年度", "B": "工数年月", "C": "部门编号", "D": "部门名称",
            "I": "WBS编号", "P": "金额(K)"
        }

        # 1. Contract parses cleaned group_dimension without trailing '的'
        contract = build_analysis_contract(prompt)
        self.assertEqual(contract.group_dimension, "部门编号")
        self.assertTrue(contract.has_filters)

        # 2. prefix_requirement resolves '只包含' as positive prefix filter without ValueError
        req = prefix_requirement(prompt, headers)
        self.assertIsNotNone(req)
        self.assertEqual(req["column"], "I")
        self.assertEqual(req["op"], "prefix")
        self.assertEqual(set(req["prefixes"]), {"ex", "sy", "sp", "ip", "ib", "sz"})

        # 3. Fact resolution keeps matching receipts
        receipt_data = {
            "kind": "spreadsheet_analysis",
            "evidence_id": "ev_01",
            "coverage": [{
                "id": "t",
                "headers": headers,
                "filters": [{"op": "prefix", "column": "WBS编号", "prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"], "case_sensitive": False}],
                "coverage_complete": True
            }],
            "plan": {
                "tables": [{"id": "t", "headers": headers, "filters": [{"op": "prefix", "column": "WBS编号", "prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"]}]}],
                "calculations": [{"id": "c1", "expression": {"table": "t", "column": "金额(K)", "aggregate": "sum"}}]
            },
            "facts": [{"id": "c1", "label": "金额", "value": "250311.12", "unit": "元", "matched_records": 21}]
        }
        r = ToolResult(status="success", data=receipt_data)
        facts = resolve_conforming_facts([r], prompt)
        self.assertEqual(len(facts), 1)
        self.assertEqual(facts[0]["value"], "250311.12")

    def test_user_reported_negation_wbs_exclusion_and_judge(self):
        """验证对'不包含...开头'的否定前缀指令，LLM-as-a-Judge 与规则层均严格收敛至 exclude_prefix 且拒绝错误包含"""
        prompt = (
            "帮我统计下附件中按 部门编号的分组统计的金额 的数据， "
            "不包含WBS编号 中ex，sy，sp，ip，ib，sz开头的数据"
        )
        headers = {
            "A": "会计年度", "B": "工数年月", "C": "部门编号", "D": "部门名称",
            "I": "WBS编号", "P": "金额(K)"
        }

        # 1. 规则 fallback 层：'不包含' 绝不会因子串 '包含' 误判为 prefix
        req = prefix_requirement(prompt, headers)
        self.assertIsNotNone(req)
        self.assertEqual(req["column"], "I")
        self.assertEqual(req["op"], "exclude_prefix")
        self.assertEqual(set(req["prefixes"]), {"ex", "sy", "sp", "ip", "ib", "sz"})

        # 2. 构造两个事实候选：一个正确排除了前缀 (253条)，一个错误包含了前缀 (21条)
        receipt_wrong = ToolResult(status="success", data={
            "kind": "spreadsheet_analysis",
            "evidence_id": "ev_wrong",
            "coverage": [{"id": "t", "headers": headers, "filters": [{"op": "prefix", "column": "WBS编号", "prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"]}]}],
            "plan": {"tables": [{"id": "t", "headers": headers, "filters": [{"op": "prefix", "column": "WBS编号", "prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"]}]}]},
            "facts": [{"id": "c1", "label": "金额", "value": "250.31", "unit": "K", "matched_records": 21}]
        })
        receipt_correct = ToolResult(status="success", data={
            "kind": "spreadsheet_analysis",
            "evidence_id": "ev_correct",
            "coverage": [{"id": "t", "headers": headers, "filters": [{"op": "exclude_prefix", "column": "WBS编号", "prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"]}]}],
            "plan": {"tables": [{"id": "t", "headers": headers, "filters": [{"op": "exclude_prefix", "column": "WBS编号", "prefixes": ["ex", "sy", "sp", "ip", "ib", "sz"]}]}]},
            "facts": [{"id": "c1", "label": "金额", "value": "1637.42", "unit": "K", "matched_records": 253}]
        })

        # 3. LLM-as-a-Judge 介入裁决：准确通过 exclude_prefix 并剔除 prefix
        def mock_judge_call(messages, *args, **kwargs):
            user_msg = messages[-1]["content"]
            if "exclude_prefix" in user_msg:
                return {"content": json.dumps({"matched": True, "reason": "Accurately excluded requested prefixes."})}
            return {"content": json.dumps({"matched": False, "reason": "Prompt requested exclude but filter included."})}

        with patch("dsh_modules.analysis_synthesis._can_reach_proxy", return_value=True), \
             patch("dsh_modules.llm.call_model_proxy", side_effect=mock_judge_call):
            conforming = resolve_conforming_facts([receipt_wrong, receipt_correct], prompt)
            self.assertEqual(len(conforming), 1)
            self.assertEqual(conforming[0]["value"], "1637.42")
            self.assertEqual(conforming[0]["matched_records"], 253)

    def test_outdated_error_not_blamed_when_later_turns_succeed(self):
        prompt = "统计金额"
        # Round 1 error, Round 2 success
        err_receipt = ToolResult(status="error", error={"code": "invalid_plan", "message": "prefix_length error"})
        succ_receipt = ToolResult(status="success", data={"kind": "spreadsheet_analysis", "evidence_id": "ev1", "facts": []})

        turn = AnalysisTurn(prompt)
        class MockTelemetry:
            def record_guard(self, *args, **kwargs):
                pass

        # When evidence has success after error, render should not present the outdated round 1 error as current obstacle
        with patch("dsh_modules.report_presentation.render_unverified_guidance") as mock_guide, \
             patch("dsh_modules.analysis_turn.analysis_task_state", return_value={"complete": False, "evidence_ids": ["ev1"], "missing_metrics": [], "issues": []}):
            turn.render([err_receipt, succ_receipt], model_text="", telemetry=MockTelemetry())
            # detail arg to render_unverified_guidance should be empty
            detail_passed = mock_guide.call_args[0][2]
            self.assertEqual(detail_passed, "")


if __name__ == "__main__":
    unittest.main()
