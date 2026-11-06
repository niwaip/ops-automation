#!/usr/bin/env python3
"""
Unit and integration tests for Phase 1 Office Deep Capabilities in DSH Sandbox.
Tests Word run merging & commenting, Excel formula handling, PDF form field detection,
and skill discovery & routing in the personal sandbox runner.
"""

import os
import sys
import unittest
from unittest.mock import MagicMock
import tempfile
import zipfile
import subprocess
import json
from pathlib import Path

# Add src to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[5]
SANDBOX_SKILLS_DIR = PROJECT_ROOT / "apps" / "backend" / "runtimes" / "personal-sandbox-runner" / "skills"
if not SANDBOX_SKILLS_DIR.exists():
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

    def test_materialize_script_deliverable_docx(self):
        """A prose Python script requires an explicit tool invocation."""
        from dsh_modules.deliverable_contract import materialize_script_deliverable

        reply_with_docx_script = (
            "好的，我为您编写了生成报告的脚本：\n"
            "```python\n"
            "import docx\n"
            "doc = docx.Document()\n"
            "doc.add_heading('AWS Token Plan 分析报告', level=1)\n"
            "doc.add_paragraph('AWS 在中国主要按量付费。')\n"
            "doc.save('test_auto_report.docx')\n"
            "```\n"
            "请查收已生成的文档。"
        )

        out_path, err = materialize_script_deliverable(
            reply_text=reply_with_docx_script,
            workspace_dir=str(self.work_dir),
            expected_deliverables=[".docx"],
            turn_start_time=None
        )

        self.assertIsNone(out_path)
        self.assertIn('显式调用', err)
        self.assertFalse((self.work_dir / 'test_auto_report.docx').exists())

    def test_materialize_script_deliverable_error_feedback(self):
        """Verify materialize_script_deliverable returns error string on bad script."""
        from dsh_modules.deliverable_contract import materialize_script_deliverable

        reply_with_bad_script = (
            "```python\n"
            "import docx\n"
            "doc = docx.Document()\n"
            "raise ValueError('Custom Test Error')\n"
            "doc.save('never_saved.docx')\n"
            "```"
        )

        out_path, err = materialize_script_deliverable(
            reply_text=reply_with_bad_script,
            workspace_dir=str(self.work_dir),
            expected_deliverables=[".docx"]
        )

        self.assertIsNone(out_path)
        self.assertIsNotNone(err)
        self.assertIn("显式调用", err)
        self.assertNotIn("Custom Test Error", err)
        self.assertFalse((self.work_dir / "never_saved.docx").exists())

    def test_extract_xlsx_text_all_sheets_and_formulas(self):
        """Verify extract_xlsx_text parses all 10+ sheets in authentic order and handles formula definitions without cache."""
        from dsh_modules.office_tools import extract_xlsx_text

        wb_path = self.work_dir / "financial_test.xlsx"
        wb = openpyxl.Workbook()
        default_sheet = wb.active
        default_sheet.title = "使用说明"
        default_sheet["A1"] = "说明事项"
        default_sheet["B1"] = "2026年财务模型"

        # Create 10 sheets to test beyond sheet10 ordering
        for i in range(2, 11):
            name = f"Sheet{i}"
            if i == 3:
                name = "月度经营"
            elif i == 4:
                name = "利润表"
            elif i == 10:
                name = "管理驾驶舱"
            ws = wb.create_sheet(title=name)
            ws["A1"] = f"{name}表头"
            ws["B1"] = 100 * i
            if i == 4:
                # Add formula referencing other sheet without evaluating
                ws["C1"] = "=月度经营!B1*2"

        wb.save(wb_path)

        res = extract_xlsx_text(wb_path)
        self.assertIn("【Excel 工作簿概览 (financial_test.xlsx)，共 10 个工作表】", res)
        # Verify all sheets are present in overview
        self.assertIn("使用说明", res)
        self.assertIn("月度经营", res)
        self.assertIn("利润表", res)
        self.assertIn("管理驾驶舱", res)
        # Verify formula indicator is captured even when openpyxl saved without cached value
        self.assertIn("[公式: =月度经营!B1*2]", res)
        # Verify Sheet10 is extracted, not skipped or misordered
        self.assertIn("--- [工作表: 管理驾驶舱", res)

    def test_ooxml_docx_translate_unpack_and_pack(self):
        """Test ooxml_docx_translate.py unpack and pack preserving document format."""
        translate_script = SANDBOX_SKILLS_DIR / "docx" / "scripts" / "ooxml_docx_translate.py"
        self.assertTrue(translate_script.exists(), "ooxml_docx_translate.py must exist")

        # 1. Create a docx with custom margins and header/footer
        doc_path = self.work_dir / "sample_contract.docx"
        doc = docx.Document()
        section = doc.sections[0]
        section.top_margin = docx.shared.Pt(50)
        section.bottom_margin = docx.shared.Pt(50)
        section.left_margin = docx.shared.Pt(40)
        section.right_margin = docx.shared.Pt(40)

        p1 = doc.add_paragraph("保密协议")
        p2 = doc.add_paragraph("甲方与乙方经友好协商，达成如下保密条款。")
        p3 = doc.add_paragraph("本协议受中华人民共和国法律管辖。")
        doc.save(doc_path)

        # 2. Test unpack
        temp_dir = self.work_dir / "docx_temp"
        out_json = self.work_dir / "input.json"
        res = subprocess.run(
            [sys.executable, str(translate_script), "unpack", str(doc_path),
             "--out-json", str(out_json), "--temp-dir", str(temp_dir)],
            capture_output=True, text=True
        )
        self.assertEqual(res.returncode, 0, f"unpack failed: {res.stderr}")
        self.assertTrue(out_json.exists())

        import json
        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIn("document_p0", data)
        self.assertEqual(data["document_p0"], "保密协议")

        # 3. Simulate translated json
        trans_json = self.work_dir / "output.json"
        trans_data = {
            "document_p0": "機密保持契約書",
            "document_p1": "甲と乙は友好な協議の上、以下の秘密保持条項に合意する。",
            "document_p2": "本契約は中華人民共和国法に準拠する。"
        }
        with open(trans_json, "w", encoding="utf-8") as f:
            json.dump(trans_data, f, ensure_ascii=False, indent=2)

        # 4. Test pack
        out_docx = self.work_dir / "translated.docx"
        res = subprocess.run(
            [sys.executable, str(translate_script), "pack", str(temp_dir),
             str(trans_json), str(out_docx), "--lang", "ja-JP", "--font", "MS Mincho"],
            capture_output=True, text=True
        )
        self.assertEqual(res.returncode, 0, f"pack failed: {res.stderr}")
        self.assertTrue(out_docx.exists())

        # 5. Verify preserved format and text
        out_doc = docx.Document(out_docx)
        out_section = out_doc.sections[0]
        self.assertEqual(out_section.top_margin.pt, 50.0)
        self.assertEqual(out_section.bottom_margin.pt, 50.0)
        self.assertEqual(out_section.left_margin.pt, 40.0)
        self.assertEqual(out_section.right_margin.pt, 40.0)

        self.assertEqual(out_doc.paragraphs[0].text, "機密保持契約書")
        self.assertEqual(out_doc.paragraphs[1].text, "甲と乙は友好な協議の上、以下の秘密保持条項に合意する。")
        self.assertEqual(out_doc.paragraphs[2].text, "本契約は中華人民共和国法に準拠する。")

    def test_docx_preflight_probe_and_layered_routing(self):
        """Test Layer 1 physical probing and Layer 3 content-driven tool selection for DOCX."""
        # 1. Create a dummy docx with paragraphs
        doc_path = self.work_dir / "sample_contract.docx"
        doc = docx.Document()
        doc.add_paragraph("第一条 保密内容与范围")
        doc.add_paragraph("第二条 双方义务")
        doc.save(doc_path)

        # Test Layer 1 probe
        from dsh_modules.preflight_probe import probe_session_attachments
        probe_res = probe_session_attachments([str(doc_path)], workspace_dir=str(self.work_dir))
        self.assertTrue(probe_res["has_docx"])
        self.assertEqual(len(probe_res["profiles"]), 1)
        prof = probe_res["profiles"][0]
        self.assertEqual(prof["kind"], "docx")
        self.assertGreaterEqual(prof["paragraphs"], 2)
        self.assertIn("DOCX附件", probe_res["summary"])

        # Test Layer 2 task intent
        from dsh_modules.task_intent import has_physical_artifact_request
        q = "翻译这个文档，变成日语的docx文档，需要保持格式不变"
        self.assertTrue(has_physical_artifact_request(q))

        # Test Layer 3 tool router
        from dsh_modules.docx_workflow import is_docx_in_place_transform_task, is_template_docx_task
        from unittest.mock import MagicMock
        mock_skill = MagicMock()
        mock_skill.source_formats = [".docx"]
        mock_skill.task_contract = {"requirements": [{"quote": "保持格式不变"}]}

        self.assertTrue(is_docx_in_place_transform_task(q, mock_skill, files=[str(doc_path)]))
        # Should NOT take the scratch template renderer
        self.assertFalse(is_template_docx_task(q, mock_skill))

    def test_ooxml_xlsx_translate_unpack_and_pack(self):
        """Test OOXML Excel unpacking, data validation translation, and repacking with 100% format preservation."""
        import openpyxl
        from openpyxl.worksheet.datavalidation import DataValidation
        from openpyxl.formatting.rule import CellIsRule
        from openpyxl.styles import PatternFill

        xlsx_path = self.work_dir / "test_sheet.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "SecurityChecklist"

        # Headers and text cells
        ws["A1"] = "項目名"
        ws["B1"] = "ステータス"
        ws["A2"] = "クラウド設定"
        ws["B2"] = "選択"

        # Data validation (dropdown list)
        dv = DataValidation(type="list", formula1='"選択,適合,不適合,その他"', allow_blank=True)
        ws.add_data_validation(dv)
        dv.add("B2:B10")

        # Conditional formatting
        red_fill = PatternFill(start_color="FFEE1111", end_color="FFEE1111", fill_type="solid")
        rule = CellIsRule(operator="equal", formula=['"不適合"'], stopIfTrue=True, fill=red_fill)
        ws.conditional_formatting.add("B2:B10", rule)

        wb.save(xlsx_path)

        # 1. Unpack
        translate_script = Path(__file__).resolve().parent.parent / "skills" / "xlsx" / "scripts" / "ooxml_xlsx_translate.py"
        temp_dir = self.work_dir / ".ooxml_xlsx_temp"
        out_json = self.work_dir / "xlsx_extracted.json"

        res = subprocess.run(
            [sys.executable, str(translate_script), "unpack", str(xlsx_path),
             "--out-json", str(out_json), "--temp-dir", str(temp_dir)],
            capture_output=True, text=True
        )
        self.assertEqual(res.returncode, 0, f"unpack failed: {res.stderr}")
        self.assertTrue(out_json.exists())

        with open(out_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        self.assertIn("sheet_name_0", data)
        self.assertEqual(data["sheet_name_0"], "SecurityChecklist")

        # Check extracted strings
        vals = set(data.values())
        self.assertIn("クラウド設定", vals)
        self.assertIn("選択", vals)
        self.assertIn("その他", vals)

        # 2. Simulate translated JSON
        trans_json = self.work_dir / "xlsx_translated.json"
        trans_data = {}
        for k, v in data.items():
            t = (v.replace("クラウド設定", "云设置")
                  .replace("項目名", "项目名")
                  .replace("ステータス", "状态")
                  .replace("選択", "选择")
                  .replace("適合", "适合")
                  .replace("不適合", "不适合")
                  .replace("その他", "其他")
                  .replace("SecurityChecklist", "安全检查清单"))
            trans_data[k] = t

        with open(trans_json, "w", encoding="utf-8") as f:
            json.dump(trans_data, f, ensure_ascii=False, indent=2)

        # 3. Pack
        out_xlsx = self.work_dir / "translated.xlsx"
        res = subprocess.run(
            [sys.executable, str(translate_script), "pack", str(temp_dir),
             str(trans_json), str(out_xlsx), "--target-lang", "zh-CN", "--no-recalc"],
            capture_output=True, text=True
        )
        self.assertEqual(res.returncode, 0, f"pack failed: {res.stderr}")
        self.assertTrue(out_xlsx.exists())

        # 4. Verify preserved format, dropdowns, and translated text
        out_wb = openpyxl.load_workbook(out_xlsx, data_only=False)
        out_ws = out_wb.active
        self.assertEqual(out_ws.title, "安全检查清单")
        self.assertEqual(out_ws["A1"].value, "项目名")
        self.assertEqual(out_ws["B1"].value, "状态")
        self.assertEqual(out_ws["A2"].value, "云设置")

        # Verify dropdown list preserved and translated
        self.assertEqual(len(out_ws.data_validations.dataValidation), 1)
        out_dv = out_ws.data_validations.dataValidation[0]
        self.assertIn("选择", out_dv.formula1)
        self.assertIn("其他", out_dv.formula1)

        # Verify conditional formatting preserved
        self.assertEqual(len(out_ws.conditional_formatting), 1)

    def test_xlsx_preflight_probe_and_layered_routing(self):
        """Test Layer 1 physical probing and Layer 3 content-driven tool selection for XLSX."""
        import openpyxl
        from openpyxl.worksheet.datavalidation import DataValidation
        from openpyxl.formatting.rule import CellIsRule
        from openpyxl.styles import PatternFill

        xlsx_path = self.work_dir / "sample_checklist.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws["A1"] = "ID"
        ws["B1"] = "Status"
        ws["A2"] = "1"
        ws["B2"] = "OptionA"

        dv = DataValidation(type="list", formula1='"OptionA,OptionB"')
        ws.add_data_validation(dv)
        dv.add("B2:B5")

        rule = CellIsRule(operator="equal", formula=['"OptionB"'])
        ws.conditional_formatting.add("B2:B5", rule)
        wb.save(xlsx_path)

        # Layer 1 probe
        from dsh_modules.preflight_probe import probe_session_attachments
        probe_res = probe_session_attachments([str(xlsx_path)], workspace_dir=str(self.work_dir))
        self.assertTrue(probe_res["has_spreadsheet"])
        prof = probe_res["profiles"][0]
        self.assertEqual(prof["kind"], "spreadsheet")
        self.assertEqual(prof["dropdowns"], 1)
        self.assertEqual(prof["conditional_formattings"], 1)
        self.assertIn("下拉框:1处", probe_res["summary"])
        self.assertIn("条件格式:1处", probe_res["summary"])

        # Layer 2 task intent
        from dsh_modules.task_intent import has_physical_artifact_request
        q = "翻译文件，保持格式不变，生成中文的excel文件"
        self.assertTrue(has_physical_artifact_request(q))

        # Layer 3 tool router
        from dsh_modules.xlsx_workflow import is_xlsx_in_place_transform_task
        from unittest.mock import MagicMock
        mock_skill = MagicMock()
        mock_skill.source_formats = [".xlsx"]
        mock_skill.task_contract = {"requirements": [{"quote": "保持格式不变"}]}

        self.assertTrue(is_xlsx_in_place_transform_task(q, mock_skill, files=[str(xlsx_path)]))

    def test_delivery_presentation_sanitizer(self):
        """Test sanitization of internal engineering/QA delivery reports and full text dumps for PPTX, DOCX, and XLSX."""
        from dsh_modules.final_answer import _sanitize_presentation_delivery

        # 1. Test DOCX internal test report sanitization
        docx_test_report = """翻译工作已执行完成。

---

## 翻译交付报告

| 项目 | 结果 |
|------|------|
| 源文件 | `保密合同_1_v1_20261012.docx`（中文） |
| 输出文件 | `保密合同_1_v1_20261012_jp.docx`（日语） |
| 目标语言 | ja-JP（日本日语） |
| 翻译项数 | 21 处（基于 `document.xml` 原生节点精确替换） |
| 原文档碎片 Runs | 89 处已整合 |

**已保留的格式要素**：
- ✅ 页面边距与版心设置
- ✅ 段落结构、标题层级与编号

## 完整翻译内容（中文→日语对照）
| 中文 | 日语 |
| 保密协议 | 機密保持契約書 |

## 翻译确认清单
| 序号 | 条款 | 状态 | 格式保留 |
| 1 | 定义 | ✅ 完成 | ✅ 保留 |

/workspace/保密合同_1_v1_20261012_jp.docx
"""
        docx_prompt = "翻译这个文档，变成日语的docx文档，需要保持格式不变"
        clean_docx = _sanitize_presentation_delivery(docx_test_report, docx_prompt, ["保密合同_1_v1_20261012_jp.docx"])

        # Must eliminate test-oriented jargon and term dictionaries
        self.assertNotIn("document.xml", clean_docx)
        self.assertNotIn("碎片 Runs", clean_docx)
        self.assertNotIn("翻译确认清单", clean_docx)
        self.assertNotIn("/workspace/", clean_docx)
        self.assertNotIn("关键术语对照", clean_docx)
        # Must contain business-friendly 4-part structure
        self.assertIn("## ✅ Word 文档翻译完成", clean_docx)
        self.assertIn("主要处理内容", clean_docx)
        self.assertIn("交付成果物", clean_docx)
        self.assertIn("提示与使用建议", clean_docx)
        self.assertIn("保密合同_1_v1_20261012_jp.docx", clean_docx)
        self.assertLess(len(clean_docx), 800)

        # 2. Test XLSX internal test report sanitization
        xlsx_test_report = """## 翻译交付报告
已调用 ooxml_xlsx_translate.py auto 针对 sharedStrings.xml 与 dataValidation 进行替换。
调用 recalc.py 刷新公式，status: verified。
产物已保存至: /workspace/安全检查清单.xlsx
"""
        xlsx_prompt = "翻译文件，保持格式不变，生成中文的excel文件"
        clean_xlsx = _sanitize_presentation_delivery(xlsx_test_report, xlsx_prompt, ["安全检查清单.xlsx"])

        self.assertNotIn("sharedStrings.xml", clean_xlsx)
        self.assertNotIn("dataValidation", clean_xlsx)
        self.assertNotIn("recalc.py", clean_xlsx)
        self.assertNotIn("/workspace/", clean_xlsx)
        self.assertNotIn("关键术语对照", clean_xlsx)
        self.assertIn("## ✅ Excel 表格翻译完成", clean_xlsx)
        self.assertIn("主要处理内容", clean_xlsx)
        self.assertIn("交付成果物", clean_xlsx)
        self.assertIn("提示与使用建议", clean_xlsx)
        self.assertIn("安全检查清单.xlsx", clean_xlsx)
        self.assertIn("数据验证", clean_xlsx)

        # 3. Test dynamic engineering jargon cleaning on customer-facing response (10:55 reproduction)
        response_1055 = """已完成高保真本地化翻译，生成中文版 Excel 文件。全量 140 处文本项（含 104 处去重翻译）已精准转换，底层 XML 级注入确保了 100% 的版式完整性。

**关键术语对照：**
*   クラウド設定・運用 -> **云端设置·运维**
*   セキュリティチェックリスト -> **安全检查表**
*   確認事項 -> **确认事项**
*   設定内容 -> **设置内容**
*   実施状況 -> **实施状态**
*   備考 -> **备注**

**格式与功能保障说明：**
本文件通过底层 OOXML 流式处理，完整保留了原表所有**数据验证下拉框**、**条件格式高亮逻辑**及**动态统计公式**。LibreOffice 无头重算校验已确认公式缓存刷新成功。您可以直接下载并使用，无需担心格式错位或功能丢失。"""

        clean_1055 = _sanitize_presentation_delivery(response_1055, xlsx_prompt, ["安全检查清单.xlsx"])
        self.assertNotIn("全量 140 处", clean_1055)
        self.assertNotIn("104 处去重翻译", clean_1055)
        self.assertNotIn("底层 XML 级注入", clean_1055)
        self.assertNotIn("OOXML", clean_1055)
        self.assertNotIn("LibreOffice", clean_1055)
        self.assertNotIn("关键术语对照", clean_1055)
        self.assertNotIn("クラウド設定・運用 ->", clean_1055)
        self.assertIn("数据验证下拉框", clean_1055)

        # 4. Test 11:14 reproduction (model outputted only term mapping dictionary)
        response_1114 = """关键术语对照：

クラウド設定・運用 -> 云设置运营
確認事項 -> 确认事项
適合/不適合 -> 符合/不符合
実地確認 -> 实地确认
補足説明 -> 补充说明"""
        clean_1114 = _sanitize_presentation_delivery(response_1114, xlsx_prompt, ["安全检查清单.xlsx"])
        self.assertIn("## ✅ Excel 表格翻译完成", clean_1114)
        self.assertIn("主要处理内容", clean_1114)
        self.assertIn("交付成果物", clean_1114)
        self.assertIn("提示与使用建议", clean_1114)
        self.assertIn("安全检查清单.xlsx", clean_1114)
        self.assertNotIn("クラウド設定・運用 -> 云设置运营", clean_1114)

    def test_office_translation_layering_consistency(self):
        """Test that PPT, DOCX, and XLSX translation tasks follow identical clean 4-layer architecture:
        - Layer 1: Suppresses row/shape dumping into prompt context.
        - Layer 3 (Prompt Builder): Action grounding strictly injects native OOXML CLI and forbids hand-written scripts.
        - Layer 3 (Planning Phase): Plan execution strictly outputs one-click auto CLI command.
        """
        from dsh_modules.prompt_builder import build_user_turn
        from dsh_modules.planning_phase import build_deliverable_execution_instruction
        from unittest.mock import MagicMock

        # 1. Excel Translation Layering Test
        xlsx_prompt = "翻译文件，保持格式不变，生成中文的excel文件"
        user_turn_xlsx = build_user_turn(
            prompt=xlsx_prompt,
            session_files=["test.xlsx"],
            is_office_intent=True,
            is_generate_intent=True,
            available_tool_names=["bash"]
        )
        self.assertIn("ooxml_xlsx_translate.py", user_turn_xlsx)
        self.assertIn("严禁使用 openpyxl 从头新建或手写 Python 脚本", user_turn_xlsx)
        self.assertNotIn("执行 Python openpyxl 脚本", user_turn_xlsx)

        mock_skill_xlsx = MagicMock()
        mock_skill_xlsx.is_office_intent = True
        mock_skill_xlsx.is_docx_intent = False
        mock_skill_xlsx.is_ppt_intent = False
        mock_skill_xlsx.is_design_intent = False
        mock_skill_xlsx.skill_id = "xlsx"
        mock_skill_xlsx.deliverables = ["/workspace/output.xlsx"]
        plan_xlsx = build_deliverable_execution_instruction(mock_skill_xlsx, xlsx_prompt)
        self.assertIn("ooxml_xlsx_translate.py auto", plan_xlsx)
        self.assertIn("--lang zh-CN", plan_xlsx)
        self.assertIn("⚠️ 核心硬性红线：严禁使用 openpyxl 编写 Python 脚本", plan_xlsx)

        # 2. Word Translation Layering Test
        docx_prompt = "翻译这个文档，变成日语的docx文档，需要保持格式不变"
        user_turn_docx = build_user_turn(
            prompt=docx_prompt,
            session_files=["test.docx"],
            is_docx_intent=True,
            is_generate_intent=True,
            available_tool_names=["bash"]
        )
        self.assertIn("ooxml_docx_translate.py", user_turn_docx)
        self.assertIn("严禁使用 python-docx 从头新建文档或手写长字典", user_turn_docx)
        self.assertIn("--lang ja-JP", user_turn_docx)

        mock_skill_docx = MagicMock()
        mock_skill_docx.is_docx_intent = True
        mock_skill_docx.is_office_intent = False
        mock_skill_docx.is_ppt_intent = False
        mock_skill_docx.is_design_intent = False
        mock_skill_docx.skill_id = "docx"
        mock_skill_docx.deliverables = ["/workspace/output.docx"]
        plan_docx = build_deliverable_execution_instruction(mock_skill_docx, docx_prompt)
        self.assertIn("ooxml_docx_translate.py auto", plan_docx)
        self.assertIn("--lang ja-JP", plan_docx)
        self.assertIn("⚠️ 核心硬性红线：严禁使用 python-docx 从头新建文档", plan_docx)

        # 3. PPT Translation Layering Test (Baseline Verification)
        ppt_prompt = "翻译这个PPT，变成日语的pptx文档，需要保持格式不变"
        user_turn_ppt = build_user_turn(
            prompt=ppt_prompt,
            session_files=["test.pptx"],
            is_ppt_intent=True,
            is_generate_intent=True,
            available_tool_names=["bash"]
        )
        self.assertIn("ooxml_translate.py", user_turn_ppt)
        mock_skill_ppt = MagicMock()
        mock_skill_ppt.skill_id = "pptx"
        mock_skill_ppt.is_ppt_intent = True
        mock_skill_ppt.is_docx_intent = False
        mock_skill_ppt.is_office_intent = False
        mock_skill_ppt.is_design_intent = False
        mock_skill_ppt.deliverables = ["/workspace/presentation.pptx"]
        plan_ppt = build_deliverable_execution_instruction(mock_skill_ppt, ppt_prompt)
        self.assertIn("ooxml_translate.py auto", plan_ppt)

    def test_pptx_delivery_sanitizer_and_failure_response(self):
        """Test that PPTX delivery follows customer-facing 4-part structure and failures follow 3-part guidance."""
        from dsh_modules.final_answer import _sanitize_presentation_delivery

        # 1. Test PPTX jargon and mechanical step sanitization
        pptx_mechanical = """完了した作業:
1. 解包 (Unpack): ooxml_translate.py unpack
2. translate: translation_input.json -> translation_output.json
3. パッキング (Pack): ooxml_translate.py pack --shrink-font --auto-fit
文件保存至: /workspace/presentation_ja.pptx
"""
        pptx_prompt = "翻译这个PPT，变成日语的pptx文档，需要保持格式不变"
        clean_pptx = _sanitize_presentation_delivery(pptx_mechanical, pptx_prompt, ["presentation_ja.pptx"])

        self.assertNotIn("ooxml_translate.py", clean_pptx)
        self.assertNotIn("--shrink-font", clean_pptx)
        self.assertNotIn("/workspace/", clean_pptx)
        self.assertNotIn("Unpack", clean_pptx)
        self.assertIn("## ✅ 日本語ローカライズ完了", clean_pptx)
        self.assertIn("主な処理内容", clean_pptx)
        self.assertIn("成果物", clean_pptx)
        self.assertIn("ご利用にあたっての提案", clean_pptx)
        self.assertIn("presentation_ja.pptx", clean_pptx)

        # 2. Test failure template structure
        from dsh_modules.tool_failure_recovery import repeated_execution_failure
        # Simulated evidence of repeated failure
        evidence = [
            MagicMock(is_success=False, is_error=True, error_message="SyntaxError: invalid syntax", provenance={"tool": "bash"}, data={}),
            MagicMock(is_success=False, is_error=True, error_message="SyntaxError: invalid syntax", provenance={"tool": "bash"}, data={}),
            MagicMock(is_success=False, is_error=True, error_message="SyntaxError: invalid syntax", provenance={"tool": "bash"}, data={}),
        ]
        fail_rep = repeated_execution_failure(evidence, artifact_task=True)
        self.assertIsNotNone(fail_rep)
        self.assertEqual(fail_rep.get("tool"), "bash")


if __name__ == "__main__":
    unittest.main()

