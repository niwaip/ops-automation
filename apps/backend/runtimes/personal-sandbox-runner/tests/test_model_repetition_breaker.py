"""Unit tests for streaming thinking and text repetition loop circuit breaker."""
import json
import unittest
from unittest.mock import patch, MagicMock

from dsh_modules.llm import (
    detect_repetition_loop,
    ModelRepetitionLoopError,
    _process_sse_data
)
from dsh_modules.agent_loop import run_agent_loop
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats


class ModelRepetitionBreakerTests(unittest.TestCase):
    def test_detect_repetition_loop_identifies_thinking_loop(self):
        repeated_sentence = (
            "如果搜到具体的比赛，就整理。如果搜不到，我就尝试抓取。fetch_page(url)如果抓取失败，我就说抱歉。但我应该再搜一下。"
        )
        looping_thought = repeated_sentence * 4
        result = detect_repetition_loop(looping_thought)
        self.assertIsNotNone(result)
        pattern, count = result
        self.assertGreaterEqual(count, 3)
        self.assertIn("如果搜到具体的比赛", pattern)

    def test_detect_repetition_loop_ignores_normal_list_and_code(self):
        normal_list = (
            "- 第一项：完成登录模块开发与鉴权接入\n"
            "- 第二项：完成数据表结构设计与迁移脚本\n"
            "- 第三项：编写单元测试用例并核验断言\n"
            "- 第四项：部署到测试环境进行整体联调\n"
        )
        self.assertIsNone(detect_repetition_loop(normal_list))

        code_snippet = (
            "for i in range(10):\n"
            "    print(f'step {i}')\n"
            "for j in range(10):\n"
            "    print(f'step {j}')\n"
        )
        self.assertIsNone(detect_repetition_loop(code_snippet))

        divider = "---------------------------------------------------------\n" * 5
        self.assertIsNone(detect_repetition_loop(divider))

    def test_process_sse_data_raises_breaker_on_thinking_loop(self):
        thought_chunks = []
        chunks = []
        tool_deltas = {}

        repeated_unit = "【思考中】：西甲赛程如果搜不到就抓取页面，抓不到就换关键词搜索。"
        # Send chunks one by one
        with self.assertRaises(ModelRepetitionLoopError) as ctx:
            for _ in range(16):
                sse_payload = json.dumps({
                    "choices": [{
                        "delta": {"reasoning_content": repeated_unit}
                    }]
                })
                _process_sse_data(
                    sse_payload,
                    chunks=chunks,
                    tool_call_deltas=tool_deltas,
                    start_time=0.0,
                    ttft_ms=None,
                    stream_deltas=False,
                    thought_chunks=thought_chunks
                )

        self.assertIn("思考链", str(ctx.exception))
        self.assertEqual(ctx.exception.target, "thought")

    def test_agent_loop_catches_repetition_breaker_and_emits_guidance(self):
        policy = RuntimePolicy()
        telemetry = TelemetryStats()
        messages = [{"role": "user", "content": "查看今天 西甲的比赛"}]

        # Mock call_model_proxy to simulate tripping the breaker during planning
        def mock_failing_call(*args, **kwargs):
            raise ModelRepetitionLoopError(
                "检测到大模型在生成推理思考链时陷入死循环（模式长 50 字，已连续复读 3 次）",
                pattern="西甲赛程如果搜不到就抓取页面，抓不到就换关键词搜索。",
                repeat_count=3,
                target="thought"
            )

        with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=mock_failing_call):
            res = run_agent_loop(
                messages=messages,
                model="default",
                policy=policy,
                max_rounds=5,
                telemetry=telemetry,
                user_prompt="查看今天 西甲的比赛"
            )

        self.assertIn("模型推理陷入死循环，已触发主动熔断保护", res.final_text)
        self.assertIn("请直接重新发送指令，或稍后点击重试", res.final_text)
        guard_names = [g.get("guard") for g in telemetry.guard_decisions]
        self.assertIn("model_repetition_breaker", guard_names)


if __name__ == "__main__":
    unittest.main()
