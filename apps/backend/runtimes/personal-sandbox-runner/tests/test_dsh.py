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
from dsh_modules.llm import parse_tool_calls, clean_output, extract_bare_json_tool_calls


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

    def test_execute_tool_fallback(self):
        res = execute_tool("unknown_test_tool", {"foo": "bar"})
        self.assertIn("未识别工具名称", res)


if __name__ == "__main__":
    unittest.main()
