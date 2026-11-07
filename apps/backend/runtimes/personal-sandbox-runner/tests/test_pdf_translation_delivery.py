"""Exercise the real CLI subprocess, proxy protocols, ledger bridge and publication gate."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from dsh_modules.shell_tools import execute_shell
from dsh_modules.pdf_external_delivery import enforce_external_pdf_delivery
from dsh_modules.pdf_preview_tool import reset_pdf_renders
from dsh_modules.pdf_translation_bridge import recognized_command, PdfTranslationBridge, atomic_json
from dsh_modules.telemetry import TelemetryStats, get_active_telemetry, set_active_telemetry
from dsh_modules.deliverable_contract import materialize_pdf_from_markdown
from pdf_translation.contracts import read_json, write_json, digest
from test_pdf_translation_engine import FixtureGateway, make_source


class Proxy(BaseHTTPRequestHandler):
    fail_translation = False

    def log_message(self, *args):
        pass

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        content = payload['messages'][0]['content']
        gateway = FixtureGateway()
        result = gateway.layout(None, content[0]['text']) if isinstance(content, list) else (
            {} if self.fail_translation else gateway.translate(content))
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


class TranslationDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.previous = get_active_telemetry()
        self.temp = tempfile.TemporaryDirectory(dir='/workspace')
        self.root = Path(self.temp.name)
        self.source, self.target = self.root / 'original.pdf', self.root / 'translated.pdf'
        make_source(self.source)
        self.target.write_bytes(b'previous approved output')
        os.utime(self.target, (time.time() - 100, time.time() - 100))
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Proxy)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.env = patch.dict(os.environ, {'WORKSPACE': str(self.root),
            'DEEPSEEK_BASE_URL': f'http://127.0.0.1:{self.server.server_port}/v1',
            'DSH_MODEL': 'fixture-text', 'DSH_VISION_MODEL': 'fixture-vision',
            'DSH_PDF_TRANSLATION_ENGINE': 'layout-html-v1'})
        self.env.start()
        self.telemetry = TelemetryStats()
        self.telemetry.bind_journal(self.root / 'history.json')
        reset_pdf_renders()
        Proxy.fail_translation = False
        self.start = time.time()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.env.stop()
        reset_pdf_renders()
        set_active_telemetry(self.previous)
        self.temp.cleanup()

    def execute(self):
        command = f'python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto "{self.source}" "{self.target}" --lang zh-CN'
        return execute_shell(command, str(self.root), time.monotonic() + 100)

    def gate(self, receipt, verdict='PASS\n无问题'):
        loop = SimpleNamespace(telemetry=self.telemetry, execution_evidence=[receipt.tool_result],
                               final_text='model draft', outbound_files=['untrusted marker'])
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image',
                   return_value='【文档/图片 (page-1.png) 视觉分析与内容识别结果】:\n' + verdict):
            owned = enforce_external_pdf_delivery(loop, str(self.root), '/opt/dsh/skills',
                self.start, '翻译原PDF，生成中文版PDF', time.monotonic() + 60, ['original.pdf'])
        self.assertTrue(owned)
        return loop

    def test_cli_ledger_and_verified_publication(self):
        result = self.execute()
        self.assertTrue(result.tool_result.is_success, str(result))
        self.assertEqual(self.target.read_bytes(), b'previous approved output')
        self.assertEqual(len(self.telemetry.calls_ledger), 2)
        self.assertEqual(self.telemetry.tokens['total_tokens'], 280)
        # A generic fallback PDF is quarantined, never chosen as translated output.
        fallback = self.root / 'fallback.pdf'
        make_source(fallback)
        loop = self.gate(result)
        self.assertEqual(len(loop.outbound_files), 1)
        self.assertFalse(fallback.exists())
        self.assertTrue(self.target.read_bytes().startswith(b'%PDF'))
        manifest = read_json(result.tool_result.data['manifest_path'])
        self.assertEqual(manifest['state'], 'published')

    def test_missing_translation_cannot_publish_or_compile_failure_text(self):
        Proxy.fail_translation = True
        result = self.execute()
        self.assertTrue(result.tool_result.is_error)
        self.assertIsNone(materialize_pdf_from_markdown('生成中文版pdf', str(self.root),
            turn_start_time=self.start, expected_deliverables=['.pdf'], final_text='这是很长的错误解释。' * 30))
        loop = self.gate(result)
        self.assertEqual(loop.outbound_files, [])
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_rollout_switch_blocks_unverified_engine_without_fallback(self):
        with patch.dict(os.environ, {'DSH_PDF_TRANSLATION_ENGINE': 'disabled'}):
            receipt = self.execute()
        self.assertTrue(receipt.tool_result.is_error)
        loop = self.gate(receipt)
        self.assertIn('engine_not_enabled', loop.final_text)
        self.assertEqual(loop.outbound_files, [])
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_visual_failure_preserves_previous_file(self):
        result = self.execute()
        self.assertTrue(result.tool_result.is_success)
        loop = self.gate(result, 'FAIL\n存在正文重叠')
        self.assertEqual(loop.outbound_files, [])
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_bare_confirmation_cannot_override_initial_rejection(self):
        result = self.execute()
        loop = SimpleNamespace(telemetry=self.telemetry, execution_evidence=[result.tool_result],
                               final_text='', outbound_files=[])
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image',
                   side_effect=['【文档/图片 视觉分析与内容识别结果】:\nFAIL\n左右栏重叠',
                                '【文档/图片 视觉分析与内容识别结果】:\nPASS']) as review:
            enforce_external_pdf_delivery(loop, str(self.root), '/opt/dsh/skills',
                self.start, '翻译原PDF，生成中文版PDF', time.monotonic() + 60, ['original.pdf'])
        self.assertEqual(review.call_count, 2)
        self.assertEqual(len(loop.outbound_files), 0)
        self.assertEqual(self.target.read_bytes(), b'previous approved output')
        audit = next(self.root.glob('.pdf-preview/translated/*/page-1-confirmation.json'))
        self.assertIn('FAIL\n左右栏重叠', read_json(audit)['initial'])
        self.assertTrue(read_json(audit)['confirmation'].endswith('PASS'))

    def test_changed_candidate_hash_is_rejected(self):
        result = self.execute()
        manifest = read_json(result.tool_result.data['manifest_path'])
        with Path(manifest['candidate_path']).open('ab') as stream:
            stream.write(b'changed after tool receipt')
        loop = self.gate(result)
        self.assertEqual(loop.outbound_files, [])
        self.assertEqual(self.target.read_bytes(), b'previous approved output')

    def test_rehashed_ir_cannot_replace_native_source_text(self):
        result = self.execute()
        manifest_path = Path(result.tool_result.data['manifest_path'])
        manifest = read_json(manifest_path)
        for name, key in [('source.ir.json', 'source_ir_sha256'),
                          ('translated.ir.json', 'translated_ir_sha256')]:
            path = manifest_path.parent / name
            ir = read_json(path)
            ir['nodes'][1]['text'] = 'Changed source 10.'
            write_json(path, ir)
            manifest[key] = digest(path)
        atomic_json(manifest_path, manifest)
        loop = self.gate(result)
        self.assertEqual(loop.outbound_files, [])
        self.assertIn('原生行不一致', loop.final_text)

    def test_untrusted_command_does_not_gain_budget(self):
        name = '/opt/dsh/skills/pdf/scripts/flow_pdf_translate.py'
        self.assertIsNone(recognized_command(f'echo python3 {name} auto x y', self.root))
        self.assertIsNone(recognized_command(f'python3 {name} auto x y ; echo ignored', self.root))
        self.assertIsNone(recognized_command('python3 /workspace/flow_pdf_translate.py auto x y', self.root))

    def test_unbound_translation_draft_is_not_accepted(self):
        draft = self.root / 'draft.pdf'
        draft.write_bytes(b'%PDF-1.4 distinct standalone test draft\n%%EOF')
        os.utime(draft, (self.start + 1, self.start + 1))
        loop = self.gate(SimpleNamespace(tool_result=None))
        self.assertEqual(loop.outbound_files, [])
        self.assertIn('translation_manifest_missing', loop.final_text)
        self.assertFalse(draft.exists())

    def test_unbound_translation_surfaces_engine_not_enabled_without_manifest(self):
        from dsh_modules.tool_result import ToolResult
        fake_receipt = ToolResult.error('engine_not_enabled',
            'STDOUT:\n{"error_code": "engine_not_enabled", "message": "布局翻译引擎尚未完成真实样本验收"}',
            provenance={'tool': 'bash'})
        copied = self.root / '2507.03009v4_中文版.pdf'
        make_source(copied)
        os.utime(copied, (self.start + 1, self.start + 1))
        loop = SimpleNamespace(telemetry=self.telemetry, execution_evidence=[fake_receipt],
                               final_text='model draft', outbound_files=['untrusted marker'])
        owned = enforce_external_pdf_delivery(loop, str(self.root), '/opt/dsh/skills',
            self.start, '翻译原PDF，生成中文版pdf', time.monotonic() + 60, ['original.pdf'])
        self.assertTrue(owned)
        self.assertEqual(loop.outbound_files, [])
        self.assertIn('engine_not_enabled', loop.final_text)
        self.assertFalse(copied.exists())

    def test_stale_artifact_impersonation_is_detected_and_quarantined(self):
        stale_pdf = self.root / 'old_paper.pdf'
        make_source(stale_pdf)
        os.utime(stale_pdf, (self.start - 50, self.start - 50))
        copied = self.root / 'new_target.pdf'
        copied.write_bytes(stale_pdf.read_bytes())
        os.utime(copied, (self.start + 1, self.start + 1))

        loop = SimpleNamespace(telemetry=self.telemetry, execution_evidence=[],
                               final_text='model draft', outbound_files=['untrusted marker'])
        owned = enforce_external_pdf_delivery(loop, str(self.root), '/opt/dsh/skills',
            self.start, '翻译原PDF，生成中文版pdf', time.monotonic() + 60, ['original.pdf'])
        self.assertTrue(owned)
        self.assertEqual(loop.outbound_files, [])
        self.assertIn('stale_artifact_impersonation', loop.final_text)
        self.assertFalse(copied.exists())

    def test_interrupted_child_is_counted_once_and_numeric_http_error_survives(self):
        bridge = PdfTranslationBridge((str(self.source), str(self.target)), self.root, time.monotonic() + 100)
        cid = 'a' * 32
        event = {'event': 'model_started', 'job_id': bridge.job_id,
                 'data': {'call_id': cid, 'purpose': 'pdf_translation', 'model': 'fixture-text'}}
        (bridge.folder / 'model-events.jsonl').write_text(json.dumps(event) + '\n')
        bridge.finish(True, 'interrupted')
        bridge.finish(True, 'interrupted')
        self.assertEqual(len(self.telemetry.calls_ledger), 1)
        manifest = read_json(bridge.manifest_path)
        manifest.update(error_code=500, message='HTTP Error 500: Internal Server Error')
        atomic_json(bridge.manifest_path, manifest)
        loop = self.gate(SimpleNamespace(tool_result=None))
        self.assertIn('500: HTTP Error', loop.final_text)
