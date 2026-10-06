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

    def test_contextual_query_does_not_pollute_weibo_trending_with_weather_history(self):
        from dsh_modules.skill_router import SkillRouter

        weather_history = [
            {"role": "user", "content": "帮我查一下上海的天气"},
            {"role": "assistant", "content": "【上海 实时权威气象与多日预报】: 今天晴..."},
        ]
        # 1. 独立新主题“微博热点”绝不可被上一轮天气污染
        resolved_weibo = SkillRouter.resolve_contextual_query("微博热点", weather_history)
        self.assertEqual(resolved_weibo, "微博热点")

        # 2. 独立新主题“北京天气”不被上一轮上海天气污染
        resolved_bj = SkillRouter.resolve_contextual_query("北京天气", weather_history)
        self.assertEqual(resolved_bj, "北京天气")

        # 3. 承接型省略主语追问“明天呢”正确继承上一轮主题
        resolved_tomorrow = SkillRouter.resolve_contextual_query("明天呢", weather_history)
        self.assertIn("上海的天气", resolved_tomorrow)
        self.assertIn("明天呢", resolved_tomorrow)

    def test_weibo_trending_not_swallowed_by_weather_search(self):
        weibo_list = "【微博 (Weibo) 实时热搜与热点排行】:\n1. 示例微博热搜"
        with patch("dsh_modules.web_tools.perform_web_search", return_value=weibo_list) as vertical, \
             patch("dsh_modules.web_tools.fetch_weather") as weather_mock:
            res = perform_multi_web_search("微博热点")
        self.assertEqual(res, weibo_list)
        weather_mock.assert_not_called()

    def test_weather_dynamic_weekday_calculation(self):
        import io
        import json
        import urllib.request
        from dsh_modules.web_tools import fetch_weather

        # 模拟 2026-10-04 (周日) 起始的 7 天预报数据
        mock_om_data = {
            "daily": {
                "time": [
                    "2026-10-04",  # 周日
                    "2026-10-05",  # 周一
                    "2026-10-06",  # 周二
                    "2026-10-07",  # 周三 (第4天)
                    "2026-10-08",  # 周四 (第5天)
                    "2026-10-09",  # 周五 (第6天)
                    "2026-10-10",  # 周六 (第7天)
                ],
                "temperature_2m_max": [25, 24, 23, 22, 21, 20, 19],
                "temperature_2m_min": [18, 17, 16, 15, 14, 13, 12],
                "precipitation_probability_max": [10, 20, 30, 40, 50, 60, 7],
                "weathercode": [0, 1, 2, 3, 45, 51, 61],
            }
        }

        mock_wttr_data = {
            "current_condition": [
                {"temp_C": "22", "humidity": "60", "weatherDesc": [{"value": "晴"}]}
            ],
            "nearest_area": [
                {"latitude": "31.23", "longitude": "121.47"}
            ],
            "weather": []
        }

        def mock_urlopen(req, *args, **kwargs):
            url = req.full_url if hasattr(req, "full_url") else str(req)
            if "open-meteo.com" in url:
                return io.BytesIO(json.dumps(mock_om_data).encode("utf-8"))
            if "wttr.in" in url:
                return io.BytesIO(json.dumps(mock_wttr_data).encode("utf-8"))
            return io.BytesIO(b"{}")

        with patch("urllib.request.urlopen", side_effect=mock_urlopen):
            output = fetch_weather("上海天气")

        self.assertIn("今天 (周日) (2026-10-04)", output)
        self.assertIn("明天 (周一) (2026-10-05)", output)
        self.assertIn("后天 (周二) (2026-10-06)", output)
        # 验证 2026-10-07 必须是 周三/第4天，绝不是硬编码的周四！
        self.assertIn("周三/第4天 (2026-10-07)", output)
        self.assertNotIn("周四/第4天 (2026-10-07)", output)

    def test_context_relevance_for_fallback(self):
        from dsh_modules.runner import is_context_relevant_to_query

        weather_text = "【上海 实时权威气象与多日预报】: 最低 18°C ~ 最高 25°C, 天气状况: 晴"
        # 微博热点查询与天气文本不相关
        self.assertFalse(is_context_relevant_to_query("微博热点", weather_text))
        # 上海天气查询与天气文本相关
        self.assertTrue(is_context_relevant_to_query("上海天气", weather_text))
        # 科技插件查询与天气文本不相关
        self.assertFalse(is_context_relevant_to_query("deepseek-harness 插件", weather_text))


if __name__ == "__main__":
    unittest.main()
