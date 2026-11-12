"""Verify real PDF evidence, tool exposure and transport rejection without model calls."""
import io
import os
import re
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

from dsh_modules.visual_reading_policy import profile_pdf, filter_reading_tools, pdf_visual_allowed
from dsh_modules.preflight_probe import probe_session_attachments
from dsh_modules.file_tools import inspect_image, read_workspace_file
from dsh_modules.context_budget import ContextBudget
from dsh_modules.skill_router import SkillRouter
from dsh_modules.document_reading_budget import native_read_budget, document_read_rounds
from dsh_modules.tools import execute_tool
from dsh_modules.runtime_policy import RuntimePolicy


def text_page():
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=400)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
                             NameObject('/Subtype'): NameObject('/Type1'),
                             NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 10 Tf 20 380 Td ' + b'(Native text for document analysis.) Tj 0 -12 Td ' * 20 + b'ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    return page


def image_page():
    buf = io.BytesIO()
    Image.new('RGB', (300, 400), 'white').save(buf, format='PDF')
    return PdfReader(buf).pages[0]


class VisualReadingPolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ws = Path(self.tmp.name)
        self.env = patch.dict(os.environ, {'DSH_USER_REQUEST': '查看和归纳内容', 'DSH_WORKSPACE_DIR': str(self.ws)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def pdf(self, name, pages):
        path = self.ws / name
        writer = PdfWriter()
        for page in pages:
            writer.add_page(page)
        writer.write(path)
        return path

    def tools(self, path, prompt='查看和归纳内容'):
        profiles = probe_session_attachments([path.name], prompt, str(self.ws))['profiles']
        tools = [{'function': {'name': n}} for n in ['read_file', 'vision_inspect', 'web_search', 'fetch_page']]
        result = filter_reading_tools(tools, prompt, SimpleNamespace(is_research_intent=False), False,
                                      files=[path.name], profiles=profiles)
        return {t['function']['name'] for t in result}

    def test_native_pdf_with_cover_and_logos_does_not_enable_vision(self):
        pages = [image_page()]
        for _ in range(5):
            page = text_page()
            page.merge_transformed_page(image_page(), Transformation().scale(.1))
            pages.append(page)
        path = self.pdf('report.pdf', pages)
        self.assertEqual(profile_pdf(path)['reading_mode'], 'native_text')
        self.assertEqual(self.tools(path), {'read_file'})
        # A model-written OCR prompt cannot override the current user's text-only task.
        with patch('dsh_modules.model_image_transport.request_image_completion') as model:
            result = inspect_image(str(path), prompt='OCR all pages', page=2)
        model.assert_not_called()
        self.assertIn('未启用视觉', result)

    def test_scanned_pdf_enables_vision_from_local_evidence(self):
        path = self.pdf('scan.pdf', [image_page() for _ in range(6)])
        self.assertEqual(profile_pdf(path)['reading_mode'], 'scanned_pdf')
        self.assertIn('vision_inspect', self.tools(path))
        self.assertTrue(pdf_visual_allowed(path))

    def test_ocr_pdf_with_hidden_text_and_full_page_images_still_enables_vision(self):
        pages = []
        for _ in range(6):
            page = image_page()
            page.merge_page(text_page())
            pages.append(page)
        path = self.pdf('ocr.pdf', pages)
        self.assertEqual(profile_pdf(path)['reading_mode'], 'image_pdf')
        self.assertIn('vision_inspect', self.tools(path))

    def test_single_illustration_does_not_make_a_text_document_image_heavy(self):
        path = self.pdf('sparse.pdf', [text_page(), text_page(), image_page(), *[text_page() for _ in range(5)]])
        self.assertFalse(profile_pdf(path)['vision_required'])

    def test_explicit_visual_request_and_negative_constraint(self):
        path = self.pdf('native.pdf', [text_page()])
        self.assertIn('vision_inspect', self.tools(path, '请识别图片并分析图表'))
        self.assertNotIn('vision_inspect', self.tools(path, '不要OCR，只归纳文字'))

    def test_invalid_pdf_does_not_trigger_an_external_model(self):
        path = self.ws / 'bad.pdf'
        path.write_bytes(b'not a PDF')
        self.assertEqual(profile_pdf(path)['reading_mode'], 'unknown')
        self.assertFalse(profile_pdf(path)['vision_required'])

    def test_explicit_web_search_can_coexist_with_attachment_reading(self):
        skills = [{'id': 'pdf', 'description': 'PDF document', 'aliases': ['pdf'],
                   'deliverables': ['.pdf'], 'requires_execution': True, 'default_rounds': 5}]
        route = SkillRouter.route('归纳附件，并联网搜索最新行业动态', [], files=['native.pdf'],
                                  available_skills=skills, load_skill_context=False)
        self.assertTrue(route.is_search_intent)
        self.assertTrue(route.is_inspect_intent)
        self.assertFalse(route.is_generate_intent)

    def test_overlarge_visual_range_is_rejected_before_transport(self):
        path = self.pdf('scan.pdf', [image_page() for _ in range(6)])
        with patch('dsh_modules.model_image_transport.request_image_completion') as model:
            result = inspect_image(str(path), page='1-6')
        model.assert_not_called()
        self.assertIn('分页范围超限', result)

    def test_native_pdf_view_keeps_honest_coverage_and_continuation_after_budgeting(self):
        path = self.pdf('long.pdf', [text_page() for _ in range(12)])
        view = read_workspace_file(str(path), max_chars=1800)
        final = ContextBudget.clip_attachment(view, 1800)
        self.assertEqual(view, final)
        self.assertLessEqual(len(final), 1800)
        shown = int(re.search(r'已展示前 (\d+) 行', final)[1])
        self.assertIn(f'start_line={shown + 1}', final)
        body = final.split('】:\n', 1)[1].split('\n\n[⚠️ 长文档截断提醒]', 1)[0]
        self.assertEqual(len(body.splitlines()), shown)

    def test_tool_reply_budget_is_applied_before_native_extraction(self):
        path = self.pdf('long.pdf', [text_page() for _ in range(12)])
        with native_read_budget(1800):
            reply = execute_tool('read_file', {'file_path': str(path)})
        self.assertLessEqual(len(reply), 1800)
        self.assertEqual(reply, ContextBudget.clip_tool_result(reply, 1800))
        self.assertIn('start_line=', reply)

    def test_long_document_has_bounded_reading_rounds(self):
        profiles = [{'reading_mode': 'native_text', 'page_count': 85,
                     'sampled_pages': [{'text_chars': 1300}]}]
        rounds = document_read_rounds(profiles, 10000)
        self.assertGreater(rounds, 3)
        self.assertLessEqual(rounds, 12)
        self.assertEqual(RuntimePolicy().determine_max_rounds('归纳附件', is_inspect_intent=True,
                                                             default_rounds=rounds), rounds)


if __name__ == '__main__':
    unittest.main()
