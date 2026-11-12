"""Content and relationship regressions; natural re-pagination remains allowed."""
import copy
import json
from pathlib import Path
import tempfile
import time
import unittest

import pdfplumber
from pypdf import PdfReader
from weasyprint import HTML

from pdf_translation.native_parser import parse_native
from pdf_translation.source_text import join_lines
from pdf_translation.source_roles import isolate_margin_lines
from pdf_translation.render_structure import reconcile_columns, typography
from pdf_translation.html_renderer import render_document
from pdf_translation.source_links import validate_link_targets, linked_text
from pdf_translation.translation_validation import needs_translation, validate_value
from dsh_modules.pdf_translation_workflow import target_language, fixed_translation


class ReadabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/workspace')
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_commands_and_wrapped_urls_keep_token_boundaries(self):
        source = self.root / 'source.pdf'
        HTML(string='''<style>body{font-family:DejaVu Sans Mono;font-size:10pt}</style>
          <p>docker pull example/tool</p><p>docker run example/<br>tool</p>
          <p><a href="https://example.org/api-reference/create">https://example.org/api-<br>reference/create</a></p>''').write_pdf(source)
        ir = parse_native(source, self.root, time.monotonic() + 20)
        lines = {l['id']: l for l in ir['pages'][0]['lines']}
        text = join_lines(list(lines), lines)
        self.assertIn('docker pull example/tool', text)
        self.assertIn('docker run example/tool', text)
        self.assertIn('https://example.org/api-reference/create', text)

    def test_common_labels_with_hyphens_or_footnotes_are_translated(self):
        for source in ('Open-source', 'Layout1', 'Formula2', 'Bilingual3', '1See https://example.org/'):
            with self.subTest(source=source):
                self.assertTrue(needs_translation(source))
                self.assertIsNotNone(validate_value(source, source, 'zh-CN'))
        for value in ('API', 'OCR4', '1.47', '✓7', 'ignore_cache', 'docker pull example/tool'):
            self.assertFalse(needs_translation(value), value)
        self.assertIsNotNone(validate_value('The cost is 250 dollars.', '费用999美元。', 'zh-CN'))
        self.assertIsNotNone(validate_value('docker pull example/tool', 'docker pull example / tool', 'zh-CN'))
        self.assertIsNone(validate_value('Created in April 2025.', '创建于2025年4月。', 'zh-CN'))

    def test_footnote_marker_merges_and_column_heading_stays_separate(self):
        page = {'width_pt': 600, 'height_pt': 800, 'lines': [
            dict(id='a', text='1', bbox=[70, 712, 74, 718]),
            dict(id='b', text='See the documentation.', bbox=[77, 714, 250, 723]),
            dict(id='c', text='2.2 Flexible middleware', bbox=[320, 200, 500, 212]),
            dict(id='d', text='The middleware translates documents.', bbox=[320, 220, 570, 232])]}
        blocks = [dict(type='footnote', line_ids=['b'], column=1),
                  dict(type='paragraph', line_ids=['a'], column=1),
                  dict(type='paragraph', line_ids=['c', 'd'], column=0)]
        result = isolate_margin_lines(blocks, page)
        self.assertEqual(result[0]['line_ids'], ['a', 'b'])
        self.assertFalse(any(b['line_ids'] == ['a'] for b in result))
        result = reconcile_columns(result, page, 2)
        self.assertEqual([(b['type'], b['column']) for b in result[-2:]], [('heading', 2), ('paragraph', 2)])

    def test_links_survive_reflow_and_text_cannot_inject_html(self):
        source = self.root / 'source.pdf'
        HTML(string='<p><a href="https://example.org/reference">Read the documentation.</a></p>').write_pdf(source)
        ir = parse_native(source, self.root, time.monotonic() + 20)
        lines = ir['pages'][0]['lines']
        ir['pages'][0]['columns'] = 1
        ir['nodes'] = [dict(id='n1', type='paragraph', page_id='p1', column=1,
                            line_ids=[l['id'] for l in lines], text='Read the documentation.')]
        ir['translations'] = {'n1': '请阅读文档。'}
        path, qa = render_document(ir, self.root / 'render', 'balanced')
        self.assertTrue(qa['valid'])
        validate_link_targets(ir, PdfReader(path))
        broken = copy.deepcopy(ir)
        broken['pages'][0]['links'][0]['uri'] = 'https://example.org/missing'
        with self.assertRaisesRegex(ValueError, 'render_links_missing'):
            validate_link_targets(broken, PdfReader(path))
        value = str(linked_text('<script>unsafe</script>', [{'uri': 'javascript:alert(1)', 'label': 'unsafe'}]))
        self.assertIn('&lt;script&gt;', value)
        self.assertNotIn('javascript:', value)

    def test_table_notes_and_caption_remain_on_same_page(self):
        nodes = [dict(id='intro', type='paragraph', page_id='p1', column=0,
                      text='正文内容。' * 280),
                 dict(id='table', type='table', page_id='p1', column=0, text='', cells=[
                     dict(id=f'c{i}', row=i, col=0, rowspan=1, colspan=1, header=False, text=f'项目{i}')
                     for i in range(8)]),
                 dict(id='note', type='footnote', page_id='p1', column=0, text='说明：数值保持不变。'),
                 dict(id='caption', type='caption', page_id='p1', column=0, text='表1：项目比较')]
        ir = dict(pages=[dict(id='p1', columns=1)], source=dict(page_count=1),
                  nodes=nodes, translations={}, assets=[])
        path, _ = render_document(ir, self.root / 'table', 'balanced')
        texts = [p.extract_text() for p in PdfReader(path).pages]
        self.assertTrue(any('项目7' in text and '表1：项目比较' in text for text in texts))

    def test_language_sizes_and_translation_directions(self):
        self.assertGreater(typography('zh-CN')['body'], typography('en')['body'])
        self.assertGreater(typography('zh-CN')['body'], typography('ja')['body'])
        for prompt, lang in [('英文文档翻译成中文PDF', 'zh-CN'),
                             ('中文文档翻译为英文PDF', 'en'), ('翻译为日文PDF', 'ja')]:
            self.assertEqual(target_language(prompt), lang)
            self.assertTrue(fixed_translation(prompt, ['source.pdf'], ['.pdf']))


if __name__ == '__main__':
    unittest.main()
