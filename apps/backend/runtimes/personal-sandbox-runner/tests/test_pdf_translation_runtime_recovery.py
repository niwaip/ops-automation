"""Real CLI recovery is bounded, ledger-linked, and cannot hide behind shell success."""
import json
import time
import unittest
import os
from unittest.mock import patch

import test_pdf_translation_delivery as fixture
from test_pdf_translation_engine import FixtureGateway
from dsh_modules.shell_tools import execute_shell
from pdf_translation.contracts import read_json


class RecoveringProxy(fixture.Proxy):
    translations = 0
    layouts = 0
    persistent = False

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        content = payload['messages'][0]['content']
        gateway = FixtureGateway()
        if isinstance(content, list):
            type(self).layouts += 1
            result = gateway.layout(None, content[0]['text'])
        else:
            type(self).translations += 1
            result = gateway.translate(content)
            source = json.loads(content.split('\nInput:\n')[1])
            if type(self).translations <= 2 or type(self).persistent:
                if 'p1_b2' in source:
                    result['p1_b2'] = source['p1_b2']
        usage = {'prompt_tokens': 100, 'completion_tokens': 40, 'total_tokens': 140}
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream' if payload['stream'] else 'application/json')
        self.end_headers()
        if payload['stream']:
            frame = {'choices': [{'delta': {'content': json.dumps(result, ensure_ascii=False)},
                                  'finish_reason': 'stop'}], 'usage': usage}
            self.wfile.write(('data: ' + json.dumps(frame) + '\n\ndata: [DONE]\n\n').encode())
        else:
            self.wfile.write(json.dumps({'model': 'fixture-vision', 'usage': usage,
                'choices': [{'message': {'content': json.dumps(result)}, 'finish_reason': 'stop'}]}).encode())


class RuntimeRecoveryTests(unittest.TestCase):
    def setUp(self):
        fixture.TranslationDeliveryTests.setUp(self)
        RecoveringProxy.translations = RecoveringProxy.layouts = 0
        RecoveringProxy.persistent = False
        self.server.RequestHandlerClass = RecoveringProxy

    tearDown = fixture.TranslationDeliveryTests.tearDown

    def execute(self):
        return execute_shell('python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py '
            f'auto {self.source} {self.target}', str(self.root), time.monotonic() + 100)

    def test_one_automatic_resume_reuses_layout_and_only_rejected_unit(self):
        result = self.execute().tool_result
        self.assertTrue(result.is_success, result.render_text())
        self.assertIn('recovered_from', result.data)
        self.assertEqual(RecoveringProxy.layouts, 1)
        self.assertEqual(RecoveringProxy.translations, 3)
        self.assertEqual(len(self.telemetry.calls_ledger), 4)
        self.assertEqual(self.telemetry.tokens['total_tokens'], 560)
        manifests = [read_json(p) for p in self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')]
        self.assertEqual(len(manifests), 2)
        self.assertEqual(len({m['parent_run_id'] for m in manifests}), 1)
        self.assertEqual(sorted(m['state'] for m in manifests), ['candidate_ready', 'failed'])
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_persistent_failure_stops_after_one_resume_and_closes_manifests(self):
        RecoveringProxy.persistent = True
        result = self.execute().tool_result
        self.assertTrue(result.is_error)
        manifests = [read_json(p) for p in self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')]
        self.assertEqual(len(manifests), 2)
        self.assertTrue(all(m['state'] == 'failed' for m in manifests))
        self.assertEqual(RecoveringProxy.layouts, 1)
        self.assertEqual(RecoveringProxy.translations, 4)
        repeated = self.execute().tool_result
        self.assertEqual(repeated.error_code, 'pdf_recovery_exhausted')
        self.assertEqual(len(list(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json'))), 2)
        self.assertEqual(RecoveringProxy.translations, 4)
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_echo_cannot_mask_failed_cli_or_escape_accounting(self):
        result = execute_shell('timeout 180 python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py '
            f'auto {self.source} {self.target}; echo EXIT_CODE:$?', str(self.root),
            time.monotonic() + 100).tool_result
        self.assertTrue(result.is_error)
        self.assertEqual(result.error_code, 'invalid_arguments')
        self.assertEqual(list(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')), [])
        self.assertEqual(RecoveringProxy.layouts, 0)
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_small_budget_is_structured_and_never_leaves_running_manifest(self):
        with patch.dict(os.environ, {'DSH_PDF_TOOL_TIMEOUT': '.001'}):
            result = self.execute().tool_result
        self.assertTrue(result.is_error)
        self.assertEqual(result.error_code, 'budget_exhausted')
        manifests = [read_json(p) for p in self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')]
        self.assertTrue(manifests)
        self.assertTrue(all(m['state'] == 'failed' for m in manifests))
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_layout_recovery_does_not_starve_translation_recovery(self):
        from dsh_modules.pdf_translation_recovery import recover_pdf_translation
        from dsh_modules.tool_result import ToolResult
        calls = []
        class Job:
            job_id = 'job1'
            manifest_path = self.root / 'm1.json'
            context = {'input_path': str(self.source), 'output_path': str(self.target)}
            telemetry = self.telemetry
        class Receipt:
            def __init__(self, tr):
                self.tool_result = tr
        def fake_exec(cmd):
            calls.append(cmd)
            if len(calls) == 1:
                return Receipt(ToolResult.error('translation_incomplete', 'p6_b20 failed',
                    data={'job_id': 'job2', 'resume_dir': str(self.root / 'r2')}))
            return Receipt(ToolResult.success(data={'state': 'candidate_ready', 'job_id': 'job3'}))
        initial = ToolResult.error('layout_unresolved', 'p3 failed',
            data={'job_id': 'job1', 'resume_dir': str(self.root / 'r1')})
        cmd = f'python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto {self.source} {self.target}'
        final = recover_pdf_translation(initial, Job(), cmd, str(self.root), time.monotonic() + 100, fake_exec)
        self.assertTrue(final.is_success)
        self.assertEqual(len(calls), 2)
        self.assertIn(str(self.root / 'r1'), calls[0])
        self.assertIn(str(self.root / 'r2'), calls[1])
