"""End-to-end tests for column sanity check and mixed-column layout on academic papers."""
import json
from pathlib import Path
import unittest

from pdf_translation.layout_analyzer import materialize_page
from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.render_structure import grouped_nodes, typography, reconcile_columns


class TestPdfColumnLayout(unittest.TestCase):
    def setUp(self):
        self.job_dir = Path('/workspace/.dsh/pdf-jobs/345260683e0342d1827edd5387848576/8a2fe2b046c746319928f19a9b1cae7a')
        if self.job_dir.exists():
            self.ir = json.loads((self.job_dir / 'source.ir.json').read_text())
        else:
            self.ir = None

    def test_p1_false_two_column_corrected_to_single_column(self):
        if not self.ir:
            return
        p1 = next(p for p in self.ir['pages'] if p['id'] == 'p1')
        p1_layout_file = self.job_dir / 'layout-p1-1.json'
        data = json.loads(p1_layout_file.read_text())
        # Model originally returned columns: 2 because of left margin arXiv watermark
        self.assertEqual(data.get('columns'), 2)

        candidates = candidate_lines(p1)
        expanded = expand_candidates(data, candidates, p1)
        nodes = materialize_page(expanded, p1)

        # After materialize_page, data['columns'] must be corrected to 1
        self.assertEqual(expanded['columns'], 1)

    def test_p2_figure_candidate_overlap_and_full_width_reconciliation(self):
        if not self.ir:
            return
        p2 = next(p for p in self.ir['pages'] if p['id'] == 'p2')
        p2_layout_file = self.job_dir / 'layout-p2-1.json'
        data = json.loads(p2_layout_file.read_text())

        candidates = candidate_lines(p2)
        expanded = expand_candidates(data, candidates, p2)
        nodes = materialize_page(expanded, p2)

        # p2 must retain columns: 2 because of the top side-by-side figure
        self.assertEqual(expanded['columns'], 2)

        # Check node columns:
        # Figure 1 should be in column 2
        fig_node = next((n for n in nodes if n['type'] == 'figure'), None)
        self.assertIsNotNone(fig_node)
        self.assertEqual(fig_node['column'], 2)

        # Full-width paragraphs below Figure 1 must be reconciled to column 0
        full_width_paras = [n for n in nodes if n['id'] in ('p2_b2', 'p2_b3', 'p2_b4', 'p2_b5', 'p2_b7')]
        for n in full_width_paras:
            self.assertEqual(n['column'], 0, f"Node {n['id']} expected column 0 (full-width), got {n.get('column')}")

    def test_end_to_end_segments_produce_clean_two_pages(self):
        if not self.ir:
            return
        p1 = next(p for p in self.ir['pages'] if p['id'] == 'p1')
        p2 = next(p for p in self.ir['pages'] if p['id'] == 'p2')

        # Materialize both pages with updated logic
        p1_expanded = expand_candidates(json.loads((self.job_dir / 'layout-p1-1.json').read_text()), candidate_lines(p1), p1)
        p1_nodes = materialize_page(p1_expanded, p1)
        p1['columns'] = p1_expanded['columns']

        p2_expanded = expand_candidates(json.loads((self.job_dir / 'layout-p2-1.json').read_text()), candidate_lines(p2), p2)
        p2_nodes = materialize_page(p2_expanded, p2)
        p2['columns'] = p2_expanded['columns']

        nodes = [n for n in (p1_nodes + p2_nodes) if n['type'] != 'furniture']
        for n in nodes:
            n['display'] = n['text']
            n['html_display'] = n['text']

        pages = {p['id']: p for p in (p1, p2)}
        segments = []
        first_page_id = 'p1'
        saw_multi = False

        for group in grouped_nodes(nodes, pages):
            node = group['nodes'][0]
            page_cols = pages[node['page_id']].get('columns', 1)
            if page_cols <= 1:
                cols = 1
            elif group.get('column') == 0 or (group.get('column') is None and node['type'] in (
                'title', 'author', 'figure', 'table', 'formula', 'caption'
            )):
                cols = 1
            else:
                cols = page_cols
                saw_multi = True
            is_hdr = bool(first_page_id and node['page_id'] == first_page_id and not saw_multi and cols == 1)
            need_new = (
                not segments
                or segments[-1]['columns'] != cols
                or segments[-1].get('is_header') != is_hdr
                or segments[-1]['page_id'] != node['page_id']
            )
            if need_new:
                segments.append({
                    'columns': cols,
                    'page_id': node['page_id'],
                    'is_header': is_hdr,
                    'groups': []
                })
            segments[-1]['groups'].append(group)

        # Check segments structure:
        # Segment 0: p1, columns=1, is_header=True
        self.assertEqual(segments[0]['page_id'], 'p1')
        self.assertEqual(segments[0]['columns'], 1)
        self.assertTrue(segments[0]['is_header'])

        # Segment 1: p2, columns=2 (top section)
        self.assertEqual(segments[1]['page_id'], 'p2')
        self.assertEqual(segments[1]['columns'], 2)

        # Segment 2: p2, columns=1 (bottom full-width section)
        self.assertEqual(segments[2]['page_id'], 'p2')
        self.assertEqual(segments[2]['columns'], 1)


if __name__ == '__main__':
    unittest.main()
