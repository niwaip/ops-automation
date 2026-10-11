"""Tests for composite research+deliverable round budgeting and deliverable materialization."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.artifact_exporter import ArtifactExporter
from dsh_modules.deliverable_contract import materialize_pdf_from_markdown
from dsh_modules.agent_loop import (
    MAX_AGENT_ROUNDS_HARD_CEILING,
    MAX_SPREADSHEET_ROUNDS_CEILING,
    run_agent_loop,
)


class CompositeDeliverableTests(unittest.TestCase):
    def setUp(self):
        self.policy = RuntimePolicy()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_composite_bilibili_pdf_request_receives_extended_rounds(self):
        prompt = "查看今天的bilibili热点，然后生成pdf文件"
        rounds = self.policy.determine_max_rounds(
            prompt,
            is_search=True,
            deliverables=[".pdf"],
            is_generate_intent=True,
        )
        self.assertEqual(rounds, 8)

    def test_pure_pdf_deliverable_receives_standard_deliverable_rounds(self):
        prompt = "生成一份2026年销售总结.pdf"
        rounds = self.policy.determine_max_rounds(
            prompt,
            is_search=False,
            deliverables=[".pdf"],
            is_generate_intent=True,
        )
        self.assertEqual(rounds, 5)

    def test_pure_query_receives_minimal_rounds(self):
        prompt = "今天北京天气怎么样"
        rounds = self.policy.determine_max_rounds(
            prompt,
            is_search=False,
            is_generate_intent=False,
        )
        self.assertEqual(rounds, 2)

    def test_pdf_auto_materialized_from_markdown_draft(self):
        md_file = self.workspace_dir / "B站今日热点日报.md"
        md_file.write_text("# B站今日热点\n\n1. 热门视频1\n2. 热门视频2", encoding="utf-8")

        prompt = "查看今天的bilibili热点，然后生成pdf文件"

        # Mock generate_report_pdf subprocess invocation
        def fake_subprocess_run(cmd, *args, **kwargs):
            pdf_path = self.workspace_dir / "B站今日热点日报.pdf"
            pdf_path.write_bytes(b"%PDF-1.4 mock pdf content" + b" " * 100)
            mock_res = MagicMock()
            mock_res.returncode = 0
            return mock_res

        with patch("subprocess.run", side_effect=fake_subprocess_run):
            pdf_result = materialize_pdf_from_markdown(
                prompt=prompt,
                workspace_dir=str(self.workspace_dir),
                expected_deliverables=[".pdf"],
            )

        self.assertIsNotNone(pdf_result)
        self.assertTrue(pdf_result.endswith(".pdf"))
        self.assertTrue(Path(pdf_result).exists())

    def test_artifact_exporter_filters_intermediate_markdown_when_pdf_generated(self):
        pdf_file = self.workspace_dir / "B站热点日报.pdf"
        pdf_file.write_bytes(b"%PDF-1.4 mock content")
        md_file = self.workspace_dir / "B站热点日报.md"
        md_file.write_text("# Draft Markdown", encoding="utf-8")

        outbound = ArtifactExporter.export_deliverables(
            workspace_dir=str(self.workspace_dir),
            final_text="已生成文件",
            expected_deliverables=[".pdf"],
            prompt="查看B站热点并生成pdf",
        )

        file_names = [f["fileName"] for f in outbound]
        self.assertIn("B站热点日报.pdf", file_names)
        self.assertNotIn("B站热点日报.md", file_names)

    def test_ceiling_separation_preserves_spreadsheet_and_general_limits(self):
        self.assertEqual(MAX_SPREADSHEET_ROUNDS_CEILING, 4)
        self.assertGreaterEqual(MAX_AGENT_ROUNDS_HARD_CEILING, 8)


if __name__ == "__main__":
    unittest.main()
