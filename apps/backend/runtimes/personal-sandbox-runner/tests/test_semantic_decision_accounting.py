"""A failed semantic model request has one ledger entry with its actual purpose."""
import io
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from dsh_modules.semantic_decision import structured_decision
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.mcp_answer_review import TOOL


class SemanticDecisionAccountingTests(unittest.TestCase):
    def test_failure_is_not_counted_twice_and_keeps_review_purpose(self):
        stats = TelemetryStats()
        with patch('urllib.request.urlopen', side_effect=TimeoutError()), redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            structured_decision('instructions', {}, TOOL, 'default', None, stats, None, 'mcp_answer_review')
        self.assertEqual(stats.llm_invocations, 1)
        self.assertEqual(stats.auxiliary_invocations, 1)
        self.assertEqual(len(stats.calls_ledger), 1)
        self.assertEqual(stats.calls_ledger[0]['purpose'], 'mcp_answer_review')
        self.assertEqual(stats.calls_ledger[0]['status'], 'failed')
        self.assertFalse(stats.calls_ledger[0]['usageKnown'])
