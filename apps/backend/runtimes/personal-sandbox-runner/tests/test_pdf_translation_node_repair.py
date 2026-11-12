"""Regress reviewed literals being skipped and related footnotes being isolated."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock

from pdf_translation.contracts import TranslationError
from pdf_translation.node_repair import repair_nodes


class ReviewedNodeRepairTests(unittest.TestCase):
    def test_model_can_move_numeric_markers_to_related_notes(self):
        ir = {
            'nodes': [
                dict(id='note', type='footnote', text='Based on the default service.'),
                dict(id='marker', type='paragraph', text='2'),
                dict(id='untouched', type='paragraph', text='Other paragraph.'),
            ],
            'translations': {'note': '基于默认服务。', 'marker': '2', 'untouched': '原有正文'},
        }
        gateway = MagicMock()
        gateway.translate.return_value = {'note': '² 基于默认服务。', 'marker': ''}
        feedback = {nid: '脚注标号游离，应归入对应说明。' for nid in ('note', 'marker')}
        with tempfile.TemporaryDirectory() as tmp:
            repaired = repair_nodes(ir, ['note', 'marker'], gateway, Path(tmp), None,
                                    feedback_map=feedback)
        self.assertEqual(gateway.translate.call_count, 1)
        prompt = gateway.translate.call_args.args[0]
        self.assertEqual(json.loads(prompt.split('Input:\n')[1]),
                         {'note': 'Based on the default service.', 'marker': '2'})
        self.assertIn('脚注标号游离', prompt)
        self.assertIn('Current translations:', prompt)
        self.assertEqual(repaired['translations'],
                         {'note': '² 基于默认服务。', 'marker': '', 'untouched': '原有正文'})

    def test_reviewed_literals_and_exempt_roles_are_sent_to_model(self):
        values = [('number', 'paragraph', '1'), ('symbol', 'paragraph', '†'),
                  ('command', 'paragraph', 'docker pull image'),
                  ('reference', 'reference', 'Author. 2025.'),
                  ('furniture', 'furniture', '2'), ('acronym', 'paragraph', 'OCR')]
        ir = {'nodes': [dict(id=nid, type=kind, text=text) for nid, kind, text in values],
              'translations': {}}
        expected = {nid: text for nid, _, text in values}
        gateway = MagicMock()
        gateway.translate.return_value = expected
        with tempfile.TemporaryDirectory() as tmp:
            repair_nodes(ir, list(expected), gateway, Path(tmp), None)
        self.assertEqual(json.loads(gateway.translate.call_args.args[0].split('Input:\n')[1]), expected)

    def test_unselected_missing_or_invalid_translations_are_not_processed(self):
        ir = {'nodes': [dict(id='target', type='paragraph', text='Fix this.'),
                        dict(id='missing', type='paragraph', text='Not selected.'),
                        dict(id='invalid', type='paragraph', text='Also not selected.')],
              'translations': {'invalid': 'Also not selected.'}}
        gateway = MagicMock()
        gateway.translate.return_value = {'target': '已修复。'}
        with tempfile.TemporaryDirectory() as tmp:
            repair_nodes(ir, ['target'], gateway, Path(tmp), None)
            self.assertEqual(ir['translations'],
                             {'target': '已修复。', 'invalid': 'Also not selected.'})
            gateway.reset_mock()
            repair_nodes(ir, [], gateway, Path(tmp), None)
        gateway.translate.assert_not_called()

    def test_bad_response_cannot_change_other_nodes_or_partially_apply(self):
        ir = {'nodes': [dict(id='target', type='paragraph', text='Fix this.')],
              'translations': {'target': '原译文'}}
        before = copy.deepcopy(ir)
        gateway = MagicMock()
        gateway.translate.side_effect = [
            {'target': '候选', 'foreign': '不应写入'}, {'target': None}]
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(TranslationError):
                repair_nodes(ir, ['target'], gateway, Path(tmp), None)
        self.assertEqual(ir, before)


if __name__ == '__main__':
    unittest.main()
