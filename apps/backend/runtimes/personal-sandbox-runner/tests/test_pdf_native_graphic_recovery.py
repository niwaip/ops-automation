"""Regress the two real page-three model responses and conservative recovery."""
import copy
import json
from pathlib import Path
import unittest

from pdf_translation.layout_analyzer import materialize_page
from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.region_validation import validate_regions
from pdf_translation.native_graphic_recovery import recover_native_graphics, coverage

FIXTURES = Path(__file__).parent / 'fixtures/pdf_translation'


class NativeGraphicRecoveryTests(unittest.TestCase):
    def test_real_page_three_both_attempts_keep_cli_image(self):
        page = json.loads((FIXTURES / 'p3-native-page.json').read_text())
        for attempt in (1, 2):
            with self.subTest(attempt=attempt):
                data = json.loads((FIXTURES / f'p3-layout-{attempt}.json').read_text())
                nodes = materialize_page(expand_candidates(data, candidate_lines(page), page), page)
                validate_regions(nodes, page)
                cli = page['visual_bounds'][-1]
                graphic = next(n for n in nodes if n.get('geometry_origin') == 'native_graphic'
                               and coverage(n['bbox'], cli) >= .95)
                caption = next(n for n in nodes if 'Figure 3:' in n['text'])
                self.assertLess(nodes.index(graphic), nodes.index(caption))
                self.assertLess(graphic['bbox'][3], caption['bbox'][1])
                assigned = [lid for n in nodes for lid in n['line_ids']]
                self.assertEqual(len(assigned), len(set(assigned)))
                self.assertEqual(set(assigned), {l['id'] for l in page['lines']})
                self.assertEqual(len(nodes), len({n['id'] for n in nodes}))

    def test_body_text_conflict_stays_rejected(self):
        page = dict(id='p1', width_pt=600, height_pt=800, visual_bounds=[[100, 100, 300, 200]],
                    lines=[dict(id='l1', bbox=[120, 120, 280, 140], text='body')])
        nodes = [dict(id='p1_b1', page_id='p1', type='paragraph', bbox=[120, 120, 280, 140],
                      line_ids=['l1'], text='body', column=1)]
        before = copy.deepcopy(nodes)
        recover_native_graphics(nodes, page)
        self.assertEqual(nodes, before)
        with self.assertRaisesRegex(ValueError, 'omitted or clipped'):
            validate_regions(nodes, page)

    def test_recovery_is_idempotent_and_keeps_independent_anchor(self):
        page = dict(id='p1', width_pt=600, lines=[], visual_bounds=[[100, 100, 300, 200]])
        nodes = []
        recover_native_graphics(nodes, page)
        before = copy.deepcopy(nodes)
        recover_native_graphics(nodes, page)
        self.assertEqual(nodes, before)
