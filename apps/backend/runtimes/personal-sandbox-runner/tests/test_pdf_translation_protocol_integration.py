"""Real CLI, SSE and checkpoint recovery using a local deterministic model proxy."""
import json
from pathlib import Path
import time
import unittest
from unittest.mock import patch

import test_pdf_translation_delivery as fixture
from test_pdf_translation_engine import FixtureGateway
from dsh_modules.shell_tools import execute_shell
from pdf_translation.contracts import read_json


class ProtocolProxy(fixture.Proxy):
    layouts = translations = rejections = 0
    persistent = False

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        content = payload['messages'][0]['content']
        gateway = FixtureGateway()
        if isinstance(content, list):
            type(self).layouts += 1
            result = gateway.layout(None, content[0]['text'])
            raw = json.dumps(result)
        else:
            type(self).translations += 1
            source = json.loads(content.split('\nInput:\n')[1])
            if type(self).persistent or ('p1_b2' in source and type(self).rejections < 2):
                type(self).rejections += 1
                raw = '{"unclosed":"value"'
            else:
                raw = json.dumps(gateway.translate(content), ensure_ascii=False)
        usage = {'prompt_tokens': 100, 'completion_tokens': 40, 'total_tokens': 140}
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream' if payload['stream'] else 'application/json')
        self.end_headers()
        if payload['stream']:
            frame = {'choices': [{'delta': {'content': raw}, 'finish_reason': 'stop'}], 'usage': usage}
            self.wfile.write(('data: ' + json.dumps(frame) + '\n\ndata: [DONE]\n\n').encode())
        else:
            self.wfile.write(json.dumps({'model': 'fixture-vision', 'usage': usage,
                'choices': [{'message': {'content': raw}, 'finish_reason': 'stop'}]}).encode())


class ProtocolIntegrationTests(unittest.TestCase):
    def setUp(self):
        fixture.TranslationDeliveryTests.setUp(self)
        ProtocolProxy.layouts = ProtocolProxy.translations = ProtocolProxy.rejections = 0
        ProtocolProxy.persistent = False
        self.server.RequestHandlerClass = ProtocolProxy

    tearDown = fixture.TranslationDeliveryTests.tearDown

    def execute(self):
        return execute_shell('python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py '
            f'auto {self.source} {self.target}', str(self.root), time.monotonic() + 100)

    def test_resume_reuses_layout_and_only_missing_ids_then_publication_checks(self):
        result = self.execute().tool_result
        self.assertTrue(result.is_success, result.render_text())
        self.assertIn('recovered_from', result.data)
        self.assertEqual(ProtocolProxy.layouts, 1)
        self.assertEqual(ProtocolProxy.translations, 5)
        manifests = [read_json(p) for p in self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')]
        self.assertEqual(len(manifests), 2)
        first = next(m for m in manifests if m['state'] == 'failed')
        self.assertEqual(first['error_code'], 'model_protocol_failed')
        second = next(m for m in manifests if m['state'] == 'candidate_ready')
        self.assertIn(first['job_id'], second['resumed_from'])
        checkpoint = read_json(Path(second['resumed_from']) / 'translated.ir.json')
        self.assertEqual(set(checkpoint['translations']), {'p1_b1', 'p1_b3'})
        guards = [g for g in self.telemetry.guard_decisions if g['guard'] == 'pdf_model_protocol']
        self.assertEqual(len(guards), 2)
        self.assertTrue(all(g['reason']['call_id'] for g in guards))
        self.assertEqual(len(self.telemetry.calls_ledger), 6)
        self.assertEqual(self.target.read_bytes(), b'previous approved output')
        loop = fixture.TranslationDeliveryTests.gate(self, type('Receipt', (), {'tool_result': result})())
        self.assertTrue(loop.outbound_files)
        self.assertTrue(self.target.read_bytes().startswith(b'%PDF'))

    def test_persistent_protocol_failure_exhausts_once_and_never_publishes(self):
        ProtocolProxy.persistent = True
        result = self.execute().tool_result
        self.assertEqual(result.error_code, 'model_protocol_failed')
        manifests = list(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json'))
        self.assertEqual(len(manifests), 2)
        self.assertEqual(ProtocolProxy.layouts, 1)
        self.assertEqual(ProtocolProxy.translations, 8)
        replies = list(self.root.glob('.dsh/pdf-jobs/*/*/translation-rejected/*.json'))
        self.assertEqual(len(replies), 8)
        self.assertTrue(all(read_json(p)['content'] == '{"unclosed":"value"' for p in replies))
        repeated = self.execute().tool_result
        self.assertEqual(repeated.error_code, 'pdf_recovery_exhausted')
        self.assertEqual(ProtocolProxy.translations, 8)
        self.assertEqual(self.target.read_bytes(), b'previous approved output')
        loop = fixture.TranslationDeliveryTests.gate(self, type('Receipt', (), {'tool_result': result})())
        self.assertFalse(loop.outbound_files)

    def test_corrected_format_contract_uses_fixed_workflow_without_planner(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.pdf_translation_routing import normalize_pdf_translation_route
        from dsh_modules.planning_phase import should_run_planning_phase
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.skill_router import SkillRoutingResult
        prompt = '翻译文档，保存格式不变，生成中文文档'
        routed = SkillRoutingResult(deliverables=['.docx'], requires_execution=True)
        normalize_pdf_translation_route(prompt, ['original.pdf'], routed, self.telemetry)
        policy = RuntimePolicy()
        self.assertEqual(should_run_planning_phase(prompt, routed, policy,
                                                  session_files=['original.pdf']), (False, True))
        with patch('dsh_modules.agent_loop.WORKSPACE_DIR', str(self.root)), patch.dict(
                'os.environ', {'DSH_SESSION_ATTACHMENTS': 'original.pdf'}), patch(
                'dsh_modules.agent_loop.call_model_proxy', side_effect=AssertionError('main model called')), patch(
                'dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】:\nPASS'):
            result = run_agent_loop([{'role': 'user', 'content': prompt}], 'fixture', policy, 5,
                tools=[{'type': 'function', 'function': {'name': 'bash'}}],
                expected_deliverables=routed.deliverables, user_prompt=prompt,
                telemetry=self.telemetry, is_generate_intent=True, deadline=time.monotonic() + 100)
        self.assertTrue(result.outbound_files)
        self.assertEqual(ProtocolProxy.layouts, 1)
        self.assertTrue(any(g['guard'] == 'pdf_translation_workflow' for g in self.telemetry.guard_decisions))


if __name__ == '__main__':
    unittest.main()
