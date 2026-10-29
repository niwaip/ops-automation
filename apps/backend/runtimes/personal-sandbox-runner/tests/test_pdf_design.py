"""Real PDF production tests: pagination, CJK extraction, images and failed publication."""

import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

try:
    from PIL import Image
    from pypdf import PdfReader
    HAS_PDF_DEPS = True
except ImportError:
    HAS_PDF_DEPS = False

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path(os.environ.get('PDF_DESIGN_SCRIPTS', ROOT / 'skills/pdf/scripts'))
sys.path.insert(0, str(SCRIPTS))

if HAS_PDF_DEPS:
    from pdf_design import render_report
    from pdf_design.quality import inspect_pdf
    from pdf_design.renderer import LocalResources, ResourceError


@unittest.skipUnless(HAS_PDF_DEPS, "PIL or pypdf not installed in test runner environment")
class PDFDesignTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.output = self.folder / '观察手册.pdf'

    def render(self, text, **kwargs):
        with contextlib.redirect_stdout(io.StringIO()):
            render_report(text.splitlines(), str(self.output), **kwargs)
        return json.loads((self.folder / '.pdf-preview/观察手册/qa.json').read_text())

    def test_markdown_two_pages_preserves_chinese_bold_links_and_final_summary(self):
        qa = self.render('# 自然观察手册\n\n## 出发前\n\n带上**记录本**，观察 English 与中文混排。\n\n'
                         '[参考资料](https://example.org/guide)\n\n<!-- pagebreak -->\n\n'
                         '## 交流\n\n把观察结果写成短句。', min_pages=2, max_pages=2)
        self.assertTrue(qa['valid'])
        self.assertEqual(qa['page_count'], 2)
        self.assertEqual(len(qa['previews']), 2)
        self.assertEqual(qa['sha256'], hashlib.sha256(self.output.read_bytes()).hexdigest())
        self.assertTrue(all(font['embedded'] for page in qa['pages'] for font in page['fonts']))
        text = '\n'.join(page['text'] for page in qa['pages'])
        self.assertIn('记录本', text)
        self.assertNotIn('\0', text)
        self.assertNotIn('\ufffd', text)
        reader = PdfReader(self.output)
        self.assertTrue(any(annotation.get_object().get('/A', {}).get('/URI') == 'https://example.org/guide'
                            for page in reader.pages for annotation in page.get('/Annots', [])))
        fonts = {font['name'] for page in qa['pages'] for font in page['fonts']}
        self.assertTrue(any('Bold' in name for name in fonts))

    def test_long_table_repeats_headers_and_keeps_last_row(self):
        rows = '\n'.join(f'| 观察编号{i:03d} | 记录叶片、枝条与环境，包含完整的中文描述。 |'
                         for i in range(70))
        qa = self.render('# 观察记录\n\n| 观察项目 | 记录内容 |\n| --- | --- |\n' + rows)
        self.assertGreater(qa['page_count'], 1)
        for page in qa['pages']:
            self.assertIn('观察项目', page['text'])
            self.assertEqual(page['outside_page_glyphs'], 0)
        self.assertIn('观察编号069', qa['pages'][-1]['text'])

    def test_json_local_image_and_mobile_geometry(self):
        Image.new('RGB', (80, 40), '#28695c').save(self.folder / '叶片.png')
        source = self.folder / '手册.json'
        source.write_text(json.dumps({'title': '图文观察', 'blocks': [
            {'type': 'heading', 'text': '观察方法'},
            {'type': 'paragraph', 'text': '放大局部，比较叶片。'},
            {'type': 'image', 'path': '叶片.png', 'caption': '叶片配图'},
        ]}, ensure_ascii=False))
        with contextlib.redirect_stdout(io.StringIO()):
            render_report(input_path=source, output_path=self.output, template='mobile', max_pages=1)
        qa = json.loads((self.folder / '.pdf-preview/观察手册/qa.json').read_text())
        self.assertAlmostEqual(qa['pages'][0]['width_pt'], 108 / 25.4 * 72, places=1)
        self.assertIn('叶片配图', qa['pages'][0]['text'])
        self.assertTrue(PdfReader(self.output).pages[0].images)

    def test_failed_page_budget_does_not_replace_existing_pdf(self):
        self.render('# 原件\n\n保留这一版本。')
        original = self.output.read_bytes()
        with self.assertRaisesRegex(ValueError, 'at most 1'):
            self.render('# 新版本\n\n第一页。\n\n<!-- pagebreak -->\n\n第二页。', max_pages=1)
        self.assertEqual(self.output.read_bytes(), original)
        self.assertFalse(list(self.folder.glob('.pdf-build-*')))

    def test_missing_or_external_images_fail_without_publishing_pdf(self):
        for image in ('https://example.invalid/leaf.png', 'missing-leaf.png'):
            with self.subTest(image=image), self.assertRaisesRegex(ValueError, 'quality checks failed'):
                self.render(f'# 图文资料\n\n![叶片]({image})')
            self.assertFalse(self.output.exists())

    def test_resource_scope_rejects_symlink_escape(self):
        with tempfile.TemporaryDirectory() as outside:
            secret = Path(outside) / 'outside.svg'
            secret.write_text('<svg/>')
            link = self.folder / 'linked.svg'
            link.symlink_to(secret)
            fetch = LocalResources([self.folder])
            with self.assertRaises(ResourceError):
                fetch(link.as_uri())

    def test_glyphs_outside_page_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'outside the page'):
            self.render('# 边界检查\n\n正文。\n\n'
                        '<div style="position:absolute;left:250mm">越界文本</div>')
        self.assertFalse(self.output.exists())

    def test_corrupt_pdf_fails_parser(self):
        bad = self.folder / 'broken.pdf'
        bad.write_bytes(b'%PDF-1.7\nnot a PDF')
        with self.assertRaises(Exception):
            inspect_pdf(bad)

    def test_existing_cli_arguments_remain_usable(self):
        result = subprocess.run([sys.executable, str(SCRIPTS / 'generate_report_pdf.py'),
                                 '--text', '# 兼容入口\n\n保留既有参数。', '--output', str(self.output),
                                 '--theme', 'burgundy', '--author', '资料组', '--date', '2026-10'],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('pages=1', result.stdout)
        self.assertIn('资料组', PdfReader(self.output).pages[0].extract_text())


if __name__ == '__main__':
    unittest.main()
