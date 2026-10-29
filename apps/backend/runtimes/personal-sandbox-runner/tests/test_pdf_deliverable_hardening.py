import unittest
from pathlib import Path
import tempfile
from dsh_modules.deliverable_contract import (
    is_code_or_script_content,
    resolve_pdf_filename,
    resolve_pdf_template,
    resolve_pdf_theme,
    resolve_pdf_page_bounds,
    resolve_pdf_cover,
    materialize_pdf_from_markdown,
)
from dsh_modules.final_answer import evaluate_answer_state


class TestPdfDeliverableHardening(unittest.TestCase):
    def test_resolve_pdf_filename(self):
        # Explicit filename in prompt
        p1 = "/pdf 帮我生成一份《城市自然观察手册》，面向小学生，共2页，A4打印版，使用 handout 讲义版式和暖色主题，不要独立封面，文件名 handout.pdf。"
        self.assertEqual(resolve_pdf_filename(p1), "handout.pdf")

        # Book title in prompt
        p2 = "/pdf 帮我生成一份《城市自然观察手册》，面向小学生，共2页"
        self.assertEqual(resolve_pdf_filename(p2), "城市自然观察手册.pdf")

        # Fallback to default or provided stem
        p3 = "/pdf 帮我生成一个小学生 竞选班干部的pdf，3到4页"
        self.assertEqual(resolve_pdf_filename(p3), "result.pdf")
        self.assertEqual(resolve_pdf_filename(p3, fallback_stem="speech"), "speech.pdf")

    def test_resolve_pdf_template(self):
        self.assertEqual(resolve_pdf_template("使用 handout 讲义版式"), "handout")
        self.assertEqual(resolve_pdf_template("制作活动手册"), "handout")
        self.assertEqual(resolve_pdf_template("生成长文排版"), "editorial")
        self.assertEqual(resolve_pdf_template("适合手机查看"), "mobile")
        self.assertEqual(resolve_pdf_template("生成正式汇报"), "report")

    def test_resolve_pdf_theme(self):
        self.assertEqual(resolve_pdf_theme("使用暖色主题"), "warm")
        self.assertEqual(resolve_pdf_theme("使用薄荷绿色风格"), "emerald")
        self.assertEqual(resolve_pdf_theme("使用灰色调"), "slate")
        self.assertEqual(resolve_pdf_theme("使用酒红色"), "burgundy")
        self.assertEqual(resolve_pdf_theme("默认风格"), "blue")

    def test_resolve_pdf_page_bounds(self):
        self.assertEqual(resolve_pdf_page_bounds("共2页，A4打印版"), (2, 2))
        self.assertEqual(resolve_pdf_page_bounds("篇幅控制在 3 到 4 页"), (3, 4))
        self.assertEqual(resolve_pdf_page_bounds("篇幅 3-5 页"), (3, 5))
        self.assertEqual(resolve_pdf_page_bounds("任意篇幅皆可"), (None, None))

    def test_resolve_pdf_cover(self):
        self.assertFalse(resolve_pdf_cover("不要独立封面"))
        self.assertFalse(resolve_pdf_cover("无需封面"))
        self.assertTrue(resolve_pdf_cover("包含独立封面"))
        self.assertFalse(resolve_pdf_cover("普通排版"))

    def test_is_code_or_script_content(self):
        python_script = """```python
import subprocess
import sys
import os

print("Installing fpdf2...")
subprocess.check_call([sys.executable, "-m", "pip", "install", "fpdf2"])
from fpdf import FPDF
pdf = FPDF()
pdf.add_page()
pdf.output("/workspace/handout.pdf")
```"""
        self.assertTrue(is_code_or_script_content(python_script))

        raw_script = """import sys
import os
from pathlib import Path

def main():
    print("generating")
"""
        self.assertTrue(is_code_or_script_content(raw_script))

        normal_markdown = """# 城市自然观察手册

## 副标题：观察、记录与分享
署名：阅读与实践

### 第一页：温馨提示与准备清单
大自然是一本有趣的书。让我们走进城市，观察身边的一草一木。
"""
        self.assertFalse(is_code_or_script_content(normal_markdown))

    def test_materialize_pdf_refuses_script_leak(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            leaked_script = """```python
import subprocess
import sys
import os
from fpdf import FPDF
pdf = FPDF()
pdf.output("/workspace/handout.pdf")
```"""
            # When final_text is a leaked script, it must NOT compile into a PDF
            res = materialize_pdf_from_markdown(
                prompt="生成 handout.pdf",
                workspace_dir=tmpdir,
                expected_deliverables=[".pdf"],
                final_text=leaked_script
            )
            self.assertIsNone(res)
            # Ensure no *.pdf or *.md file with script content was created
            pdf_files = list(Path(tmpdir).glob("*.pdf"))
            self.assertEqual(len(pdf_files), 0)

    def test_trivial_english_status_is_filler(self):
        state_ready = evaluate_answer_state("task ready", has_physical_artifact=False)
        self.assertTrue(state_ready.is_filler)
        self.assertTrue(state_ready.needs_summary)

        state_done = evaluate_answer_state("done.", has_physical_artifact=False)
        self.assertTrue(state_done.is_filler)

        # Even if a physical artifact exists, 'task ready' is still recognized as filler
        state_ready_art = evaluate_answer_state("task ready", has_physical_artifact=True)
        self.assertTrue(state_ready_art.is_filler)

        # Genuine substantial Chinese text is not filler
        state_good = evaluate_answer_state(
            "✅ **城市自然观察手册已生成就绪！**\n\n已为您排版好两页观察手册，包含准备清单与引导问题。",
            has_physical_artifact=True
        )
        self.assertFalse(state_good.is_filler)

    def test_continuation_cue_and_skill_inheritance(self):
        from dsh_modules.skill_router import SkillRouter, is_continuation_cue
        from dsh_modules.runner import select_active_tools

        self.assertTrue(is_continuation_cue("请重新生成该文件"))
        self.assertTrue(is_continuation_cue("重新生成该文件"))
        self.assertTrue(is_continuation_cue("重新生成"))
        self.assertTrue(is_continuation_cue("请重试"))
        self.assertTrue(is_continuation_cue("再生成一次"))
        self.assertTrue(is_continuation_cue("1"))
        self.assertFalse(is_continuation_cue("请帮我写一个Python排序算法"))

        # Test skill and tool inheritance on retry
        history = [
            {"role": "user", "content": "/pdf 帮我生成一份《城市自然观察手册》，面向小学生，共2页，A4打印版，使用 handout 讲义版式和暖色主题，不要独立封面，文件名 handout.pdf。"},
            {"role": "assistant", "content": "⚠️ 沙箱运行正常，但上游模型未返回有效回复内容。建议：可直接回复「请重新生成该文件」"}
        ]
        router = SkillRouter()
        skill_res = router.route("请重新生成该文件", history)
        self.assertEqual(skill_res.skill_id, "pdf")
        self.assertTrue(skill_res.is_generate_intent)

        tools = select_active_tools("请重新生成该文件", skill_res, is_search_intent=False, has_web_search_permission=True)
        tool_names = [t.get("function", {}).get("name") for t in tools]
        self.assertIn("render_pdf", tool_names)
        self.assertIn("inspect_pdf_page", tool_names)
        self.assertNotIn("bash", tool_names)


if __name__ == "__main__":
    unittest.main()
