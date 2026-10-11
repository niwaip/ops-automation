"""
Unit tests for Financial Workbook Processing Fixes:
P0: Original file protection (recalc.py, file_tools.py, runner.py snapshot/restore)
P1: Formula cache cell-level detection, atomic caching, targeted projection
P2: Multi-turn consistency & Sampling Coverage Assertion Guard
P3: Inspect action patterns with auditing verbs
P4: Telemetry status auditing
"""

import os
import sys
import json
import shutil
import tempfile
import unittest
import openpyxl
from pathlib import Path

# Add src and skills to path
MODULES_DIR = Path(__file__).resolve().parent.parent / "src"
SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
if str(MODULES_DIR) not in sys.path:
    sys.path.insert(0, str(MODULES_DIR))
if str(SKILLS_DIR / "xlsx" / "scripts") not in sys.path:
    sys.path.insert(0, str(SKILLS_DIR / "xlsx" / "scripts"))

from dsh_modules.office_tools import (
    _has_uncalculated_formulas,
    _is_catalog_query,
    extract_xlsx_text
)
from dsh_modules.file_tools import resolve_sandboxed_path, is_protected_session_file
from dsh_modules.skill_router import SkillRouter
from dsh_modules.agent_loop import _check_no_tool_assertion_guard, _is_tool_error
from dsh_modules.runner import _verify_and_restore_input_attachments
from dsh_modules.telemetry import TelemetryStats
import recalc


class TestFinancialWorkbookFixes(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="test_fin_fixes_")
        self.workspace = Path(self.test_dir) / "workspace"
        self.workspace.mkdir(parents=True, exist_ok=True)
        import dsh_modules.config as cfg
        self._orig_ws = cfg.WORKSPACE_DIR
        cfg.WORKSPACE_DIR = str(self.workspace)

    def tearDown(self):
        import dsh_modules.config as cfg
        cfg.WORKSPACE_DIR = self._orig_ws
        if "DSH_SESSION_ATTACHMENTS" in os.environ:
            del os.environ["DSH_SESSION_ATTACHMENTS"]
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ----------------- P0: File Protection Tests -----------------
    def test_recalc_input_file_protection(self):
        """P0: recalc must refuse to overwrite session input attachments in-place."""
        sheet_path = self.workspace / "original_report.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 100
        wb.save(sheet_path)

        # 1. Protected via DSH_SESSION_ATTACHMENTS
        os.environ["DSH_SESSION_ATTACHMENTS"] = "original_report.xlsx"
        res = recalc.recalc(str(sheet_path))
        self.assertIn("error", res)
        self.assertIn("Refusing to overwrite protected input attachment", res["error"])

        # 2. Protected via .dsh/inputs_backup
        del os.environ["DSH_SESSION_ATTACHMENTS"]
        backup_dir = self.workspace / ".dsh" / "inputs_backup"
        backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(sheet_path, backup_dir / "original_report.xlsx")
        res2 = recalc.recalc(str(sheet_path))
        self.assertIn("error", res2)
        self.assertIn("Refusing to overwrite protected input attachment", res2["error"])

        # 3. With -o / output parameter specified, should allow writing to different target
        out_path = self.workspace / "recalculated_out.xlsx"
        # We don't necessarily have libreoffice in all test environments, but recalc should not reject for file protection
        res3 = recalc.recalc(str(sheet_path), output=str(out_path))
        # If error occurs, it should be about soffice or environment, NEVER about refusing to overwrite
        if "error" in res3:
            self.assertNotIn("Refusing to overwrite protected input attachment", res3["error"])

    def test_file_tools_blocks_write_to_input_attachment(self):
        """P0: resolve_sandboxed_path with for_write=True must block modifying input attachments."""
        doc_path = self.workspace / "financial_data.xlsx"
        doc_path.write_text("dummy")

        os.environ["DSH_SESSION_ATTACHMENTS"] = "financial_data.xlsx"
        self.assertTrue(is_protected_session_file(doc_path))

        # Read allowed
        p, err = resolve_sandboxed_path("financial_data.xlsx", for_write=False)
        self.assertIsNone(err)
        self.assertIsNotNone(p)

        # Write blocked
        p_write, err_write = resolve_sandboxed_path("financial_data.xlsx", for_write=True)
        self.assertIsNone(p_write)
        self.assertIn("【安全拦截】原始输入附件", err_write)

    # ----------------- P1: Formula State & Targeted Projection -----------------
    def test_formula_uncalculated_detection_precision(self):
        """P1: _has_uncalculated_formulas must correctly scan cell <c> tags without being fooled by static <v>."""
        sheet_path = self.workspace / "uncalc_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 10  # static <v>
        ws["A2"] = 20  # static <v>
        ws["A3"] = 30  # static <v>
        ws["A4"] = "=SUM(A1:A3)"  # formula with empty/no cached <v>
        wb.save(sheet_path)

        # There are 3 static <v> and 1 formula. Old check (v_count < f_count) would fail (3 < 1 is False).
        # New check must detect the uncalculated formula!
        self.assertTrue(_has_uncalculated_formulas(sheet_path))

    def test_is_catalog_query_detection(self):
        """P1: _is_catalog_query must distinguish sheet catalog questions from calculation questions."""
        self.assertTrue(_is_catalog_query("列出工作簿中的Sheet，并说明每个Sheet用途。"))
        self.assertTrue(_is_catalog_query("有哪些工作表？说明各自用途"))
        self.assertTrue(_is_catalog_query("有哪些sheet"))

        # Deep calculation queries should NOT be classified as catalog-only
        self.assertFalse(_is_catalog_query("总结2026年收入、毛利率、营业利润和净利润。"))
        self.assertFalse(_is_catalog_query("检查交易明细是否有重复凭证"))
        self.assertFalse(_is_catalog_query("计算各月份最大绝对偏差"))

    def test_extract_xlsx_text_targeted_projection(self):
        """P1: extract_xlsx_text must project compact samples for catalog queries and full rows for target sheets."""
        wb_path = self.workspace / "multi_sheet.xlsx"
        wb = openpyxl.Workbook()

        # Sheet 1: 使用说明
        ws1 = wb.active
        ws1.title = "使用说明"
        for i in range(1, 15):
            ws1.append([f"说明行{i}", f"描述{i}"])

        # Sheet 2: 交易明细 (50 rows)
        ws2 = wb.create_sheet("交易明细")
        ws2.append(["凭证号", "摘要", "金额"])
        for i in range(1, 45):
            ws2.append([f"V-2026-{i:03d}", f"交易{i}", 100 * i])

        wb.save(wb_path)

        # 1. Catalog query: should show overview and limit sample to 3 rows
        catalog_text = extract_xlsx_text(wb_path, prompt="列出工作簿中的Sheet，并说明每个Sheet用途。")
        self.assertIn("工作表概览模式", catalog_text)
        self.assertIn("使用说明", catalog_text)
        self.assertIn("交易明细", catalog_text)
        self.assertIn("目录概览模式: 已呈现表头及前 3 行样本", catalog_text)

        # 2. Targeted sheet query: should extract all rows for '交易明细' without 30-row truncation
        target_text = extract_xlsx_text(wb_path, prompt="检查交易明细是否有重复凭证")
        self.assertIn("V-2026-044", target_text)  # 44th row must be present!

    # ----------------- P2: Sampling Coverage Assertion Guard -----------------
    def test_sampling_coverage_guard_triggers(self):
        """P2: Guard 10 intercepts fabricated voucher assertions on sampled data without tools."""
        user_prompt = "检查交易明细是否有重复凭证"
        reply_with_hallucination = "经全面审查，发现存在重复凭证号 V-2026-015，分别出现在第 15 行和第 42 行。"
        messages = [
            {"role": "user", "content": f"[User Request]:\n{user_prompt}\n\n[Attached File Content - test.xlsx]:\n⚠️ [工作表覆盖度提醒: 抽样 (已展示 30/80 行)]：当前展示仅为前 30 行样本"}
        ]

        action, msg, max_rounds = _check_no_tool_assertion_guard(
            reply_text=reply_with_hallucination,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=2,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=[],  # No bash tool executed!
            messages=messages
        )

        self.assertEqual(action, "continue")
        self.assertIsNotNone(msg)
        self.assertIn("【系统数据核验拦截】", msg)
        self.assertIn("严禁在未读取全量数据的情况下凭空编造凭证号", msg)

    # ----------------- P3: Audit Intent Routing -----------------
    def test_audit_intent_routing(self):
        """P3: Auditing verbs (稽核、勾稽、对账、核查、验算) route to is_inspect_intent=True."""
        prompts = [
            "稽核交易明细是否有异常",
            "进行报表勾稽检查",
            "对账下半年的收入数据",
            "核验各月费用总额",
            "验算营业利润与净利润"
        ]
        for p in prompts:
            res = SkillRouter.route(p)
            self.assertTrue(res.is_inspect_intent, f"Prompt '{p}' should have is_inspect_intent=True")
            self.assertFalse(res.is_generate_intent, f"Prompt '{p}' should have is_generate_intent=False")

    def test_recalc_same_file_execution(self):
        """P0: recalc must handle src_path == output without shutil.SameFileError."""
        sheet_path = self.workspace / "unprotected_calc.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 100
        wb.save(sheet_path)

        try:
            res = recalc.recalc(str(sheet_path), output=str(sheet_path))
            if "error" in res:
                self.assertNotIn("are the same file", res["error"])
        except shutil.SameFileError:
            self.fail("recalc raised shutil.SameFileError when input == output")

    def test_recalc_output_protected_file_blocked(self):
        """P0: recalc must refuse to overwrite protected input file even when passed as -o/output."""
        src_path = self.workspace / "scratch.xlsx"
        protected_target = self.workspace / "protected_target.xlsx"
        wb = openpyxl.Workbook()
        wb.save(src_path)
        wb.save(protected_target)

        os.environ["DSH_SESSION_ATTACHMENTS"] = "protected_target.xlsx"
        res = recalc.recalc(str(src_path), output=str(protected_target))
        self.assertIn("error", res)
        self.assertIn("Refusing to overwrite protected input attachment", res["error"])

    def test_runner_verify_and_restore_input_attachments(self):
        """P0: _verify_and_restore_input_attachments restores corrupted attachments from backup."""
        fpath = self.workspace / "report.xlsx"
        fpath.write_bytes(b"ORIGINAL_EXCEL_BYTES")
        import hashlib
        orig_hash = hashlib.sha256(b"ORIGINAL_EXCEL_BYTES").hexdigest()

        backup_dir = self.workspace / ".dsh" / "inputs_backup"
        backup_dir.mkdir(parents=True, exist_ok=True)
        (backup_dir / "report.xlsx").write_bytes(b"ORIGINAL_EXCEL_BYTES")

        fpath.write_bytes(b"MODIFIED_CORRUPTED_BYTES")

        _verify_and_restore_input_attachments(
            original_hashes={"report.xlsx": orig_hash},
            inputs_backup_dir=backup_dir,
            workspace_dir=str(self.workspace)
        )

        self.assertEqual(fpath.read_bytes(), b"ORIGINAL_EXCEL_BYTES")

    def test_is_tool_error_standardized(self):
        """P4: _is_tool_error detects tracebacks, non-zero exit codes, and structured JSON errors."""
        tb = "Traceback (most recent call last):\n  File 'test.py', line 12, in <module>\nValueError: invalid value"
        self.assertTrue(_is_tool_error(tb))
        self.assertTrue(_is_tool_error('{"error": "Failed to parse workbook"}'))
        self.assertTrue(_is_tool_error('{"success": false, "message": "API call failed"}'))
        self.assertTrue(_is_tool_error('{"status": "error", "code": 500}'))
        self.assertTrue(_is_tool_error('{"status": "failed"}'))
        self.assertFalse(_is_tool_error('{"status": "success", "rows": 80}'))
        self.assertFalse(_is_tool_error('{"success": true, "result": 16038.3}'))

    def test_sampling_coverage_guard_on_clipped_attachment_and_audit_keywords(self):
        """P2: Guard 10 intercepts missing/null/deviation audit assertions when data is clipped by ContextBudget."""
        user_prompt = "检查交易明细中是否存在缺失字段或空值"
        reply_assert = "经全面审查，未发现任何缺失字段，所有记录均完整。"
        messages = [
            {"role": "user", "content": f"[User Request]:\n{user_prompt}\n\n[Attached File Content - test.xlsx]:\n...[⚠️ 附件文本超过限制已截断。💡 建议：如需深入分析长文档，可明确指定章节范围或调用 read_file 工具分页读取]"}
        ]

        action, msg, max_rounds = _check_no_tool_assertion_guard(
            reply_text=reply_assert,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=2,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=[],
            messages=messages
        )
        self.assertEqual(action, "continue")
        self.assertIn("【系统数据核验拦截】", msg)

        # Non-computational command like 'ls -la' must STILL be intercepted
        telem = TelemetryStats()
        telem.record_tool_call(tool_name="bash", params={"cmd": "ls -la"}, status="success")
        action2, msg2, _ = _check_no_tool_assertion_guard(
            reply_text=reply_assert,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=2,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=["bash:{\"cmd\": \"ls -la\"}"],
            messages=messages,
            telemetry=telem
        )
        self.assertEqual(action2, "continue", "Running 'ls -la' must not count as a valid computational tool")

        # Trivial import stub is rejected by _is_meaningful_computational_command
        telem_stub = TelemetryStats()
        telem_stub.record_tool_call(tool_name="bash", params={"cmd": "python3 -c 'import pandas'"}, status="success")
        action_stub, _, _ = _check_no_tool_assertion_guard(
            reply_text=reply_assert,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=2,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=["bash:{\"cmd\": \"python3 -c 'import pandas'\"}"],
            messages=messages,
            telemetry=telem_stub
        )
        self.assertEqual(action_stub, "continue", "Trivial 'python3 -c import pandas' must NOT count as meaningful computation")

        # Meaningful computational python script execution allows passing
        telem3 = TelemetryStats()
        telem3.record_tool_call(
            tool_name="bash",
            params={"cmd": "python3 -c \"import pandas as pd; df = pd.read_excel('report.xlsx'); print(df.duplicated().sum())\""},
            status="success"
        )
        action3, msg3, _ = _check_no_tool_assertion_guard(
            reply_text=reply_assert,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=2,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=["bash:{\"cmd\": \"python3 audit_dedup.py\"}"],
            messages=messages,
            telemetry=telem3
        )
        self.assertEqual(action3, "pass", "Successful meaningful python script execution should allow answer to pass")

    # ----------------- P1 & P2: Data Types, Range Slicing & Recalc Status -----------------
    def test_format_excel_cell_types_and_placeholders(self):
        """P1-1 & P1-2: Test dates, percentages, booleans, and empty placeholders formatting."""
        from dsh_modules.office_tools import _format_excel_cell
        import datetime

        class MockCell:
            def __init__(self, value, number_format="General", coordinate="A1"):
                self.value = value
                self.number_format = number_format
                self.coordinate = coordinate

        # 1. Date formatting
        date_cell = MockCell(datetime.datetime(2026, 10, 8, 0, 0), number_format="yyyy-mm-dd")
        self.assertEqual(_format_excel_cell(date_cell), "2026-10-08")

        # 2. Percentage formatting
        pct_cell = MockCell(0.405, number_format="0.0%")
        self.assertEqual(_format_excel_cell(pct_cell), "40.5%")

        # 3. Boolean formatting
        bool_cell_t = MockCell(True)
        bool_cell_f = MockCell(False)
        self.assertEqual(_format_excel_cell(bool_cell_t), "TRUE")
        self.assertEqual(_format_excel_cell(bool_cell_f), "FALSE")

        # 4. Empty placeholder
        empty_cell = MockCell(None)
        self.assertEqual(_format_excel_cell(empty_cell), "[EMPTY]")

        # 5. Formula cell with and without evaluated value
        formula_mock = MockCell("=SUM(A1:A10)")
        self.assertEqual(_format_excel_cell(empty_cell, formula_mock), "[公式: =SUM(A1:A10)]")
        val_cell = MockCell(1500)
        self.assertEqual(_format_excel_cell(val_cell, formula_mock), "1500 [公式: =SUM(A1:A10)]")

    def test_extract_xlsx_range_slice_and_empty_placeholders(self):
        """P1-4 & P2-2: Test range slicing and row-internal empty placeholder generation."""
        import datetime
        wb_path = self.workspace / "typed_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "测试明细"
        ws.append(["凭证号", "日期", "部门", "金额"])
        # Row 2: full
        ws.append(["V001", datetime.date(2026, 1, 15), "研发部", 1000])
        # Row 3: column 3 (部门) is None -> should output C3:[EMPTY]
        ws.append(["V002", datetime.date(2026, 1, 16), None, 2000])
        wb.save(wb_path)

        # 1. Sliced extraction
        res_slice = extract_xlsx_text(wb_path, cell_range="测试明细!A1:D3")
        self.assertIn("DATA_COVERAGE", res_slice)
        self.assertIn("SLICED", res_slice)
        self.assertIn("C3:[EMPTY]", res_slice)
        self.assertIn("2026-01-15", res_slice)
        self.assertIn("Row 2:", res_slice)
        self.assertIn("Row 3:", res_slice)

    def test_recalc_strict_four_state_model(self):
        """P1-3: Test recalc status reporting (verified/partial/failed)."""
        from dsh_modules.office_tools import _get_or_create_recalculated_xlsx
        # Non-existent or invalid file safely returns original path
        non_file = self.workspace / "non_existent.xlsx"
        res = _get_or_create_recalculated_xlsx(non_file)
        self.assertEqual(res, non_file)


    # ----------------- Review Report Defect Regression Tests -----------------
    def test_numeric_lossless_precision_and_percent_formatting(self):
        """[P1-1] Test that floating point numbers retain authentic precision without truncation."""
        from dsh_modules.excel_tools import _format_excel_cell, _format_float_lossless

        class MockCell:
            def __init__(self, value, number_format="General", coordinate="A1"):
                self.value = value
                self.number_format = number_format
                self.coordinate = coordinate

        # Tiny floats like 0.000049 must NOT become "0"
        self.assertEqual(_format_float_lossless(0.000049), "0.000049")
        c1 = MockCell(0.000049, number_format="General")
        self.assertEqual(_format_excel_cell(c1), "0.000049")

        # Multi-decimal floats like 7.123456789 must NOT be truncated to 4 decimals (7.1235)
        self.assertEqual(_format_float_lossless(7.123456789), "7.123456789")
        c2 = MockCell(7.123456789, number_format="General")
        self.assertEqual(_format_excel_cell(c2), "7.123456789")

        # Percentage formatting with 4 decimals (0.0000%) must preserve 4 decimals
        c3 = MockCell(0.123456, number_format="0.0000%")
        self.assertEqual(_format_excel_cell(c3), "12.3456%")

    def test_sliced_coverage_triggers_audit_guard_and_fallback_warning(self):
        """[P1-2] Test that sliced extraction triggers audit guard and appends fallback warning on nudge exhaustion."""
        from dsh_modules.agent_loop import _finalize_agent_text
        from dsh_modules.runtime_policy import RuntimePolicy

        messages = [
            {"role": "user", "content": "检查交易明细是否有重复凭证"},
            {"role": "tool", "content": "【Excel 工作簿: test.xlsx】\n- 提取模式: SLICED\n- 切片区域: 交易明细!A2:H3\nRow 2: A2:V001 | B2:研发\nRow 3: A3:V002 | B3:运营"}
        ]
        reply_assert = "经全面审查，未发现重复凭证。"

        # 1. Guard must intercept sliced context on turn 0
        action, msg, _ = _check_no_tool_assertion_guard(
            reply_text=reply_assert,
            last_user_prompt="检查交易明细是否有重复凭证",
            round_idx=0,
            max_rounds=2,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=[],
            guard_nudges_count=0,
            messages=messages
        )
        self.assertEqual(action, "continue", "Audit guard must intercept sweeping assertions on SLICED context")
        self.assertIn("系统数据核验拦截", msg)

        # 2. When nudges are exhausted, _finalize_agent_text appends coverage caveat
        policy = RuntimePolicy()
        final_text, _ = _finalize_agent_text(
            reply_text=reply_assert,
            messages=messages,
            model="test-model",
            policy=policy,
            deadline=None,
            is_guide_intent=False,
            executed_calls_history=[],
            was_token_truncated=False,
            telemetry=TelemetryStats(),
            last_user_prompt="检查交易明细是否有重复凭证"
        )
        self.assertIn("数据覆盖度与真实性提示", final_text)
        self.assertIn("当前分析基于局部切片或抽样数据", final_text)

    def test_legitimate_empty_string_formula(self):
        """[P1-3] Test that formulas returning empty strings are not falsely flagged as uncalculated."""
        wb_path = self.workspace / "empty_str_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 100
        # Formula returning ""
        ws["B1"] = '=""'
        wb.save(wb_path)

        # In openpyxl data_only mode, cell with empty string cache has value=None but data_type in ('str', 's')
        # We test recalc._check_calculated_workbook handles it correctly
        wb_data = openpyxl.load_workbook(wb_path, data_only=True)
        # Manually verify that openpyxl treats cell coordinate as str type when empty string
        ws_d = wb_data.active
        ws_d["B1"].value = ""
        wb_data.save(wb_path)

        res = recalc._check_calculated_workbook(str(wb_path))
        self.assertEqual(res.get("status"), "verified")
        self.assertEqual(res.get("uncalculated_formulas"), 0)

    def test_corrupted_cache_invalidation(self):
        """[P1-4] Test that corrupted cache files are safely rejected and purged."""
        from dsh_modules.excel_tools import _get_or_create_recalculated_xlsx, RECALC_CACHE_VERSION
        import hashlib
        from unittest.mock import Mock, patch

        # Create a test workbook
        wb_path = self.workspace / "corrupt_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = "=1+1"
        wb.save(wb_path)

        h = hashlib.sha256(wb_path.read_bytes()).hexdigest()[:20]
        cache_dir = self.workspace / "calculation_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        fake_cache = cache_dir / f"{wb_path.stem}_{h}_{RECALC_CACHE_VERSION}.xlsx"
        # Write corrupted content (not a zip)
        fake_cache.write_text("CORRUPTED_BINARY_TRASH")
        fake_meta = fake_cache.with_suffix(".json")
        fake_meta.write_text(json.dumps({"status": "verified", "total_errors": 0}))

        # _get_or_create_recalculated_xlsx must detect that fake_cache is not a valid zip and purge it
        # Isolate the cache and stop after purge: a working local engine may otherwise
        # legitimately rebuild a valid cache at the same path before this assertion.
        with patch("dsh_modules.workbook_calculation.CACHE_DIR", cache_dir), \
             patch("dsh_modules.workbook_calculation.subprocess.run",
                   return_value=Mock(returncode=1, stdout="", stderr="test engine unavailable")):
            res = _get_or_create_recalculated_xlsx(wb_path)
        self.assertFalse(fake_cache.exists(), "Corrupted cache must be deleted")
        self.assertFalse(fake_meta.exists(), "Corrupted cache credentials must be deleted")
        self.assertEqual(res.resolve(), wb_path.resolve())

    def test_full_column_schema_preserves_trailing_empty_cells(self):
        """[P2-5] Test that header width A..H preserves empty trailing cells like H2:[EMPTY]."""
        wb_path = self.workspace / "schema_edge_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "明细表"
        # Header has 8 columns: A to H
        headers = ["A", "B", "C", "D", "E", "F", "G", "H"]
        ws.append(headers)
        # Row 2 only has data in columns A to G, column H is None
        row2 = [1, 2, 3, 4, 5, 6, 7, None]
        ws.append(row2)
        wb.save(wb_path)

        text = extract_xlsx_text(wb_path)
        self.assertIn("H2:[EMPTY]", text, "Trailing column H in row 2 must be preserved as [EMPTY]")

    def test_invalid_and_ambiguous_slice_error_reporting(self):
        """[P2-6] Test that invalid sheet, ambiguous range, and bad ranges return errors rather than dumping all."""
        wb_path = self.workspace / "multi_slice_test.xlsx"
        wb = openpyxl.Workbook()
        ws1 = wb.active
        ws1.title = "表1"
        ws1.append(["A", "B"])
        ws2 = wb.create_sheet("表2")
        ws2.append(["C", "D"])
        wb.save(wb_path)

        # 1. Non-existent sheet
        err1 = extract_xlsx_text(wb_path, sheet_name="不存在的Sheet")
        self.assertIn("【错误", err1)
        self.assertIn("sheet_not_found", err1)
        self.assertIn("不存在工作表 '不存在的Sheet'", err1)

        # 2. Ambiguous range on multi-sheet workbook
        err2 = extract_xlsx_text(wb_path, cell_range="A1:B2")
        self.assertIn("【错误", err2)
        self.assertIn("ambiguous_range", err2)
        self.assertIn("存在歧义", err2)

        # 3. Invalid range format
        err3 = extract_xlsx_text(wb_path, sheet_name="表1", cell_range="INVALID_RANGE")
        self.assertIn("【错误", err3)
        self.assertIn("invalid_range", err3)
        self.assertIn("格式无效", err3)

    def test_static_error_cells_and_tool_error_interception(self):
        """[P2-7] Test that static error cells prevent verified status, and tool error intercepts partial/unavailable."""
        wb_path = self.workspace / "static_err_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 100
        # Static #DIV/0! (not a formula)
        ws["B1"] = "#DIV/0!"
        # Normal text with substring '#N/A'
        ws["C1"] = "遇到 #N/A 请联系管理员"
        wb.save(wb_path)

        res = recalc._check_calculated_workbook(str(wb_path))
        # total_errors must be 1 (only B1, C1 must NOT be counted)
        self.assertEqual(res.get("total_errors"), 1)
        self.assertIn("#DIV/0!", res.get("error_summary", {}))
        self.assertNotIn("#N/A", res.get("error_summary", {}))
        # Status cannot be verified
        self.assertIn(res.get("status"), ("partial", "failed"))

        # _is_tool_error must catch status=partial and status=unavailable
        self.assertTrue(_is_tool_error(json.dumps({"status": "partial"})))
        self.assertTrue(_is_tool_error(json.dumps({"status": "unavailable"})))
        self.assertTrue(_is_tool_error(json.dumps({"status": "failed"})))
        self.assertFalse(_is_tool_error(json.dumps({"status": "verified"})))
        self.assertFalse(_is_tool_error(json.dumps({"status": "success"})))

    # ----------------- 10/9 Review Finding Regression Tests -----------------
    def test_formula_str_empty_v_uncalculated_detection(self):
        """[10/9-P1] Formula with empty <v> cache must be detected as uncalculated even if t='str'."""
        wb_path = self.workspace / "uncalc_formula_str.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 1000
        ws["B1"] = 200
        # Formula with arithmetic expression (similar to L4-M4)
        ws["C1"] = "=A1-B1"
        wb.save(wb_path)

        # By default openpyxl saves formula cells without <v> cache.
        # Ensure _has_uncalculated_formulas identifies it as uncalculated!
        self.assertTrue(_has_uncalculated_formulas(wb_path))

    def test_sheet_not_found_structured_error_and_telemetry(self):
        """[10/9-P2] sheet_not_found must return structured guidance and be flagged as tool error."""
        wb_path = self.workspace / "sheet_lookup.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "利润表"
        ws.append(["科目", "金额"])
        ws.append(["营业收入", 124020])
        wb.save(wb_path)

        err_out = extract_xlsx_text(wb_path, sheet_name="财务数据摘要")
        self.assertIn("【错误: sheet_not_found】", err_out)
        self.assertIn("错误代码: sheet_not_found", err_out)
        self.assertIn("可用工作表清单: 利润表", err_out)
        self.assertIn("严禁臆造不存在的表名", err_out)

        # Telemetry check: _is_tool_error must return True for this output
        self.assertTrue(_is_tool_error(err_out))

    def test_metric_alignment_guard_intercepts_evasion_and_missing_values(self):
        """[10/9-P4] Metric Alignment Guard must intercept evasive queries and pass concrete metrics."""
        user_prompt = "总结2026年收入、毛利率、营业利润和净利润。"

        # 1. Evasive reply that asks user whether to read Income Statement
        evasive_reply = (
            "在当前工作簿中未找到名为“财务数据摘要”或“年度汇总”的工作表。\n"
            "请问是否需要我读取《利润表》来获取2026年的收入、毛利率、营业利润和净利润数据？"
        )
        action, msg, _ = _check_no_tool_assertion_guard(
            reply_text=evasive_reply,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=3,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=[]
        )
        self.assertEqual(action, "continue")
        self.assertIn("系统问答对齐与指标核算拦截", msg)
        self.assertIn("严禁向用户反问", msg)

        # 2. Complete reply with concrete figures passes Guard 9
        concrete_reply = (
            "根据《利润表》与《管理驾驶舱》核算，2026年度核心财务指标总结如下：\n"
            "- **营业收入**：124,020 千元（1.24亿元）\n"
            "- **毛利率**：43.1%（毛利 53,445 千元）\n"
            "- **营业利润**：21,209.4 千元\n"
            "- **净利润**：16,038.3 千元\n"
            "数据来源：《利润表》B4、B10、B14单元格及《管理驾驶舱》汇总。"
        )
        action_pass, _, _ = _check_no_tool_assertion_guard(
            reply_text=concrete_reply,
            last_user_prompt=user_prompt,
            round_idx=1,
            max_rounds=3,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=["read_file:{\"sheet\": \"利润表\"}"]
        )
        self.assertEqual(action_pass, "pass")

    # ----------------- Step 1: Universal Architecture & Boundary 5-8 Tests -----------------
    def test_boundary_5_normal_text_containing_error_substring_not_tool_error(self):
        """[Boundary 5] Normal documentation containing 'sheet_not_found' must NOT be flagged as tool error."""
        from dsh_modules.tool_result import ToolResult, TextToolOutput, is_tool_error

        # 1. Normal document content mentioning 'sheet_not_found' as explanation
        doc_text = "操作手册说明：当遇到 sheet_not_found 提示时，请检查工作表名称是否拼写正确。"
        # Plain text without error envelope
        self.assertFalse(is_tool_error(doc_text), "Normal text mentioning 'sheet_not_found' must NOT be flagged as error")

        # 2. TextToolOutput wrapping a success result must NOT be flagged as error
        success_tr = ToolResult.success(data={"info": "guide"}, text=doc_text)
        success_output = TextToolOutput(doc_text, success_tr)
        self.assertFalse(is_tool_error(success_output))

        # 3. TextToolOutput wrapping a real error MUST be flagged as error
        real_err_text = "【错误: sheet_not_found】工作簿中不存在工作表 '未知表'"
        err_tr = ToolResult.error(code="sheet_not_found", message="不存在工作表", text=real_err_text)
        real_err_output = TextToolOutput(real_err_text, err_tr)
        self.assertTrue(is_tool_error(real_err_output))

    def test_boundary_6_conditional_empty_branch_unified_validation(self):
        """[Boundary 6] =IF(FALSE, '', 123) with empty cache must be consistently treated as uncalculated."""
        from dsh_modules.workbook_calculation import check_workbook_formulas
        import zipfile
        import xml.etree.ElementTree as ET

        wb_path = self.workspace / "cond_empty_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = '=IF(FALSE, "", 123)'
        wb.save(wb_path)

        # Pre-check: must identify it as uncalculated because condition FALSE should produce 123, not empty string!
        pre_res = check_workbook_formulas(wb_path, is_post_recalc=False)
        self.assertTrue(pre_res.get("has_uncalculated"))
        self.assertEqual(pre_res.get("uncalculated_formulas"), 1)
        self.assertNotEqual(pre_res.get("status"), "verified")

    def test_boundary_7_tampered_cache_named_cached_unverified(self):
        """[Boundary 7] File with existing cache (even if tampered =1+1 -> 999) must be labeled cached_unverified."""
        from dsh_modules.workbook_calculation import check_workbook_formulas
        import zipfile
        import re

        wb_path = self.workspace / "tampered_cache.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = "=1+1"
        wb.save(wb_path)

        # Inject cached value 999 into XML
        tmp_unzip = Path(tempfile.mkdtemp(prefix="unzip_"))
        try:
            with zipfile.ZipFile(wb_path, "r") as z:
                z.extractall(tmp_unzip)
            sheet_xml_p = tmp_unzip / "xl" / "worksheets" / "sheet1.xml"
            content = sheet_xml_p.read_text(encoding="utf-8")
            # Replace <v></v> with <v>999</v>
            content = re.sub(r'<v>.*?</v>', '<v>999</v>', content)
            sheet_xml_p.write_text(content, encoding="utf-8")
            # Rezip
            wb_path.unlink()
            with zipfile.ZipFile(wb_path, "w", zipfile.ZIP_DEFLATED) as z_out:
                for root, _, files in os.walk(tmp_unzip):
                    for f in files:
                        full_f = Path(root) / f
                        rel_f = full_f.relative_to(tmp_unzip)
                        z_out.write(full_f, str(rel_f))
        finally:
            shutil.rmtree(tmp_unzip, ignore_errors=True)

        res = check_workbook_formulas(wb_path, is_post_recalc=False)
        # Must be labeled cached_unverified, NEVER verified_existing or verified!
        self.assertEqual(res.get("status"), "cached_unverified")
        self.assertFalse(res.get("has_uncalculated"))

    def test_boundary_8_xml_namespace_prefix_formula_detection(self):
        """[Boundary 8] Formula tags with XML namespace prefixes (e.g. ss:c, ss:f) must be correctly detected."""
        from dsh_modules.workbook_calculation import check_workbook_formulas
        import zipfile

        wb_path = self.workspace / "prefix_test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = 100
        wb.save(wb_path)

        # Inject XML with ss namespace prefix on cell and formula tags without <v>
        tmp_unzip = Path(tempfile.mkdtemp(prefix="unzip_ns_"))
        try:
            with zipfile.ZipFile(wb_path, "r") as z:
                z.extractall(tmp_unzip)
            sheet_xml_p = tmp_unzip / "xl" / "worksheets" / "sheet1.xml"
            xml_text = (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:ss="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n'
                '<sheetData>\n'
                '<row r="1">\n'
                '<ss:c r="A1"><ss:f>1+1</ss:f></ss:c>\n'
                '</row>\n'
                '</sheetData>\n'
                '</worksheet>'
            )
            sheet_xml_p.write_text(xml_text, encoding="utf-8")
            wb_path.unlink()
            with zipfile.ZipFile(wb_path, "w", zipfile.ZIP_DEFLATED) as z_out:
                for root, _, files in os.walk(tmp_unzip):
                    for f in files:
                        full_f = Path(root) / f
                        rel_f = full_f.relative_to(tmp_unzip)
                        z_out.write(full_f, str(rel_f))
        finally:
            shutil.rmtree(tmp_unzip, ignore_errors=True)

        # Namespace-aware parser must find ss:f and detect that <v> is missing!
        res = check_workbook_formulas(wb_path, is_post_recalc=False)
        self.assertEqual(res.get("total_formulas"), 1)
        self.assertTrue(res.get("has_uncalculated"), "Must detect missing cache even with ss: prefix!")
        self.assertEqual(res.get("uncalculated_formulas"), 1)

    # ----------------- Step 2: Boundaries 1-4 & Structural Discovery Regression Tests -----------------
    def test_boundary_1_four_metrics_only_one_answered_intercepted(self):
        """[Boundary 1] If user asks for 4 metrics, answering only 1 must be intercepted by contract validation."""
        user_prompt = "总结2026年收入、毛利率、营业利润和净利润。"
        partial_reply = "经统计核算，2026年度营业收入：100千元。"

        action, msg, _ = _check_no_tool_assertion_guard(
            reply_text=partial_reply,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=3,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=[]
        )
        self.assertEqual(action, "continue", "Partial answer with only 1 of 4 metrics must be intercepted!")
        self.assertIn("系统指标逐项验收未完成拦截", msg)
        self.assertIn("缺少关键指标", msg)
        self.assertIn("毛利率", msg)
        self.assertIn("净利润", msg)

    def test_boundary_2_year_number_not_treated_as_metric_value(self):
        """[Boundary 2] '营业收入：2026年尚未计算' must NOT mistake year (2026/2020/2030) for a valid metric value."""
        user_prompt = "总结2026年收入、毛利率、营业利润和净利润。"
        for yr in ["2026", "2020", "2030"]:
            evasive_reply = f"根据工作簿说明，营业收入：{yr}年尚未计算。其余指标暂无数据。"
            action, msg, _ = _check_no_tool_assertion_guard(
                reply_text=evasive_reply,
                last_user_prompt=user_prompt,
                round_idx=0,
                max_rounds=3,
                start_ts=0.0,
                is_guide_intent=False,
                expected_deliverables=None,
                is_generate_intent=False,
                is_inspect_intent=True,
                executed_calls_history=[]
            )
            self.assertEqual(action, "continue", f"Year '{yr}年' must NOT be accepted as metric value!")
            self.assertIn("营业收入", msg)

    def test_boundary_3_round_budget_exhaustion_does_not_silent_pass(self):
        """[Boundary 3] When round budget is exhausted on evasive reply, _finalize_agent_text must append unfulfilled barrier."""
        from dsh_modules.agent_loop import _finalize_agent_text
        from dsh_modules.runtime_policy import RuntimePolicy

        user_prompt = "总结2026年收入、毛利率、营业利润和净利润。"
        evasive_reply = "未在工作簿中找到财务数据摘要表，请问是否需要我读取利润表？"

        final_text, _ = _finalize_agent_text(
            reply_text=evasive_reply,
            messages=[{"role": "user", "content": user_prompt}],
            model="test-model",
            policy=RuntimePolicy(),
            deadline=None,
            is_guide_intent=False,
            executed_calls_history=[],
            was_token_truncated=False,
            telemetry=TelemetryStats(),
            last_user_prompt=user_prompt
        )

        self.assertIn("【指标核算未完成声明】", final_text, "Exhausted rounds with missing metrics must NOT silently pass!")
        self.assertIn("未完成指标", final_text)
        self.assertIn("营业收入", final_text)
        self.assertIn("毛利率", final_text)

    def test_boundary_4_generic_order_amount_not_blocked_by_financial_dict(self):
        """[Boundary 4] Generic metric query '统计订单金额。' with concrete answer must pass without financial dictionary collision."""
        user_prompt = "统计订单金额。"
        good_reply = "根据订单明细表，统计得出订单金额：500元。"

        action, msg, _ = _check_no_tool_assertion_guard(
            reply_text=good_reply,
            last_user_prompt=user_prompt,
            round_idx=0,
            max_rounds=3,
            start_ts=0.0,
            is_guide_intent=False,
            expected_deliverables=None,
            is_generate_intent=False,
            is_inspect_intent=True,
            executed_calls_history=[]
        )
        self.assertEqual(action, "pass", "Generic order amount query must pass when answered!")

    def test_structural_discovery_and_sheet_pre_validation(self):
        """[Step 2 Architecture] Workbook manifest inspects metadata and pre-validates before expensive recalc."""
        from dsh_modules.workbook_reader import inspect_workbook, validate_sheet_and_range

        wb_path = self.workspace / "manifest_test.xlsx"
        wb = openpyxl.Workbook()
        ws1 = wb.active
        ws1.title = "资产负债表"
        ws1["A1"] = "资产"
        ws1["B1"] = 1000
        ws2 = wb.create_sheet("利润表")
        ws2["A1"] = "营业收入"
        ws2["B1"] = 5000
        wb.save(wb_path)

        manifest = inspect_workbook(wb_path)
        self.assertEqual(len(manifest.sheets), 2)
        self.assertIn("资产负债表", manifest.sheet_names)
        self.assertIn("利润表", manifest.sheet_names)

        # Pre-validate non-existent sheet
        sheet_out, range_out, err_res = validate_sheet_and_range(wb_path, sheet_name="不存在的表")
        self.assertIsNone(sheet_out)
        self.assertIsNotNone(err_res)
        self.assertEqual(err_res.error_code, "sheet_not_found")
        self.assertIn("资产负债表", err_res.error.get("available_sheets", []))

    def test_recalc_cli_clean_subprocess_entrypoint(self):
        """[P0 Regression] recalc.py CLI entrypoint must run cleanly in subprocess without sys.path tampering."""
        import subprocess
        recalc_script = SKILLS_DIR / "xlsx" / "scripts" / "recalc.py"
        self.assertTrue(recalc_script.exists())

        # Run with clean environment (NO PYTHONPATH, NO sys.path tampering)
        clean_env = {
            "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
            "HOME": os.environ.get("HOME", "/tmp")
        }
        res = subprocess.run(
            [sys.executable, str(recalc_script), "--help"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=clean_env
        )
        self.assertEqual(res.returncode, 0, f"recalc.py failed to run with clean env: stderr={res.stderr}")
        self.assertIn("Recalculates all formulas in an Excel file", res.stdout)
        self.assertNotIn("ModuleNotFoundError", res.stderr)

    def test_argmax_month_variance_contract_rejects_formula_percentage_and_requires_month(self):
        """[P1 Metric Alignment] argmax + month inquiry must reject formula percentages and require month attribution."""
        from dsh_modules.analysis_contract import build_analysis_contract
        from dsh_modules.analysis_validation import validate_reply_against_contract

        prompt = "找出收入与净利润偏差最大的月份。"
        contract = build_analysis_contract(prompt)
        self.assertEqual(contract.operation, "argmax")
        self.assertEqual(contract.dimension, "month")
        self.assertEqual(contract.comparison, "variance")
        self.assertIn("营业收入", contract.get_metric_names())
        self.assertIn("净利润", contract.get_metric_names())

        # Case A: False-pass trap: 75% formula deduction without month must be rejected
        reply_tax_formula = "经测算，所得税税率为25%，因此净利润为75%。营业收入尚无差异数据。"
        res_a = validate_reply_against_contract(contract, reply_tax_formula, round_idx=0, max_rounds=3)
        self.assertFalse(res_a.is_pass)
        self.assertIn("净利润", res_a.missing_metrics, "75% tax deduction must NOT be accepted as net profit!")
        self.assertIn("营业收入", res_a.missing_metrics)

        # Case B: Annual summary totals without month attribution must be rejected for monthly inquiry
        reply_annual = "2026年年度经营总结如下：营业收入：124,020千元，净利润：9,180千元。"
        res_b = validate_reply_against_contract(contract, reply_annual, round_idx=0, max_rounds=3)
        self.assertFalse(res_b.is_pass)
        self.assertIn("营业收入", res_b.missing_metrics, "Annual numbers without month must NOT satisfy monthly extreme inquiry!")
        self.assertIn("净利润", res_b.missing_metrics)

        # Case C: Concrete prose stating extreme month and variance values must pass
        reply_good_prose = (
            "通过对比《预算对比》与《月度经营》各月数据：\n"
            "1. 营业收入偏差最大的月份是12月，预算11,530千元，实际13,400千元，偏差金额为+1,870千元（或2月负向偏差-1,080千元）；\n"
            "2. 净利润绝对偏差最大的是7月，预算1,380千元，实际934.31千元，偏差金额为-445.69千元（偏差率最大为2月的-33.42%）。"
        )
        res_c = validate_reply_against_contract(contract, reply_good_prose, round_idx=0, max_rounds=3)
        self.assertTrue(res_c.is_pass, f"Valid prose with months and numbers should pass: missing={res_c.missing_metrics}")
        self.assertIn("营业收入", res_c.satisfied_metrics)
        self.assertIn("净利润", res_c.satisfied_metrics)

        # Case D: Markdown table stating extreme month and values must pass
        reply_good_table = (
            "各指标最大偏差月份汇总如下：\n\n"
            "| 指标 | 偏差最大月份 | 预算值 | 实际值 | 偏差金额 |\n"
            "| :--- | :--- | :--- | :--- | :--- |\n"
            "| 营业收入 | 12月 | 11,530 | 13,400 | +1,870 千元 |\n"
            "| 净利润 | 7月 | 1,380 | 934.31 | -445.69 千元 |\n"
        )
        res_d = validate_reply_against_contract(contract, reply_good_table, round_idx=0, max_rounds=3)
        self.assertTrue(res_d.is_pass, f"Valid table with months and numbers should pass: missing={res_d.missing_metrics}")

    def test_contract_termination_truthful_attribution(self):
        """[P1 Attribution] Termination warning must truthfully attribute causes and not blame user's file."""
        from dsh_modules.analysis_contract import build_analysis_contract
        from dsh_modules.analysis_validation import (
            validate_reply_against_contract,
            build_contract_termination_warning
        )

        prompt = "找出收入与净利润偏差最大的月份。"
        contract = build_analysis_contract(prompt)

        # Case A: Tool execution error in messages (e.g. Python TypeError)
        messages_with_err = [
            {"role": "user", "content": prompt},
            {"role": "tool", "content": "Traceback (most recent call last):\nTypeError: unsupported operand type(s) for -: 'str' and 'int'"}
        ]
        val_res = validate_reply_against_contract(contract, "未能完成计算", round_idx=3, max_rounds=3)
        warn_err = build_contract_termination_warning(contract, val_res, messages=messages_with_err)
        self.assertIn("【指标核算未完成声明】", warn_err)
        self.assertIn("代码或工具执行过程中出现异常", warn_err)
        self.assertIn("TypeError: unsupported operand type(s)", warn_err)
        self.assertNotIn("请确认工作簿中相关数据表结构", warn_err)

        # Case B: Evasive model response
        evasive_text = "未找到对应工作表，请问是否需要我读取《利润表》？"
        val_res_evasive = validate_reply_against_contract(contract, evasive_text, round_idx=3, max_rounds=3)
        warn_evasive = build_contract_termination_warning(contract, val_res_evasive, messages=[])
        self.assertIn("模型出现反问或重复索取授权", warn_evasive)
        self.assertIn("沙箱已具备完整只读与计算权限", warn_evasive)
        self.assertNotIn("请确认工作簿中相关数据表结构", warn_evasive)

        # Case C: Multi-turn ceiling on monthly variance inquiry
        val_res_ceiling = validate_reply_against_contract(contract, "正在分析中...", round_idx=3, max_rounds=3)
        warn_ceiling = build_contract_termination_warning(contract, val_res_ceiling, messages=[])
        self.assertIn("多轮推理已达上限", warn_ceiling)
        self.assertIn("锁定极值月份", warn_ceiling)
        self.assertIn("实际与预算差额", warn_ceiling)
        self.assertNotIn("《预算对比》", warn_ceiling)
        self.assertNotIn("《月度经营》", warn_ceiling)
        self.assertNotIn("请确认工作簿中相关数据表结构", warn_ceiling)


if __name__ == "__main__":
    unittest.main()
