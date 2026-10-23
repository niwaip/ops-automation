"""Intent is extracted independently of skill defaults and remains source grounded."""

import json
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.task_intent import extract_task_intent
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.semantic_decision import ground_user_quote


class TaskIntentTests(unittest.TestCase):
    def test_extraction_has_no_candidate_skill_or_default_delivery_context(self):
        request = '读取附件，列出各组结果'
        def model(messages, **kwargs):
            payload = json.loads(messages[-1]['content'])
            self.assertTrue(set(payload) <= {'request', 'user_history', 'input_count', 'skill_names', 'feedback', 'proposed_contract'})
            self.assertFalse(kwargs['stream_deltas'])
            return {'finish_reason': 'stop', 'content': json.dumps({'task_mode': 'execute',
                'output_mode': 'conversation', 'artifact_types': [], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
                'requirements': [{'id': 'r', 'quote': request}]})}
        with patch('dsh_modules.semantic_decision.call_model_proxy', side_effect=model):
            result = extract_task_intent(request, [], 'selected-model', None, TelemetryStats(), time.monotonic()+30, input_count=1)
        self.assertEqual(result['output_mode'], 'conversation')

    def test_invocation_can_bind_catalog_identity_without_literal_id_in_request(self):
        request = '用月度盘点列出结果'
        response = {'finish_reason': 'stop', 'content': json.dumps({'task_mode': 'execute',
            'output_mode': 'conversation', 'artifact_types': [],
            'skill_invocation': {'mode': 'execute', 'name': 'inventory-87', 'replace_defaults': False},
            'requirements': [{'id': 'r', 'quote': request}]})}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=response):
            result = extract_task_intent(request, [], 'model', None, TelemetryStats(), time.monotonic()+30,
                skill_names=[{'id': 'inventory-87', 'name': '月度盘点', 'aliases': []}])
        self.assertEqual(result['skill_invocation']['name'], 'inventory-87')
        self.assertEqual(result['skill_invocation']['mode'], 'execute')

    def test_catalog_entry_is_not_itself_a_user_invocation(self):
        response = {'finish_reason': 'stop', 'content': json.dumps({'task_mode': 'execute',
            'output_mode': 'conversation', 'artifact_types': [],
            'skill_invocation': {'mode': 'execute', 'name': 'inventory-87', 'replace_defaults': False},
            'requirements': [{'id': 'r', 'quote': '列出全部记录'}]})}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=response):
            with self.assertRaisesRegex(ValueError, '无法可靠确认'):
                extract_task_intent('列出全部记录', [], 'model', None, TelemetryStats(), time.monotonic()+30,
                    skill_names=[{'id': 'inventory-87', 'name': '月度盘点', 'aliases': []}])

    def test_independent_review_corrects_unrequested_physical_delivery(self):
        request = '只要表格，无需解读'
        initial = {'task_mode': 'execute', 'output_mode': 'artifact', 'artifact_types': ['xlsx'],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'r', 'quote': request}]}
        corrected = {**initial, 'output_mode': 'conversation', 'artifact_types': []}
        replies = [{'finish_reason': 'stop', 'content': json.dumps(v)} for v in (initial, corrected)]
        telemetry = TelemetryStats()
        with patch('dsh_modules.semantic_decision.call_model_proxy', side_effect=replies) as call:
            result = extract_task_intent(request, [], 'model', None, telemetry, time.monotonic()+30)
        self.assertEqual(call.call_count, 2)
        self.assertEqual(result['output_mode'], 'conversation')
        self.assertEqual(result['artifact_types'], [])
        self.assertTrue(any(g['guard'] == 'task_intent_review' and g['action'] == 'revise' for g in telemetry.guard_decisions))

    def test_quote_normalization_restores_source_span_without_semantic_rewriting(self):
        self.assertEqual(ground_user_quote('按部门编号统计', ['按 部门编号 统计']), '按 部门编号 统计')
        self.assertIsNone(ground_user_quote('仅统计已批准', ['统计全部记录']))
        self.assertIsNone(ground_user_quote('abc', ['ABC']))

    def test_invalid_delivery_contract_gets_one_recheck_then_stops(self):
        response = {'finish_reason': 'stop', 'content': json.dumps({'task_mode': 'execute',
            'output_mode': 'conversation', 'artifact_types': ['xlsx'], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'r', 'quote': '列出结果'}]})}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=response) as call:
            with self.assertRaises(ValueError):
                extract_task_intent('列出结果', [], 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(call.call_count, 2)

    def test_explicit_artifact_extensions_are_normalized_without_format_specific_rules(self):
        response = {'finish_reason': 'stop', 'content': json.dumps({'task_mode': 'execute',
            'output_mode': 'artifact', 'artifact_types': ['novel7'], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'r', 'quote': '导出novel7文件'}]})}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=response):
            result = extract_task_intent('导出novel7文件', [], 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['artifact_types'], ['.novel7'])


if __name__ == '__main__': unittest.main()
