import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from dsh_modules.pdf_render_tool import render_pdf
from dsh_modules.pdf_task_contract import validate_pdf_content
from dsh_modules.pdf_preview_tool import reset_pdf_renders, pdf_delivery_result


class PDFPrecheckRecoveryTests(unittest.TestCase):
    def test_missing_break_reports_structure_not_missing_content(self):
        with self.assertRaisesRegex(ValueError, '分页结构错误') as error:
            validate_pdf_content('第一页\n---\n如何写观察记录：写下事实。', '第1页：简介。第2页：如何写观察记录。')
        self.assertNotIn('缺少用户', str(error.exception))

    def test_failure_keeps_full_private_input_and_does_not_run_renderer(self):
        reset_pdf_renders()
        with tempfile.TemporaryDirectory() as folder, patch('dsh_modules.pdf_render_tool.subprocess.run') as run:
            text = '完整正文' * 300
            result = render_pdf({'markdown': text, 'output_path': 'new.pdf'}, folder, folder,
                                user_prompt='第1页：简介。第2页：记录。').tool_result
            self.assertTrue(result.is_error)
            self.assertEqual(result.data['stage'], 'content_precheck')
            attempt = Path(result.data['attempt_path'])
            self.assertEqual(json.loads(attempt.read_text())['raw_markdown'], text)
            self.assertEqual(os.stat(attempt).st_mode & 0o777, 0o600)
            run.assert_not_called()
            self.assertFalse((Path(folder) / 'new.pdf').exists())
            answer, files = pdf_delivery_result()
            self.assertIn('未发布', answer)
            self.assertNotIn('尚未生成', answer)
            self.assertEqual(files, [])

    def test_pages_are_joined_and_reach_renderer_setup(self):
        with tempfile.TemporaryDirectory() as folder:
            result = render_pdf({'pages': ['第一页', '如何写观察记录：写下事实。'], 'output_path': 'new.pdf'},
                                folder, folder, user_prompt='第1页：简介。第2页：如何写观察记录。').tool_result
            self.assertEqual(result.data['stage'], 'render')
            saved = json.loads(Path(result.data['attempt_path']).read_text())
            self.assertEqual(saved['normalized_markdown'], '第一页\n\n<!-- pagebreak -->\n\n如何写观察记录：写下事实。')

    def test_schema_requires_real_page_content_and_malformed_call_is_auditable(self):
        from dsh_modules.pdf_render_tool import PDF_RENDER_TOOL
        schema = PDF_RENDER_TOOL['function']['parameters']
        self.assertIn('pages', schema['required'])
        with tempfile.TemporaryDirectory() as folder:
            result = render_pdf({'output_path': 'a.pdf'}, folder, folder).tool_result
            self.assertTrue(result.is_error)
            saved = json.loads(Path(result.data['attempt_path']).read_text())
            self.assertEqual(saved['params']['output_path'], 'a.pdf')

    def test_ambiguous_or_empty_page_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            for params in ({'pages': []}, {'pages': ['']}, {'pages': ['one'], 'markdown': 'two'}):
                self.assertTrue(render_pdf({**params, 'output_path': 'a.pdf'}, folder, folder).is_error)
