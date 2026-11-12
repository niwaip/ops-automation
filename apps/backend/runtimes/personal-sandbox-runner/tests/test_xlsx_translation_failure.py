"""Failures explain the actual phase, retained work and a supported next action."""
import json
from pathlib import Path
import sys
import unittest
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.xlsx_translation_failure import failure_feedback


class TranslationFailureFeedbackTests(unittest.TestCase):
    def manifest(self, stage='translate'):
        return dict(session_id='session-a', active_stage=stage,
                    progress=dict(total=12, completed=7, remaining=5))

    def test_nested_upstream_http_failure_has_retained_counts_and_resume(self):
        root = urllib.error.HTTPError('http://model', 500, 'Internal Server Error', {}, None)
        middle = ValueError('transport unavailable')
        middle.__cause__ = root
        error = ValueError('batch failed')
        error.__cause__ = middle
        result = failure_feedback(error, self.manifest())
        self.assertEqual(result['code'], 'model_unavailable')
        for text in ('HTTP 500', '7/12', '剩余 5', '本会话回复“继续”', '无需重新上传'):
            self.assertIn(text, result['message'])
        self.assertNotIn('校验未通过', result['message'])

    def test_integrity_failure_does_not_claim_retry_will_fix_the_file(self):
        result = failure_feedback(ValueError('styles changed'), self.manifest('validate'))
        self.assertEqual(result['code'], 'integrity_check_failed')
        self.assertFalse(result['retryable'])
        self.assertIn('查看失败原因', result['next_action'])

    def test_auth_failure_requires_fixing_credentials(self):
        error = urllib.error.HTTPError('http://model', 401, 'Unauthorized', {}, None)
        result = failure_feedback(error, self.manifest())
        self.assertEqual(result['code'], 'model_auth_failed')
        self.assertIn('凭据或权限', result['next_action'])

    def test_timeout_and_missing_session_do_not_promise_automatic_continuation(self):
        result = failure_feedback(TimeoutError('deadline'), dict(active_stage='translate'))
        self.assertEqual(result['code'], 'model_timeout')
        self.assertNotIn('复用', result['next_action'])
        self.assertNotIn('自动继续', result['message'])

    def test_translation_incomplete_does_not_mislead_as_model_outage(self):
        scoped = failure_feedback(
            RuntimeError('Translation acceptance failed for 124 items; checkpoint retained'),
            dict(active_stage='translate', session_id='chat-session-1'),
        )
        self.assertEqual(scoped['code'], 'translation_incomplete')
        self.assertTrue(scoped['retryable'])
        self.assertIn('继续', scoped['next_action'])
        self.assertNotIn('模型服务故障', scoped['next_action'])
        unscoped = failure_feedback(
            RuntimeError('Translation acceptance failed for 124 items; checkpoint retained'),
            dict(active_stage='translate'),
        )
        self.assertEqual(unscoped['code'], 'translation_incomplete')
        self.assertNotIn('模型服务可用', unscoped['next_action'])
        self.assertEqual(unscoped['detail_code'], 'acceptance_incomplete')

    def test_nested_format_failure_sets_format_detail_without_internal_jargon(self):
        key_cause = ValueError('Translation keys do not cover the batch')
        wrapped_key = RuntimeError('Translation acceptance failed for 2 items; checkpoint retained')
        wrapped_key.__cause__ = key_cause
        key_result = failure_feedback(wrapped_key, self.manifest())
        self.assertEqual(key_result['code'], 'translation_incomplete')
        self.assertEqual(key_result['detail_code'], 'format_invalid')
        self.assertTrue(key_result['retryable'])
        self.assertIn('输出格式异常', key_result['message'])
        self.assertIn('7/12', key_result['message'])
        self.assertNotIn('JSONDecodeError', key_result['message'])
        self.assertNotIn('Translation keys', key_result['message'])

        json_cause = json.JSONDecodeError('Expecting value', 'bad', 0)
        wrapped_json = RuntimeError('Translation failed; checkpoint retained')
        wrapped_json.__cause__ = json_cause
        json_result = failure_feedback(wrapped_json, self.manifest())
        self.assertEqual(json_result['code'], 'translation_incomplete')
        self.assertEqual(json_result['detail_code'], 'format_invalid')
        self.assertTrue(json_result['retryable'])
        self.assertNotIn('JSONDecodeError', json_result['message'])
        self.assertNotIn('Translation keys', json_result['message'])
