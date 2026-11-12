"""Protocol failures preserve evidence and recover without discarding accepted work."""
import copy
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pdf_translation.contracts import TranslationError, read_json
from pdf_translation.model_gateway import ModelGateway, json_response
from pdf_translation.text_translator import translate_document
from dsh_modules.pdf_translation_recovery import recover_pdf_translation
from dsh_modules.pdf_translation_routing import normalize_pdf_translation_route, preserves_pdf_format
from dsh_modules.pdf_translation_workflow import fixed_translation, run_fixed_translation
from dsh_modules.skill_router import SkillRoutingResult
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult


def document(count=1, long=False):
    text = 'This paragraph describes the experiment. ' * (60 if long else 1)
    nodes = [dict(id=f'n{i}', page_id='p1', type='paragraph', text=text,
                  line_ids=[f'l{i}']) for i in range(count)]
    return dict(schema_version='pdf-document-ir/1', nodes=nodes,
                reading_order=[n['id'] for n in nodes],
                pages=[dict(id='p1', lines=[dict(id=f'l{i}', text=text) for i in range(count)])])


class TranslationProtocolTests(unittest.TestCase):
    def test_json_with_embedded_fence_and_complete_outer_fence(self):
        value = {'n1': '示例 ```json\n{"value": 1}\n```'}
        raw = json.dumps(value)
        self.assertEqual(json_response(raw), value)
        self.assertEqual(json_response('```json\n' + raw + '\n```'), value)
        with self.assertRaises(TranslationError):
            json_response('{"n1":"incomplete"')
        with self.assertRaises(TranslationError):
            json_response('[]')
        with self.assertRaises(TranslationError):
            json_response('"{}"')

    def test_gateway_keeps_private_raw_reply_and_call_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            gateway = ModelGateway(tmp, {'job_id': 'fixture'}, time.monotonic() + 60)
            reply = dict(content='{"n1":"unfinished"', call_id='a' * 32, model='fixture',
                         finish_reason='stop', received_done=True, usage={'total_tokens': 30})
            with patch.dict(os.environ, {'DSH_PDF_OPAQUE_TOKENS': '0'}), patch(
                    'pdf_translation.model_gateway.call_model_proxy', return_value=reply) as model:
                with self.assertRaises(TranslationError) as raised:
                    gateway.translate('input')
            self.assertEqual(model.call_count, 1)  # The caller owns bounded semantic/protocol retries.
            path = Path(raised.exception.details['response_path'])
            saved = read_json(path)
            self.assertEqual(saved['content'], reply['content'])
            self.assertEqual(saved['call_id'], reply['call_id'])
            self.assertIn('pos', saved)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            events = [json.loads(line) for line in (Path(tmp) / 'model-events.jsonl').read_text().splitlines()]
            self.assertEqual(events[-1]['data']['guard'], 'pdf_model_protocol')

    def test_protocol_failure_retries_each_id_with_error_feedback(self):
        calls = []
        class Gateway:
            def translate(self, prompt):
                calls.append(prompt)
                if len(calls) == 1:
                    raise TranslationError('model_protocol_failed', 'invalid JSON')
                source = json.loads(prompt.split('\nInput:\n')[1])
                self_source = next(iter(source))
                return {self_source: '实验段落的内容。'}
        with tempfile.TemporaryDirectory() as tmp:
            ir = translate_document(document(2), Gateway(), Path(tmp), time.monotonic() + 60, 'zh-CN')
            self.assertEqual(set(ir['translations']), {'n0', 'n1'})
            self.assertEqual(len(calls), 3)
            for prompt in calls[1:]:
                self.assertIn('Previous reply was rejected', prompt)
                self.assertIn('model_protocol_failed', prompt)
                self.assertEqual(len(json.loads(prompt.split('\nInput:\n')[1])), 1)
            failed = read_json(Path(tmp) / 'translation-attempts/batch-1-attempt-1.json')
            self.assertIsNone(failed['response'])
            self.assertIn('model_protocol_failed', failed['errors']['n0'])

    def test_persistent_bad_batch_does_not_discard_other_completed_batches(self):
        class Gateway:
            def translate(self, prompt):
                source = json.loads(prompt.split('\nInput:\n')[1])
                if 'n0' in source:
                    raise TranslationError('model_protocol_failed', 'invalid JSON')
                return {key: '实验段落的内容。' for key in source}
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(TranslationError) as raised:
                translate_document(document(3, long=True), Gateway(), Path(tmp),
                                   time.monotonic() + 60, 'zh-CN')
            self.assertEqual(raised.exception.code, 'model_protocol_failed')
            ir = read_json(Path(tmp) / 'translated.ir.json')
            self.assertEqual(set(ir['translations']), {'n1', 'n2'})
            failures = read_json(Path(tmp) / 'translation-failures.json')
            self.assertEqual(set(failures['errors']), {'n0'})

    def test_budget_failure_is_not_retried(self):
        gateway = SimpleNamespace(translate=lambda prompt: (_ for _ in ()).throw(
            TranslationError('budget_exhausted', 'budget')))
        with tempfile.TemporaryDirectory() as tmp, self.assertRaises(TranslationError) as raised:
            translate_document(document(), gateway, Path(tmp), time.monotonic() + 60, 'zh-CN')
        self.assertEqual(raised.exception.code, 'budget_exhausted')

    def test_protocol_recovery_uses_manifest_stage_and_shared_attempt_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / 'manifest.json'
            manifest.write_text(json.dumps({'stage': 'layout'}))
            tracker = TelemetryStats()
            job = SimpleNamespace(job_id='first', manifest_path=manifest, telemetry=tracker,
                context={'input_path': str(root / 'source.pdf'), 'output_path': str(root / 'target.pdf')})
            initial = ToolResult.error('model_protocol_failed', 'bad JSON', data={'resume_dir': tmp})
            calls = []
            def execute(cmd):
                calls.append(cmd)
                manifest.write_text(json.dumps({'stage': 'translate'}))
                return SimpleNamespace(tool_result=ToolResult.error('model_protocol_failed', 'bad JSON',
                    data={'resume_dir': tmp}))
            skills = Path(__file__).resolve().parents[1] / 'skills'
            cmd = f'python3 {skills}/pdf/scripts/flow_pdf_translate.py auto {root}/source.pdf {root}/target.pdf'
            with patch('dsh_modules.pdf_translation_recovery.SKILL_DIR', str(skills)):
                result = recover_pdf_translation(initial, job, cmd, tmp, time.monotonic() + 100, execute)
                self.assertTrue(result.is_error)
                self.assertEqual(len(calls), 2)  # Once for layout, once for translation.
                self.assertTrue(all('--resume' in value for value in calls))
                recover_pdf_translation(initial, job, cmd, tmp, time.monotonic() + 100, execute)
                self.assertEqual(len(calls), 2)
                # A different document still has its own stage budget.
                job.context['output_path'] = str(root / 'other.pdf')
                manifest.write_text(json.dumps({'stage': 'translate'}))
                recover_pdf_translation(initial, job, cmd, tmp, time.monotonic() + 20, execute)
                self.assertEqual(len(calls), 2)  # Insufficient time does not start recovery.


class FormatPreservationTests(unittest.TestCase):
    def test_explicit_preservation_corrects_inferred_docx_contract(self):
        routed = SkillRoutingResult(skill_id='docx', deliverables=['.docx'], is_docx_intent=True,
            admission={'artifact_types': ['.docx'], 'task_mode': 'execute',
                       'skill_invocation': {'mode': 'none'}})
        prompt = '翻译文档，保存格式不变，生成中文文档'
        normalize_pdf_translation_route(prompt, ['paper.pdf'], routed, TelemetryStats())
        self.assertEqual(routed.deliverables, ['.pdf'])
        self.assertIsNone(routed.skill_id)
        self.assertFalse(routed.is_docx_intent)
        self.assertTrue(fixed_translation(prompt, ['paper.pdf'], routed.deliverables))
        self.assertEqual(routed.admission['artifact_types'], ['.pdf'])

    def test_conversions_composite_tasks_and_consultation_keep_their_contract(self):
        cases = [('翻译为中文Word，保持格式', ['paper.pdf'], {}),
                 ('翻译为中文，保持格式并总结', ['paper.pdf'], {}),
                 ('翻译文档，保存格式不变，生成中文文档', ['a.pdf', 'b.pdf'], {}),
                 ('如何翻译中文并保持格式', ['paper.pdf'], {'task_mode': 'consult'}),
                 ('翻译为中文并保持格式', ['paper.pdf'], {'skill_invocation': {'mode': 'execute'}})]
        for prompt, files, admission in cases:
            with self.subTest(prompt=prompt, files=files):
                routed = SkillRoutingResult(deliverables=['.docx'], admission=copy.deepcopy(admission))
                normalize_pdf_translation_route(prompt, files, routed, TelemetryStats())
                self.assertEqual(routed.deliverables, ['.docx'])
        self.assertFalse(preserves_pdf_format('不要保持原格式'))

    def test_fixed_workflow_uses_preserve_and_does_not_add_another_recovery(self):
        tracker = TelemetryStats()
        result = ToolResult.error('model_protocol_failed', 'already exhausted shared recovery', provenance={'tool': 'bash'})
        with tempfile.TemporaryDirectory() as tmp, patch('dsh_modules.shell_tools.execute_shell',
                return_value=SimpleNamespace(tool_result=result)) as execute, patch(
                'dsh_modules.pdf_external_delivery.enforce_external_pdf_delivery'):
            run_fixed_translation('翻译文档，保存格式不变，生成中文文档', ['source.pdf'], ['.pdf'],
                                  tmp, '/opt/dsh/skills', time.time(), None, tracker)
        self.assertEqual(execute.call_count, 1)
        self.assertIn('--layout preserve', execute.call_args.args[0])


if __name__ == '__main__':
    unittest.main()
