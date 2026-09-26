"""Regression tests for small-model planning, tool recovery, and Markdown delivery."""

import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


SRC_DIR = Path(__file__).resolve().parent.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from dsh_modules.action_protocol import is_internal_plan_output, recover_text_tool_calls
from dsh_modules.agent_loop import run_agent_loop
from dsh_modules.deliverable_contract import (
    materialize_requested_markdown,
    requests_markdown_artifact,
    resolve_markdown_filename,
    unwrap_outer_markdown_fence,
    write_markdown_artifact,
)
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.skill_router import resolve_file_action_intent
from dsh_modules.tools import get_sandbox_tools
from dsh_modules.web_tools import extract_query_freshness, fetch_page, normalize_search_query


SMALL_MODEL_PLAN = """new_plan
The user wants the latest AI news. I need to search and then create a Markdown file.

Step 1: Search for AI News.
Step 2: Write the file.

I will perform the search first.

web_search(query="latest AI news")"""


class TestSmallModelProtocol(unittest.TestCase):
    def test_search_query_separates_topic_from_delivery_actions(self):
        prompt = "获取最新 AI 新闻，总结，输出 md 文件"
        self.assertEqual(normalize_search_query(prompt), "AI 新闻")
        self.assertEqual(extract_query_freshness(prompt), "week")

    def test_markdown_is_a_physical_delivery_intent(self):
        prompt = "获取最新 AI 新闻，总结，输出 md 文件"
        self.assertEqual(resolve_file_action_intent(prompt, []), (True, False))
        self.assertTrue(requests_markdown_artifact(prompt))
        self.assertEqual(resolve_markdown_filename(prompt), "latest_ai_news.md")

    def test_recovers_safe_function_call_from_explicit_plan(self):
        self.assertTrue(is_internal_plan_output(SMALL_MODEL_PLAN))
        recovered = recover_text_tool_calls(SMALL_MODEL_PLAN, round_idx=2)
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0]["function"]["name"], "web_search")
        self.assertEqual(
            json.loads(recovered[0]["function"]["arguments"]),
            {"query": "latest AI news"},
        )

    def test_never_recovers_mutating_bash_from_plain_text(self):
        plan = "new_plan\nStep 1: write the file\nbash(cmd=\"touch /workspace/a.md\")"
        self.assertTrue(is_internal_plan_output(plan))
        self.assertEqual(recover_text_tool_calls(plan), [])

    def test_recovers_multiline_standalone_markdown_writer(self):
        raw = '''write_markdown(
    filename="ai-daily-news-20260926.md",
    content="# AI 日报\\n\\n- 新闻一\\n- 新闻二"
)'''
        recovered = recover_text_tool_calls(raw, round_idx=3)
        self.assertTrue(is_internal_plan_output(raw))
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0]["function"]["name"], "write_markdown")
        self.assertEqual(
            json.loads(recovered[0]["function"]["arguments"]),
            {
                "filename": "ai-daily-news-20260926.md",
                "content": "# AI 日报\n\n- 新闻一\n- 新闻二",
            },
        )

    def test_rejects_markdown_writer_with_path_traversal(self):
        raw = 'write_markdown(filename="../escape.md", content="unsafe")'
        self.assertEqual(recover_text_tool_calls(raw), [])

    def test_tool_set_is_reduced_for_small_model_task(self):
        tools = get_sandbox_tools(
            available_skills=[],
            allowed_names={"web_search", "fetch_page", "write_markdown"},
        )
        names = {tool["function"]["name"] for tool in tools}
        self.assertEqual(names, {"web_search", "fetch_page", "write_markdown"})

    def test_page_read_timeout_is_isolated_as_tool_result(self):
        opener = MagicMock()
        opener.open.side_effect = TimeoutError("The read operation timed out")
        with patch("dsh_modules.web_tools.is_safe_web_url", return_value=(True, "")):
            with patch("dsh_modules.web_tools.urllib.request.build_opener", return_value=opener):
                with patch(
                    "dsh_modules.web_tools._fetch_jina_fallback",
                    return_value=(None, "获取网页内容超时 (https://example.com)"),
                ):
                    result = fetch_page("https://example.com", deadline=time.monotonic() + 30)
        self.assertIn("获取网页内容超时", result)

    def test_materializes_substantive_markdown_content(self):
        content = "# AI 新闻摘要\n\n" + ("这是基于最新公开来源整理的人工智能新闻摘要。" * 12)
        with tempfile.TemporaryDirectory() as tmp_dir:
            path, created = materialize_requested_markdown(
                "总结最新 AI 新闻并输出 md 文件",
                content,
                tmp_dir,
            )
            self.assertTrue(created)
            self.assertIsNotNone(path)
            target = Path(path)
            self.assertEqual(target.name, "latest_ai_news.md")
            self.assertEqual(target.read_text(encoding="utf-8").strip(), content)

    def test_unwraps_document_wide_markdown_fence(self):
        fenced = "```markdown\n# 标题\n\n- **项目**\n```"
        self.assertEqual(unwrap_outer_markdown_fence(fenced), "# 标题\n\n- **项目**")
        self.assertEqual(unwrap_outer_markdown_fence("```python\nprint(1)\n```"), "```python\nprint(1)\n```")

    def test_markdown_writer_does_not_persist_outer_fence(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            write_markdown_artifact(
                tmp_dir,
                "report.md",
                "```md\n# 报告\n\n正文\n```",
            )
            self.assertEqual(
                (Path(tmp_dir) / "report.md").read_text(encoding="utf-8"),
                "# 报告\n\n正文\n",
            )

    def test_reuses_custom_markdown_created_during_turn(self):
        content = "# AI 新闻摘要\n\n" + ("这是一段足够长的摘要内容。" * 20)
        with tempfile.TemporaryDirectory() as tmp_dir:
            turn_start = time.time()
            custom = Path(tmp_dir) / "ai-digest.md"
            custom.write_text(content, encoding="utf-8")
            path, created = materialize_requested_markdown(
                "总结最新 AI 新闻并输出 md 文件",
                content,
                tmp_dir,
                turn_start_time=turn_start,
            )
            self.assertFalse(created)
            self.assertEqual(path, str(custom))
            self.assertFalse((Path(tmp_dir) / "latest_ai_news.md").exists())

    def test_markdown_delivery_gets_extended_runtime_budget(self):
        policy = RuntimePolicy(max_rounds=3)
        self.assertEqual(
            policy.determine_max_rounds("获取最新 AI 新闻，总结，输出 md 文件"),
            5,
        )

    def test_agent_loop_compiles_plan_executes_search_and_writes_markdown(self):
        final_summary = (
            "# 最新 AI 新闻摘要\n\n"
            "## 核心动态\n\n"
            + ("- 多家机构发布了新的人工智能模型与产品更新，并给出了公开来源。\n" * 8)
            + "\n## 来源\n\n- https://example.com/ai-news"
        )
        responses = [
            {
                "content": SMALL_MODEL_PLAN,
                "tool_calls": [],
                "usage": {"total_tokens": 30},
                "total_ms": 20,
                "ttft_ms": 5,
                "finish_reason": "stop",
            },
            {
                "content": final_summary,
                "tool_calls": [],
                "usage": {"total_tokens": 40},
                "total_ms": 25,
                "ttft_ms": 5,
                "finish_reason": "stop",
            },
        ]
        prompt = "获取最新 AI 新闻，总结，输出 md 文件"
        messages = [
            {"role": "system", "content": "test"},
            {"role": "user", "content": prompt},
        ]
        tools = get_sandbox_tools(
            available_skills=[],
            allowed_names={"web_search", "fetch_page", "write_markdown"},
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            with patch("dsh_modules.agent_loop.WORKSPACE_DIR", tmp_dir):
                with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=responses):
                    with patch(
                        "dsh_modules.agent_loop.execute_tool",
                        return_value="【联网检索实时结果】\nAI News: https://example.com/ai-news",
                    ) as execute_mock:
                        result = run_agent_loop(
                            messages,
                            "small-model",
                            RuntimePolicy(max_rounds=3),
                            max_rounds=3,
                            tools=tools,
                            is_generate_intent=True,
                        )

            execute_mock.assert_called_once_with(
                "web_search",
                {"query": "latest AI news"},
                deadline=None,
            )
            artifact = Path(tmp_dir) / "latest_ai_news.md"
            self.assertTrue(artifact.exists())
            self.assertGreater(artifact.stat().st_size, 0)
            self.assertEqual(result.final_text, final_summary)
            self.assertNotIn("new_plan", result.final_text)
            self.assertTrue(any("latest_ai_news.md" in item for item in result.outbound_files))

    def test_agent_loop_executes_standalone_multiline_markdown_call(self):
        tool_expression = '''write_markdown(
    filename="ai-daily-news-20260926.md",
    content="# AI 日报\\n\\n- 已完成新闻检索与摘要。"
)'''
        responses = [
            {
                "content": tool_expression,
                "tool_calls": [],
                "usage": {"total_tokens": 20},
                "total_ms": 10,
                "ttft_ms": 2,
                "finish_reason": "stop",
            },
            {
                "content": "已生成 **ai-daily-news-20260926.md**。您可以通过下方产物链接下载完整日报。",
                "tool_calls": [],
                "usage": {"total_tokens": 15},
                "total_ms": 8,
                "ttft_ms": 2,
                "finish_reason": "stop",
            },
        ]
        prompt = "获取最新 AI 新闻，总结，输出 md 文件"
        messages = [{"role": "system", "content": "test"}, {"role": "user", "content": prompt}]
        tools = get_sandbox_tools(allowed_names={"web_search", "fetch_page", "write_markdown"})

        with tempfile.TemporaryDirectory() as tmp_dir:
            def execute_in_tmp(name, params, deadline=None):
                self.assertEqual(name, "write_markdown")
                return write_markdown_artifact(
                    tmp_dir,
                    params.get("filename") or params.get("file_path"),
                    params["content"],
                )

            with patch("dsh_modules.agent_loop.WORKSPACE_DIR", tmp_dir):
                with patch("dsh_modules.agent_loop.call_model_proxy", side_effect=responses):
                    with patch("dsh_modules.agent_loop.execute_tool", side_effect=execute_in_tmp):
                        result = run_agent_loop(
                            messages,
                            "small-model",
                            RuntimePolicy(max_rounds=3),
                            max_rounds=3,
                            tools=tools,
                            is_generate_intent=True,
                        )

            artifact = Path(tmp_dir) / "ai-daily-news-20260926.md"
            self.assertEqual(
                artifact.read_text(encoding="utf-8"),
                "# AI 日报\n\n- 已完成新闻检索与摘要。\n",
            )
            self.assertNotIn("write_markdown(", result.final_text)
            self.assertTrue(any(artifact.name in item for item in result.outbound_files))


if __name__ == "__main__":
    unittest.main()
