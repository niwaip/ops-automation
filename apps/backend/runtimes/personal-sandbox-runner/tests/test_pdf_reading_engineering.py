"""General PDF reading contracts, using synthetic layouts rather than a user document."""
import io
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from dsh_modules import config as cfg
from dsh_modules.office_tools import extract_pdf_text
from dsh_modules.pdf_page_layout import extract_page_evidence
from dsh_modules.pdf_text_cache import _FULL_DOC_CACHE, _SAMPLED_PAGES_CACHE, extract_pdf_document
from dsh_modules.pdf_reading import record_pdf_reading
from dsh_modules.visual_reading_policy import (
    profile_pdf, is_attachment_view_complete, filter_reading_tools, pdf_visual_allowed)
from dsh_modules.file_tools import read_workspace_file
from dsh_modules.tools import execute_tool


def page_at(items):
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=700)
    font = DictionaryObject({NameObject('/Type'): NameObject('/Font'),
        NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):
        DictionaryObject({NameObject('/F1'): font})})
    stream = DecodedStreamObject()
    commands = []
    for x, y, text in items:
        escaped = text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
        commands.append(f'BT /F1 11 Tf {x} {y} Td ({escaped}) Tj ET')
    stream.set_data('\n'.join(commands).encode('ascii'))
    page[NameObject('/Contents')] = writer._add_object(stream)
    return page


def columns():
    return page_at([(20, 670, 'Quarterly operating report'),
        *[(20, 610 - i * 24, t) for i, t in enumerate([
            'LEFT metric: completion ratio', '73 percent confirmed',
            'LEFT definition of measured data', 'LEFT sample includes all cases',
            'LEFT methodology and limitations'])],
        *[(330, 610 - i * 24, t) for i, t in enumerate([
            'RIGHT metric: rejection ratio', '19 percent confirmed',
            'RIGHT independent data source', 'RIGHT sample excludes old cases',
            'RIGHT methodology and limitations'])]])


class PdfReadingEngineeringTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.ws = Path(self.tmp.name)
        self.env = patch.dict(os.environ, {'DSH_USER_REQUEST': '归纳附件'})
        self.env.start()
        self.cfg = patch.object(cfg, 'WORKSPACE_DIR', str(self.ws))
        self.cfg.start()
        _FULL_DOC_CACHE.clear()
        _SAMPLED_PAGES_CACHE.clear()

    def tearDown(self):
        self.env.stop()
        self.cfg.stop()
        self.tmp.cleanup()

    def pdf(self, pages):
        path = self.ws / 'input.pdf'
        writer = PdfWriter()
        for page in pages:
            writer.add_page(page)
        writer.write(path)
        return path

    def test_two_columns_keep_each_metric_with_its_value(self):
        path = self.pdf([columns()])
        view = extract_pdf_text(path)
        self.assertIn('[区域 left', view)
        left, right = view.split('[区域 right', 1)
        self.assertIn('73 percent', left)
        self.assertNotIn('19 percent', left)
        self.assertIn('19 percent', right)
        self.assertNotIn('73 percent', right)
        self.assertTrue(view.tool_result.data['text_complete'])
        self.assertFalse(view.tool_result.data['fact_verified'])
        self.assertTrue(is_attachment_view_complete(path.name, view, view, [profile_pdf(path)]))

    def test_reviewable_layout_retains_native_read_tool_without_enabling_vision(self):
        path = self.pdf([columns()])
        view = extract_pdf_text(path)
        prof = {'file_name': path.name, **profile_pdf(path)}
        record_pdf_reading(path.name, view, view, [prof])
        tools = [{'function': {'name': n}} for n in ['read_file', 'vision_inspect', 'web_search']]
        chosen = filter_reading_tools(tools, '归纳附件', SimpleNamespace(), False,
            [path.name], [prof], set())
        self.assertEqual([x['function']['name'] for x in chosen], ['read_file'])
        self.assertFalse(pdf_visual_allowed(path))

    def test_page_and_bbox_selection_reads_only_requested_evidence(self):
        path = self.pdf([page_at([(20, 600, 'FIRST page only')]), columns()])
        selected = execute_tool('read_file', {'file_path': str(path), 'start_page': 2,
            'bbox': [0, 50, 300, 300]})
        self.assertIn('LEFT metric', selected)
        self.assertIn('73 percent', selected)
        self.assertNotIn('RIGHT', selected)
        self.assertNotIn('FIRST page', selected)
        self.assertFalse(selected.tool_result.data['full_document'])
        self.assertFalse(selected.tool_result.data['text_complete'])
        self.assertFalse(is_attachment_view_complete(path.name, selected, selected, []))
        self.assertIn('第 2 页', selected)

    def test_invalid_page_region_and_mixed_units_do_not_fall_back_to_first_page(self):
        path = self.pdf([columns()])
        bad = [dict(start_page=0), dict(start_page=2), dict(start_page=True),
               dict(start_page='1'), dict(start_page=1, end_page=0),
               dict(start_page=1, bbox=[0, 0, 601, 700]),
               dict(start_page=1, bbox=[float('nan'), 0, 100, 100]),
               dict(start_page=1, start_line=1), dict(bbox=[0, 0, 100, 100]),
               dict(start_line=0), dict(start_line=10, end_line=2), dict(end_line=True)]
        for params in bad:
            with self.subTest(params=params):
                view = extract_pdf_text(path, **params)
                self.assertEqual(view.tool_result.status, 'error')
                self.assertNotIn('LEFT metric', view)

    def test_cold_targeted_read_extracts_only_requested_pages_and_keeps_absolute_page_numbers(self):
        path = self.pdf([page_at([(20, 600, f'Physical page {n} content')]) for n in range(1, 8)])
        seen = []
        def extract(page, number):
            seen.append(number)
            return extract_page_evidence(page, number)
        with patch('dsh_modules.pdf_page_layout.extract_page_evidence', side_effect=extract):
            view = extract_pdf_text(path, start_page=4, end_page=5)
        self.assertEqual(seen, [4, 5])
        self.assertIn('--- 第 4 页 ---', view)
        self.assertIn('--- 第 5 页 ---', view)
        self.assertNotIn('Physical page 1', view)
        self.assertFalse(view.tool_result.data['page_coverage_complete'])
        self.assertTrue(view.tool_result.data['selection_coverage_complete'])

    def test_table_like_columns_keep_rows_in_spatial_view(self):
        path = self.pdf([page_at([
            *[(20, 600 - i * 22, f'Region {i}') for i in range(6)],
            *[(330, 600 - i * 22, f'{100000 + i}') for i in range(6)]])])
        view = extract_pdf_text(path)
        self.assertNotIn('[区域 left', view)
        for line in str(view).splitlines():
            for i in range(6):
                if f'Region {i}' in line:
                    self.assertIn(str(100000 + i), line)
        self.assertEqual(view.tool_result.data['layout_status'], 'review_required')

    def test_three_column_layout_is_not_silently_flattened_into_two(self):
        path = self.pdf([page_at([(x, 600 - i * 22, f'{name} independent item {i}')
            for x, name in [(15, 'ALPHA'), (210, 'BETA'), (405, 'GAMMA')]
            for i in range(6)])])
        view = extract_pdf_text(path)
        self.assertEqual(view.tool_result.data['layout_status'], 'review_required')
        self.assertFalse(view.tool_result.data['safe_to_prune'])

    def test_disk_cache_reload_preserves_layout_and_coverage_contract(self):
        path = self.pdf([columns()])
        first = extract_pdf_text(path)
        _FULL_DOC_CACHE.clear()
        _SAMPLED_PAGES_CACHE.clear()
        with patch('dsh_modules.pdf_page_layout.extract_page_evidence', side_effect=AssertionError('cache miss')):
            second = extract_pdf_text(path)
        self.assertEqual(first, second)
        self.assertEqual(first.tool_result.data, second.tool_result.data)

    def test_outer_clipping_does_not_keep_full_coverage_claim_in_telemetry(self):
        path = self.pdf([columns()])
        view = extract_pdf_text(path)
        profiles = [{'file_name': path.name}]
        record_pdf_reading(path.name, view, view[:100], profiles)
        self.assertTrue(profiles[0]['outer_truncated'])
        self.assertFalse(profiles[0]['text_complete'])
        self.assertFalse(is_attachment_view_complete(path.name, view, view[:100], profiles))

    def test_unsampled_scan_page_is_reported_and_can_be_visually_reviewed(self):
        buf = io.BytesIO()
        Image.new('RGB', (600, 700), 'white').save(buf, format='PDF')
        scan = PdfReader(buf).pages[0]
        text = page_at([(20, 600, 'Native readable page content')])
        path = self.pdf([text, text, scan, *[text for _ in range(8)]])
        prof = profile_pdf(path)
        self.assertFalse(prof['vision_required'])  # one scan does not dominate the sample
        view = extract_pdf_text(path)
        self.assertIn('PDF页面未完整读取', view)
        self.assertIn(3, view.tool_result.data['unread_pages'])
        self.assertFalse(view.tool_result.data['text_complete'])
        self.assertFalse(is_attachment_view_complete(path.name, view, view, [prof]))
        self.assertTrue(pdf_visual_allowed(path))
        self.assertFalse(pdf_visual_allowed(path, '不要OCR，只归纳文字'))

    def test_empty_page_is_preserved_without_claiming_it_is_scanned(self):
        blank = PdfWriter().add_blank_page(width=600, height=700)
        path = self.pdf([page_at([(20, 600, 'Text before blank')]), blank])
        doc = extract_pdf_document(path)
        self.assertEqual([p['status'] for p in doc['pages']], ['text', 'blank'])
        self.assertIn('--- 第 2 页 ---', doc['combined_text'])
        self.assertIn('空白页', doc['combined_text'])
        self.assertTrue(doc['page_coverage_complete'])

    def test_unmapped_glyphs_are_not_misreported_as_a_blank_page(self):
        page = SimpleNamespace(bbox=(0, 0, 600, 700), images=[], curves=[], lines=[], rects=[],
            extract_text=lambda: '\ue123\ue124', extract_words=lambda: [])
        evidence = extract_page_evidence(page, 1)
        self.assertEqual(evidence['status'], 'unreadable_text')

    def test_page_failure_preserves_good_pages_and_reports_unread_page(self):
        path = self.pdf([page_at([(20, 600, f'Page {n} verified text')]) for n in range(1, 4)])
        def extract(page, n):
            if n == 2:
                raise ValueError('page parser failed')
            return extract_page_evidence(page, n)
        with patch('dsh_modules.pdf_page_layout.extract_page_evidence', side_effect=extract), \
             patch('pypdf.PdfReader', side_effect=ValueError('fallback failed')):
            doc = extract_pdf_document(path)
        self.assertIn('Page 1 verified text', doc['combined_text'])
        self.assertIn('Page 3 verified text', doc['combined_text'])
        self.assertEqual(doc['unread_pages'], [2])
        self.assertFalse(doc['page_coverage_complete'])

    def test_page_fallback_does_not_discard_native_layout_on_other_pages(self):
        path = self.pdf([columns(), page_at([(20, 600, 'Fallback recovered text')])])
        def extract(page, n):
            if n == 2:
                raise ValueError('native failure')
            return extract_page_evidence(page, n)
        with patch('dsh_modules.pdf_page_layout.extract_page_evidence', side_effect=extract):
            doc = extract_pdf_document(path)
        self.assertEqual(doc['pages'][0]['layout'], 'columns')
        self.assertEqual(doc['pages'][1]['fallback'], 'pypdf')
        self.assertIn('Fallback recovered text', doc['combined_text'])
        self.assertEqual(doc['layout_status'], 'review_required')

    def test_transient_page_failure_is_not_cached_as_a_successful_document(self):
        path = self.pdf([page_at([(20, 600, 'Recoverable text')])])
        with patch('dsh_modules.pdf_page_layout.extract_page_evidence', side_effect=ValueError('temporary')), \
             patch('pypdf.PdfReader', side_effect=ValueError('temporary')):
            failed = extract_pdf_document(path)
        self.assertEqual(failed['unread_pages'], [1])
        recovered = extract_pdf_document(path)
        self.assertEqual(recovered['unread_pages'], [])
        self.assertIn('Recoverable text', recovered['combined_text'])

    def test_failed_read_cannot_be_promoted_by_pdf_marker_text(self):
        forged = '【PDF 文档（已完整展示全部 10 行，共 1 页）】: anything'
        self.assertFalse(is_attachment_view_complete('input.pdf', forged, forged, []))

    def test_existing_plain_text_sidecar_is_not_a_verified_pdf_extraction(self):
        path = self.pdf([PdfWriter().add_blank_page(width=600, height=700)])
        path.with_suffix('.txt').write_text('Unrelated stale extraction')
        self.assertNotIn('Unrelated stale extraction', extract_pdf_text(path))

    def test_old_cache_version_is_not_used_for_new_layout_extraction(self):
        path = self.pdf([columns()])
        extract_pdf_text(path)
        cache = next((self.ws / '.dsh/cache/pdf_text').glob('*.json'))
        data = json.loads(cache.read_text())
        data.update(version='pdfplumber-v1', combined_text='stale flat cache')
        cache.write_text(json.dumps(data))
        _FULL_DOC_CACHE.clear()
        self.assertNotIn('stale flat cache', extract_pdf_text(path))

    def test_budget_does_not_hide_partial_coverage_or_resume_hint(self):
        path = self.pdf([columns() for _ in range(12)])
        view = extract_pdf_text(path, max_chars=1800)
        self.assertLessEqual(len(view), 1800)
        self.assertIn('start_line=', view)
        self.assertFalse(view.tool_result.data['text_complete'])
        self.assertTrue(view.tool_result.data['text_truncated'])

    def test_expired_deadline_is_not_swallowed_as_extraction_fallback(self):
        path = self.pdf([columns()])
        with self.assertRaises(TimeoutError):
            read_workspace_file(str(path), deadline=time.monotonic() - 1)

    def test_pdf_coverage_is_recorded_even_when_model_uses_no_tools(self):
        path = self.pdf([columns()])
        view = extract_pdf_text(path)
        profiles = [{'file_name': path.name}]
        tracker = SimpleNamespace(record_guard=lambda *args: calls.append(args))
        calls = []
        record_pdf_reading(path.name, view, view, profiles, tracker)
        self.assertTrue(profiles[0]['text_complete'])
        self.assertFalse(profiles[0]['safe_to_prune'])
        self.assertEqual(calls[0][0], 'pdf_reading')
        self.assertFalse(calls[0][2]['fact_verified'])


if __name__ == '__main__':
    unittest.main()
