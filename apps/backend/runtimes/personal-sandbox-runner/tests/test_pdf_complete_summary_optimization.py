"""Regression tests for PDF text extraction, PUA cleanup, complete-attachment pruning, and thinking retention."""

import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

SRC_DIR = Path(__file__).resolve().parent.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from dsh_modules import config as cfg
from dsh_modules.office_tools import extract_pdf_text, format_unsliced_document_view
from dsh_modules.pdf_text_cache import (
    _FULL_DOC_CACHE,
    _SAMPLED_PAGES_CACHE,
    clean_pdf_text,
    extract_pdf_document,
    sha256_file_chunked,
)
from dsh_modules.prompt_builder import build_user_turn
from dsh_modules.skill_router import SkillRouter
from dsh_modules.tool_routing import select_active_tools
from dsh_modules.visual_reading_policy import (
    filter_reading_tools,
    is_attachment_view_complete,
    profile_pdf,
    reading_guidance,
)


def _make_text_pdf(path: Path, pages_lines: list[str]) -> Path:
    writer = PdfWriter()
    for text in pages_lines:
        page = writer.add_blank_page(width=400, height=500)
        font = DictionaryObject({
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        })
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        stream = DecodedStreamObject()
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream.set_data(f"BT /F1 11 Tf 20 460 Td ({safe}) Tj ET".encode("latin1"))
        page[NameObject("/Contents")] = writer._add_object(stream)
    writer.write(path)
    return path


class TestPdfCompleteSummaryOptimization(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ws = Path(self.tmp.name)
        self._orig_ws = cfg.WORKSPACE_DIR
        cfg.WORKSPACE_DIR = str(self.ws)
        _SAMPLED_PAGES_CACHE.clear()
        _FULL_DOC_CACHE.clear()
        profile_pdf.cache_clear() if hasattr(profile_pdf, "cache_clear") else None

    def tearDown(self):
        cfg.WORKSPACE_DIR = self._orig_ws
        self.tmp.cleanup()

    def test_clean_pdf_text_removes_pua_icons_without_losing_content(self):
        raw = "\ue2c8 控制文件\n\ue838  \ueb8e\n250K+ GITHUB STARS\n\n\uf221\nModularity & AZTA"
        cleaned = clean_pdf_text(raw)
        self.assertEqual(cleaned, "控制文件\n250K+ GITHUB STARS\n\nModularity & AZTA")

    def test_sha256_file_chunked_matches_standard_digest(self):
        p = self.ws / "big.bin"
        payload = b"OpenClaw-Security-" * 70000  # > 1 MiB chunk boundary
        p.write_bytes(payload)
        self.assertEqual(sha256_file_chunked(p, chunk_size=65536), hashlib.sha256(payload).hexdigest())

    def test_single_pass_sampling_cache_reused_and_no_workspace_txt_pollution(self):
        pdf_path = _make_text_pdf(self.ws / "report.pdf", [
            "Module 01 Background Overview " * 6,
            "Module 02 Architecture Analysis " * 6,
            "Module 03 Attack Cases Vidar " * 6,
        ])
        extract_calls = 0
        import pdfplumber

        orig_extract = pdfplumber.page.Page.extract_text

        def counted_extract(page_self, *args, **kwargs):
            nonlocal extract_calls
            extract_calls += 1
            return orig_extract(page_self, *args, **kwargs)

        with patch.object(pdfplumber.page.Page, "extract_text", counted_extract):
            prof = profile_pdf(pdf_path)
            self.assertEqual(prof["reading_mode"], "native_text")
            first_extracts = extract_calls
            self.assertEqual(first_extracts, 3)

            doc = extract_pdf_document(pdf_path)
            # Reused sampled pages instead of calling extract_text() again!
            self.assertEqual(extract_calls, first_extracts)
            self.assertEqual(doc["extractor"], "pdfplumber")
            self.assertIn("Module 01 Background Overview", doc["combined_text"])
            self.assertIn("Module 03 Attack Cases Vidar", doc["combined_text"])

        # Never pollute workspace root with report.txt or report.pdf.txt
        self.assertFalse((self.ws / "report.txt").exists())
        self.assertFalse((self.ws / "report.pdf.txt").exists())
        cache_dir = self.ws / ".dsh" / "cache" / "pdf_text"
        self.assertTrue(cache_dir.exists() and list(cache_dir.glob("*.json")))

    def test_untruncated_pdf_view_marks_text_complete_and_keeps_native_review(self):
        pdf_path = _make_text_pdf(self.ws / "brief.pdf", ["Section 1 facts", "Section 2 conclusion"])
        rendered = extract_pdf_text(pdf_path, max_chars=24000)
        self.assertIn("已完整展示全部", rendered)
        self.assertIn("共 2 页", rendered)
        self.assertNotIn("长文档截断提醒", rendered)

        prof = profile_pdf(pdf_path)
        self.assertTrue(is_attachment_view_complete("brief.pdf", rendered, rendered, [prof]))

        guidance = reading_guidance("查看和归纳内容", ["brief.pdf"], [prof], complete_files={"brief.pdf"})
        self.assertIn("无需再调用 read_file", guidance)
        self.assertNotIn("分段补读全文", guidance)

        route = SkillRouter.route("查看和归纳内容", [], files=["brief.pdf"], load_skill_context=False)
        fake_mcp = [{"id": "mcp-1", "name": "WeatherPro", "aliases": ["WeatherPro"], "triggers": ["WeatherPro"], "source": "mcp"}]
        with patch("dsh_modules.mcp_skill_catalog.available_mcp_skills", return_value=fake_mcp):
            tools = select_active_tools(
                "查看和归纳内容",
                route,
                is_search_intent=False,
                has_web_search_permission=True,
                session_files=["brief.pdf"],
                attachment_profiles=[prof],
                complete_files={"brief.pdf"},
            )
        self.assertEqual([t['function']['name'] for t in tools], ['read_file'])

    def test_mcp_skill_explicitly_mentioned_stays_available_with_attachment(self):
        pdf_path = _make_text_pdf(self.ws / "brief.pdf", ["Section 1 facts"])
        prof = profile_pdf(pdf_path)
        fake_mcp = [{"id": "mcp-1", "name": "Example Docs", "aliases": ["Example Docs"], "triggers": ["Example Docs"], "source": "mcp"}]
        route = SkillRouter.route("查看 brief.pdf 并查询 Example Docs", [], files=["brief.pdf"], load_skill_context=False)
        with patch("dsh_modules.mcp_skill_catalog.available_mcp_skills", return_value=fake_mcp):
            tools = select_active_tools(
                "查看 brief.pdf 并查询 Example Docs",
                route,
                is_search_intent=False,
                has_web_search_permission=True,
                session_files=["brief.pdf"],
                attachment_profiles=[prof],
                complete_files={"brief.pdf"},
            )
        names = {t["function"]["name"] for t in tools}
        self.assertTrue({"read_skill", "list_external_tools", "call_external_tool"} <= names)

    def test_prompt_builder_inline_complete_doc_has_no_spreadsheet_contradiction(self):
        turn = build_user_turn(
            prompt="查看和归纳内容",
            session_files=["brief.pdf"],
            file_context="【PDF 文档 (brief.pdf) 内容提取（已完整展示全部 2 行，共 1 页）】:\n正文内容",
            is_inspect_intent=True,
            is_generate_intent=False,
            available_tool_names=[],
        )
        self.assertIn("内容核查与严谨表述准则", turn)
        self.assertNotIn("确定性核算工具", turn)
        self.assertNotIn("[Available Capabilities]: 。", turn)
        self.assertIn("[Available Capabilities]: none", turn)
        self.assertIn("逐一覆盖全部主要模块", turn)

    def test_pure_complete_pdf_cmd_run_uses_single_llm_call_and_preserves_thinking(self):
        from dsh_modules import runner

        pdf_path = _make_text_pdf(self.ws / "67页_测试报告.pdf", [
            "Module 01 Background 250K+ Stars",
            "Module 02 Architecture",
            "Module 03 Attack Cases",
            "Module 04 Audit Defense",
            "Module 05 Enterprise AZTA",
            "Module 06 Conclusion",
        ])
        captured_calls = []

        def fake_model_proxy(messages, model, tools=None, policy=None, **kwargs):
            captured_calls.append({
                "tools": tools,
                "thinking": getattr(policy, "thinking", None),
                "effort": getattr(policy, "reasoning_effort", None),
                "messages": messages,
            })
            return {
                "content": "## Module 01-06\n完整归纳内容",
                "reasoning_content": "分析六大模块结构...",
                "tool_calls": [],
                "usage": {"prompt_tokens": 500, "completion_tokens": 120, "total_tokens": 620},
                "total_ms": 50.0,
                "ttft_ms": 10.0,
                "finish_reason": "stop",
            }

        args = SimpleNamespace(
            query=["查看和归纳内容"],
            session_id="test-pdf-opt-session",
            files=[pdf_path.name],
            model="mock-model",
            model_display_name="mock-model",
            web_search=True,
            thinking=True,
            reasoning_effort="medium",
            research=False,
            no_plan=False,
        )
        fake_mcp = [{"id": "mcp-1", "name": "OtherTool", "aliases": ["OtherTool"], "triggers": ["OtherTool"], "source": "mcp"}]
        with patch.object(runner, "WORKSPACE_DIR", str(self.ws)), \
             patch("dsh_modules.agent_loop.WORKSPACE_DIR", str(self.ws)), \
             patch("dsh_modules.file_tools.WORKSPACE_DIR", str(self.ws)), \
             patch("dsh_modules.mcp_skill_catalog.available_mcp_skills", return_value=fake_mcp), \
             patch("dsh_modules.personal_knowledge_search.scan_personal_knowledge") as mock_kn, \
             patch("dsh_modules.agent_loop.call_model_proxy", side_effect=fake_model_proxy):
            runner.cmd_run(args)

        mock_kn.assert_not_called()
        self.assertEqual(len(captured_calls), 1)
        self.assertEqual([t['function']['name'] for t in captured_calls[0]['tools']], ['read_file'])
        self.assertTrue(captured_calls[0]["thinking"])
        self.assertEqual(captured_calls[0]["effort"], "medium")
        self.assertIn('内容核查与严谨表述准则', captured_calls[0]['messages'][-1]['content'])
        self.assertFalse((self.ws / ".dsh" / "inputs_backup" / pdf_path.name).exists())
        self.assertFalse((self.ws / "67页_测试报告.txt").exists())
        self.assertFalse((self.ws / "67页_测试报告.pdf.txt").exists())

    def test_truncated_pdf_keeps_read_file_and_continuation_guidance(self):
        pdf_path = _make_text_pdf(
            self.ws / "85页_长报告.pdf",
            [f"Page {i} detailed analysis paragraph " + ("data " * 80) for i in range(1, 20)],
        )
        rendered = extract_pdf_text(pdf_path, max_chars=2400)
        prof = profile_pdf(pdf_path)
        self.assertIn("长文档截断提醒", rendered)
        self.assertFalse(is_attachment_view_complete("85页_长报告.pdf", rendered, rendered, [prof]))

        guidance = reading_guidance("查看和归纳内容", ["85页_长报告.pdf"], [prof], complete_files=set())
        self.assertIn("分段补读全文", guidance)

        route = SkillRouter.route("查看和归纳内容", [], files=["85页_长报告.pdf"], load_skill_context=False)
        fake_mcp = [{"id": "mcp-1", "name": "OtherTool", "aliases": ["OtherTool"], "triggers": ["OtherTool"], "source": "mcp"}]
        with patch("dsh_modules.mcp_skill_catalog.available_mcp_skills", return_value=fake_mcp):
            tools = select_active_tools(
                "查看和归纳内容",
                route,
                is_search_intent=False,
                has_web_search_permission=True,
                session_files=["85页_长报告.pdf"],
                attachment_profiles=[prof],
                complete_files=set(),
            )
        names = {t["function"]["name"] for t in tools}
        self.assertEqual(names, {"read_file"})


if __name__ == "__main__":
    unittest.main()
