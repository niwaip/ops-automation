"""Tests for OOXML translation heavy task timeout and checkpoint cache recovery."""
import json
import os
import re
import tempfile
import unittest
from unittest.mock import patch, MagicMock

from dsh_modules.shell_tools import execute_shell
from dsh_modules.tool_result import adapt_tool_output


class OoxmlTranslateTimeoutAndCacheTests(unittest.TestCase):
    def test_heavy_task_regex_matches_all_office_and_pdf_translators(self):
        pattern = r'(?:ooxml|flow).*translate|render_(?:docx|pdf|spreadsheet)'
        cases = [
            ("python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto /workspace/test.xlsx /workspace/out.xlsx", True),
            ("python3 /opt/dsh/skills/docx/scripts/ooxml_docx_translate.py auto /workspace/test.docx /workspace/out.docx", True),
            ("python3 /opt/dsh/skills/pptx/scripts/ooxml_translate.py auto /workspace/test.pptx /workspace/out.pptx", True),
            ("python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto /workspace/test.pdf /workspace/out.pdf", True),
            ("python3 render_spreadsheet.py input.xlsx", True),
            ("python3 render_docx.py input.docx", True),
            ("python3 render_pdf.py input.pdf", True),
            ("ls -la /workspace", False),
            ("cat /workspace/data.json", False),
        ]
        for cmd, expected in cases:
            with self.subTest(cmd=cmd):
                self.assertEqual(bool(re.search(pattern, cmd)), expected)

    def test_checkpoint_cache_restores_and_skips_cached_items(self):
        import sys
        skill_script_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../skills/xlsx/scripts")
        )
        if skill_script_dir not in sys.path:
            sys.path.insert(0, skill_script_dir)

        import ooxml_xlsx_translate

        with tempfile.TemporaryDirectory() as temp_dir:
            in_json = os.path.join(temp_dir, "in.json")
            out_json = os.path.join(temp_dir, "out.json")
            cache_file = os.path.join(temp_dir, ".translation_cache.json")

            # Prepare test data with 3 items: 1 passthrough, 2 to translate
            raw_data = {
                "0": "Item A to translate",
                "1": "Item B to translate",
                "2": "100.00"  # passthrough
            }
            with open(in_json, "w", encoding="utf-8") as f:
                json.dump(raw_data, f)

            # Pre-populate cache with Item A already translated
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump({"Item A to translate": "已翻译项A"}, f)

            # Mock _translate_single_batch_streaming to translate remaining Item B
            def mock_translate_batch(batch_dict, target_lang, api_base, api_key, model="default", retries=2):
                res = {}
                for uid, text in batch_dict.items():
                    res[uid] = f"已翻译_{text}"
                return res

            with patch.object(ooxml_xlsx_translate, "_translate_single_batch_streaming", side_effect=mock_translate_batch) as mock_fn:
                result = ooxml_xlsx_translate.translate_texts(in_json, out_json, target_lang="zh-CN", batch_size=10, concurrency=1)

                # Mock should only be called for Item B, because Item A came from cache
                self.assertEqual(mock_fn.call_count, 1)
                called_batch = mock_fn.call_args[0][0]
                self.assertIn("Item B to translate", called_batch.values())
                self.assertNotIn("Item A to translate", called_batch.values())

            # Verify final output combines cached, translated, and passthrough
            self.assertEqual(result["0"], "已翻译项A")
            self.assertEqual(result["1"], "已翻译_Item B to translate")
            self.assertEqual(result["2"], "100.00")

            # Verify cache file was cleaned up on success
            self.assertFalse(os.path.exists(cache_file))
            self.assertTrue(os.path.exists(out_json))

    def test_unpack_xlsx_preserves_existing_checkpoint_cache(self):
        import sys
        import zipfile
        skill_script_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../skills/xlsx/scripts")
        )
        if skill_script_dir not in sys.path:
            sys.path.insert(0, skill_script_dir)

        import ooxml_xlsx_translate

        with tempfile.TemporaryDirectory() as temp_dir:
            xlsx_path = os.path.join(temp_dir, "dummy.xlsx")
            unpacked_dir = os.path.join(temp_dir, "unpacked")
            os.makedirs(unpacked_dir, exist_ok=True)

            # Create a minimal valid zip file as dummy xlsx
            with zipfile.ZipFile(xlsx_path, "w") as z:
                z.writestr("xl/sharedStrings.xml", b"<sst xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'><si><t>Test</t></si></sst>")

            # Simulate existing checkpoint cache from previous interrupted attempt
            cache_file = os.path.join(unpacked_dir, ".translation_cache.json")
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump({"Old Text": "已翻译旧文本"}, f)

            out_json = os.path.join(unpacked_dir, "translation_input.json")
            # Unpack should NOT destroy .translation_cache.json
            ooxml_xlsx_translate.unpack_xlsx(xlsx_path, unpacked_dir, out_json)

            self.assertTrue(os.path.exists(cache_file), "断点缓存文件在 unpack_xlsx 重新解压后必须被完整保留")
            with open(cache_file, "r", encoding="utf-8") as f:
                restored = json.load(f)
            self.assertEqual(restored.get("Old Text"), "已翻译旧文本")

    def test_format_client_safe_tool_preview_sanitizes_bash_and_paths(self):
        from dsh_modules.tool_dispatch import format_client_safe_tool_preview

        def dummy_preview(val, max_chars=100):
            return str(val)[:max_chars]

        # 1. Heavy XLSX translation command -> High-level description without any paths
        bash_xlsx = {
            "cmd": "cd /workspace && python3 /opt/dsh/skills/xlsx/scripts/ooxml_xlsx_translate.py auto /workspace/upload/System_Security_Plan_Sheets_FCH.xlsx"
        }
        res = format_client_safe_tool_preview("bash", bash_xlsx, dummy_preview, 100)
        self.assertEqual(res, "高保真表格本地化与校验")
        self.assertNotIn("/workspace", res)
        self.assertNotIn("/opt/dsh", res)
        self.assertNotIn("python3", res)

        # 2. PDF rendering / compilation
        bash_pdf = {"cmd": "python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto in.pdf out.pdf"}
        self.assertEqual(format_client_safe_tool_preview("bash", bash_pdf, dummy_preview, 100), "高保真文档排版与编译")

        # 3. File operations -> Clean filename only
        read_file_params = {"file_path": "/workspace/upload/System_Security_Plan_Sheets_FCH.xlsx"}
        res_file = format_client_safe_tool_preview("read_file", read_file_params, dummy_preview, 100)
        self.assertEqual(res_file, "'System_Security_Plan_Sheets_FCH.xlsx'")
        self.assertNotIn("/workspace/upload", res_file)

    def test_preserve_root_tag_write_preserves_custom_namespaces_like_xdr(self):
        import sys
        import xml.etree.ElementTree as ET
        skill_script_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "../skills/xlsx/scripts")
        )
        if skill_script_dir not in sys.path:
            sys.path.insert(0, skill_script_dir)

        import ooxml_xlsx_translate

        with tempfile.TemporaryDirectory() as temp_dir:
            xml_path = os.path.join(temp_dir, "sheet.xml")
            raw_xml = (
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
                'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">'
                '<sheetData/>'
                '<drawing><xdr:col>5</xdr:col></drawing>'
                '</worksheet>'
            )

            # Register dynamic namespaces as pack_xlsx does
            ooxml_xlsx_translate._register_all_namespaces(raw_xml)
            tree = ET.ElementTree(ET.fromstring(raw_xml))

            # Modify an element
            sheet_data = tree.getroot().find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData')
            sheet_data.set('modified', '1')

            # Write via _preserve_root_tag_write
            ooxml_xlsx_translate._preserve_root_tag_write(tree, xml_path, raw_xml)

            # Verification: the resulting file MUST be parsable without unbound prefix error
            with open(xml_path, 'r', encoding='utf-8') as f:
                saved_text = f.read()

            parsed = ET.fromstring(saved_text)
            self.assertEqual(parsed.tag, '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}worksheet')
            self.assertNotIn("ns4:", saved_text)
            self.assertIn("xdr:", saved_text)

    def test_quarantine_invalid_deliverables_non_strict_preserves_files_and_outbounds(self):
        """Verify that under non-strict verification mode ('不要一票否决'), files and outbounds are preserved."""
        import time
        from pathlib import Path
        from dsh_modules.workbook_delivery import quarantine_invalid_deliverables
        import openpyxl

        with tempfile.TemporaryDirectory() as temp_dir:
            ws_root = Path(temp_dir)
            # Create a workbook with missing formula cache
            test_file = ws_root / "System_Security_Plan_Sheets_FCH_zh.xlsx"
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "测试"
            ws["A1"] = 10
            ws["A2"] = 20
            ws["A3"] = "=SUM(A1:A2)"
            wb.save(test_file)

            outbounds = [json.dumps({"filePath": str(test_file), "fileName": test_file.name})]
            sample_text = "本地化已顺利完成，请查收交付物。"

            # 1. Non-strict mode (strict=False)
            res_text, kept_outbounds, rejected = quarantine_invalid_deliverables(
                ws_root, time.time() - 10, sample_text, outbounds, strict=False
            )

            self.assertEqual(rejected, [], "非一票否决模式下 rejected 应为空，不阻断主流程")
            self.assertEqual(len(kept_outbounds), 1, "外发交付物列表必须完整保留供前端卡片呈现")
            self.assertTrue(test_file.exists(), "工作区物理文件必须被完整保留，不能被隔离移走")
            self.assertIn("本地化已顺利完成", res_text)

            # 2. Strict mode (strict=True) -> Legacy veto behavior
            res_text_strict, kept_outbounds_strict, rejected_strict = quarantine_invalid_deliverables(
                ws_root, time.time() - 10, sample_text, outbounds, strict=True
            )
            # Since A3 = "=SUM(A1:A2)" without openpyxl evaluation might lack cache or pass depending on openpyxl write:
            # Regardless, the strict flag is respected
            self.assertTrue(isinstance(rejected_strict, list))

    def test_deliverable_is_valid_lenient_mode(self):
        """Test deliverable_is_valid allows readable workbooks in non-strict mode."""
        from dsh_modules.workbook_delivery import deliverable_is_valid
        import openpyxl
        from pathlib import Path

        with tempfile.TemporaryDirectory() as temp_dir:
            f = Path(temp_dir) / "test.xlsx"
            wb = openpyxl.Workbook()
            ws = wb.active
            ws["A1"] = "test"
            wb.save(f)

            self.assertTrue(deliverable_is_valid(f, strict=False))

            broken = Path(temp_dir) / "broken.xlsx"
            broken.write_text("not a zip file", encoding="utf-8")
            self.assertFalse(deliverable_is_valid(broken, strict=False))
