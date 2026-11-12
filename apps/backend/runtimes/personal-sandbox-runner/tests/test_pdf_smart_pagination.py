"""Unit tests for smart pagination and candidate heading classification."""
from pathlib import Path
import tempfile
import unittest

from pdf_translation.paragraph_candidates import expand_candidates
from pdf_translation.smart_pagination import measure_page_whitespace, optimize_smart_layout
from pdf_design.renderer import LocalResources
from weasyprint import HTML, CSS
from weasyprint.text.fonts import FontConfiguration


class TestSmartPagination(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix='smart_page_test_'))
        self.font_config = FontConfiguration()
        self.resources = LocalResources([self.tmp_dir])

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_paragraph_candidate_does_not_misclassify_body_line_as_heading(self):
        candidates = [
            {'id': 'p1_g1', 'text': '本文范围的假设条件 ：私有网络连接是模型、网关、智能体和',
             'line_ids': ['p1_l1'], 'bbox': [50, 100, 300, 118], 'column_hint': 1},
            {'id': 'p1_g2', 'text': '1.2 系统架构设计',
             'line_ids': ['p1_l2'], 'bbox': [50, 150, 200, 170], 'column_hint': 1},
            {'id': 'p1_g3', 'text': 'Abstract',
             'line_ids': ['p1_l3'], 'bbox': [50, 200, 120, 220], 'column_hint': 1},
        ]
        data = {'blocks': []}
        page = {'id': 'p1', 'width_pt': 595, 'height_pt': 842, 'lines': []}
        result = expand_candidates(data, candidates, page)
        blocks = {b['line_ids'][0]: b['type'] for b in result['blocks']}

        # Regular body line fragment must be paragraph, not heading
        self.assertEqual(blocks['p1_l1'], 'paragraph')
        # Numbered section must be heading
        self.assertEqual(blocks['p1_l2'], 'heading')
        # Keyword section must be heading
        self.assertEqual(blocks['p1_l3'], 'heading')

    def test_smart_pagination_removes_unnatural_page_break_when_blank_exceeds_threshold(self):
        css = """
        @page { size: A4; margin: 18mm; }
        body { font-size: 10pt; line-height: 1.4; }
        .source-page-start { break-before: page; }
        """
        # Section 0: only one line, leaving >90% whitespace
        # Section 1: starts with source-page-start (continuation text)
        html = """
        <!DOCTYPE html><html><body>
        <section class="segment" data-section-idx="0">
            <p data-node-id="n1">Short tail line that leaves huge whitespace.</p>
        </section>
        <section class="segment source-page-start" data-section-idx="1">
            <p data-node-id="n2">Continuation content that should flow into the sparse page.</p>
        </section>
        </body></html>
        """
        # Initial render should take 2 pages
        doc_init = HTML(string=html).render(stylesheets=[CSS(string=css)])
        self.assertEqual(len(doc_init.pages), 2)

        # After smart optimization, section 1 should be joined into page 1
        opt_html, opt_doc = optimize_smart_layout(
            html, css, self.tmp_dir, self.resources, self.font_config, blank_threshold=0.60
        )
        self.assertEqual(len(opt_doc.pages), 1)
        self.assertNotIn('source-page-start', opt_html)

    def test_smart_pagination_preserves_page_break_for_h1_chapter_heading(self):
        css = """
        @page { size: A4; margin: 18mm; }
        body { font-size: 10pt; line-height: 1.4; }
        .source-page-start { break-before: page; }
        """
        # Section 0: leaves >90% whitespace
        # Section 1: starts with <h1>, representing a real chapter boundary
        html = """
        <!DOCTYPE html><html><body>
        <section class="segment" data-section-idx="0">
            <p data-node-id="n1">Short end of previous section.</p>
        </section>
        <section class="segment source-page-start" data-section-idx="1">
            <h1 data-node-id="n2">Chapter 2: Architecture</h1>
            <p data-node-id="n3">Chapter content here.</p>
        </section>
        </body></html>
        """
        opt_html, opt_doc = optimize_smart_layout(
            html, css, self.tmp_dir, self.resources, self.font_config, blank_threshold=0.60
        )
        # Chapter 1 H1 must maintain its page break
        self.assertEqual(len(opt_doc.pages), 2)
        self.assertIn('source-page-start', opt_html)


if __name__ == '__main__':
    unittest.main()
