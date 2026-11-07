"""Actual parser/HTML/PDF roundtrips and the historical silent-failure regressions."""
import copy
import json
import re
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from weasyprint import HTML

from pdf_translation.contracts import IR_SCHEMA, TranslationError, digest, read_json, write_json
from pdf_translation.native_parser import page_lines, parse_native
from pdf_translation.layout_analyzer import materialize_page
from pdf_translation.pipeline import run_job
from pdf_translation.translation_validation import needs_translation, validate_value, validate_translation
from pdf_translation.text_translator import translate_document
from pdf_translation.html_renderer import render_document
from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.asset_extractor import extract_assets


def make_source(path):
    HTML(string='''<style>@page {size:A4;margin:20mm} body {font-family:"DejaVu Serif";font-size:11pt}
        h1 {font-size:18pt} .columns {column-count:2}</style>
        <h1>Document Translation</h1><div class="columns"><p>First paragraph 10.</p>
        <p>Second paragraph 20.</p></div>''').write_pdf(path)


class FixtureGateway:
    def __init__(self, *args):
        pass

    def layout(self, image, prompt):
        context = json.loads(prompt.split('authoritative; use the image for structure, not rewriting words.\n')[1].split('\nPrevious')[0])
        return {'columns': 2, 'blocks': [{'type': 'title' if index == 0 else 'paragraph',
            'line_ids': [line['id']], 'bbox': line['bbox'], 'column': 0 if index == 0 else 1}
            for index, line in enumerate(context['lines'])]}

    def translate(self, prompt):
        values = json.loads(prompt.split('\nInput:\n')[1])
        dictionary = {'Document Translation': '文档翻译', 'First paragraph 10.': '第一段内容10。',
                      'Second paragraph 20.': '第二段内容20。'}
        result = {}
        for key, value in values.items():
            tokens = re.findall(r'__PDF_NUM_[A-Za-z0-9_]+__', value)
            # The HTTP fixture echoes opaque tokens; the real codec owns their
            # values. Direct parser tests continue using the unencoded input.
            literal = '10' if value.startswith('First') else '20'
            source = re.sub(r'__PDF_NUM_[A-Za-z0-9_]+__', literal, value)
            translated = dictionary[source]
            if tokens:
                iterator = iter(tokens)
                translated = re.sub(r'\d+', lambda _: next(iterator), translated)
            result[key] = translated
        return result


class TranslationEngineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='/workspace')
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {'WORKSPACE': str(self.root)})
        self.env.start()
        self.source = self.root / 'original.pdf'
        make_source(self.source)

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def test_full_candidate_roundtrip_keeps_original_and_old_output(self):
        target = self.root / 'translated.pdf'
        target.write_bytes(b'previous approved output')
        source_hash = digest(self.source)
        path = run_job(self.source, target, gateway_factory=FixtureGateway)
        manifest = read_json(path)
        self.assertEqual(manifest['state'], 'candidate_ready')
        self.assertEqual(target.read_bytes(), b'previous approved output')
        self.assertEqual(digest(self.source), source_hash)
        self.assertTrue(Path(manifest['candidate_path']).is_file())
        ir = read_json(path.parent / 'translated.ir.json')
        self.assertTrue(validate_translation(ir, 'zh-CN')['valid'])
        self.assertEqual(len(ir['nodes']), 3)
        from pypdf import PdfReader
        text = ''.join(p.extract_text() for p in PdfReader(manifest['candidate_path']).pages)
        self.assertIn('第一段内容10', text)
        self.assertIn('第二段内容20', text)

    def test_transport_error_never_exports_original(self):
        class Failing(FixtureGateway):
            def translate(self, prompt):
                raise ConnectionError('synthetic proxy refused')
        with self.assertRaises(ConnectionError):
            run_job(self.source, self.root / 'translated.pdf', gateway_factory=Failing)
        manifests = list(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json'))
        self.assertEqual(read_json(manifests[0])['state'], 'failed')
        self.assertFalse((self.root / 'translated.pdf').exists())

    def test_missing_json_keys_cannot_succeed(self):
        class Empty(FixtureGateway):
            def translate(self, prompt):
                return {}
        with self.assertRaises(TranslationError):
            run_job(self.source, self.root / 'translated.pdf', gateway_factory=Empty)
        self.assertFalse((self.root / 'translated.pdf').exists())

    def test_unpack_pack_uses_versioned_ir_and_explicit_translations(self):
        directory = self.root / 'unpacked'
        manifest = run_job(self.source, mode='unpack', work_dir=directory, gateway_factory=FixtureGateway)
        self.assertEqual(read_json(manifest)['state'], 'unpacked')
        ir = read_json(directory / 'source.ir.json')
        translations = FixtureGateway().translate('\nInput:\n' + json.dumps(
            {node['id']: node['text'] for node in ir['nodes']}))
        write_json(directory / 'translated.json', translations)
        result = run_job(self.source, self.root / 'packed.pdf', mode='pack',
                         work_dir=directory, gateway_factory=FixtureGateway)
        self.assertEqual(read_json(result)['state'], 'candidate_ready')
        self.assertFalse((self.root / 'packed.pdf').exists())

    def test_layout_must_assign_each_source_line_exactly_once(self):
        ir = parse_native(self.source, self.root, time.monotonic() + 30)
        page = ir['pages'][0]
        first = page['lines'][0]
        with self.assertRaises(ValueError):
            materialize_page({'columns': 2, 'blocks': [{'type': 'title',
                'bbox': first['bbox'], 'line_ids': [first['id']], 'column': 0}]}, page)

    def test_numeric_and_language_validation(self):
        self.assertIsNotNone(validate_value('Costs 10.50 dollars.', '费用为10.60美元。', 'zh-CN', strict_numbers=True))
        self.assertIsNone(validate_value('Costs 10.50 dollars.', '费用为10.60美元。', 'zh-CN', strict_numbers=False))
        self.assertIsNone(validate_value('two model formats: ONNX 2', '两种模型格式：ONNX 2', 'zh-CN'))
        self.assertIsNotNone(validate_value('A complete paragraph.', 'A complete paragraph.', 'zh-CN'))
        self.assertIsNone(validate_value('Costs 10.50 dollars.', '费用为10.50美元。', 'zh-CN'))
        self.assertFalse(needs_translation('docker pull byaidu / pdf2zh'))
        self.assertFalse(needs_translation('pip install pdf2zh'))
        self.assertIsNone(validate_value('docker pull byaidu / pdf2zh', 'docker pull byaidu / pdf2zh', 'zh-CN'))
        self.assertIsNone(validate_value('Created in April 2025.', '创建于 2025 年 4 月。', 'zh-CN'))
        self.assertIsNone(validate_value('IMT: Immersive Translate PDF Pro.', 'IMT：Immersive Translate PDF Pro。', 'zh-CN'))
        self.assertTrue(needs_translation('A complete paragraph.'))

    def test_two_column_candidates_keep_native_ids_and_reading_lanes(self):
        lines = [{'id': f'p1_l{row * 2 + col}', 'text': f'Sentence {row} column {col}.',
                  'bbox': [40 + 260 * col, 100 + row * 13, 240 + 260 * col, 110 + row * 13]}
                 for row in range(8) for col in range(2)]
        groups = candidate_lines({'id': 'p1', 'width_pt': 595, 'lines': lines, 'table_candidates': []})
        self.assertEqual([g['column_hint'] for g in groups], [1, 2])
        expanded = expand_candidates({'blocks': [{'line_ids': [g['id']]} for g in groups]}, groups)
        self.assertEqual(expanded['blocks'][0]['line_ids'], [f'p1_l{r * 2}' for r in range(8)])
        with self.assertRaises(ValueError):
            expand_candidates({'blocks': [{'line_ids': [groups[0]['id']]}]}, groups)

    def test_layout_geometric_self_healing_recovers_missing_candidates_and_figure_overlaps(self):
        page = {'id': 'p1', 'width_pt': 600, 'height_pt': 800, 'table_candidates': [], 'lines': [
            {'id': 'p1_l1', 'text': 'Diagram internal label', 'bbox': [100, 120, 200, 130], 'rotated': False},
            {'id': 'p1_l2', 'text': 'Figure 1: The architecture', 'bbox': [100, 290, 300, 300], 'rotated': False},
            {'id': 'p1_l3', 'text': '1.1 Introduction heading', 'bbox': [50, 320, 200, 330], 'rotated': False},
            {'id': 'p1_l4', 'text': 'This is the main body paragraph describing architecture.', 'bbox': [50, 340, 250, 380], 'rotated': False},
        ]}
        groups = candidate_lines(page)
        # Model returns figure overlapping caption, and omits heading p1_l3
        raw_model_data = {
            'columns': 1,
            'blocks': [
                {'type': 'figure', 'bbox': [50, 100, 500, 300], 'line_ids': []},
                {'type': 'caption', 'bbox': [100, 290, 300, 300], 'line_ids': [groups[1]['id']]},
                {'type': 'paragraph', 'bbox': [50, 340, 250, 380], 'line_ids': [groups[3]['id']]},
            ]
        }
        # With page provided, self-healing heals figure overlap, absorbs internal label, and synthesizes missing heading
        expanded = expand_candidates(raw_model_data, groups, page)
        from pdf_translation.layout_analyzer import materialize_page
        nodes = materialize_page(expanded, page)
        self.assertEqual(len(nodes), 4)
        node_types = [n['type'] for n in nodes]
        self.assertIn('figure', node_types)
        self.assertIn('caption', node_types)
        self.assertIn('heading', node_types)
        self.assertIn('paragraph', node_types)
        heading_node = [n for n in nodes if n['type'] == 'heading'][0]
        self.assertIn('1.1 Introduction heading', heading_node['text'])

    def test_vector_figure_and_formula_are_cropped_and_rendered_with_legend(self):
        from PIL import Image, ImageDraw
        preview = self.root / 'preview.png'
        image = Image.new('RGB', (600, 800), 'white')
        ImageDraw.Draw(image).rectangle((50, 100, 550, 300), fill='navy')
        image.save(preview)
        ir = {'pages': [{'id': 'p1', 'columns': 1, 'preview': str(preview),
                        'width_pt': 600, 'height_pt': 800}], 'source': {'page_count': 1},
              'nodes': [{'id': 'figure', 'page_id': 'p1', 'type': 'figure',
                         'bbox': [50, 100, 550, 300], 'text': 'Input 10'},
                        {'id': 'formula', 'page_id': 'p1', 'type': 'formula',
                         'bbox': [100, 350, 400, 390], 'text': 'x = 10'}],
              'translations': {'figure': '输入10'}, 'assets': []}
        extract_assets(ir, self.root)
        self.assertEqual(len(ir['assets']), 2)
        candidate, qa = render_document(ir, self.root / 'figures', 'balanced')
        self.assertTrue(qa['valid'])
        from pypdf import PdfReader
        self.assertGreaterEqual(sum(len(p.images) for p in PdfReader(candidate).pages), 2)
        self.assertIn('输入10', '\n'.join(p['text'] for p in qa['pages']))

    def test_output_cannot_overwrite_source_or_follow_symlink(self):
        with self.assertRaises(TranslationError):
            run_job(self.source, self.source, gateway_factory=FixtureGateway)
        link = self.root / 'link'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(TranslationError):
            run_job(self.source, link / 'translated.pdf', gateway_factory=FixtureGateway)

    def test_long_table_and_merged_header_render_without_losing_cells(self):
        cells = [{'id': 'header', 'row': 0, 'col': 0, 'rowspan': 1, 'colspan': 2,
                  'header': True, 'text': '表格标题'}]
        for row in range(1, 81):
            for col in range(2):
                cells.append({'id': f'c{row}_{col}', 'row': row, 'col': col,
                    'rowspan': 1, 'colspan': 1, 'header': False, 'text': f'项目{row}编号{col}'})
        ir = {'pages': [{'id': 'p1', 'columns': 2}], 'source': {'page_count': 1},
              'nodes': [{'id': 'table', 'page_id': 'p1', 'type': 'table', 'text': '', 'cells': cells}],
              'translations': {}, 'assets': []}
        candidate, qa = render_document(ir, self.root / 'long-table', 'balanced')
        self.assertTrue(qa['valid'])
        self.assertGreater(qa['page_count'], 1)
        html = (candidate.parent / 'document.html').read_text()
        self.assertIn('colspan="2"', html)
        self.assertIn('<thead>', html)
        self.assertIn('项目80编号1', '\n'.join(p['text'] for p in qa['pages']))

    def test_column_specific_figure_stays_in_multi_column_segment(self):
        from PIL import Image
        img_path = self.root / 'dummy.png'
        Image.new('RGB', (100, 100), color='blue').save(img_path)
        ir = {
            'pages': [{'id': 'p1', 'columns': 2}],
            'source': {'page_count': 1},
            'nodes': [
                {'id': 'p1_b1', 'page_id': 'p1', 'type': 'paragraph', 'column': 1, 'text': 'Left col text'},
                {'id': 'p1_b2', 'page_id': 'p1', 'type': 'figure', 'column': 2, 'text': 'Right col fig', 'asset': str(img_path)},
                {'id': 'p1_b3', 'page_id': 'p1', 'type': 'caption', 'column': 2, 'text': '图 1：右栏说明'},
            ],
            'translations': {},
            'assets': [{'id': 'p1_b2', 'path': str(img_path)}],
        }
        candidate, qa = render_document(ir, self.root / 'col-fig', 'balanced')
        self.assertTrue(qa['valid'])
        html = (candidate.parent / 'document.html').read_text()
        self.assertIn('columns-2', html)
        self.assertNotIn('columns-1', html)
