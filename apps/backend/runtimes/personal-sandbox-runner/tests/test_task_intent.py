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
            self.assertTrue(set(payload) <= {'request', 'user_history', 'recent_dialogue', 'input_count', 'skill_names', 'feedback', 'proposed_contract'})
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

    def test_standalone_relation_blocks_historical_requirement_grounding(self):
        request = '统计 各个部门里面 合计金额 超过 500k的部门有哪些'
        users = ['使用部门别有偿统计，只要表格，无需解读']
        contaminated_response = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'conversation',
            'artifact_types': [],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [
                {'id': 'r1', 'quote': request},
                {'id': 'r2', 'quote': '只要表格，无需解读'}
            ]
        })}
        clean_response = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'conversation',
            'artifact_types': [],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [
                {'id': 'r1', 'quote': request}
            ]
        })}
        # First attempt returns contaminated_response which fails validate_intent, second returns clean_response
        replies = [contaminated_response, clean_response, clean_response]
        with patch('dsh_modules.semantic_decision.call_model_proxy', side_effect=replies):
            result = extract_task_intent(request, users, 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(len(result['requirements']), 1)
        self.assertEqual(result['requirements'][0]['quote'], request)
        self.assertEqual(result['instruction_relation'], 'standalone')

    def test_standalone_relation_normalizes_unrequested_artifact_to_conversation(self):
        request = '统计 各个部门里面 合计金额 超过 500k的部门有哪些'
        artifact_response = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['xlsx'],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'r1', 'quote': request}]
        })}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=artifact_response):
            result = extract_task_intent(request, [], 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['output_mode'], 'conversation')
        self.assertEqual(result['artifact_types'], [])

    def test_standalone_relation_preserves_explicit_export_request(self):
        request = '导出各个部门统计为excel文件'
        artifact_response = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['xlsx'],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'r1', 'quote': request}]
        })}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=artifact_response):
            result = extract_task_intent(request, [], 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['output_mode'], 'artifact')
        self.assertEqual(result['artifact_types'], ['.xlsx'])

    def test_followup_relation_allows_historical_requirement_grounding(self):
        request = '再筛选出大于500的'
        users = ['统计各个部门合计金额']
        followup_response = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'followup',
            'task_mode': 'execute',
            'output_mode': 'conversation',
            'artifact_types': [],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [
                {'id': 'r1', 'quote': request},
                {'id': 'r2', 'quote': '统计各个部门合计金额'}
            ]
        })}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=followup_response):
            result = extract_task_intent(request, users, 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['instruction_relation'], 'followup')
        self.assertEqual(len(result['requirements']), 2)

    def test_followup_parameter_fulfillment_normalizes_to_execute(self):
        request = '有偿的金额'
        users = ['统计各个部门金额']
        consult_response = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'followup',
            'task_mode': 'consult',
            'output_mode': 'conversation',
            'artifact_types': [],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': '1', 'quote': request}]
        })}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=consult_response):
            result = extract_task_intent(request, users, 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['task_mode'], 'execute')

    def test_condition_replacement_heals_standalone_to_followup_and_preserves_chart_artifact(self):
        users = ['按部门统计 金额的合计，不包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据，生成柱状图']
        request = '按部门统计 金额的合计，只包含（WBS编号）中ex，sy，sp，ip，ib，sz开头的数据'
        # Model initially misclassifies as standalone but quotes the historical chart requirement
        model_reply = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['html'],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [
                {'id': 'r1', 'quote': '按部门统计 金额的合计，只包含(WBS编号)中ex,sy,sp,ip,ib,sz开头的数据'},
                {'id': 'r2', 'quote': '生成柱状图'}
            ]
        })}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=model_reply):
            result = extract_task_intent(request, users, 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['instruction_relation'], 'followup')
        self.assertEqual(result['output_mode'], 'artifact')
        self.assertIn('.html', result['artifact_types'])
        self.assertEqual(len(result['requirements']), 2)

    def test_clean_dialogue_content_strips_html_and_code_blocks(self):
        from dsh_modules.task_intent import clean_dialogue_content
        assistant_raw = (
            "✨ 交互式页面已生成完毕！\n\n"
            "输出文件：/workspace/index.html\n"
            "```html\n<!DOCTYPE html><html><head><style>body { color: red; }</style></head><body><h1>Chart</h1></body></html>\n```\n"
            "<div>操作提示：请查看看板</div>"
        )
        cleaned = clean_dialogue_content('assistant', assistant_raw)
        self.assertNotIn('```', cleaned)
        self.assertNotIn('<!DOCTYPE', cleaned)
        self.assertNotIn('<style>', cleaned)
        self.assertIn('交互式页面已生成完毕', cleaned)
        self.assertIn('/workspace/index.html', cleaned)
        self.assertIn('操作提示：请查看看板', cleaned)

    def test_unrelated_task_does_not_inherit_chart(self):
        users = ['按部门统计 金额的合计，不包含...生成柱状图']
        request = '帮我写一封感谢信'
        model_reply = {'finish_reason': 'stop', 'content': json.dumps({
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'conversation',
            'artifact_types': [],
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [{'id': 'r1', 'quote': request}]
        })}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=model_reply):
            result = extract_task_intent(request, users, 'model', None, TelemetryStats(), time.monotonic()+30)
        self.assertEqual(result['instruction_relation'], 'standalone')
        self.assertEqual(result['output_mode'], 'conversation')
        self.assertEqual(result['artifact_types'], [])

    def test_sanitize_drops_flawed_requirement_in_retry(self):
        from dsh_modules.task_intent import validate_intent
        request = '生成一份自然观察手册，共2页，使用warm主题'
        raw = {
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['.pdf'],
            'unit_confirmation': None,
            'section_confirmation': None,
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [
                {'id': 'r1', 'quote': '生成一份自然观察手册'},
                {'id': 'r2', 'quote': '这一句在用户原话中根本不存在的编造要求'}
            ]
        }
        # In first round (allow_sanitize=False), must raise ValueError
        with self.assertRaises(ValueError) as cm:
            validate_intent(dict(raw), request, [], None, allow_sanitize=False)
        self.assertIn('用户原话依据', str(cm.exception))

        # In retry round (allow_sanitize=True), flawed requirement is sanitized away
        cleaned = validate_intent(dict(raw), request, [], None, allow_sanitize=True)
        self.assertEqual(len(cleaned['requirements']), 1)
        self.assertEqual(cleaned['requirements'][0]['id'], 'r1')

    def test_pure_export_command_resolves_to_followup(self):
        from dsh_modules.task_intent import validate_intent
        request = '生成pdf文件'
        users = ['查看今天微博的热点新闻']
        raw = {
            'instruction_relation': 'standalone',
            'task_mode': 'execute',
            'output_mode': 'artifact',
            'artifact_types': ['.pdf'],
            'unit_confirmation': None,
            'section_confirmation': None,
            'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
            'requirements': [
                {'id': 'r1', 'quote': '生成pdf文件'}
            ]
        }
        validated = validate_intent(dict(raw), request, users, None, allow_sanitize=False)
        self.assertEqual(validated['instruction_relation'], 'followup')
        self.assertEqual(validated['task_mode'], 'execute')
        self.assertEqual(validated['output_mode'], 'artifact')
        self.assertEqual(validated['artifact_types'], ['.pdf'])


if __name__ == '__main__': unittest.main()
