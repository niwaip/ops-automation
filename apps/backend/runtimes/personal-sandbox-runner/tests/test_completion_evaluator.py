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

    def may_finish(self, evidence, *args, **kwargs):
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
        reply = "✨ 看板已生成\n```html\n<!DOCTYPE html><html><body><h1>看板</h1><p>金额: 100</p></body></html>\n```"

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

    def test_extract_evidence_summary_authoritative_supersedes_stale(self):
        # 模拟审计问题1：早期探索性试算产生100~109，后续权威纠偏计算产生777
        r1 = ToolResult.success(
            data={"facts": [{"id": f"fact_{i}", "label": f"指标_{i}", "value": 100 + i} for i in range(10)]},
            provenance={"workbook_id": "wb_test", "tool": "aggregate_spreadsheet"}
        )
        r2 = ToolResult.success(
            data={"facts": [{"id": "final_metric", "label": "最终权威金额", "value": 777, "unit": "元"}]},
            provenance={"workbook_id": "wb_test", "tool": "aggregate_spreadsheet"}
        )
        summary = extract_evidence_summary([r1, r2], prompt="统计最终权威金额")
        self.assertIn("777 元", summary)
        self.assertNotIn("指标_0", summary, "旧的探索性试算数据应被淘汰")

    def test_evaluate_tool_execution_turn_deliverable_not_satisfied_by_missing_file_or_empty_html(self):
        # 模拟审计问题2：用户要求HTML看板，outbound_files仅有不存在的路径，且HTML为占位说明
        turn = MockAnalysisTurn(may_finish_val=True)
        ev = ToolResult.success(
            data={"facts": [{"label": "金额", "value": 100}]},
            provenance={"tool": "aggregate_spreadsheet"}
        )
        prompt = "按部门统计 金额的合计，生成柱状图与HTML看板"
        reply_with_mock_html = "```html\n<!DOCTYPE html><html><body><h1>看板</h1><p>数据待填充...</p></body></html>\n```"

        should_finish, transition_msg, max_rounds = evaluate_tool_execution_turn(
            analysis_turn=turn,
            execution_evidence=[ev],
            active_tools=[],
            deadline=None,
            telemetry=None,
            has_visual_or_deliverable=True,
            outbound_files=["/nonexistent/missing/notes.md"],
            reply_text=reply_with_mock_html,
            round_idx=0,
            max_rounds=2,
            task_ceiling=10,
            last_user_prompt=prompt,
        )
        self.assertFalse(should_finish, "虚假/不存在的交付物不应判定为完成")
        self.assertIsNotNone(transition_msg)
        self.assertIn("【表格数据核算完成，请执行可视化呈现与交付阶段】", transition_msg)

    def test_evaluate_no_tool_turn_read_only_plan_preview_not_forced_to_execute(self):
        # 模拟审计问题3：只读预览或未授权execute_spreadsheet_update时，不强制要求调用execute
        read_only_tools = [{"function": {"name": "plan_spreadsheet_update"}}]
        plan_ev = ToolResult.success(
            data={"status": "planned", "plan_id": "p_123", "plan": {"actions": []}},
            provenance={"tool": "plan_spreadsheet_update"}
        )
        prompt = "只生成表格更新计划方案，不要执行"
        reply = "已为您生成更新方案：1. 复制原表为1026；2. 数据回填完成。请查阅。"

        decision = evaluate_no_tool_turn(
            reply_text=reply,
            last_user_prompt=prompt,
            round_idx=1,
            max_rounds=5,
            start_ts=0.0,
            tools=read_only_tools,
            execution_evidence=[plan_ev],
            executed_calls_history=["plan_spreadsheet_update:ok"],
        )
        self.assertNotEqual(decision.category, "spreadsheet_update_force", "只读预览模式不应强制要求execute")
        self.assertEqual(decision.action, "pass")

    def test_hard_ceiling_not_breached_by_spreadsheet_update_force(self):
        # 模拟审计问题4：当round_idx接近上限时，绝不能突破hard_ceiling
        tools_with_execute = [
            {"function": {"name": "plan_spreadsheet_update"}},
            {"function": {"name": "execute_spreadsheet_update"}},
        ]
        plan_ev = ToolResult.success(
            data={"status": "planned", "plan_id": "p_456", "plan": {"actions": []}},
            provenance={"tool": "plan_spreadsheet_update"}
        )
        prompt = "更新表格并交付"
        reply = "我已规划好方案。"

        # 场景 A: round_idx = 23, hard_ceiling = 24 (round_idx >= hard_ceiling - 1)
        decision_at_ceiling = evaluate_no_tool_turn(
            reply_text=reply,
            last_user_prompt=prompt,
            round_idx=23,
            max_rounds=23,
            hard_ceiling=24,
            start_ts=0.0,
            tools=tools_with_execute,
            execution_evidence=[plan_ev],
            executed_calls_history=["plan_spreadsheet_update:ok"],
        )
        self.assertEqual(decision_at_ceiling.action, "break", "达到硬上限时应阻断追加")
        self.assertLessEqual(decision_at_ceiling.max_rounds, 24)

        # 场景 B: round_idx = 20, hard_ceiling = 24
        decision_bumped = evaluate_no_tool_turn(
            reply_text=reply,
            last_user_prompt=prompt,
            round_idx=20,
            max_rounds=21,
            hard_ceiling=24,
            start_ts=0.0,
            tools=tools_with_execute,
            execution_evidence=[plan_ev],
            executed_calls_history=["plan_spreadsheet_update:ok"],
        )
        self.assertEqual(decision_bumped.action, "continue")
        self.assertLessEqual(decision_bumped.max_rounds, 24, "追加预算绝不能击穿硬上限")


if __name__ == '__main__':
    unittest.main()
