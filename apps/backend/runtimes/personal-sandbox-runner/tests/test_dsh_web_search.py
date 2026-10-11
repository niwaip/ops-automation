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

    def test_search_intent_does_not_trigger_claimed_artifact_guard_on_mentioned_repo_files(self):
        from dsh_modules.agent_loop import detect_missing_claimed_artifacts, _check_no_tool_assertion_guard

        text = (
            "在 GitHub 上最流行的 Agent Skill 规范是 Anthropic 的 Skills 架构。\n"
            "仓库中核心规范文件为 `SKILL.md`，用于定义元数据和执行逻辑；同时提供 `config.json` 配置文件。"
        )
        # 搜索意图下绝不将介绍外部仓库的文件当做本地缺失交付物
        missing = detect_missing_claimed_artifacts(text, is_search_intent=True, is_generate_intent=False)
        self.assertEqual(missing, [])

        # 检查守卫放行
        action, msg, _ = _check_no_tool_assertion_guard(
            reply_text=text,
            last_user_prompt="查看现在github最流行的skill",
            round_idx=1,
            max_rounds=5,
            start_ts=100.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=False,
            is_search_intent=True,
            tools=[{"function": {"name": "web_search"}}, {"function": {"name": "fetch_page"}}],
        )
        self.assertEqual(action, "pass")
        self.assertIsNone(msg)

    def test_read_only_tools_never_instruct_model_to_call_bash(self):
        from dsh_modules.agent_loop import _check_no_tool_assertion_guard

        # 即使模型文本里提到生成了文件
        claim_text = "已生成文件 test_result.md，请查看。"
        read_only_tools = [{"function": {"name": "web_search"}}, {"function": {"name": "fetch_page"}}]
        action, msg, _ = _check_no_tool_assertion_guard(
            reply_text=claim_text,
            last_user_prompt="查看报告",
            round_idx=1,
            max_rounds=5,
            start_ts=100.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=False,
            is_search_intent=False,
            tools=read_only_tools,
        )
        if action == "continue":
            # 绝不能指示调用 bash
            self.assertNotIn("调用 bash", msg)
            self.assertIn("只读模式", msg)

    def test_fallback_report_filters_out_tool_errors(self):
        from dsh_modules.agent_loop_helpers import _build_fallback_report

        messages = [
            {"role": "user", "content": "查看现在github最流行的skill"},
            {"role": "tool", "content": '{"schema_version": 1, "data": [{"title": "anthropics/skills", "snippet": "Official repository for Agent Skills"}]}'},
            {"role": "tool", "content": '{"schema_version": 1, "status": "error", "error": {"code": "tool_not_available", "message": "本轮未提供工具 bash。"}}'},
        ]
        executed_calls_history = ["web_search", "err:bash"]
        report = _build_fallback_report(messages, executed_calls_history)

        # 验证错误信息被过滤，没有把 tool_not_available 报给用户
        self.assertNotIn("tool_not_available", report)
        self.assertNotIn("未提供工具 bash", report)
        # 验证成功工具中的真实数据片段被保留
        self.assertIn("anthropics/skills", report)
        self.assertIn("web_search", report)
        self.assertNotIn("bash", report)

    def test_context_budget_machine_placeholder_no_chinese_parroting(self):
        """验证 ContextBudget 历史消息裁剪采用机器注释占位符，绝不使用口语化中文句子，防止模型复读偷懒截断"""
        from dsh_modules.context_budget import ContextBudget

        long_assistant_msg = "开头前情 " + "内容" * 1000 + " 结尾结论"
        history = [
            {"role": "user", "content": "提问"},
            {"role": "assistant", "content": long_assistant_msg}
        ]
        budgeted, _ = ContextBudget.budget_history(history, max_total_chars=8000, max_item_chars=1000)
        assistant_content = budgeted[1]["content"]

        self.assertIn("CONTEXT_BUDGET", assistant_content)
        self.assertNotIn("因历史消息长度预算超出", assistant_content)
        self.assertNotIn("中间部分已自动省略", assistant_content)

    def test_truncation_parroting_guard_interception(self):
        """验证 Truncation Parroting Guard: 模型回复中若偷懒包含截断/省略占位符，被确定性拦截并要求完整输出"""
        from dsh_modules.agent_loop import _check_no_tool_assertion_guard

        parroted_replies = [
            "以下是 GitHub 上当前最流行的 AI 技能项目：\n| 项目名 | 简介 |\n| GitHub Skills | 官方模板 |\n\n[因历史消息长度预算超出，中间部分已自动省略]\n",
            "根据检索结果如下：\n1. 项目 A\n2. 项目 B\n...[内容已截断]...",
            "分析汇总如下：\n- 模块 1\n<!-- [CONTEXT_BUDGET: Earlier middle content of this previous message was omitted to fit context window] -->\n- 模块 2"
        ]
        for reply in parroted_replies:
            action, msg, _ = _check_no_tool_assertion_guard(
                reply_text=reply,
                last_user_prompt="查看现在github最流行的skill",
                round_idx=0,
                max_rounds=3,
                start_ts=0.0,
                is_guide_intent=False,
                expected_deliverables=None,
                is_generate_intent=False,
                is_inspect_intent=False,
                tools=[{"name": "web_search"}],
            )
            self.assertEqual(action, "continue")
            self.assertIn("系统完整性拦截提示", msg)
            self.assertIn("请勿使用任何省略标记", msg)

    def test_normalize_search_query_decouples_action_clauses_generically(self):
        """验证 normalize_search_query 通用解耦下游动作与交付从句，杜绝关键词污染"""
        from dsh_modules.web_tools import normalize_search_query

        test_cases = [
            ("今天的微博热点，并且进行总结", "微博热点"),
            ("今天的微博热点，进行总结", "微博热点"),
            ("查看最新开源大模型，然后做个对比分析", "开源大模型"),
            ("查找最近的科技新闻并整理成表格", "科技新闻"),
            ("帮我查下python 3.12的新特性，给出一份简要汇总", "python 3.12的新特性"),
            ("查看现在的热门插件并且输出为markdown", "热门插件"),
            ("获取最新 AI 新闻，总结，输出 md 文件", "AI 新闻"),
        ]
        for raw_prompt, expected_kw in test_cases:
            cleaned = normalize_search_query(raw_prompt)
            self.assertEqual(cleaned, expected_kw, f"Failed on prompt: {raw_prompt}")

    def test_enrichable_content_url_evaluation(self):
        """验证 is_enrichable_content_url 基于 RFC/Web 通用标准过滤检索聚合、API 与认证端点"""
        from dsh_modules.web_tools import is_enrichable_content_url, enrich_search_context_with_pages

        # 1. 检索/聚合/筛选端点应被过滤
        self.assertFalse(is_enrichable_content_url("https://s.weibo.com/weibo?q=%E5%A4%A7%E4%BA%8C%E4%B8%93%E7%A7%91%E7%94%9F"))
        self.assertFalse(is_enrichable_content_url("https://search.bilibili.com/all?keyword=mouz"))
        self.assertFalse(is_enrichable_content_url("https://www.google.com/search?q=test"))
        self.assertFalse(is_enrichable_content_url("https://weibo.com/ajax/side/hotSearch"))
        self.assertFalse(is_enrichable_content_url("https://example.com/login?redirect=/dashboard"))

        # 2. 真实文档、仓库与正文页面应放行
        self.assertTrue(is_enrichable_content_url("https://github.com/deepseek-ai/deepseek-harness/releases"))
        self.assertTrue(is_enrichable_content_url("https://docs.python.org/3/library/re.html"))
        self.assertTrue(is_enrichable_content_url("https://en.wikipedia.org/wiki/Artificial_intelligence"))
        self.assertTrue(is_enrichable_content_url("https://blog.example.com/posts/agent-framework"))

        # 3. 验证当检索结果仅包含检索聚合端点时，富化流程瞬时返回，绝不产生无谓网络超时
        aggregator_context = (
            "【微博实时热搜榜最新排行】:\n"
            "1. [热] [大二专科生称靠切片三年赚七百万](https://s.weibo.com/weibo?q=%E5%A4%A7%E4%BA%8C%E4%B8%93%E7%A7%91%E7%94%9F) (热度值: 1746万)\n"
            "2. [新] [被字节开除实习生创业获2亿美元估值](https://s.weibo.com/weibo?q=%E8%A2%AB%E5%AD%97%E8%8A%82%E5%BC%80%E9%99%A4) (热度值: 899万)"
        )
        enriched = enrich_search_context_with_pages(aggregator_context, max_pages=2, deadline=None)
        # 应直接原样返回，不追加【高价值页面正文抓取】
        self.assertEqual(enriched, aggregator_context)


if __name__ == "__main__":
    unittest.main()
