"""Acceptance boundaries for grounded short answers vs undelivered headings."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from dsh_modules.retrieval_answer_validation import assess_retrieval_answer, has_retrieval_evidence
from dsh_modules.tool_result import ToolResult


class RetrievalAnswerValidationTests(unittest.TestCase):
    def test_search_heading_never_counts_as_the_answer(self):
        for text in [
            "2026年10月22日（周四）体育赛果与热点速览",
            "# 今日体育赛事\n\n## 足球\n\n## 篮球",
            "**今日赛事汇总**", "今日赛程\n===", "Today's sports highlights", "",
            "# 今日体育赛事\n来源：https://example.com/schedule",
            "华为最新新闻",
        ]:
            with self.subTest(text=text):
                self.assertEqual(assess_retrieval_answer(text, "今天的体育赛事").status, "incomplete")

    def test_short_facts_and_uncertainty_are_valid(self):
        for text in [
            "比赛已取消。", "今天没有比赛。", "上海今天晴，25℃。", "阿森纳 2:1 拜仁。",
            "官方尚未公布赛程。", "目前尚无可核实的比赛结果。",
            "# 上海天气\n晴，25℃。", "# 今天没有比赛", "# 当前气温 25℃",
            "# 阿森纳 2:1 拜仁",
            "赛程：19:35，A 队对 B 队。", "Team A won 2–1.",
        ]:
            with self.subTest(text=text):
                self.assertEqual(assess_retrieval_answer(text, "查一下今天的比赛").status, "completed")

    def test_concrete_clarification_is_allowed(self):
        for text in ["您想看哪类体育赛事？", "请指定要查询的联赛。", "Which league would you like?"]:
            with self.subTest(text=text):
                self.assertEqual(assess_retrieval_answer(text, "今天的比赛").status, "needs_input")

    def test_explicit_title_request_and_negation(self):
        title = "今日体育热点速览"
        for prompt in ["只要一个标题", "给今天的新闻起个标题", "帮我写一个标题", "Give me a headline only"]:
            self.assertEqual(assess_retrieval_answer(title, prompt).status, "completed")
        for prompt in ["今天的体育赛事，不要只给标题", "Do not just give a title"]:
            self.assertEqual(assess_retrieval_answer(title, prompt).status, "incomplete")

    def test_only_successful_current_turn_retrieval_enables_guard(self):
        self.assertTrue(has_retrieval_evidence([
            ToolResult.success("source", provenance={"tool": "web_search"}),
        ]))
        for evidence in [[], [ToolResult.success("data", provenance={"tool": "read_file"})],
                         [ToolResult.error("unavailable", "no search", provenance={"tool": "web_search"})],
                         [ToolResult.success("", provenance={"tool": "web_search"})]]:
            self.assertFalse(has_retrieval_evidence(evidence))


if __name__ == "__main__":
    unittest.main()
