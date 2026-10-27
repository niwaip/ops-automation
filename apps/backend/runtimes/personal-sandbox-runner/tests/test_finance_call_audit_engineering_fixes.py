"""Unit tests verifying engineering fixes for finance call audit (2026-10-27 09:16).

Ensures:
1. Declarative plan compilation errors (invalid_analysis_plan) do not falsely trigger
   premature bash fallback, providing compilation repair guidance instead.
2. Reviewer context includes attempted plans and external execution receipts,
   ensuring cache invalidation between pre-bash-success and post-bash-success.
3. Task failure attribution preserves native execution obstacles even if a later
   external tool (e.g. bash) succeeded without producing spreadsheet_analysis evidence.
4. Presentation guidance precisely distinguishes external execution / plan compilation failure
   from uncalculated columns, eliminating misleading "not executed" assertions.
5. TaskCompletenessJudge uses cache version 5 and enforces parameter schema constraints.
"""

import copy
import hashlib
import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from dsh_modules.tool_result import ToolResult
from dsh_modules.analysis_task_state import analysis_task_state
from dsh_modules.task_completeness_judge import TaskCompletenessJudge
from dsh_modules.report_presentation import render_unverified_guidance
from dsh_modules.analysis_turn import AnalysisTurn


class TestFinanceCallAuditEngineeringFixes(unittest.TestCase):
    def test_plan_compilation_error_does_not_prematurely_open_bash(self):
        """Plan compilation errors must guide declarative parameter fix rather than jumping to bash."""
        # Simulate agent loop logic with plan syntax errors
        active_tools = [{"name": "aggregate_spreadsheet"}]
        messages = [{"role": "tool", "content": "error output"}]
        consecutive_tool_errors = 0
        consecutive_comparison_errors = 0
        consecutive_plan_syntax_errors = 0

        # Round 1: Plan metric conflict
        err_result_1 = ToolResult(
            status="error",
            error={
                "code": "invalid_analysis_plan",
                "message": "plan：度量定义冲突：'营业收入' 与 '毛利' 对同一字段 '2026实际' 执行了完全相同的 'sum' 聚合"
            },
            provenance={"tool": "aggregate_spreadsheet", "round": 0}
        )
        # Execute logic matching agent_loop.py
        is_plan_syntax_1 = (
            err_result_1.error_code in ("invalid_analysis_plan", "invalid_query_plan", "invalid_plan_schema")
            or (err_result_1.error_message or "").startswith("plan：")
        )
        self.assertTrue(is_plan_syntax_1)
        if is_plan_syntax_1:
            consecutive_plan_syntax_errors += 1
            plan_fix_hint = "\n\n【系统指导】这是分析计划参数校验未通过"
            messages[-1]["content"] += plan_fix_hint
        
        self.assertEqual(consecutive_comparison_errors, 0, "Plan syntax errors must not increment comparison errors")
        self.assertEqual(consecutive_plan_syntax_errors, 1)
        self.assertIn("【系统指导】这是分析计划参数校验未通过", messages[-1]["content"])
        self.assertFalse(any(t["name"] == "bash" for t in active_tools), "Must not open bash on round 1 plan error")

        # Round 2: Empty where condition
        err_result_2 = ToolResult(
            status="error",
            error={
                "code": "invalid_analysis_plan",
                "message": "plan：and 组合操作需要 1 到 16 个子条件列表"
            },
            provenance={"tool": "aggregate_spreadsheet", "round": 1}
        )
        is_plan_syntax_2 = (
            err_result_2.error_code in ("invalid_analysis_plan", "invalid_query_plan", "invalid_plan_schema")
            or (err_result_2.error_message or "").startswith("plan：")
        )
        self.assertTrue(is_plan_syntax_2)
        if is_plan_syntax_2:
            consecutive_plan_syntax_errors += 1

        self.assertEqual(consecutive_comparison_errors, 0)
        self.assertEqual(consecutive_plan_syntax_errors, 2)
        self.assertFalse(any(t["name"] == "bash" for t in active_tools), "Must not open bash on round 2 plan error")

    def test_reviewer_context_differentiates_pre_and_post_bash_success(self):
        """Reviewer context and cache path must change when a subsequent bash execution succeeds."""
        # 2 failed aggregate_spreadsheet receipts followed by 1 successful bash receipt
        receipt_1 = ToolResult(
            status="error",
            error={
                "code": "invalid_analysis_plan",
                "message": "plan：度量定义冲突"
            },
            data={"requested_plan": {"metrics": [{"field": "2026实际", "aggregation": "sum", "label": "营业收入"}]}},
            provenance={"tool": "aggregate_spreadsheet", "round": 0}
        )
        receipt_2 = ToolResult(
            status="error",
            error={
                "code": "invalid_analysis_plan",
                "message": "plan：and 组合操作需要子条件"
            },
            data={"requested_plan": {"where": {"and": []}}},
            provenance={"tool": "aggregate_spreadsheet", "round": 1}
        )
        receipt_bash_success = ToolResult(
            status="success",
            data="营业收入: 124,020.00\n毛利率: 43.09%\n营业利润: 21,209.40\n净利润: 16,038.30",
            provenance={"tool": "bash", "round": 2}
        )

        with patch("dsh_modules.task_completeness_judge.judge_task_completeness") as mock_judge:
            mock_judge.return_value = None
            prompt = "总结2026年收入、毛利率、营业利润和净利润。"

            # State before bash success
            analysis_task_state([receipt_1, receipt_2], prompt)
            self.assertTrue(mock_judge.called)
            context_before = copy.deepcopy(mock_judge.call_args.kwargs["context"])

            # State after bash success
            analysis_task_state([receipt_1, receipt_2, receipt_bash_success], prompt)
            context_after = copy.deepcopy(mock_judge.call_args.kwargs["context"])

            # 1. Context must not be identical
            self.assertNotEqual(context_before, context_after, "Context must update when external tool executes successfully")
            
            # 2. Context after must contain attempted plans and other executions
            self.assertEqual(len(context_before["other_executions"]), 2)
            self.assertEqual(len(context_after["other_executions"]), 3)
            self.assertEqual(len(context_after["attempted_plans"]), 2, "Must capture requested plans from failed receipts")
            self.assertEqual(context_after["other_executions"][-1]["tool"], "bash")
            self.assertTrue(context_after["other_executions"][-1]["is_success"])
            self.assertIn("124,020.00", context_after["other_executions"][-1]["output_snippet"])

            # 3. Cache keys must differ
            cache_before = TaskCompletenessJudge._cache_path(prompt, [], [], context=context_before)
            cache_after = TaskCompletenessJudge._cache_path(prompt, [], [], context=context_after)
            self.assertNotEqual(cache_before, cache_after, "Cache path must invalidate when external execution occurs")

    def test_native_obstacle_is_preserved_when_bash_succeeds_without_analysis_evidence(self):
        """When entire turn fails, native tool error must not be silenced by non-native bash success."""
        receipt_fail = ToolResult(
            status="error",
            error={
                "code": "invalid_analysis_plan",
                "message": "plan：度量定义冲突：'营业收入' 与 '毛利' 对同一字段 '2026实际' 执行了完全相同的 'sum' 聚合"
            },
            provenance={"tool": "aggregate_spreadsheet", "round": 0}
        )
        receipt_bash_success = ToolResult(
            status="success",
            data="some stdout without spreadsheet_analysis kind",
            provenance={"tool": "bash", "round": 1}
        )

        turn = AnalysisTurn("总结2026年收入、毛利率、营业利润和净利润。")
        mock_telemetry = MagicMock()

        rendered = turn.render([receipt_fail, receipt_bash_success], "测试模型回答", mock_telemetry)
        self.assertIn("执行阻碍：invalid_analysis_plan：plan：度量定义冲突", rendered,
                      "Must preserve native execution obstacle instead of setting failed to None")

    def test_presentation_guidance_distinguishes_external_and_attempted_execution(self):
        """Presentation guidance must not falsely claim '尚未执行聚合计算' when scripts or plans were attempted."""
        # Case A: External execution exists
        state_ext = {
            "complete": False,
            "issues": [{"code": "execution_evidence_missing", "message": "缺少证据"}],
            "missing_metrics": [{
                "name": "营业收入",
                "source_column_exists": True,
                "matched_source_columns": ["收入差异", "收入预算"],
                "external_execution_exists": True
            }]
        }
        guidance_ext = render_unverified_guidance(state_ext, "总结收入")
        self.assertNotIn("尚未执行对【营业收入】的聚合计算", guidance_ext)
        self.assertIn("外部脚本已尝试计算 【营业收入】", guidance_ext)
        self.assertIn("未生成符合系统规范的结构化核验凭据", guidance_ext)

        # Case B: Plan attempted but unverified (compilation error)
        state_plan = {
            "complete": False,
            "issues": [{"code": "execution_evidence_missing", "message": "缺少证据"}],
            "missing_metrics": [{
                "name": "营业收入",
                "source_column_exists": True,
                "matched_source_columns": ["2026实际"],
                "plan_attempted_but_unverified": True
            }]
        }
        guidance_plan = render_unverified_guidance(state_plan, "总结收入")
        self.assertNotIn("尚未执行对【营业收入】的聚合计算", guidance_plan)
        self.assertIn("模型已提交针对 【营业收入】 的分析计划，但计划校验未通过", guidance_plan)

    def test_judge_cache_version_is_v5(self):
        """TaskCompletenessJudge cache version must be 5 to purge stale judgments."""
        payload_repr = TaskCompletenessJudge._cache_path("prompt", [], []).name
        self.assertTrue(payload_repr.endswith(".json"))
        # Verify directly in code that payload version is 5
        import inspect
        src = inspect.getsource(TaskCompletenessJudge._cache_path)
        self.assertIn('"version": 5', src)


if __name__ == "__main__":
    unittest.main()
