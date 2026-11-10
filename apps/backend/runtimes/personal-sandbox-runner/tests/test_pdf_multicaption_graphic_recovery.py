"""Regress multi-caption page figure splitting and soft-fail warning delivery."""
import json
from pathlib import Path
import unittest

from pdf_translation.layout_analyzer import materialize_page
from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.region_validation import validate_regions
from pdf_translation.native_graphic_recovery import coverage

FIXTURES = Path(__file__).parent / 'fixtures/pdf_translation'


class MultiCaptionGraphicRecoveryTests(unittest.TestCase):
    def test_p36_both_attempts_split_and_preserve_both_figures(self):
        page = json.loads((FIXTURES / 'p36-native-page.json').read_text())
        fig19_anchor = [108.0, 142.79943600000001, 504.01187999999996, 261.60299999999995]
        fig20_anchor = [108.0, 304.94043600000003, 504.01187999999996, 423.744]

        for attempt in (1, 2):
            with self.subTest(attempt=attempt):
                data = json.loads((FIXTURES / f'p36-layout-{attempt}.json').read_text())
                expanded = expand_candidates(data, candidate_lines(page), page)
                nodes = materialize_page(expanded, page)
                validate_regions(nodes, page)

                fig19 = next(n for n in nodes if n['type'] == 'figure' and coverage(n['bbox'], fig19_anchor) >= .95)
                fig20 = next(n for n in nodes if n['type'] == 'figure' and coverage(n['bbox'], fig20_anchor) >= .95)
                cap19 = next(n for n in nodes if 'Figure 19:' in n.get('text', ''))
                cap20 = next(n for n in nodes if 'Figure 20:' in n.get('text', '') or 'Figure20:' in n.get('text', ''))

                self.assertLess(nodes.index(fig19), nodes.index(cap19))
                self.assertLess(nodes.index(cap19), nodes.index(fig20))
                self.assertLess(nodes.index(fig20), nodes.index(cap20))

                assigned = [lid for n in nodes for lid in n['line_ids']]
                self.assertEqual(len(assigned), len(set(assigned)))
                self.assertEqual(set(assigned), {l['id'] for l in page['lines']})

    def test_region_validation_soft_fail_records_warning_without_raising(self):
        page = dict(id='p1', width_pt=600, height_pt=800, visual_bounds=[[100, 100, 300, 200]],
                    lines=[dict(id='l1', bbox=[120, 120, 280, 140], text='body')])
        nodes = [dict(id='p1_b1', page_id='p1', type='paragraph', bbox=[120, 120, 280, 140],
                      line_ids=['l1'], text='body', column=1)]
        # Soft-fail logs warning into page['warnings']
        validate_regions(nodes, page, allow_soft_fail=True)
        self.assertTrue(len(page.get('warnings', [])) > 0)
        self.assertIn('native graphic is omitted or clipped', page['warnings'][0])

        # Strict validation raises ValueError
        with self.assertRaisesRegex(ValueError, 'omitted or clipped'):
            validate_regions(nodes, page, allow_soft_fail=False)

    def test_p28_table_cell_ownership_auto_healed(self):
        from pdf_translation.table_geometry import layout_candidates
        from pdf_translation.contracts import validate_ir
        page = json.loads((FIXTURES / 'p28-native-page.json').read_text())
        data = json.loads((FIXTURES / 'p28-layout-2.json').read_text())
        candidates = layout_candidates(page, candidate_lines(page))

        # Must not raise "table cell ownership missing or duplicate"
        expanded = expand_candidates(data, candidates, page)
        nodes = materialize_page(expanded, page)

        trial = dict(schema_version='pdf-document-ir/1', nodes=nodes,
                     reading_order=[n['id'] for n in nodes], pages=[page])
        validate_ir(trial)

        # Caption preserved
        caption_node = next(n for n in nodes if 'Table 8:' in n.get('text', ''))
        self.assertEqual(caption_node['type'], 'caption')

        # Native table preserved with its cells
        table_node = next(n for n in nodes if n.get('native_table_id') == '28_t1')
        self.assertEqual(table_node['type'], 'table')
        self.assertEqual(len(table_node['cells']), len(page['native_tables'][0]['cells']))

        # All lines preserved
        assigned = [lid for n in nodes for lid in n['line_ids']]
        self.assertEqual(len(assigned), len(set(assigned)))
        self.assertEqual(set(assigned), {l['id'] for l in page['lines']})

    def test_layout_analyzer_fallback_nodes_on_exhaustion(self):
        from pdf_translation.layout_analyzer import build_fallback_nodes
        from pdf_translation.contracts import validate_ir
        page = json.loads((FIXTURES / 'p28-native-page.json').read_text())
        trial_ir = dict(schema_version='pdf-document-ir/1', pages=[page])

        fb_nodes = build_fallback_nodes(page, trial_ir)
        trial = dict(schema_version='pdf-document-ir/1', nodes=fb_nodes,
                     reading_order=[n['id'] for n in fb_nodes], pages=[page])
        validate_ir(trial)

        # Verify all lines preserved
        assigned = [lid for n in fb_nodes for lid in n['line_ids']]
        self.assertEqual(len(assigned), len(set(assigned)))
        self.assertEqual(set(assigned), {l['id'] for l in page['lines']})

        # Verify native table preserved
        self.assertTrue(any(n.get('native_table_id') == '28_t1' for n in fb_nodes))


if __name__ == '__main__':
    unittest.main()
