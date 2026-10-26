"""
Unit tests for completion_evaluator module.
Verifies multi-dimensional acceptance, tool completion evaluation, and transition to deliverable phase.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))

from dsh_modules.completion_evaluator import (
    CompletionDecision,
    evaluate_tool_execution_turn,
    evaluate_no_tool_turn,
    extract_evidence_summary,
)
from dsh_modules.tool_result import ToolResult


class MockAnalysisTurn:
    def __init__(self, may_finish_val=True):
        self._may_finish_val = may_finish_val

    def may_finish(self, evidence):
        return self._may_finish_val


class TestCompletionEvaluator(unittest.TestCase):
    def test_decision_tuple_unpacking(self):
        d = CompletionDecision(action="continue", guard_msg="Please retry", max_rounds=5)
        action, msg, rounds = d
        self.assertEqual(action, "continue")
        self.assertEqual(msg, "Please retry")
        self.assertEqual(rounds, 5)

    def test_tool_execution_pure_analysis_finishes(self):
        turn = MockAnalysisTurn(may_finish_val=True)
        should_finish, transition_msg, max_rounds = evaluate_tool_execution_turn(
            analysis_turn=turn,
            execution_evidence=[],
            active_tools=[],
            deadline=None,
            telemetry=None,
            has_visual_or_deliverable=False,
            outbound_files=[],
            reply_text="",
            round_idx=0,
            max_rounds=3,
            task_ceiling=10,
        )
        self.assertTrue(should_finish)
        self.assertIsNone(transition_msg)

    def test_tool_execution_hybrid_task_transitions_to_delivery_with_facts(self):
        turn = MockAnalysisTurn(may_finish_val=True)
        ev = ToolResult.success(
            data={
                "kind": "spreadsheet_analysis",
                "facts": [
                    {"label": "金额合计", "value": "1637.42", "unit": "K"}
                ],
                "rows": [
                    {"部门名称": "華東MIS", "金额(K)": 587.23},
                    {"部门名称": "華東BAS", "金额(K)": 328.78}
                ]
            },
            provenance={"tool": "aggregate_spreadsheet"}
        )

        should_finish, transition_msg, max_rounds = evaluate_tool_execution_turn(
            analysis_turn=turn,
            execution_evidence=[ev],
            active_tools=[],
            deadline=None,
            telemetry=None,
            has_visual_or_deliverable=True,
            outbound_files=[],
            reply_text="",  # No HTML yet
            round_idx=0,
            max_rounds=2,
            task_ceiling=10,
        )
        self.assertFalse(should_finish, "Should not finish when deliverable is still pending")
        self.assertIsNotNone(transition_msg)
        self.assertIn("【表格数据核算完成，请执行可视化呈现与交付阶段】", transition_msg)
        self.assertIn("1637.42 K", transition_msg)
        self.assertIn("華東MIS", transition_msg)
        self.assertGreaterEqual(max_rounds, 2)

    def test_tool_execution_hybrid_task_finishes_when_html_delivered(self):
        turn = MockAnalysisTurn(may_finish_val=True)
        ev = ToolResult.success(
            data={"kind": "spreadsheet_analysis", "facts": [{"label": "金额", "value": 100}]},
            provenance={"tool": "aggregate_spreadsheet"}
        )
        reply = "✨ 看板已生成\n```html\n<!DOCTYPE html><html><body><h1>看板</h1></body></html>\n```"

        should_finish, transition_msg, max_rounds = evaluate_tool_execution_turn(
            analysis_turn=turn,
            execution_evidence=[ev],
            active_tools=[],
            deadline=None,
            telemetry=None,
            has_visual_or_deliverable=True,
            outbound_files=[],
            reply_text=reply,
            round_idx=1,
            max_rounds=4,
            task_ceiling=10,
        )
        self.assertTrue(should_finish, "Should finish when HTML is already delivered")
        self.assertIsNone(transition_msg)

    def test_evaluate_no_tool_turn_zero_tool_calculation(self):
        prompt = "【当前轮次用户上传附件】: 明细.xlsx\n用户指令：按部门统计 金额的合计，不包含（WBS编号）中ex开头的数据，生成柱状图"
        reply = "按部门统计如下：华东MIS金额为 1,887.73 K\n```html\n<table><tr><td>1887.73</td></tr></table>\n```"

        decision = evaluate_no_tool_turn(
            reply_text=reply,
            last_user_prompt=prompt,
            round_idx=0,
            max_rounds=3,
            start_ts=0.0,
            execution_evidence=[],
            executed_calls_history=[],
        )
        self.assertEqual(decision.action, "continue")
        self.assertIn("系统数据核验拦截", decision.guard_msg)
        self.assertEqual(decision.category, "zero_tool_calculation")


if __name__ == '__main__':
    unittest.main()
