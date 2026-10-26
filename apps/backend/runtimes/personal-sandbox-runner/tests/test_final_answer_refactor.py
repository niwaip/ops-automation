"""Tests for refactored final_answer, artifact_discovery, and image_link_sanitizer."""
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))

from dsh_modules.artifact_discovery import (
    discover_physical_artifacts,
    has_all_expected_artifacts,
    has_verified_published_receipt,
    is_valid_regular_file,
)
from dsh_modules.image_link_sanitizer import (
    sanitize_and_repair_markdown_images,
)
from dsh_modules.final_answer import (
    finalize_agent_text,
    evaluate_answer_state,
)
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult


class TestArtifactDiscovery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ws = Path(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_discover_physical_artifacts_filters_invalid_files(self):
        # 1. Zero-byte file
        (self.ws / "empty.xlsx").touch()
        # 2. Lock file
        (self.ws / "~$lock.xlsx").write_text("lock")
        # 3. Temp file
        (self.ws / "temp_123.pdf").write_text("temp")
        # 4. Hidden file
        (self.ws / ".hidden.xlsx").write_text("hidden")
        # 5. Directory matching extension
        (self.ws / "fake.xlsx").mkdir()
        # 6. Valid file
        valid = self.ws / "report.xlsx"
        valid.write_text("valid content")

        found = discover_physical_artifacts(str(self.ws), expected_deliverables=[".xlsx"])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].name, "report.xlsx")

    def test_case_insensitive_matching(self):
        pdf = self.ws / "REPORT.PDF"
        pdf.write_text("content")
        found = discover_physical_artifacts(str(self.ws), expected_deliverables=[".pdf"])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].name, "REPORT.PDF")

    def test_input_attachment_exclusion(self):
        input_file = self.ws / "source_data.xlsx"
        input_file.write_text("input")
        output_file = self.ws / "output.xlsx"
        output_file.write_text("output")

        found = discover_physical_artifacts(
            str(self.ws),
            expected_deliverables=[".xlsx"],
            input_attachments=["/workspace/source_data.xlsx"]
        )
        self.assertEqual([f.name for f in found], ["output.xlsx"])

    def test_has_all_expected_artifacts(self):
        f1 = self.ws / "report.pdf"
        f1.write_text("pdf")
        f2 = self.ws / "data.xlsx"
        f2.write_text("xlsx")
        artifacts = [f1, f2]

        self.assertTrue(has_all_expected_artifacts(artifacts, [".pdf", ".xlsx"]))
        self.assertFalse(has_all_expected_artifacts(artifacts, [".pdf", ".xlsx", ".docx"]))

    def test_verified_published_receipt(self):
        valid_file = self.ws / "out.xlsx"
        valid_file.write_text("content")

        ev_good = ToolResult.success(data={'status': 'published', 'published_file': str(valid_file)})
        ev_no_file = ToolResult.success(data={'status': 'published', 'published_file': str(self.ws / "none.xlsx")})
        ev_failed = ToolResult(status="error", data={'status': 'published', 'published_file': str(valid_file)})

        self.assertTrue(has_verified_published_receipt([ev_good], str(self.ws)))
        self.assertFalse(has_verified_published_receipt([ev_no_file], str(self.ws)))
        self.assertFalse(has_verified_published_receipt([ev_failed], str(self.ws)))


class TestImageLinkSanitizer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ws = Path(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_repairs_hallucinated_blob_url_with_existing_workspace_image(self):
        # Create an actual image file in workspace
        chart = self.ws / "部门金额柱状图.png"
        chart.write_bytes(b"\x89PNG\r\n\x1a\nfake")

        md = (
            "## 📐 柱状图预览\n\n"
            "柱状图已根据以下真实数据生成：\n\n"
            "![柱状图](blob:https://f2db5d24-3f5e-4d23-a3d5-8a0e6e6e30e9)\n\n"
            "**图表特点**: 7个部门"
        )

        repaired = sanitize_and_repair_markdown_images(md, str(self.ws))
        self.assertIn("![柱状图](/workspace/部门金额柱状图.png)", repaired)
        self.assertNotIn("blob:", repaired)

    def test_strips_broken_blob_url_when_no_image_exists(self):
        md = (
            "## 📐 柱状图预览\n\n"
            "柱状图已根据以下真实数据生成：\n\n"
            "![柱状图](blob:https://f2db5d24-3f5e-4d23-a3d5-8a0e6e6e30e9)\n\n"
            "**图表特点**: 7个部门"
        )
        repaired = sanitize_and_repair_markdown_images(md, str(self.ws))
        self.assertNotIn("![柱状图]", repaired)
        self.assertNotIn("blob:", repaired)

    def test_normalizes_relative_workspace_image_link(self):
        chart = self.ws / "dept.png"
        chart.write_bytes(b"\x89PNG\r\n\x1a\nfake")

        md = "请看图表：![统计图](dept.png)"
        repaired = sanitize_and_repair_markdown_images(md, str(self.ws))
        self.assertEqual(repaired, "请看图表：![统计图](/workspace/dept.png)")

    def test_preserves_valid_base64_and_web_urls(self):
        b64 = "![嵌入](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)"
        web = "![外部](https://example.com/logo.png)"
        md = f"{b64}\n\n{web}"
        repaired = sanitize_and_repair_markdown_images(md, str(self.ws))
        self.assertIn(b64, repaired)
        self.assertIn(web, repaired)


class TestFinalAnswerRefactor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ws = Path(self.tmp)
        self.start = time.monotonic()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_valid_short_answer_not_overwritten_by_fallback_after_nudge(self):
        """Tests that a valid concise answer returned by model after nudge is NOT
        discarded by a stale is_hollow_claim evaluation."""
        initial_reply = "文件已生成"  # Hollow claim initially

        # Model returns a valid 60-char concise factual answer
        valid_response = {"content": "已核实：总收入 1,000 万元，总成本 600 万元，净利润 400 万元。"}

        final_text, healed = finalize_agent_text(
            reply_text=initial_reply,
            messages=[{"role": "user", "content": "统计收入利润"}],
            model="test-model",
            policy=RuntimePolicy.from_env(),
            deadline=None,
            is_guide_intent=False,
            executed_calls_history=["tool1"],
            was_token_truncated=False,
            telemetry=TelemetryStats(),
            last_user_prompt="统计收入利润",
            call_model=lambda *a, **k: valid_response,
            workspace_dir=str(self.ws),
            max_agent_rounds=10,
            max_spreadsheet_rounds=4,
        )

        self.assertIn("已核实：总收入 1,000 万元", final_text)
        self.assertNotIn("未输出最终有效正文", final_text)
        self.assertNotIn("由于当前执行预算耗尽", final_text)

    def test_metric_contract_warning_not_suppressed_by_random_html(self):
        """Random HTML snippet must NOT suppress missing business metrics."""
        prompt = "统计2024年度总营收与净利润"
        # HTML that does not have metrics
        fake_html = "```html\n<div>hello world</div>\n```"

        final_text, _ = finalize_agent_text(
            reply_text=fake_html,
            messages=[{"role": "user", "content": prompt}],
            model="test-model",
            policy=RuntimePolicy.from_env(),
            deadline=None,
            is_guide_intent=False,
            executed_calls_history=["bash"],
            was_token_truncated=False,
            telemetry=TelemetryStats(),
            last_user_prompt=prompt,
            call_model=lambda *a, **k: {},
            workspace_dir=str(self.ws),
            max_agent_rounds=1,
            max_spreadsheet_rounds=1,
        )

        self.assertIn("【指标核算未完成声明】", final_text)

    def test_repairs_blob_url_in_final_answer(self):
        """Tests that finalize_agent_text sanitizes hallucinated blob images."""
        chart = self.ws / "部门金额柱状图.png"
        chart.write_bytes(b"\x89PNG\r\n\x1a\nfake")

        reply = (
            "✨ 交互式页面已生成完毕！\n"
            "输出文件：/workspace/index.html\n\n"
            "```html\n<!DOCTYPE html><html><body><h1>看板</h1></body></html>\n```\n\n"
            "![柱状图](blob:https://f2db5d24-3f5e-4d23-a3d5-8a0e6e6e30e9)"
        )

        final_text, _ = finalize_agent_text(
            reply_text=reply,
            messages=[{"role": "user", "content": "生成柱状图"}],
            model="test-model",
            policy=RuntimePolicy.from_env(),
            deadline=None,
            is_guide_intent=False,
            executed_calls_history=[],
            was_token_truncated=False,
            telemetry=TelemetryStats(),
            last_user_prompt="生成柱状图",
            call_model=lambda *a, **k: {},
            workspace_dir=str(self.ws),
            max_agent_rounds=10,
            max_spreadsheet_rounds=4,
        )

        self.assertIn("![柱状图](/workspace/部门金额柱状图.png)", final_text)
        self.assertNotIn("blob:", final_text)


class TestZeroToolCalculationGuard(unittest.TestCase):
    def test_intercepts_zero_tool_reply_with_uncalculated_numbers(self):
        from dsh_modules.sampling_guard import check_zero_tool_calculation_guard

        prompt = "【当前轮次用户上传附件】: 明细.xlsx\n用户指令：按部门统计 金额的合计，不包含（WBS编号）中ex开头的数据，生成柱状图"
        # Reply with hand-written / uncalculated HTML table numbers
        reply = (
            "✨ 交互式页面已生成！\n"
            "```html\n"
            "<table><tr><td>华东</td><td>1,887.73 K</td></tr></table>\n"
            "<script>const dataValues = [677.59, 328.78];</script>\n"
            "```"
        )

        issue = check_zero_tool_calculation_guard(
            reply_text=reply,
            last_user_prompt=prompt,
            executed_calls_history=[],
            execution_evidence=[],
            is_guide_intent=False
        )
        self.assertIsNotNone(issue)
        self.assertIn("系统数据核验拦截", issue)
        self.assertIn("aggregate_spreadsheet", issue)

    def test_passes_when_computational_tool_executed(self):
        from dsh_modules.sampling_guard import check_zero_tool_calculation_guard

        prompt = "【当前轮次用户上传附件】: 明细.xlsx\n用户指令：按部门统计 金额的合计，不包含（WBS编号）中ex开头的数据，生成柱状图"
        reply = "```html\n<table><tr><td>华东</td><td>1,637.42 K</td></tr></table>\n```"

        # Case 1: with aggregate_spreadsheet in history
        issue = check_zero_tool_calculation_guard(
            reply_text=reply,
            last_user_prompt=prompt,
            executed_calls_history=["aggregate_spreadsheet:ok"],
            execution_evidence=[],
            is_guide_intent=False
        )
        self.assertIsNone(issue)

        # Case 2: with bash python in evidence
        ev = ToolResult.success(data="1637.42", provenance={"tool": "bash", "cmd": "python3 calc.py"})
        issue2 = check_zero_tool_calculation_guard(
            reply_text=reply,
            last_user_prompt=prompt,
            executed_calls_history=["bash:ok"],
            execution_evidence=[ev],
            is_guide_intent=False
        )
        self.assertIsNone(issue2)

    def test_passes_for_non_spreadsheet_task(self):
        from dsh_modules.sampling_guard import check_zero_tool_calculation_guard

        prompt = "帮我生成一个贪吃蛇html游戏"
        reply = "```html\n<canvas id='game'></canvas>\n```"

        issue = check_zero_tool_calculation_guard(
            reply_text=reply,
            last_user_prompt=prompt,
            executed_calls_history=[],
            execution_evidence=[],
            is_guide_intent=False
        )
        self.assertIsNone(issue)


class TestRequiresSpreadsheetAnalysis(unittest.TestCase):
    def test_hybrid_spreadsheet_and_chart_task_requires_analysis(self):
        from dsh_modules.spreadsheet_analysis_evidence import requires_spreadsheet_analysis

        class MockSkillRes:
            source_formats = [".xlsx"]
            skill_id = "xlsx"
            is_generate_intent = True
            is_modify_intent = False
            requires_execution = False
            is_guide_intent = False

        prompt = "按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，生成柱状图"
        res = requires_spreadsheet_analysis(prompt, MockSkillRes())
        self.assertTrue(res, "Hybrid calculation + visual chart task must require spreadsheet analysis")

    def test_requires_execution_does_not_suppress_analysis_for_hybrid_task(self):
        from dsh_modules.spreadsheet_analysis_evidence import requires_spreadsheet_analysis

        class MockSkillRes:
            source_formats = [".xlsx"]
            skill_id = "xlsx"
            is_generate_intent = True
            is_modify_intent = False
            requires_execution = True  # Audit Finding 2: requires_execution must NOT suppress analysis
            is_guide_intent = False

        prompt = "按部门统计 金额的合计，不包含（WBS编号）中ex开头的数据，生成柱状图"
        res = requires_spreadsheet_analysis(prompt, MockSkillRes())
        self.assertTrue(res, "requires_execution=True should not suppress spreadsheet analysis for hybrid tasks")


class TestDeliveryReconciliationEvidence(unittest.TestCase):
    def test_reconciles_amount_from_execution_evidence_facts(self):
        from dsh_modules.delivery_reconciliation import reconcile_delivery_presentation
        from dsh_modules.tool_result import ToolResult
        from decimal import Decimal

        ev = ToolResult.success(
            data={
                "kind": "spreadsheet_analysis",
                "facts": [
                    {"label": "金额合计", "op": "sum", "value": "1637.42", "unit": "K"}
                ]
            },
            provenance={"tool": "aggregate_spreadsheet"}
        )

        reply = "- **总金额(K)**：1,887.730\n按部门统计如下..."
        reconciled = reconcile_delivery_presentation(
            reply_text=reply,
            workspace_dir="/tmp",
            prompt="按部门统计 金额的合计",
            execution_evidence=[ev]
        )
        self.assertIn("1,637.420", reconciled)
        self.assertNotIn("1,887.730", reconciled)


if __name__ == '__main__':
    unittest.main()

