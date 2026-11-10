"""Regression tests for 0922 contract table extraction, inter-column text splitting, and telemetry."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.table_geometry import discover_tables, layout_candidates, validate_table
from pdf_translation.region_validation import validate_regions
from pdf_translation.native_graphic_recovery import recover_native_graphics
from dsh_modules.telemetry import TelemetryStats


class MockColumn:
    def __init__(self, bbox):
        self.bbox = bbox


class MockRow:
    def __init__(self, cells):
        self.cells = cells


class MockTable:
    def __init__(self, bbox, rows, columns):
        self.bbox = bbox
        self.rows = [MockRow(r) for r in rows]
        self.columns = [MockColumn(c) for c in columns]


class ContractTableRegressionTests(unittest.TestCase):
    def test_rect_grid_table_discovered_without_caption(self):
        # A contract form table: 3 rows x 2 cols, no caption
        t_box = (50.0, 200.0, 500.0, 300.0)
        row_cells = [
            [(50.0, 200.0, 250.0, 230.0), (250.0, 200.0, 500.0, 230.0)],
            [(50.0, 230.0, 250.0, 260.0), (250.0, 230.0, 500.0, 260.0)],
            [(50.0, 260.0, 250.0, 300.0), (250.0, 260.0, 500.0, 300.0)],
        ]
        col_boxes = [(50.0, 200.0, 250.0, 300.0), (250.0, 200.0, 500.0, 300.0)]
        mock_t = MockTable(t_box, row_cells, col_boxes)

        pdf_page = SimpleNamespace(
            page_number=5,
            lines=[],
            rects=[{'x0': 50.0, 'top': 200.0, 'x1': 500.0, 'bottom': 300.0}],
            edges=[],
            find_tables=lambda: [mock_t]
        )

        lines = [
            {'id': 'p5_l1', 'text': '字段名', 'bbox': [60.0, 205.0, 100.0, 220.0], 'rotated': False},
            {'id': 'p5_l2', 'text': '内容值', 'bbox': [260.0, 205.0, 320.0, 220.0], 'rotated': False},
            {'id': 'p5_l3', 'text': '乙方名称', 'bbox': [60.0, 235.0, 110.0, 250.0], 'rotated': False},
            {'id': 'p5_l4', 'text': '示例公司', 'bbox': [260.0, 235.0, 310.0, 250.0], 'rotated': False},
            {'id': 'p5_l5', 'text': '签署日期', 'bbox': [60.0, 265.0, 110.0, 280.0], 'rotated': False},
            {'id': 'p5_l6', 'text': '2026-10-12', 'bbox': [260.0, 265.0, 330.0, 280.0], 'rotated': False},
        ]

        tables = discover_tables(pdf_page, lines, [list(t_box)])
        self.assertEqual(len(tables), 1)
        t = tables[0]
        self.assertEqual(t['row_count'], 3)
        self.assertEqual(len(t['cells']), 6)
        self.assertEqual(t['cells'][0]['line_ids'], ['p5_l1'])
        self.assertEqual(t['cells'][1]['line_ids'], ['p5_l2'])
        self.assertEqual(t['cells'][2]['line_ids'], ['p5_l3'])
        self.assertEqual(t['cells'][3]['line_ids'], ['p5_l4'])

        # Validate that validate_table accepts this node
        page_dict = {'lines': lines, 'native_tables': tables}
        node = dict(type='table', column=0, bbox=t['bbox'], native_table_id=t['id'],
                    column_edges=t['column_edges'], line_ids=t['line_ids'], cells=t['cells'])
        validate_table(node, page_dict)

    def test_inter_column_text_split_in_page_lines(self):
        from pdf_translation.native_parser import page_lines

        # Simulate 2 cells on the same row with small inter-word gap (< 14pt)
        mock_table = MockTable(
            (50.0, 100.0, 400.0, 150.0),
            [[(50.0, 100.0, 200.0, 150.0), (200.0, 100.0, 400.0, 150.0)]],
            [(50.0, 100.0, 200.0, 150.0), (200.0, 100.0, 400.0, 150.0)]
        )
        # Gap between word1 (x1=185) and word2 (x0=205) is 20pt or 12pt
        words = [
            {'text': 'col1_text', 'x0': 100.0, 'x1': 190.0, 'top': 110.0, 'bottom': 125.0, 'upright': True},
            {'text': 'col2_text', 'x0': 202.0, 'x1': 280.0, 'top': 110.0, 'bottom': 125.0, 'upright': True},
        ]
        page = SimpleNamespace(
            width=600,
            height=800,
            lines=[],
            rects=[],
            extract_words=lambda **kw: words,
            find_tables=lambda: [mock_table]
        )
        lines = page_lines(page, 'p1')
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]['text'], 'col1_text')
        self.assertEqual(lines[1]['text'], 'col2_text')

    def test_structured_error_on_mismatched_cells(self):
        page = {
            'id': 'p1', 'width_pt': 600, 'height_pt': 800,
            'lines': [
                {'id': 'p1_l1', 'text': 'Cell 1', 'bbox': [50.0, 100.0, 100.0, 120.0]},
                {'id': 'p1_l2', 'text': 'Cell 2', 'bbox': [150.0, 100.0, 200.0, 120.0]},
            ]
        }
        candidates = [
            {'id': 'p1_g1', 'line_ids': ['p1_l1'], 'bbox': [50.0, 100.0, 100.0, 120.0], 'type_hint': 'unknown'},
            {'id': 'p1_g2', 'line_ids': ['p1_l2'], 'bbox': [150.0, 100.0, 200.0, 120.0], 'type_hint': 'unknown'},
        ]
        # Malformed reply: table contains p1_g1 and p1_g2, but cells omit p1_g2
        bad_reply = {
            'columns': 1,
            'blocks': [
                {
                    'type': 'table',
                    'bbox': [50.0, 100.0, 200.0, 120.0],
                    'line_ids': ['p1_g1', 'p1_g2'],
                    'cells': [{'line_ids': ['p1_g1']}]  # missing p1_g2!
                }
            ]
        }
        with self.assertRaises(ValueError) as ctx:
            expand_candidates(bad_reply, candidates, page)
        err = str(ctx.exception)
        self.assertTrue(err.startswith('table cell ownership missing or duplicate'))
        self.assertIn('missing in cells', err)
        self.assertIn('p1_g2', err)

    def test_compact_ruled_table_candidate_detection(self):
        from pdf_translation.native_parser import ruled_table_bounds
        # A table rule spanning 225pt on 612pt page width (~36.8%, previously failed with 0.4 threshold)
        page = SimpleNamespace(
            width=612.0,
            height=792.0,
            lines=[
                {'x0': 193.5, 'top': 100.0, 'x1': 418.5, 'bottom': 100.0},
                {'x0': 193.5, 'top': 115.0, 'x1': 418.5, 'bottom': 115.0},
                {'x0': 193.5, 'top': 165.0, 'x1': 418.5, 'bottom': 165.0},
            ],
            rects=[],
            extract_words=lambda **kw: [
                {'text': 'Data', 'x0': 200.0, 'x1': 250.0, 'top': 120.0, 'bottom': 130.0}
            ]
        )
        bounds = ruled_table_bounds(page)
        self.assertEqual(len(bounds), 1)
        self.assertAlmostEqual(bounds[0][0], 193.5)
        self.assertAlmostEqual(bounds[0][2], 418.5)

    def test_duplicate_candidate_across_cells_deduplicated_cleanly(self):
        page = {
            'id': 'p1', 'width_pt': 600, 'height_pt': 800,
            'lines': [
                {'id': 'p1_l1', 'text': 'Cell 1', 'bbox': [50.0, 100.0, 100.0, 120.0]},
                {'id': 'p1_l2', 'text': 'Cell 2', 'bbox': [150.0, 100.0, 200.0, 120.0]},
            ]
        }
        candidates = [
            {'id': 'p1_g1', 'line_ids': ['p1_l1'], 'bbox': [50.0, 100.0, 100.0, 120.0], 'type_hint': 'unknown'},
            {'id': 'p1_g2', 'line_ids': ['p1_l2'], 'bbox': [150.0, 100.0, 200.0, 120.0], 'type_hint': 'unknown'},
        ]
        # Duplicate reply: p1_g1 is placed in both cell 0 and cell 1
        dup_reply = {
            'columns': 1,
            'blocks': [
                {
                    'type': 'table',
                    'bbox': [50.0, 100.0, 200.0, 120.0],
                    'line_ids': ['p1_g1', 'p1_g2'],
                    'cells': [{'line_ids': ['p1_g1']}, {'line_ids': ['p1_g1', 'p1_g2']}]
                }
            ]
        }
        expanded = expand_candidates(dup_reply, candidates, page)
        self.assertEqual(expanded['blocks'][0]['type'], 'table')
        cells = expanded['blocks'][0]['cells']
        self.assertEqual(cells[0]['line_ids'], ['p1_l1'])
        self.assertEqual(cells[1]['line_ids'], ['p1_l2'])

    def test_telemetry_finish_reason_auxiliary_isolation(self):
        stats = TelemetryStats()
        # Auxiliary model failure should record error but NOT overwrite global finishReason
        stats.record_model_failure(
            call_id='c1', purpose='pdf_layout_analysis', model='vision',
            total_ms=60000, code='image_transport_failed', details={'error_type': 'TimeoutError'}
        )
        # Should not be overwritten with image_transport_failed because it's auxiliary
        self.assertEqual(stats.finish_reason, 'unknown')
        # Ledger has details
        self.assertEqual(stats.calls_ledger[0]['status'], 'failed')
        self.assertEqual(stats.calls_ledger[0]['error_code'], 'image_transport_failed')

        # Setting terminal finish reason sets the actual blocking error
        stats.set_terminal_finish_reason('layout_unresolved')
        self.assertEqual(stats.finish_reason, 'layout_unresolved')

    def test_table_rect_in_visual_bounds_is_not_flagged_as_clipped_graphic(self):
        # Anchor is table header background rect
        table_bbox = [50.0, 199.868, 545.28, 401.428]
        header_rect = [50.0, 199.868, 545.28, 228.14]
        page = {
            'id': 'p5', 'width_pt': 595.0, 'height_pt': 842.0,
            'lines': [{'id': 'p5_l1', 'text': 'Header', 'bbox': [60.0, 205.0, 200.0, 220.0]}],
            'visual_bounds': [header_rect],
            'native_tables': [{'id': 'p5_t1', 'bbox': table_bbox, 'cells': [], 'line_ids': ['p5_l1']}],
        }
        nodes = [
            {'id': 'p5_b1', 'page_id': 'p5', 'type': 'table', 'bbox': table_bbox, 'column': 0, 'line_ids': ['p5_l1'], 'cells': []}
        ]

        # 1. validate_regions should NOT raise
        validate_regions(nodes, page)

        # 2. recover_native_graphics should not inject a redundant figure node
        nodes_copy = list(nodes)
        recovered = recover_native_graphics(nodes_copy, page)
        self.assertEqual(len(recovered), 1)
        self.assertEqual(recovered[0]['type'], 'table')

    def test_table_node_covers_visual_bounds_even_without_native_tables(self):
        table_bbox = [50.0, 100.0, 500.0, 300.0]
        rect = [50.0, 100.0, 500.0, 130.0]
        page = {
            'id': 'p1', 'width_pt': 600.0, 'height_pt': 800.0,
            'lines': [],
            'visual_bounds': [rect],
            'native_tables': [],
        }
        nodes = [
            {'id': 'p1_b1', 'page_id': 'p1', 'type': 'table', 'bbox': table_bbox, 'column': 0, 'line_ids': [], 'cells': []}
        ]
        # Table node covers rect >= 95%, so validate_regions must pass
        validate_regions(nodes, page)

    def test_genuine_omitted_figure_is_flagged(self):
        fig_rect = [60.0, 60.0, 300.0, 200.0]
        page = {
            'id': 'p1', 'width_pt': 600.0, 'height_pt': 800.0,
            'lines': [],
            'visual_bounds': [fig_rect],
            'native_tables': [],
        }
        nodes = []
        with self.assertRaises(ValueError) as ctx:
            validate_regions(nodes, page)
        self.assertIn('native graphic is omitted or clipped', str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
