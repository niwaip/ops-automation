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
