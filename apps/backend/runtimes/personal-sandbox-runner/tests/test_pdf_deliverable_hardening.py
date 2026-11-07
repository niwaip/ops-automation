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

        # Translation prompt with attachment envelope does not resolve to the input file
        p4 = "【当前轮次用户上传附件】: 2507.03009v4.pdf（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n用户指令：翻译这个问题，保持格式不变，生成中文版的pdf"
        self.assertEqual(resolve_pdf_filename(p4), "2507.03009v4_中文版.pdf")

        p5 = "翻译 2507.03009v4.pdf，保持格式不变，生成中文版的pdf"
        self.assertEqual(resolve_pdf_filename(p5), "2507.03009v4_中文版.pdf")

        p6 = "翻译 2507.03009v4.pdf，生成日文版pdf"
        self.assertEqual(resolve_pdf_filename(p6), "2507.03009v4_日文版.pdf")

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

    def test_materialize_pdf_from_markdown_skips_protected_files(self):
        import time
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp_dir:
            ws = Path(tmp_dir)
            protected_pdf = ws / "input.pdf"
            protected_pdf.write_bytes(b"%PDF-1.4 dummy content with more than 50 bytes of data to satisfy size requirement")

            # Patch is_protected_session_file to return True for input.pdf
            with patch("dsh_modules.file_tools.is_protected_session_file", side_effect=lambda p: Path(p).name == "input.pdf"):
                res = materialize_pdf_from_markdown(
                    prompt="翻译 input.pdf 生成中文版pdf",
                    workspace_dir=tmp_dir,
                    turn_start_time=time.time(),
                    expected_deliverables=[".pdf"],
                    final_text="测试正文"
                )
                # It should NOT return input.pdf
                self.assertNotEqual(res, str(protected_pdf))

    def test_materialize_pdf_never_compiles_plan_for_uploaded_pdf_translation(self):
        import time
        prompt = ("【当前轮次用户上传附件】: 2507.03009v4.pdf（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n"
                  "用户指令：翻译这个文档，保持格式不变，生成中文版的pdf")
        plan = "【方案规划】\n### 高保真PDF翻译执行规划方案\n" + "- 布局解析、翻译与重排步骤说明。\n" * 30
        with tempfile.TemporaryDirectory() as tmp_dir:
            res = materialize_pdf_from_markdown(
                prompt=prompt, workspace_dir=tmp_dir, turn_start_time=time.time(),
                expected_deliverables=[".pdf"], final_text=plan)
            self.assertIsNone(res)
            self.assertEqual(list(Path(tmp_dir).glob("*.pdf")) + list(Path(tmp_dir).glob("*.md")), [])

    def test_is_pdf_translation_request(self):
        from dsh_modules.pdf_translation_bridge import is_pdf_translation_request
        envelope = "【当前轮次用户上传附件】: a.pdf（新文件）\n用户指令："
        self.assertTrue(is_pdf_translation_request(envelope + "翻译这个文档，生成中文版的pdf"))
        self.assertTrue(is_pdf_translation_request("translate it", session_files=["a.pdf"]))
        self.assertFalse(is_pdf_translation_request(envelope + "总结这个文档，生成pdf报告"))
        self.assertFalse(is_pdf_translation_request("/pdf 生成一份英文翻译学习手册"))

    def test_is_substantive_final_content_rejects_ai_refusal(self):
        from dsh_modules.deliverable_contract import is_substantive_final_content
        refusal = "无法生成 PDF 文件\n作为一个人工智能助手，我无法直接生成或发送 .pdf 文件。不过，我可以为你提供以下两种解决方案..." * 2
        self.assertFalse(is_substantive_final_content(refusal))

    def test_review_verdict_cannot_be_overridden_by_whitespace_keywords(self):
        from dsh_modules.pdf_review_contract import validate_review
        validate_review('PASS\nOPTIONAL: 页面留白可以调整。')
        with self.assertRaises(ValueError):
            validate_review('FAIL\n1. 页面下半部留白过多，版面重心失衡。')

        # Real errors must still raise ValueError
        bad_text = "FAIL\n1. 右上角存在显著错误提示信息无法生成 PDF 文件，内容显示不完整。"
        with self.assertRaises(ValueError):
            validate_review(bad_text)


if __name__ == "__main__":
    unittest.main()
