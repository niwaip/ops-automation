"""A sporadic malformed layout reply gets one corrective retry instead of aborting the document."""
import tempfile
import time
import unittest
from pathlib import Path

from pdf_translation.contracts import TranslationError
from pdf_translation.layout_analyzer import analyze_layout


def _ir():
    page = {'id': 'p1', 'number': 1, 'width_pt': 595.0, 'height_pt': 842.0, 'preview': 'unused.png',
            'lines': [{'id': 'p1_l1', 'text': 'Hello world', 'bbox': [72.0, 100.0, 300.0, 112.0]}],
            'visual_bounds': [], 'table_candidates': []}
    return {'pages': [page], 'nodes': [], 'reading_order': [], 'source': {'page_count': 1}}


class ScriptedGateway:
    def __init__(self, *outcomes):
        self.outcomes, self.prompts = list(outcomes), []

    def layout(self, image, prompt):
        self.prompts.append(prompt)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class LayoutProtocolRetryTest(unittest.TestCase):
    def run_layout(self, gateway):
        with tempfile.TemporaryDirectory() as folder:
            return analyze_layout(_ir(), gateway, Path(folder), time.monotonic() + 60)

    def test_malformed_reply_is_retried_with_corrective_prompt(self):
        gateway = ScriptedGateway(TranslationError('model_protocol_failed', '模型未返回完整JSON对象'),
                                  TranslationError('model_protocol_failed', '模型未返回完整JSON对象'))
        with self.assertRaises(TranslationError) as raised:
            self.run_layout(gateway)
        self.assertEqual(raised.exception.code, 'model_protocol_failed')
        self.assertEqual(len(gateway.prompts), 2)
        self.assertIn('Previous reply was rejected', gateway.prompts[1])

    def test_budget_exhaustion_is_not_retried(self):
        gateway = ScriptedGateway(TranslationError('budget_exhausted', 'budget'))
        with self.assertRaises(TranslationError) as raised:
            self.run_layout(gateway)
        self.assertEqual(raised.exception.code, 'budget_exhausted')
        self.assertEqual(len(gateway.prompts), 1)


if __name__ == '__main__':
    unittest.main()
