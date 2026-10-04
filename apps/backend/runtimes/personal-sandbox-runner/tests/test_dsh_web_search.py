import unittest
from unittest.mock import patch

from dsh_modules.web_tools import (
    decompose_search_queries,
    perform_multi_web_search,
    perform_web_search,
)


class TestDshWebSearch(unittest.TestCase):
    def test_decompose_trending_query_uses_chinese_facets_without_github(self):
        queries = decompose_search_queries("bilibili的热点")
        self.assertEqual(len(queries), 3)
        self.assertIn("bilibili", queries[0].lower())
        self.assertIn("实时热点", queries[1])
        self.assertNotIn("github", queries[1].lower())
        self.assertNotIn("github", queries[2].lower())

    def test_decompose_tech_query_preserves_github_releases(self):
        queries = decompose_search_queries("查看 deepseek harness 最新的插件")
        self.assertEqual(len(queries), 3)
        self.assertIn("plugins extensions registry github", queries[1].lower())
        self.assertIn("official documentation github releases", queries[2].lower())

    def test_bilibili_hot_search_uses_vertical_source_before_platform(self):
        bili_list = "【B站 (Bilibili) 实时热点与热门视频排行】:\n1. 示例热门"
        with patch("dsh_modules.web_tools.perform_web_search", return_value=bili_list) as vertical, \
             patch("dsh_modules.web_tools.perform_platform_web_search") as platform:
            result = perform_multi_web_search("查看bilibili的热点")
        self.assertEqual(result, bili_list)
        self.assertFalse(vertical.call_args.kwargs["use_platform"])
        platform.assert_not_called()

    def test_multi_search_uses_balanced_policy_for_trending(self):
        with patch("dsh_modules.web_tools.perform_platform_web_search", return_value="platform trending") as gateway:
            result = perform_multi_web_search("最新科技热点")
        self.assertEqual(result, "platform trending")
        self.assertEqual(gateway.call_args.kwargs["source_policy"], "balanced")

    def test_multi_search_uses_official_first_for_tech_query(self):
        with patch("dsh_modules.web_tools.perform_platform_web_search", return_value="platform tech") as gateway:
            result = perform_multi_web_search("fastapi 最新插件版本")
        self.assertEqual(result, "platform tech")
        self.assertEqual(gateway.call_args.kwargs["source_policy"], "official-first")

    def test_detect_retrieval_mismatch_disclaimer(self):
        from dsh_modules.action_protocol import detect_retrieval_mismatch_disclaimer

        sample = "当前检索到的有效信息中仅包含上海地区的天气预报数据，未检索到微博热搜及实时热点榜单的相关内容。因此，目前无法确认并提供最新的微博热点榜单及相关热度数据。"
        self.assertTrue(detect_retrieval_mismatch_disclaimer(sample))

        sample_missing = "未检索到关于该开源库的有效信息，无法提供最新数据"
        self.assertTrue(detect_retrieval_mismatch_disclaimer(sample_missing))

        normal = "根据检索结果，微博热搜 Top 10 如下：1. 示例热搜..."
        self.assertFalse(detect_retrieval_mismatch_disclaimer(normal))

    def test_retrieval_mismatch_guard_nudges_for_research(self):
        from dsh_modules.agent_loop import _check_no_tool_assertion_guard

        disclaimer = "当前检索到的有效信息中仅包含天气预报，未检索到微博热搜相关内容，无法提供榜单。"
        tools = [{"name": "web_search", "description": "search web"}]
        action, msg, bumped_rounds = _check_no_tool_assertion_guard(
            reply_text=disclaimer,
            last_user_prompt="查看微博热搜",
            round_idx=0,
            max_rounds=3,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=False,
            tools=tools,
        )
        self.assertEqual(action, "continue")
        self.assertIn("系统检索纠错提示", msg)
        self.assertIn("web_search", msg)


if __name__ == "__main__":
    unittest.main()
