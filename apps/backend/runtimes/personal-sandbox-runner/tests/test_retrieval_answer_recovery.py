"""Regression for the sports call and bounded delivery recovery failure modes."""
import io
import json
import sys
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from dsh_modules.agent_loop import _finalize_agent_text, run_agent_loop
from dsh_modules.retrieval_answer_recovery import ensure_retrieval_answer, INCOMPLETE_ANSWER
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult

PROMPT = "今天的体育赛事"
TITLE = "2026年10月22日（周四）体育赛果与热点速览"
BODY = "今日赛程：19:35，A 队对 B 队。\n来源：[赛程](https://example.com/schedule)"
RECEIPT = ToolResult.success(BODY, provenance={"tool": "web_search", "round": 0})


class RetrievalAnswerRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.policy = RuntimePolicy(thinking=True, reasoning_effort="medium")
        self.telemetry = TelemetryStats()
        self.messages = [{"role": "user", "content": PROMPT}]
        self.model = Mock(return_value={"content": BODY, "finish_reason": "stop", "received_done": True})

    def recover(self, text=TITLE, **overrides):
        args = dict(prompt=PROMPT, messages=self.messages, evidence=[RECEIPT], telemetry=self.telemetry,
                    model="selected-model", policy=self.policy, deadline=time.monotonic() + 90,
                    call_model=self.model)
        args.update(overrides)
        with redirect_stdout(io.StringIO()):
            return ensure_retrieval_answer(text, **args)

    def test_recovery_is_single_buffered_same_model_synthesis(self):
        self.assertEqual(self.recover(), BODY)
        self.model.assert_called_once()
        args, kwargs = self.model.call_args
        self.assertEqual(args[1], "selected-model")
        self.assertIn("https://example.com/schedule", json.dumps(args[0]))
        self.assertIsNone(kwargs["tools"])
        self.assertFalse(kwargs["stream_deltas"])
        self.assertFalse(kwargs["policy"].thinking)
        self.assertEqual(kwargs["policy"].model_max_retries, 0)
        self.assertLessEqual(kwargs["timeout"], 30)
        self.assertTrue(self.policy.thinking)
        self.assertEqual(self.messages, [{"role": "user", "content": PROMPT}])
        self.assertEqual(self.telemetry.answer_validation["status"], "completed")
        self.assertEqual(self.telemetry.answer_validation["attempts"], 1)

    def test_repeated_heading_has_explicit_incomplete_outcome(self):
        self.model.return_value = {"content": TITLE, "finish_reason": "stop"}
        self.assertEqual(self.recover(), INCOMPLETE_ANSWER)
        self.model.assert_called_once()
        self.assertEqual(self.telemetry.answer_validation["status"], "incomplete")

    def test_recovery_exception_never_leaks_upstream_data(self):
        self.model.side_effect = RuntimeError("api_key=private-secret")
        self.assertEqual(self.recover(), INCOMPLETE_ANSWER)
        self.assertNotIn("private-secret", self.telemetry.to_metrics_json())
        self.assertEqual(self.telemetry.answer_validation["reason"], "recovery_error_RuntimeError")

    def test_budget_exhaustion_does_not_start_extra_work(self):
        self.assertEqual(self.recover(deadline=time.monotonic() + 1), INCOMPLETE_ANSWER)
        self.model.assert_not_called()
        self.assertEqual(self.telemetry.answer_validation["attempts"], 0)
        with self.assertRaises(TimeoutError):
            self.recover(deadline=time.monotonic() - 1)

    def test_recovery_timeout_and_parent_timeout_are_distinct(self):
        self.model.side_effect = TimeoutError("local recovery window")
        self.assertEqual(self.recover(), INCOMPLETE_ANSWER)
        self.assertEqual(self.telemetry.answer_validation["reason"], "recovery_timeout")
        with patch("dsh_modules.retrieval_answer_recovery.time.monotonic", side_effect=[100, 112]):
            with self.assertRaises(TimeoutError):
                ensure_retrieval_answer(TITLE, prompt=PROMPT, messages=self.messages,
                    evidence=[RECEIPT], telemetry=self.telemetry, model="selected-model",
                    policy=self.policy, deadline=110, call_model=self.model)

    def test_token_limit_preserves_its_original_notice(self):
        limited = TITLE + "\n输出截断提醒（已达到模型单次 Token 上限）"
        self.assertEqual(self.recover(limited, token_truncated=True), limited)
        self.model.assert_not_called()
        self.assertEqual(self.telemetry.answer_validation["reason"], "length")

    def test_premature_eof_cannot_be_marked_complete_from_partial_prose(self):
        self.telemetry.finish_reason = "stream_closed_prematurely"
        self.assertEqual(self.recover(BODY), BODY)
        self.model.assert_called_once()
        self.assertTrue(any(g["reason"] == "stream_closed_prematurely"
                            and g["action"] == "reject" for g in self.telemetry.guard_decisions))

    def test_no_retrieval_no_repair_even_with_old_tool_history(self):
        self.messages.insert(0, {"role": "tool", "name": "web_search", "content": "old result"})
        self.assertEqual(self.recover(evidence=[]), TITLE)
        self.model.assert_not_called()

    def test_normal_answer_clarification_and_title_request_do_not_retry(self):
        for text, prompt in [(BODY, PROMPT), ("您想看哪个联赛？", PROMPT), (TITLE, "只要标题")]:
            self.assertEqual(self.recover(text, prompt=prompt), text)
        self.model.assert_not_called()

    def test_invalid_or_truncated_repair_cannot_be_accepted(self):
        for response in [
            {"content": BODY, "finish_reason": "length"},
            {"content": BODY, "finish_reason": "stream_closed_prematurely"},
            {"content": BODY, "tool_calls": [{"function": {"name": "bash"}}], "finish_reason": "stop"},
            {"content": "我将继续搜索获取完整结果。", "finish_reason": "stop"},
        ]:
            with self.subTest(response=response):
                self.model.reset_mock()
                self.model.return_value = response
                self.assertEqual(self.recover(), INCOMPLETE_ANSWER)
                self.model.assert_called_once()

    def test_actual_finalization_entry_point_repairs_original_title(self):
        with patch("dsh_modules.agent_loop.call_model_proxy", self.model):
            final, _ = _finalize_agent_text(
                TITLE, self.messages, "selected-model", self.policy, time.monotonic() + 90,
                False, ["web_search:{}"], False, self.telemetry,
                last_user_prompt=PROMPT, execution_evidence=[RECEIPT],
            )
        self.assertEqual(final, BODY)
        self.model.assert_called_once()

    def test_loop_search_then_heading_is_repaired_without_repeating_tools(self):
        tool = {"type": "function", "function": {"name": "web_search"}}
        response = {"content": "", "finish_reason": "tool_calls", "tool_calls": [
            {"id": "search1", "type": "function", "function": {"name": "web_search", "arguments": '{"query":"今日体育"}'}}
        ]}
        with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=[
            response, {"content": TITLE, "finish_reason": "stop"},
            {"content": BODY, "finish_reason": "stop", "received_done": True},
        ]) as model, patch("dsh_modules.agent_loop.execute_tool", return_value=BODY) as search, redirect_stdout(io.StringIO()):
            result = run_agent_loop(self.messages, "selected-model", self.policy, 3,
                                    tools=[tool], telemetry=self.telemetry, is_search_intent=True)
        self.assertEqual(result.final_text, BODY)
        self.assertEqual(model.call_count, 3)
        search.assert_called_once()
        self.assertEqual(result.telemetry.answer_validation["status"], "completed")


if __name__ == "__main__":
    unittest.main()
