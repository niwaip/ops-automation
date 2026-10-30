import os
from pathlib import Path
import tempfile
import unittest

from dsh_modules.docx_render_tool import render_docx, _make_error, DOCX_RENDER_TOOL
from dsh_modules.tool_result import ToolResult, TextToolOutput


class DocxRenderToolTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace_dir = self.temp_dir.name
        self.skill_dir = os.path.join(self.workspace_dir, "skills")
        os.makedirs(self.skill_dir, exist_ok=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_tool_result_error_single_argument_resilience(self):
        """ToolResult.error must not crash with TypeError when given only 1 positional argument."""
        res = ToolResult.error("单一错误描述")
        self.assertTrue(res.is_error)
        self.assertEqual(res.error_message, "单一错误描述")
        self.assertEqual(res.error_code, "tool_error")

    def test_make_error_constructs_valid_tool_result(self):
        """_make_error must construct TextToolOutput and not raise TypeError."""
        provenance = {"tool": "render_docx"}
        out = _make_error("测试错误信息", provenance)
        self.assertIsInstance(out, TextToolOutput)
        self.assertTrue(out.tool_result.is_error)
        self.assertEqual(out.tool_result.error_message, "测试错误信息")
        self.assertEqual(out.tool_result.provenance, provenance)

    def test_render_docx_missing_markdown(self):
        """Empty markdown should return friendly error result without exception."""
        out = render_docx({"markdown": ""}, self.workspace_dir, self.skill_dir)
        self.assertIsInstance(out, TextToolOutput)
        self.assertTrue(out.tool_result.is_error)
        self.assertIn("markdown 参数必须为非空字符串", out.tool_result.error_message)

    def test_render_docx_auto_infers_output_path_from_title(self):
        """When output_path is omitted, it should infer from title and generate docx successfully."""
        params = {
            "markdown": "# 季度总结报告\n\n这是正文内容。",
            "title": "季度总结报告"
        }
        out = render_docx(params, self.workspace_dir, self.skill_dir)
        self.assertIsInstance(out, TextToolOutput)
        self.assertTrue(out.tool_result.is_success)
        self.assertEqual(out.tool_result.data["file_name"], "季度总结报告.docx")
        self.assertTrue(Path(out.tool_result.data["file_path"]).exists())

    def test_render_docx_auto_infers_output_path_from_markdown_heading(self):
        """When output_path and title are omitted, it should infer from markdown # heading."""
        params = {
            "markdown": "# Bilibili 热点日报\n\n核心数据概览"
        }
        out = render_docx(params, self.workspace_dir, self.skill_dir)
        self.assertIsInstance(out, TextToolOutput)
        self.assertTrue(out.tool_result.is_success)
        self.assertEqual(out.tool_result.data["file_name"], "Bilibili_热点日报.docx")
        self.assertTrue(Path(out.tool_result.data["file_path"]).exists())

    def test_render_docx_path_outside_workspace_rejected(self):
        """Path traversal outside workspace should be rejected with invalid_path."""
        params = {
            "markdown": "# 内容",
            "output_path": "/etc/malicious.docx"
        }
        out = render_docx(params, self.workspace_dir, self.skill_dir)
        self.assertIsInstance(out, TextToolOutput)
        self.assertTrue(out.tool_result.is_error)
        self.assertEqual(out.tool_result.error_code, "invalid_path")


if __name__ == "__main__":
    unittest.main()
