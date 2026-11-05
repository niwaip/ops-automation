"""Tests for write_json tool, format validation, and smart compatibility."""
import json
import tempfile
import unittest
from pathlib import Path

from dsh_modules.deliverable_contract import write_json_artifact, write_markdown_artifact
from dsh_modules.tools import execute_tool, SANDBOX_TOOLS, get_sandbox_tools
from dsh_modules.tool_routing import select_active_tools
from dsh_modules.skill_router import SkillRouter


class WriteJsonToolTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.workspace = self.tmp_dir.name

    def tearDown(self):
        self.tmp_dir.cleanup()

    def test_write_json_artifact_valid_string(self):
        content = '{"slide1_p0": "戦略ブループリント層", "slide1_p1": "RAG構築"}'
        res = write_json_artifact(self.workspace, "translation_output.json", content)
        self.assertIn("OUTBOUND_FILE", res)
        self.assertIn("translation_output.json", res)
        self.assertIn("有效结构包含 2 项元素", res)

        target = Path(self.workspace) / "translation_output.json"
        self.assertTrue(target.exists())
        loaded = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(loaded["slide1_p0"], "戦略ブループリント層")

    def test_write_json_artifact_dict_object(self):
        data = {"hello": "world", "numbers": [1, 2, 3]}
        res = write_json_artifact(self.workspace, "test.json", data, indent=4)
        target = Path(self.workspace) / "test.json"
        self.assertTrue(target.exists())
        loaded = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(loaded["numbers"], [1, 2, 3])

    def test_write_json_artifact_with_markdown_fences(self):
        fenced = """```json
{
  "key": "value"
}
```"""
        res = write_json_artifact(self.workspace, "fenced.json", fenced)
        target = Path(self.workspace) / "fenced.json"
        self.assertTrue(target.exists())
        loaded = json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(loaded["key"], "value")

    def test_write_json_artifact_invalid_syntax_reports_location(self):
        bad_json = '{\n  "name": "test",\n  "broken": unquoted_value\n}'
        with self.assertRaises(ValueError) as ctx:
            write_json_artifact(self.workspace, "bad.json", bad_json)
        err = str(ctx.exception)
        self.assertIn("JSON 格式语法校验失败", err)
        self.assertIn("第 3 行", err)

    def test_write_json_auto_adds_json_extension(self):
        res = write_json_artifact(self.workspace, "my_config", '{"status": "ok"}')
        target = Path(self.workspace) / "my_config.json"
        self.assertTrue(target.exists())

    def test_execute_sandbox_tool_write_json(self):
        import dsh_modules.tools as tools_mod
        orig = tools_mod.WORKSPACE_DIR
        tools_mod.WORKSPACE_DIR = self.workspace
        try:
            out = execute_tool("write_json", {
                "file_path": "output.json",
                "content": '{"translated": true}'
            })
            text = str(out)
            self.assertIn("JSON 文件已成功校验并落盘", text)
            target = Path(self.workspace) / "output.json"
            self.assertTrue(target.exists())
        finally:
            tools_mod.WORKSPACE_DIR = orig

    def test_execute_sandbox_tool_smart_redirect_from_write_markdown(self):
        """When the LLM mistakenly calls write_markdown on a .json file, it should automatically succeed."""
        import dsh_modules.tools as tools_mod
        orig = tools_mod.WORKSPACE_DIR
        tools_mod.WORKSPACE_DIR = self.workspace
        try:
            out = execute_tool("write_markdown", {
                "file_path": "translation_output.json",
                "content": '{"slide1": "日本語"}'
            })
            text = str(out)
            self.assertIn("JSON 文件已成功校验并落盘", text)
            target = Path(self.workspace) / "translation_output.json"
            self.assertTrue(target.exists())
            loaded = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(loaded["slide1"], "日本語")
        finally:
            tools_mod.WORKSPACE_DIR = orig

    def test_tool_routing_strictly_prunes_tools_on_translation_task(self):
        """Tool pruning test: translation tasks should strictly expose only bash, read_file, write_json,
        eliminating schema bloat (~1,500 chars) and reducing TTFT by 30~40%."""
        skill_res = SkillRouter.route("翻译这个文件，生成日语版的ppt", [])
        # Even with web_search permission enabled, noise tools must be stripped
        tools = select_active_tools("翻译这个文件，生成日语版的ppt", skill_res, is_search_intent=False, has_web_search_permission=True)
        names = {t["function"]["name"] for t in tools}
        self.assertEqual(names, {"bash", "read_file", "write_json"})
        self.assertNotIn("write_markdown", names)
        self.assertNotIn("patch_file", names)
        self.assertNotIn("web_search", names)
        self.assertNotIn("fetch_page", names)

    def test_tool_routing_explicit_search_allowed_when_requested(self):
        skill_res = SkillRouter.route("翻译这个文件，生成日语版的ppt", [])
        tools = select_active_tools("翻译这个文件，生成日语版的ppt", skill_res, is_search_intent=True, has_web_search_permission=True)
        names = {t["function"]["name"] for t in tools}
        self.assertIn("web_search", names)
        self.assertIn("fetch_page", names)
        self.assertIn("write_json", names)

    def test_tool_routing_non_translation_task_not_pruned_to_minimal(self):
        skill_res = SkillRouter.route("生成一个关于人工智能的PPT", [])
        tools = select_active_tools("生成一个关于人工智能的PPT", skill_res, is_search_intent=False, has_web_search_permission=True)
        names = {t["function"]["name"] for t in tools}
        self.assertIn("write_markdown", names)
        self.assertIn("web_search", names)


if __name__ == "__main__":
    unittest.main()
