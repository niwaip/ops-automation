"""The exact audited tail wrapper preserves failure status and child accounting."""
import json
import time
import unittest
from pathlib import Path

import test_pdf_translation_delivery as fixture
from dsh_modules.shell_tools import execute_shell
from dsh_modules.pdf_translation_bridge import recognized_command


class ShellRecoveryTests(unittest.TestCase):
    setUp = fixture.TranslationDeliveryTests.setUp
    tearDown = fixture.TranslationDeliveryTests.tearDown

    def test_unpack_with_tail_enters_parent_ledger(self):
        prepared = self.root / 'prepared'
        command = (f'python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py '
                   f'unpack {self.source} {prepared} 2>&1 | tail -30')
        receipt = execute_shell(command, str(self.root), time.monotonic() + 100)
        self.assertTrue(receipt.tool_result.is_success, str(receipt))
        self.assertEqual(receipt.tool_result.data['state'], 'unpacked')
        self.assertEqual(len(self.telemetry.calls_ledger), 1)
        self.assertEqual(self.telemetry.tokens['total_tokens'], 140)

    def test_missing_resume_with_tail_is_business_error(self):
        command = (f'python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py '
                   f'auto {self.source} {self.target} --resume {self.root}/missing 2>&1 | tail -n 30')
        receipt = execute_shell(command, str(self.root), time.monotonic() + 100)
        self.assertTrue(receipt.tool_result.is_error)
        self.assertEqual(receipt.tool_result.error_code, 'checkpoint_incomplete')
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_mutating_or_unbounded_pipeline_does_not_gain_budget(self):
        base = f'python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto {self.source} {self.target}'
        for suffix in (' | tail -30; touch bad', ' | cat', ' | tail -f', ' | tail -n 30 | sh'):
            self.assertIsNone(recognized_command(base + suffix, self.root))


class LayoutCheckpointTests(unittest.TestCase):
    setUp = fixture.TranslationDeliveryTests.setUp
    tearDown = fixture.TranslationDeliveryTests.tearDown

    def test_failed_layout_resumes_only_unfinished_page(self):
        from weasyprint import HTML
        from pdf_translation.pipeline import run_job
        from pdf_translation.contracts import TranslationError, read_json
        from test_pdf_translation_engine import FixtureGateway
        HTML(string='<h1>Document Translation</h1><p>First paragraph 10.</p>'
                    '<h1 style="break-before:page">Document Translation</h1>'
                    '<p>Second paragraph 20.</p>').write_pdf(self.source)
        class FailPageTwo(FixtureGateway):
            def layout(self, image, prompt):
                if 'p2_g' in prompt:
                    return {}
                return super().layout(image, prompt)
        with self.assertRaises(TranslationError):
            run_job(self.source, self.target, gateway_factory=FailPageTwo)
        folder = next(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')).parent
        self.assertIn('layout_ir_sha256', read_json(folder / 'manifest.json'))
        requested = []
        class Resume(FixtureGateway):
            def layout(self, image, prompt):
                requested.append(prompt)
                if 'p1_g' in prompt:
                    raise AssertionError('accepted page must be reused')
                return super().layout(image, prompt)
        result = run_job(self.source, self.target, resume=folder, gateway_factory=Resume)
        self.assertEqual(read_json(result)['state'], 'candidate_ready')
        self.assertEqual(len(requested), 1)
        # A changed checkpoint cannot be reused even if it contains valid JSON.
        original = (folder / 'source.ir.json').read_text()
        (folder / 'source.ir.json').write_text(original + ' ')
        with self.assertRaisesRegex(TranslationError, '哈希不一致'):
            run_job(self.source, self.target, resume=folder, gateway_factory=Resume)
