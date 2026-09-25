"""
Unit tests for DeepSeek Harness (dsh) core modules.
"""

import unittest
from unittest.mock import patch
import sys
from pathlib import Path

# Add src to sys.path
src_dir = Path(__file__).resolve().parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

import os
import json
import time
import tempfile

from dsh_modules.config import VERSION
from dsh_modules.tools import (
    CITY_PINYIN, normalize_search_query, extract_query_freshness, execute_tool, SANDBOX_TOOLS,
    get_sandbox_tools, perform_web_search, fetch_weather, fetch_page, inspect_image, read_workspace_file
)
from dsh_modules.llm import parse_tool_calls, clean_output, extract_bare_json_tool_calls, is_promising_action, call_model_proxy
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.context_budget import ContextBudget
from dsh_modules.prompt_builder import build_system_prompt, build_user_turn
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.agent_loop import (
    run_agent_loop, sanitize_preview
)


class TestDshCoreModules(unittest.TestCase):

    def test_version_format(self):
        self.assertTrue(VERSION.startswith("1.3.0"))

    def test_normalize_search_query(self):
        self.assertEqual(normalize_search_query("帮我查一下天气"), "天气")
        self.assertEqual(normalize_search_query("搜索 deepseek 最新新闻"), "deepseek 最新新闻")
        self.assertEqual(normalize_search_query("查询上海"), "上海")
        self.assertEqual(normalize_search_query("调研关于他qwen 3.8 27b"), "qwen 3.8 27b")
        self.assertEqual(normalize_search_query("调研关于他qwen 3.8 27b 最近30天的"), "qwen 3.8 27b")
        self.assertEqual(normalize_search_query("查看关于它的技术方案"), "技术方案")

    def test_extract_query_freshness(self):
        self.assertEqual(extract_query_freshness("调研关于他qwen 3.8 27b 最近30天的"), "month")
        self.assertEqual(extract_query_freshness("查看近7天动态"), "week")
        self.assertEqual(extract_query_freshness("今天最新新闻"), "day")
        self.assertIsNone(extract_query_freshness("普通查询"))

    def test_city_pinyin_mapping(self):
        self.assertEqual(CITY_PINYIN.get("上海"), "Shanghai")
        self.assertEqual(CITY_PINYIN.get("北京"), "Beijing")
        self.assertEqual(CITY_PINYIN.get("广州"), "Guangzhou")

    def test_parse_tool_calls_json(self):
        raw = '下面是调用：<tool_call>{"name": "weather", "arguments": {"city": "上海"}}</tool_call>'
        calls = parse_tool_calls(raw)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "weather")
        self.assertEqual(calls[0]["params"].get("city"), "上海")

    def test_parse_tool_calls_bare_json(self):
        raw = '好的，我来执行：\n{"name": "fetch_page", "parameters": {"url": "https://example.com"}}\n'
        calls = parse_tool_calls(raw)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "fetch_page")
        self.assertEqual(calls[0]["params"].get("url"), "https://example.com")

    def test_parse_tool_calls_dsml_double_pipe(self):
        raw = (
            '<｜｜DSML｜｜ calls> '
            '<｜｜DSML｜｜ invoke name="web_search"> '
            '<｜｜DSML｜｜ parameter name="arguments" string="false">{"query": "2026年AI人工智能最新发展 大模型 进展"}</｜｜DSML｜｜ parameter> '
            '</｜｜DSML｜｜ invoke> '
            '<｜｜DSML｜｜ invoke name="web_search"> '
            '<｜｜DSML｜｜ parameter name="arguments" string="false">{"query": "AI industry latest developments September 2026 frontier models"}</｜｜DSML｜｜ parameter> '
            '</｜｜DSML｜｜ invoke> '
            '</｜｜DSML｜｜ calls>'
        )
        calls = parse_tool_calls(raw)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]["name"], "web_search")
        self.assertEqual(calls[0]["params"].get("query"), "2026年AI人工智能最新发展 大模型 进展")
        self.assertEqual(calls[1]["name"], "web_search")
        self.assertEqual(calls[1]["params"].get("query"), "AI industry latest developments September 2026 frontier models")

    def test_clean_output(self):
        raw = (
            "这是回答正文。\n"
            "<tool_call>{\"name\": \"weather\", \"arguments\": {\"city\": \"上海\"}}</tool_call>\n"
            "```json\n```\n"
            "这是回答结论。"
        )
        cleaned = clean_output(raw)
        self.assertNotIn("<tool_call>", cleaned)
        self.assertIn("这是回答正文。", cleaned)
        self.assertIn("这是回答结论。", cleaned)

    def test_clean_output_dsml(self):
        raw = (
            '<｜｜DSML｜｜ calls> '
            '<｜｜DSML｜｜ invoke name="web_search"> '
            '<｜｜DSML｜｜ parameter name="arguments" string="false">{"query": "2026年AI人工智能最新发展 大模型 进展"}</｜｜DSML｜｜ parameter> '
            '</｜｜DSML｜｜ invoke> '
            '</｜｜DSML｜｜ calls>'
        )
        cleaned = clean_output(raw)
        self.assertEqual(cleaned, "")

    def test_execute_tool_fallback(self):
        res = execute_tool("unknown_test_tool", {"foo": "bar"})
        self.assertIn("未识别工具名称", res)

    def test_is_promising_action(self):
        # 常见行动口头承诺/待继续探索垫话（漏掉 tool_call 标签）
        self.assertTrue(is_promising_action("微博页面需要登录，我换用更精确的关键词组合来搜索这个热搜话题的具体内容。"))
        self.assertTrue(is_promising_action("我换用更精确的关键词组合来搜索这个热搜话题的具体内容。"))
        self.assertTrue(is_promising_action("页面需要登录，我换用其他关键词重新搜索。"))
        self.assertTrue(is_promising_action("好的，我来查一下。"))
        self.assertTrue(is_promising_action("接下来我搜索一下10天不吃糖的具体健康影响。"))

        # 真正已完成的最终内容或普通回答
        self.assertFalse(is_promising_action("10天不吃糖身体的变化主要体现在血糖稳定、食欲减弱以及精神状态的改善。"))
        self.assertFalse(is_promising_action("处理完成"))
        self.assertFalse(is_promising_action(""))

    def test_parse_tool_calls_image_gen(self):
        raw = '<tool_call>{"name": "image_gen", "arguments": {"prompt": "cyberpunk neon cat", "aspect_ratio": "16:9"}}</tool_call>'
        calls = parse_tool_calls(raw)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "image_gen")
        self.assertEqual(calls[0]["params"].get("prompt"), "cyberpunk neon cat")
        self.assertEqual(calls[0]["params"].get("aspect_ratio"), "16:9")

    def test_sandbox_tools_schema_completeness(self):
        """AC-1: 验证 SANDBOX_TOOLS 包含全部 11 个工具且包含 vision_inspect, image_gen 与 patch_file"""
        tool_names = [t["function"]["name"] for t in SANDBOX_TOOLS]
        self.assertEqual(len(tool_names), 11)
        self.assertIn("vision_inspect", tool_names)
        self.assertIn("image_gen", tool_names)
        self.assertIn("patch_file", tool_names)
        self.assertIn("weather", tool_names)
        self.assertIn("web_search", tool_names)
        self.assertIn("fetch_page", tool_names)
        self.assertIn("read_file", tool_names)
        self.assertIn("bash", tool_names)
        self.assertIn("scan_knowledge", tool_names)
        self.assertIn("read_skill", tool_names)
        self.assertIn("send_file", tool_names)

        # 检查 read_file 是否支持 start_line 与 end_line 切片
        rf_tool = next(t for t in SANDBOX_TOOLS if t["function"]["name"] == "read_file")
        self.assertIn("start_line", rf_tool["function"]["parameters"]["properties"])
        self.assertIn("end_line", rf_tool["function"]["parameters"]["properties"])

        # 检查 vision_inspect 结构
        vi_tool = next(t for t in SANDBOX_TOOLS if t["function"]["name"] == "vision_inspect")
        self.assertIn("file_path", vi_tool["function"]["parameters"]["properties"])
        self.assertEqual(vi_tool["function"]["parameters"]["required"], ["file_path"])

        # 检查 image_gen 结构
        ig_tool = next(t for t in SANDBOX_TOOLS if t["function"]["name"] == "image_gen")
        self.assertIn("prompt", ig_tool["function"]["parameters"]["properties"])
        self.assertEqual(ig_tool["function"]["parameters"]["required"], ["prompt"])

    def test_runtime_policy_defaults_and_overrides(self):
        """AC-3: 验证 RuntimePolicy 默认策略配置与环境变量覆盖机制"""
        import os
        policy = RuntimePolicy()
        self.assertEqual(policy.max_rounds, 3)
        self.assertEqual(policy.max_history_chars, 16000)
        self.assertEqual(policy.max_tool_result_chars, 10000)

        # 动态轮数测试
        self.assertEqual(policy.determine_max_rounds("今天天气如何"), 2)
        self.assertEqual(policy.determine_max_rounds("普通任务"), 3)
        self.assertEqual(policy.determine_max_rounds("复杂原型设计", is_design_or_ppt=True), 4)
        self.assertEqual(policy.determine_max_rounds("查询上海一周的天气，并且生成一页的pdf", is_office=True), 5)
        self.assertEqual(policy.determine_max_rounds("查询上海一周的天气，并且生成一页的pdf"), 5)

        # 环境变量重载测试
        os.environ["DSH_MAX_ROUNDS"] = "5"
        os.environ["DSH_MAX_HISTORY_CHARS"] = "8000"
        try:
            custom_policy = RuntimePolicy.from_env()
            self.assertEqual(custom_policy.max_rounds, 5)
            self.assertEqual(custom_policy.max_history_chars, 8000)
        finally:
            del os.environ["DSH_MAX_ROUNDS"]
            del os.environ["DSH_MAX_HISTORY_CHARS"]

    def test_context_budget_sliding_window(self):
        """AC-3: 验证 ContextBudget 历史滑动窗口裁剪与截断安全保护"""
        # 工具输出超长截断测试
        long_result = "x" * 5000
        clipped = ContextBudget.clip_tool_result(long_result, max_chars=3000)
        self.assertTrue(len(clipped) < 3200)
        self.assertIn("自动截断", clipped)

        # 历史滑动窗口裁剪测试
        history = [
            {"role": "user", "content": "第一轮提问 " + "A" * 1500},
            {"role": "assistant", "content": "第一轮回答 " + "B" * 1500},
            {"role": "user", "content": "第二轮提问 " + "C" * 800},
            {"role": "assistant", "content": "第二轮回答 " + "D" * 800},
        ]
        budgeted, dropped_count = ContextBudget.budget_history(history, max_total_chars=2000, max_item_chars=1000)
        self.assertTrue(dropped_count > 0)
        # 应保留最近的轮次
        self.assertTrue(any("第二轮回答" in h["content"] for h in budgeted))
        self.assertFalse(any("第一轮提问" in h["content"] for h in budgeted))

    def test_prompt_builder_clean_system_prompt(self):
        """AC-1 & AC-5: 验证 PromptBuilder 产出纯净 System Prompt，绝无手写 XML 工具格式"""
        sys_prompt = build_system_prompt("/test/workspace", "/test/knowledge")
        self.assertIn("/test/workspace", sys_prompt)
        self.assertIn("/test/knowledge", sys_prompt)
        # 绝无手写工具调用标签诱导
        self.assertNotIn("<tool_call>", sys_prompt)
        self.assertNotIn("```json", sys_prompt)
        self.assertNotIn("<tool_calls>", sys_prompt)

        user_turn = build_user_turn(
            prompt="帮我分析代码",
            session_files=["main.py"],
            timestamp_str="2026年09月19日 15:00:00 星期六 (Asia/Shanghai)"
        )
        self.assertIn("[User Request]:\n帮我分析代码", user_turn)
        self.assertIn("main.py", user_turn)
        self.assertTrue(user_turn.strip().endswith("(Asia/Shanghai)"))

    def test_telemetry_stats_recording(self):
        """AC-2: 验证 TelemetryStats 遥测指标收集与序列化"""
        telemetry = TelemetryStats()
        telemetry.record_llm_response({
            "total_ms": 500,
            "ttft_ms": 120,
            "usage": {"prompt_tokens": 100, "completion_tokens": 50},
            "finish_reason": "stop"
        }, is_first_round=True)
        telemetry.record_tool_call()

        metrics_json = telemetry.to_metrics_json()
        import json
        data = json.loads(metrics_json)
        self.assertEqual(data["ttftMs"], 120)
        self.assertEqual(data["durationMs"], 500.0)
        self.assertEqual(data["toolCallsCount"], 1)
        self.assertEqual(data["tokens"]["prompt_tokens"], 100)

    def test_agent_loop_mocked_execution(self):
        """AC-2: 验证 agent_loop 处理工具调用以及最终回答组装"""
        from unittest.mock import patch

        messages = [
            {"role": "system", "content": "You are dsh"},
            {"role": "user", "content": "查一下上海天气"}
        ]
        policy = RuntimePolicy()

        # 模拟第 1 轮返回 tool_calls，第 2 轮返回最终总结
        mock_responses = [
            {
                "content": "正在为您查询上海天气",
                "tool_calls": [
                    {
                        "id": "call_123",
                        "type": "function",
                        "function": {
                            "name": "weather",
                            "arguments": '{"city": "上海"}'
                        }
                    }
                ],
                "total_ms": 300,
                "ttft_ms": 100,
                "usage": {"prompt_tokens": 50, "completion_tokens": 20},
                "finish_reason": "tool_calls"
            },
            {
                "content": "上海今天多云转晴，气温适宜。",
                "tool_calls": [],
                "total_ms": 250,
                "ttft_ms": 80,
                "usage": {"prompt_tokens": 80, "completion_tokens": 30},
                "finish_reason": "stop"
            }
        ]

        with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=mock_responses):
            result = run_agent_loop(messages, "deepseek-chat", policy, max_rounds=3)

            self.assertEqual(result.final_text, "上海今天多云转晴，气温适宜。")
            self.assertEqual(result.telemetry.tool_invocations, 1)
            # 确认 messages 中记录了 assistant tool_calls 与 tool 回传
            self.assertTrue(any(m.get("role") == "tool" and m.get("tool_call_id") == "call_123" for m in result.messages))

    def test_context_budget_atomic_tool_pairing(self):
        """验证含有 tool_calls 的 assistant 消息与对应 tool 回包成组保留或成组丢弃"""
        history = [
            {"role": "user", "content": "查天气"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "weather", "arguments": "{}"}}]
            },
            {"role": "tool", "tool_call_id": "c1", "content": "晴天25度"},
            {"role": "assistant", "content": "今天晴天25度"},
            {"role": "user", "content": "明天呢"}
        ]
        # 足够容纳所有消息
        budgeted, dropped = ContextBudget.budget_history(history, max_total_chars=1000)
        self.assertEqual(dropped, 0)
        self.assertEqual(len(budgeted), 5)

        # 预算只够保留最后两条 (明天呢 + 今天晴天25度)
        budgeted_small, dropped_small = ContextBudget.budget_history(history, max_total_chars=20)
        # 应成组丢弃前面的 user+assistant+tool，绝不留单丁 tool 或单丁 assistant(tool_calls)
        has_tool = any(m.get("role") == "tool" for m in budgeted_small)
        has_tool_call = any(m.get("role") == "assistant" and m.get("tool_calls") for m in budgeted_small)
        self.assertEqual(has_tool, has_tool_call)

    def test_context_budget_contiguous_break(self):
        """验证预算不足时立即 break，杜绝跨越非连续丢弃导致的语义断层"""
        history = [
            {"role": "user", "content": "早期短消息"},
            {"role": "assistant", "content": "中间非常非常非常非常非常非常非常非常非常长的一段回复" * 20},
            {"role": "user", "content": "最新短提问"}
        ]
        # 限制预算为 100 字符，即使“早期短消息”可以塞入，也绝不能跳过中间长消息单独保留
        budgeted, dropped = ContextBudget.budget_history(history, max_total_chars=100)
        self.assertEqual(len(budgeted), 1)
        self.assertEqual(budgeted[0]["content"], "最新短提问")
        self.assertEqual(dropped, 2)

    def test_telemetry_token_accumulation(self):
        """验证 TelemetryStats 在多轮中对 token 进行累加而非覆盖"""
        stats = TelemetryStats()
        stats.record_llm_response({
            "total_ms": 200,
            "ttft_ms": 100,
            "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
        }, is_first_round=True)
        stats.record_llm_response({
            "total_ms": 300,
            "ttft_ms": 80,
            "usage": {"prompt_tokens": 120, "completion_tokens": 60, "total_tokens": 180}
        }, is_first_round=False)

        self.assertEqual(stats.tokens["prompt_tokens"], 220)
        self.assertEqual(stats.tokens["completion_tokens"], 110)
        self.assertEqual(stats.tokens["total_tokens"], 330)
        self.assertEqual(stats.ttft_ms, 100)
        self.assertEqual(stats.total_ms, 500)

        stats.set_wall_clock_duration(850.5)
        metrics = stats.to_metrics_json()
        self.assertIn('"durationMs": 850.5', metrics)
        self.assertIn('"llmDurationMs": 500.0', metrics)

    def test_prompt_builder_model_identity(self):
        """验证模型身份去硬编码，支持动态传入真实模型架构"""
        # 默认不传模型名
        prompt_default = build_system_prompt("/workspace", "/knowledge")
        self.assertNotIn("You are DeepSeek Harness", prompt_default)
        self.assertIn("intelligent AI assistant", prompt_default)

        # 传入具体的平台模型名（例如 qwen36-35b-a3b）
        prompt_qwen = build_system_prompt("/workspace", "/knowledge", model_name="qwen36-35b-a3b")
        self.assertIn("qwen36-35b-a3b", prompt_qwen)
        self.assertIn("never falsely claim to be DeepSeek", prompt_qwen)

    def test_sanitize_preview(self):
        """验证日志脱敏函数安全遮盖 API 密钥与敏感参数"""
        raw = "cmd: curl -H 'Authorization: Bearer sk-ant-api03-abcdef123456789' password=mysecretpassword123"
        sanitized = sanitize_preview(raw, max_chars=120)
        self.assertNotIn("sk-ant-api03-abcdef123456789", sanitized)
        self.assertNotIn("mysecretpassword123", sanitized)
        self.assertIn("****", sanitized)

    def test_prompt_builder_model_display_name_and_uuid(self):
        """验证传递 model_display_name 与 UUID 时生成真实的模型身份描述"""
        prompt_with_display = build_system_prompt(
            "/workspace", "/knowledge",
            model_name="d13e0d30-b30f-48db-876a-3507d727a3c3",
            model_display_name="qwen36-35b-a3b"
        )
        self.assertIn("qwen36-35b-a3b", prompt_with_display)
        self.assertNotIn("Your underlying model runtime is d13e0d30", prompt_with_display)

        prompt_uuid_only = build_system_prompt(
            "/workspace", "/knowledge",
            model_name="d13e0d30-b30f-48db-876a-3507d727a3c3"
        )
        self.assertIn("endpoint binding: d13e0d30-b30f-48db-876a-3507d727a3c3", prompt_uuid_only)
        self.assertNotIn("Your underlying model architecture is d13e0d30", prompt_uuid_only)

    def test_monotonic_deadline_timeout(self):
        """验证任务总截止时间硬限制：当 deadline 超时时立即抛出 TimeoutError"""
        past_deadline = time.monotonic() - 1.0
        with self.assertRaises(TimeoutError):
            call_model_proxy([{"role": "user", "content": "hi"}], deadline=past_deadline)

    def test_tool_calls_accounted_in_context_budget(self):
        """验证 assistant 消息中 tool_calls 的参数大小被正确计入 block_chars 预算"""
        huge_args = "x" * 2000
        history = [
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "run_code", "arguments": json.dumps({"code": huge_args})}
                    }
                ]
            },
            {"role": "tool", "tool_call_id": "call_1", "content": "ok"}
        ]
        budgeted, dropped = ContextBudget.budget_history(history, max_total_chars=1000, max_item_chars=3000)
        self.assertEqual(len(budgeted), 0)
        self.assertEqual(dropped, 2)

    def test_agent_loop_telemetry_records_all_calls(self):
        """验证 agent_loop 中各种分支（文件发送补答、强制总结）都会被计入遥测"""
        policy = RuntimePolicy(max_rounds=3, single_request_timeout=10, total_task_timeout=30)
        mock_res_tool = {
            "content": "",
            "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "send_file", "arguments": '{"path": "a.txt"}'}}],
            "usage": {"total_tokens": 50},
            "total_ms": 100,
            "ttft_ms": 50
        }
        mock_res_final = {
            "content": "文件已发送给您",
            "tool_calls": [],
            "usage": {"total_tokens": 30},
            "total_ms": 150,
            "ttft_ms": 40
        }
        with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=[mock_res_tool, mock_res_final]):
            with patch("dsh_modules.agent_loop.execute_tool", return_value="<<<DSH_OUTBOUND_FILE:a.txt>>>"):
                res = run_agent_loop([{"role": "user", "content": "发我文件"}], "default", policy, max_rounds=2)
                self.assertEqual(res.telemetry.llm_invocations, 2)
                self.assertEqual(res.telemetry.tokens["total_tokens"], 80)

    def test_realtime_delta_streaming(self):
        """验证 call_model_proxy 流式接收时实时向 stdout 刷新 <<<DSH_DELTA:...>>>"""
        import io
        fake_sse_lines = [
            b'data: {"choices": [{"delta": {"content": "\xe4\xbd\xa0\xe5\xa5\xbd"}}]}\n',
            b'data: {"choices": [{"delta": {"content": "\xe4\xb8\x96\xe7\x95\x8c"}}]}\n',
            b'data: [DONE]\n'
        ]
        class MockResponse:
            def __enter__(self):
                return iter(fake_sse_lines)
            def __exit__(self, *args):
                pass

        captured_stdout = io.StringIO()
        with patch("urllib.request.urlopen", return_value=MockResponse()):
            with patch("sys.stdout", captured_stdout):
                res = call_model_proxy([{"role": "user", "content": "hi"}])
                self.assertEqual(res["content"], "你好世界")
                output = captured_stdout.getvalue()
                self.assertIn('<<<DSH_DELTA:"你好">>>', output)
                self.assertIn('<<<DSH_DELTA:"世界">>>', output)


    def test_execute_tool_deadline(self):
        """验证 execute_tool 在截止时间已过时抛出 TimeoutError"""
        past_deadline = time.monotonic() - 1.0
        with self.assertRaises(TimeoutError):
            execute_tool("bash", {"command": "ls"}, deadline=past_deadline)

    def test_agent_loop_deadline_raises_timeout(self):
        """验证 agent_loop 在截止时间已过时不吞没超时异常，不伪造成功返回"""
        policy = RuntimePolicy(max_rounds=3, single_request_timeout=10, total_task_timeout=30)
        past_deadline = time.monotonic() - 1.0
        with self.assertRaises(TimeoutError):
            run_agent_loop([{"role": "user", "content": "hi"}], "default", policy, max_rounds=2, deadline=past_deadline)

    def test_agent_loop_dead_loop_interception(self):
        """验证 agent_loop 检测到完全相同的工具调用反复执行时触发死循环拦截"""
        policy = RuntimePolicy(max_rounds=5, single_request_timeout=10, total_task_timeout=30)
        mock_tool_step = {
            "content": "",
            "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "read_skill", "arguments": '{"skill_name": "ppt"}'}}],
            "usage": {"total_tokens": 10},
            "total_ms": 50,
            "ttft_ms": 20
        }
        mock_final_step = {
            "content": "检测到重复调用后总结",
            "tool_calls": [],
            "usage": {"total_tokens": 10},
            "total_ms": 50,
            "ttft_ms": 20
        }
        with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=[mock_tool_step, mock_tool_step, mock_final_step]):
            with patch("dsh_modules.agent_loop.execute_tool", return_value="skill content") as mock_exec:
                res = run_agent_loop([{"role": "user", "content": "做ppt"}], "default", policy, max_rounds=5)
                # 第一次调用正常执行 execute_tool，第二次被拦截，不再调用 execute_tool
                self.assertEqual(mock_exec.call_count, 1)
                # messages 中应该收到死循环拦截提示
                has_warning = any("已调用过且参数完全一致" in m.get("content", "") for m in res.messages if m.get("role") == "tool")
                self.assertTrue(has_warning)

    def test_network_tool_weather_deadline_enforcement(self):
        """验证网络工具 (weather) 在总 deadline 超时时抛出 TimeoutError，杜绝吞没超时或返回伪成功"""
        def slow_urlopen(*args, **kwargs):
            time.sleep(0.05)
            class MockResp:
                def __enter__(self):
                    return self
                def __exit__(self, *a):
                    pass
                def read(self):
                    return json.dumps({
                        "weather": [],
                        "current_condition": [{"temp_C": "20", "FeelsLikeC": "20", "humidity": "50", "windspeedKmph": "10", "weatherDesc": [{"value": "晴"}]}]
                    }).encode("utf-8")
            return MockResp()

        deadline = time.monotonic() + 0.010  # 10ms deadline
        with patch("urllib.request.urlopen", side_effect=slow_urlopen):
            with self.assertRaises(TimeoutError):
                execute_tool("weather", {"city": "上海"}, deadline=deadline)

    def test_network_tool_search_deadline_enforcement(self):
        """验证 web_search 在超时时不返回空字符串或伪造结果，而是抛出 TimeoutError"""
        def slow_urlopen(*args, **kwargs):
            time.sleep(0.05)
            class MockResp:
                def __enter__(self):
                    return self
                def __exit__(self, *a):
                    pass
                def read(self):
                    return b"<html><body>test</body></html>"
            return MockResp()

        deadline = time.monotonic() + 0.010
        with patch("urllib.request.urlopen", side_effect=slow_urlopen):
            with self.assertRaises(TimeoutError):
                perform_web_search("天气", deadline=deadline)

    def test_image_gen_no_hardcoded_model_identity(self):
        """验证生图降级提示中去除了硬编码的 Gemini 身份，使用中立能力提示"""
        out = execute_tool("image_gen", {"prompt": "绘制一幅画"})
        self.assertNotIn("Gemini", out)
        self.assertIn("多模态视觉理解能力", out)

    def test_resolve_model_display_name_from_proxy(self):
        """验证传递 UUID 时能从模型代理中动态解析出友好模型名称"""
        from dsh_modules.runner import resolve_model_display_name
        # 1. 显式给出名称时不发起请求
        self.assertEqual(resolve_model_display_name("uuid-1234", "qwen-35b"), "qwen-35b")

        # 2. 模拟从 /models 端点获取模型列表
        mock_payload = json.dumps({
            "object": "list",
            "data": [
                {"id": "d13e0d30-87b9-4e87-b96a-d8b1b3cf78af", "name": "qwen36-35b-a3b"}
            ]
        }).encode("utf-8")

        class MockResp:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return mock_payload

        with patch("urllib.request.urlopen", return_value=MockResp()):
            resolved = resolve_model_display_name("d13e0d30-87b9-4e87-b96a-d8b1b3cf78af", None)
            self.assertEqual(resolved, "qwen36-35b-a3b")

    def test_bash_structured_failure_and_self_healing(self):
        """验证 bash 执行失败时返回结构化退出码、STDERR 与自愈提示"""
        # 1. 模拟缺失模块错误
        res_pkg = execute_tool("bash", {"cmd": "python3 -c 'import non_existent_pkg_xyz'"})
        self.assertIn("命令执行失败，退出码 1", res_pkg)
        self.assertIn("STDERR:", res_pkg)
        self.assertIn("ModuleNotFoundError", res_pkg)
        self.assertIn("系统自愈提示", res_pkg)
        self.assertIn("pip install", res_pkg)

        # 2. 模拟文件不存在错误
        res_fnf = execute_tool("bash", {"cmd": "cat nonexistent_file_98765.txt"})
        self.assertIn("命令执行失败，退出码 1", res_fnf)
        self.assertIn("系统自愈提示", res_fnf)
        self.assertIn("ls -la", res_fnf)

        # 3. 模拟语法错误
        res_syn = execute_tool("bash", {"cmd": "python3 -c 'def broken(:'"})
        self.assertIn("命令执行失败", res_syn)
        self.assertIn("SyntaxError", res_syn)
        self.assertIn("语法错误", res_syn)

    def test_read_workspace_file_line_slicing(self):
        """验证 read_file 支持按行切片读取大文件并附带行号标记"""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = Path(tmpdir) / "sample_multiline.txt"
            lines = [f"This is line {i}" for i in range(1, 51)]
            test_file.write_text("\n".join(lines), encoding="utf-8")

            res_slice = execute_tool("read_file", {
                "file_path": str(test_file),
                "start_line": 10,
                "end_line": 15
            })
            self.assertIn("第 10 至 15 行", res_slice)
            self.assertIn("共 50 行", res_slice)
            self.assertIn("L10: This is line 10", res_slice)
            self.assertIn("L15: This is line 15", res_slice)
            self.assertNotIn("L9: ", res_slice)
            self.assertNotIn("L16: ", res_slice)

    def test_patch_workspace_file(self):
        """验证 patch_file 工具的精准局部匹配与原子替换"""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_file = Path(tmpdir) / "config.yaml"
            test_file.write_text("server:\n  host: 127.0.0.1\n  port: 8080\n", encoding="utf-8")

            # 1. 成功精准替换
            res_ok = execute_tool("patch_file", {
                "file_path": str(test_file),
                "target_text": "port: 8080",
                "replacement_text": "port: 9090"
            })
            self.assertIn("已成功精准修改落盘", res_ok)
            new_content = test_file.read_text(encoding="utf-8")
            self.assertIn("port: 9090", new_content)
            self.assertNotIn("port: 8080", new_content)

            # 2. 目标文本不存在时的自愈提示
            res_miss = execute_tool("patch_file", {
                "file_path": str(test_file),
                "target_text": "non_existent_key: 123",
                "replacement_text": "foo: bar"
            })
            self.assertIn("替换失败：在文件", res_miss)
            self.assertIn("未找到目标文本", res_miss)
            self.assertIn("read_file", res_miss)

    def test_web_search_freshness_filtering_and_schema(self):
        """验证 web_search 工具支持 freshness 参数，且参数 Schema 定义完整"""
        ws_tool = next(t for t in SANDBOX_TOOLS if t["function"]["name"] == "web_search")
        props = ws_tool["function"]["parameters"]["properties"]
        self.assertIn("freshness", props)
        self.assertEqual(props["freshness"]["enum"], ["day", "week", "month", "year"])

        # 验证 execute_tool 派发接受 freshness 参数
        res = execute_tool("web_search", {"query": "上海天气", "freshness": "day"})
        self.assertTrue(isinstance(res, str))

    def test_dsh_doctor_diagnostics(self):
        """验证 dsh doctor 环境自检诊断器能够输出完整分类的健康清单"""
        from dsh_modules.doctor import run_doctor_checks, check_python_modules, check_system_binaries
        is_healthy, checks = run_doctor_checks()
        self.assertIsInstance(is_healthy, bool)
        self.assertIsInstance(checks, list)
        self.assertGreater(len(checks), 10)

        categories = {c["category"] for c in checks}
        self.assertIn("Python 核心依赖", categories)
        self.assertIn("系统命令引擎", categories)
        self.assertIn("沙箱路径挂载", categories)
        self.assertIn("通信与网络通道", categories)

        for c in checks:
            self.assertIn(c["status"], ["PASS", "WARN", "FAIL"])
            self.assertTrue(len(c["name"]) > 0)
            self.assertTrue(len(c["detail"]) > 0)


if __name__ == "__main__":
    unittest.main()



