"""
Unit tests for DeepSeek Harness (dsh) core modules.
"""

import unittest
import sys
from pathlib import Path

# Add src to sys.path
src_dir = Path(__file__).resolve().parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from dsh_modules.config import VERSION
from dsh_modules.tools import CITY_PINYIN, normalize_search_query, execute_tool
from dsh_modules.llm import parse_tool_calls, clean_output, extract_bare_json_tool_calls, is_promising_action


class TestDshCoreModules(unittest.TestCase):

    def test_version_format(self):
        self.assertTrue(VERSION.startswith("1.3.0"))

    def test_normalize_search_query(self):
        self.assertEqual(normalize_search_query("帮我查一下天气"), "天气")
        self.assertEqual(normalize_search_query("搜索 deepseek 最新新闻"), "deepseek 最新新闻")
        self.assertEqual(normalize_search_query("查询上海"), "上海")

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


if __name__ == "__main__":
    unittest.main()
