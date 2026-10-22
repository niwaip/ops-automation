"""Keep aggregate results separate from optional detail previews."""
from types import SimpleNamespace
import unittest

from audit_native import verify


class NativeGraderTests(unittest.TestCase):
    def check_receipt(self, value, query_ir=False):
        profile = {'sha256': 'hash', 'sheet': 'Rows', 'data_range': 'A2:A2',
                   'header_row': 1, 'headers': {'wbs': {'column': 'A'}}}
        data = {'evidence_id': 'receipt', 'coverage': [{'selected_rows': [2],
                'coverage_complete': True, 'data_range': 'A2:A2'}],
                'facts': [{'id': 'records', 'value': value, 'unit': 'number',
                           'source_cells': ['Rows!A2']}],
                'rows': [{'WBS编号': 'sample'}]}
        if query_ir:
            data['query_ir_version'] = 1
        result = SimpleNamespace(is_success=True, provenance={'workbook_id': 'hash'}, data=data)
        return verify(result, {'selected_row_ids': [2], 'rows': [{'records': 1}]}, profile)

    def test_legacy_preview_does_not_replace_aggregate(self):
        self.assertEqual(self.check_receipt(1), [])

    def test_wrong_aggregate_cannot_hide_behind_preview(self):
        self.assertIn('result_bag_mismatch', self.check_receipt(2))

    def test_query_ir_result_rows_are_still_checked(self):
        self.assertIn('result_bag_mismatch', self.check_receipt(1, query_ir=True))
