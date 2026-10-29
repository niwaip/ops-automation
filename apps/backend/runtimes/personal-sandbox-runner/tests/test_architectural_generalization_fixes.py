"""Unit tests for architectural generalization fixes:
1. Weather inquiry distinguishing genuine query from document form templates (e.g. '时间天气记录卡').
2. Markdown generation preserving read_file and bash when computation/data analysis is requested.
3. Spreadsheet update correctly routing natural cell/row mutations to custom edit instead of template backfill.
4. Planning phase avoiding blind skip on compound multi-step tasks.
"""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.runner import is_weather_inquiry, select_active_tools
from dsh_modules.spreadsheet_update.routing import (
    is_custom_workbook_or_row_edit,
    is_workbook_update,
)
from dsh_modules.planning_phase import is_fast_path_task


class ArchitecturalGeneralizationFixesTest(unittest.TestCase):
    def test_weather_inquiry_does_not_falsely_trigger_on_document_templates(self):
        # Doc generation prompt mentioning '时间天气' form fields
        prompt_handout = (
            "帮我生成一份《城市自然观察手册》的pdf，面向小学生，共2页，A4打印版，使用 讲义版式和暖色主题，不要独立封面。"
            "第2页：如何写观察记录、三个引导问题、交流与分享建议，以及时间天气、地点、有趣发现、待探索问题四项记录卡。"
        )
        skill_res_pdf = SimpleNamespace(
            skill_id="pdf",
            is_generate_intent=True,
            is_search_intent=False,
            requires_execution=False,
            is_inspect_intent=False,
            is_knowledge_intent=False,
            is_send_intent=False,
        )
        self.assertFalse(is_weather_inquiry(prompt_handout, skill_res_pdf))

        # Doc generation prompt with column headers mentioning weather
        prompt_table = "生成一份实验记录表，包含字段：时间、天气、气温、光照强度"
        self.assertFalse(is_weather_inquiry(prompt_table, skill_res_pdf))

        # Genuine weather queries
        self.assertTrue(is_weather_inquiry("北京今天天气怎么样"))
        self.assertTrue(is_weather_inquiry("查一下上海明天的气温与降水"))
        self.assertTrue(is_weather_inquiry("What is the weather in Tokyo tomorrow?"))

        # In doc generation where weather is just a field, weather tool should not be loaded
        tools = select_active_tools(prompt_handout, skill_res_pdf, False, False)
        tool_names = {t["function"]["name"] for t in tools}
        self.assertNotIn("weather", tool_names)

    def test_markdown_generation_preserves_read_and_bash_when_needed(self):
        # 1. Markdown with execution / script calculation needs
        prompt_calc = "读取 sales.csv，写一份 markdown 格式的数据分析报告，用 python 统计各季度总额"
        skill_calc = SimpleNamespace(
            skill_id=None,
            is_generate_intent=True,
            is_modify_intent=False,
            is_inspect_intent=False,
            is_knowledge_intent=False,
            is_send_intent=False,
            requires_execution=True,
        )
        tools_calc = select_active_tools(prompt_calc, skill_calc, False, False)
        calc_tool_names = {t["function"]["name"] for t in tools_calc}
        self.assertIn("write_markdown", calc_tool_names)
        self.assertIn("read_file", calc_tool_names)
        self.assertIn("bash", calc_tool_names)

        # 2. Markdown purely descriptive - least privilege preserved
        prompt_simple = "写一份关于公司文化的 markdown 介绍文档"
        skill_simple = SimpleNamespace(
            skill_id=None,
            is_generate_intent=True,
            is_modify_intent=False,
            is_inspect_intent=False,
            is_knowledge_intent=False,
            is_send_intent=False,
            requires_execution=False,
        )
        tools_simple = select_active_tools(prompt_simple, skill_simple, False, False)
        simple_tool_names = {t["function"]["name"] for t in tools_simple}
        self.assertEqual(simple_tool_names, {"write_markdown"})

    def test_spreadsheet_routing_recognizes_cell_and_row_edits(self):
        # Natural cell/row edits without rigid prefix
        edit_cases = [
            "把张三的工资改为8000",
            "将部门编号S22014的负责人修改为李四",
            "把第3季度的预算修改为50000",
            "修改A1单元格为销售总额",
            "在表中把状态改为已审核",
        ]
        for prompt in edit_cases:
            self.assertTrue(is_custom_workbook_or_row_edit(prompt), f"Failed for {prompt}")
            self.assertFalse(is_workbook_update(prompt), f"is_workbook_update should be False for {prompt}")

        # Template backfill requests
        backfill_cases = [
            "复制工数Sheet更新预测并回填实绩",
            "复制工作表更新年度计划",
        ]
        for prompt in backfill_cases:
            self.assertFalse(is_custom_workbook_or_row_edit(prompt), f"Failed for {prompt}")
            self.assertTrue(is_workbook_update(prompt), f"is_workbook_update should be True for {prompt}")

    def test_planning_phase_not_blindly_skipped_on_compound_tasks(self):
        skill_res = SimpleNamespace(
            deliverables=[".docx"],
            is_generate_intent=True,
            is_search_intent=False,
            is_research_intent=False,
        )

        # Single-field simple replacement -> fast path allowed
        simple_prompt = "将预算由30000改为36000，保持原版"
        self.assertTrue(is_fast_path_task(simple_prompt, skill_res))

        # Compound multi-step task with replace clause -> planning NOT skipped
        compound_prompt = "把第3季度预算由5万改为8万，并同步核算全年税额与折旧，更新现金流预测并生成财务对比分析报告"
        self.assertFalse(is_fast_path_task(compound_prompt, skill_res))

        # Research intent -> planning NOT skipped
        skill_res_research = SimpleNamespace(
            deliverables=[".md"],
            is_generate_intent=True,
            is_search_intent=True,
            is_research_intent=True,
        )
        self.assertFalse(is_fast_path_task("帮我查一下近期的行业动态并整理成报告", skill_res_research))

    def test_pdf_print_css_incorporates_frontend_design_atoms(self):
        css_path = Path(__file__).resolve().parent.parent / "skills" / "pdf" / "templates" / "print.css"
        self.assertTrue(css_path.is_file())
        css_content = css_path.read_text(encoding="utf-8")
        # Ensure modern frontend-design compatible layout primitives are available
        for cls in [".grid-2", ".grid-2-1", ".card", ".pill", ".tag", ".rank-badge", ".stat-strip"]:
            self.assertIn(cls, css_content, f"Class {cls} missing from print.css")

    def test_pdf_review_model_supports_vision_model_override(self):
        import os
        from unittest.mock import patch
        from dsh_modules.pdf_review_model import inspect_pdf_image

        events = []
        with patch("dsh_modules.pdf_review_model.inspect_image", return_value="【文档/图片】:\nPASS") as mock_inspect:
            # 1. Explicit model_name passed
            inspect_pdf_image("test.png", "check", model_events=events, model_name="custom-vision-v1")
            self.assertEqual(mock_inspect.call_args[1]["model_name"], "custom-vision-v1")

            # 2. Env override
            with patch.dict(os.environ, {"DSH_VISION_MODEL": "fast-vision-mini"}):
                inspect_pdf_image("test.png", "check", model_events=events)
                self.assertEqual(mock_inspect.call_args[1]["model_name"], "fast-vision-mini")


if __name__ == "__main__":
    unittest.main()
