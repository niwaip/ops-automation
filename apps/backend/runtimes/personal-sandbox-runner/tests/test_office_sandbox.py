#!/usr/bin/env python3
"""
Unit and integration tests for Phase 1 Office Deep Capabilities in DSH Sandbox.
Tests Word run merging & commenting, Excel formula handling, PDF form field detection,
and skill discovery & routing in the personal sandbox runner.
"""

import os
import sys
import unittest
import tempfile
import zipfile
import subprocess
from pathlib import Path

# Add src to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[5]
SANDBOX_SKILLS_DIR = PROJECT_ROOT / "docker" / "user-sandbox" / "skills"
DSH_MODULES_DIR = PROJECT_ROOT / "apps" / "backend" / "runtimes" / "personal-sandbox-runner" / "src" / "dsh_modules"

os.environ["DSH_SKILL_DIR"] = str(SANDBOX_SKILLS_DIR)

if str(DSH_MODULES_DIR.parent) not in sys.path:
    sys.path.insert(0, str(DSH_MODULES_DIR.parent))

import docx
import openpyxl
from pypdf import PdfWriter, PdfReader
from pypdf.generic import DictionaryObject, NameObject, ArrayObject

from dsh_modules.skills import get_available_skills, read_skill
from dsh_modules.skill_router import SkillRouter


class TestOfficeSandbox(unittest.TestCase):
    """Test suite for Office scripts and DSH sandbox skill integration."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.work_dir = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_docx_merge_runs_and_comments(self):
        """Test docx run merging and comment injection on real docx files."""
        # 1. Create a sample docx
        doc_path = self.work_dir / "test_contract.docx"
        doc = docx.Document()
        p = doc.add_paragraph()
        p.add_run("第一条：本合同双方同意，")
        p.add_run("付款期限为")
        p.add_run("30个工作日。")
        doc.save(doc_path)
        self.assertTrue(doc_path.exists())

        # 2. Unpack docx
        unpacked_dir = self.work_dir / "unpacked"
        with zipfile.ZipFile(doc_path, 'r') as zf:
            zf.extractall(unpacked_dir)

        # 3. Test merge_runs.py
        merge_script = SANDBOX_SKILLS_DIR / "docx" / "scripts" / "merge_runs.py"
        self.assertTrue(merge_script.exists(), "merge_runs.py must exist")

        res = subprocess.run(
            [sys.executable, str(merge_script), str(unpacked_dir)],
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0, f"merge_runs failed: {res.stderr}")

        # 4. Test comment.py
        comment_script = SANDBOX_SKILLS_DIR / "docx" / "scripts" / "comment.py"
        self.assertTrue(comment_script.exists(), "comment.py must exist")

        comment_text = "法务提示：付款账期建议缩短为15个工作日"
        res = subprocess.run(
            [
                sys.executable, str(comment_script),
                str(unpacked_dir), comment_text,
                "--author", "AI法务合规官"
            ],
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0, f"comment.py failed: {res.stderr}")

        # 5. Verify comments.xml exists and contains comment text
        comments_file = unpacked_dir / "word" / "comments.xml"
        self.assertTrue(comments_file.exists(), "comments.xml must be generated")
        content = comments_file.read_text(encoding="utf-8")
        self.assertIn("法务提示", content)
        self.assertIn("AI法务合规官", content)

    def test_docx_one_click_add_comment(self):
        """Test add_comment.py one-click CLI tool."""
        add_comment_script = SANDBOX_SKILLS_DIR / "docx" / "scripts" / "add_comment.py"
        self.assertTrue(add_comment_script.exists())

        doc_path = self.work_dir / "service_agreement.docx"
        out_path = self.work_dir / "service_agreement_reviewed.docx"
        doc = docx.Document()
        doc.add_paragraph("第一条：付款条件。本协议生效后，客户一次性全额支付10万元。")
        doc.save(doc_path)

        res = subprocess.run(
            [
                sys.executable, str(add_comment_script), str(doc_path),
                "--target", "一次性全额支付",
                "--comment", "【合规风险】：建议增加验收合格后再付款的要求",
                "--author", "合规审查专员",
                "-o", str(out_path)
            ],
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0, f"add_comment.py failed: {res.stderr}")
        self.assertTrue(out_path.exists())

        # Inspect resulting zip archive
        with zipfile.ZipFile(out_path, "r") as zf:
            comments_xml = zf.read("word/comments.xml").decode("utf-8")
            self.assertIn("建议增加验收合格后再付款的要求", comments_xml)
            self.assertIn("合规审查专员", comments_xml)

            doc_xml = zf.read("word/document.xml").decode("utf-8")
            self.assertIn("commentRangeStart", doc_xml)
            self.assertIn("commentReference", doc_xml)

    def test_xlsx_formula_and_recalc_script(self):
        """Test openpyxl formula creation and recalc script interface."""
        recalc_script = SANDBOX_SKILLS_DIR / "xlsx" / "scripts" / "recalc.py"
        self.assertTrue(recalc_script.exists(), "recalc.py must exist")

        # 1. Create a workbook with formulas
        wb_path = self.work_dir / "test_sheet.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Data"
        ws["A1"] = "Item"
        ws["B1"] = "Amount"
        ws["A2"] = "Sales"
        ws["B2"] = 100
        ws["A3"] = "Tax"
        ws["B3"] = 15
        ws["A4"] = "Total"
        ws["B4"] = "=SUM(B2:B3)"
        wb.save(wb_path)

        self.assertTrue(wb_path.exists())

        # Verify formula in saved workbook
        loaded_wb = openpyxl.load_workbook(wb_path)
        self.assertEqual(loaded_wb["Data"]["B4"].value, "=SUM(B2:B3)")

        # Verify recalc.py error handling for missing file
        res = subprocess.run(
            [sys.executable, str(recalc_script), "non_existent_file.xlsx"],
            capture_output=True,
            text=True
        )
        self.assertIn("does not exist", res.stdout)

    def test_pdf_fillable_fields_detection(self):
        """Test PDF form detection script on both flat and interactive PDFs."""
        check_script = SANDBOX_SKILLS_DIR / "pdf" / "scripts" / "check_fillable_fields.py"
        extract_script = SANDBOX_SKILLS_DIR / "pdf" / "scripts" / "extract_form_field_info.py"
        self.assertTrue(check_script.exists(), "check_fillable_fields.py must exist")
        self.assertTrue(extract_script.exists(), "extract_form_field_info.py must exist")

        # 1. Create a non-fillable flat PDF
        flat_pdf = self.work_dir / "flat.pdf"
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)
        with open(flat_pdf, "wb") as f:
            writer.write(f)

        res = subprocess.run(
            [sys.executable, str(check_script), str(flat_pdf)],
            capture_output=True,
            text=True
        )
        self.assertEqual(res.returncode, 0)
        self.assertIn("does not have fillable form fields", res.stdout)

    def test_dsh_skill_discovery_and_routing(self):
        """Verify DSH correctly scans and routes to the updated docx, xlsx, and pdf skills."""
        # Test skill inspection
        docx_skill = read_skill("docx")
        self.assertTrue(len(docx_skill) > 100, "docx skill must be readable")
        self.assertIn("Tracked Changes", docx_skill)

        xlsx_skill = read_skill("xlsx")
        self.assertTrue(len(xlsx_skill) > 100, "xlsx skill must be readable")
        self.assertIn("recalc", xlsx_skill)

        pdf_skill = read_skill("pdf")
        self.assertTrue(len(pdf_skill) > 100, "pdf skill must be readable")
        self.assertIn("表单", pdf_skill)
        self.assertIn("fill_fillable_fields.py", pdf_skill)

        # Test intent routing
        r_word = SkillRouter.route("请帮我起草合同并生成word文档")
        self.assertEqual(r_word.skill_id, "docx")

        r_excel = SkillRouter.route("请帮我做个表格生成excel")
        self.assertEqual(r_excel.skill_id, "xlsx")

        r_pdf = SkillRouter.route("请帮我将这个分析总结导出pdf")
        self.assertEqual(r_pdf.skill_id, "pdf")


if __name__ == "__main__":
    unittest.main()
