"""Tests for repair loop triage localization, fallback visual recovery, and translation QA."""
import copy
import unittest

from dsh_modules.pdf_issue_triage import triage_review_issues
from pdf_translation.layout_analyzer import build_fallback_nodes
from pdf_translation.translation_validation import validate_translation


class TestPdfRepairHardening(unittest.TestCase):
    def test_triage_filters_micro_line_break_suggestions(self):
        issues = [{
            'page': 12,
            'kind': 'layout',
            'anchor': '左栏末尾',
            'quote': 'プロンプ',
            'evidence': '左栏倒数第二行末尾：`プロンプ`（断开在`テン`之前），建议若版面允许可将“プロンプト”整体移至下一行首，或调整字间距。'
        }]
        ir = {'nodes': [], 'pages': [{'id': 'p12'}]}
        page_map = {'pages': [{'page': 12, 'nodes': []}]}
        triage = triage_review_issues(issues, ir, page_map)
        self.assertEqual(triage['pages_to_relayout'], [])

    def test_triage_does_not_drift_to_distant_page(self):
        # Spurious p5_b6 in candidate list for page 12 must not cause p5 relayout
        issues = [{
            'page': 12,
            'kind': 'layout',
            'anchor': '正文结构',
            'quote': '正文部分',
            'evidence': '正文对齐严重混乱，表格结构串行'
        }]
        ir = {
            'nodes': [
                {'id': 'p5_b6', 'page_id': 'p5', 'type': 'heading', 'text': '中央中心'},
                {'id': 'p12_b1', 'page_id': 'p12', 'type': 'paragraph', 'text': '内容段落1'},
                {'id': 'p12_b2', 'page_id': 'p12', 'type': 'paragraph', 'text': '内容段落2'},
            ],
            'pages': [{'id': 'p5'}, {'id': 'p12'}]
        }
        page_map = {'pages': [{'page': 12, 'nodes': ['p5_b6', 'p12_b1', 'p12_b2']}]}
        triage = triage_review_issues(issues, ir, page_map)
        self.assertNotIn('p5', triage['pages_to_relayout'])
        self.assertIn('p12', triage['pages_to_relayout'])

    def test_fallback_nodes_retains_visual_bounds_as_figures(self):
        page = {
            'id': 'p2',
            'width_pt': 600,
            'height_pt': 800,
            'lines': [
                {'id': 'l1', 'bbox': [50, 50, 200, 70], 'text': '目录项 1'},
                {'id': 'l2', 'bbox': [50, 80, 200, 100], 'text': '目录项 2'},
            ],
            'visual_bounds': [
                [50, 500, 500, 750]  # Illustration at bottom of catalog page
            ]
        }
        ir = {'nodes': [], 'pages': [page]}
        nodes = build_fallback_nodes(page, ir)
        types = [n['type'] for n in nodes]
        self.assertIn('figure', types)
        fig = next(n for n in nodes if n['type'] == 'figure')
        self.assertEqual(fig['bbox'], [50, 500, 500, 750])

    def test_translation_validation_fails_on_stale_ids_and_passes_after_cleanup(self):
        import json
        from pathlib import Path
        job_dir = Path('/workspace/.dsh/pdf-jobs/0307c777c2ec452dbda97bf1d82b80f6/49e9f1c1b45149c1832af460e204864a')
        if not job_dir.exists():
            return
        ir = json.loads((job_dir / 'translated.ir.json').read_text())
        # Inject stale old ID
        ir['translations']['stale_old_id_999'] = '旧翻译残留'
        bad_qa = validate_translation(ir, 'ja')
        self.assertFalse(bad_qa['valid'])
        self.assertIn('unexpected_ids', bad_qa.get('errors', {}))

        # After atomic cleanup, recheck passes
        ir['translations'].pop('stale_old_id_999')
        # Also ensure only valid node ids are in translations
        node_ids = {n['id'] for n in ir['nodes']}
        for cell_n in ir['nodes']:
            for c in cell_n.get('cells', []):
                node_ids.add(c['id'])
        ir['translations'] = {k: v for k, v in ir['translations'].items() if k in node_ids}
        good_qa = validate_translation(ir, 'ja')
        self.assertTrue(good_qa['valid'])

    def test_job_2210_fixture_prunes_orphaned_cell_ids_and_identifies_untranslated(self):
        import json
        from pathlib import Path
        from pdf_translation.contracts import text_units

        job_dir = Path('/workspace/.dsh/pdf-jobs/345260683e0342d1827edd5387848576/8a2fe2b046c746319928f19a9b1cae7a')
        if not job_dir.exists():
            return
        ir = json.loads((job_dir / 'translated.ir.json').read_text())

        # Verify old state has unexpected_ids
        qa_before = validate_translation(ir, 'zh-CN')
        self.assertFalse(qa_before['valid'])
        self.assertIn('unexpected_ids', qa_before.get('errors', {}))

        # Test valid text units collection
        valid_units = list(text_units(ir))
        valid_unit_ids = {u['id'] for u in valid_units}

        # Check that p25_b5..p25_b9 (lists) and p25_b13_c0..c3 (cells) are valid units
        for lid in ['p25_b5', 'p25_b6', 'p25_b7', 'p25_b8', 'p25_b9']:
            self.assertIn(lid, valid_unit_ids)
        for cid in ['p25_b13_c0', 'p25_b13_c1', 'p25_b13_c2', 'p25_b13_c3']:
            self.assertIn(cid, valid_unit_ids)

        # Check compensation logic: find missing units
        missing_ids = [u['id'] for u in valid_units if not ir['translations'].get(u['id'])]
        self.assertIn('p25_b5', missing_ids)
        self.assertIn('p25_b13_c0', missing_ids)

        # Prune orphaned translations
        for tid in list(ir['translations'].keys()):
            if tid not in valid_unit_ids:
                ir['translations'].pop(tid, None)

        qa_after = validate_translation(ir, 'zh-CN')
        # Crucial check: unexpected_ids must be completely gone
        self.assertNotIn('unexpected_ids', qa_after.get('errors', {}))
        # The remaining errors must only be the un-repaired missing units
        self.assertEqual(set(qa_after.get('errors', {}).keys()), set(missing_ids))


if __name__ == '__main__':
    unittest.main()
