"""Explicit output format survives semantic misclassification and general routing."""
from copy import deepcopy
import json
import io
import tempfile
from contextlib import redirect_stdout
import unittest
from unittest.mock import patch

from dsh_modules.task_intent import validate_intent, extract_task_intent
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.skill_admission import general_route
from dsh_modules.output_format_contract import requested_output_formats


class OutputFormatContractTests(unittest.TestCase):
    def contract(self, request, formats=None, relation='standalone'):
        return {'instruction_relation': relation, 'task_mode': 'execute', 'output_mode': 'artifact',
                'artifact_types': formats or ['.html'], 'unit_confirmation': None, 'section_confirmation': None,
                'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
                'requirements': [{'id': 'r', 'quote': request}]}

    def test_original_election_ppt_request_cannot_be_downgraded_to_html(self):
        request = '帮我生成一个小学生 竞选班干部的ppt，3到4页，主要是自我介绍，个人荣誉，竞选的目标和宣言，或者给你的建议，不要太复杂'
        result = validate_intent(self.contract(request), request, [], [], allow_sanitize=True)
        self.assertEqual(result['artifact_types'], ['.pptx'])
        with patch('dsh_modules.skills.get_available_skills', return_value=[]):
            route = general_route(request, [], [], result)
        self.assertIsNone(route.skill_id)
        self.assertEqual(route.deliverables, ['.pptx'])

    def test_explicit_native_formats_override_wrong_semantic_format(self):
        for request, expected in [
            ('生成一份Word文档', ['.docx']), ('生成Excel文件', ['.xlsx']),
            ('生成PDF报告', ['.pdf']), ('生成金额柱状图的ppt', ['.pptx']),
            ('读取输入.xlsx，生成说明.docx', ['.docx']),
            ('生成PPT和HTML网页两个文件', ['.html', '.pptx']),
        ]:
            with self.subTest(request=request):
                result = validate_intent(self.contract(request), request, [], [])
                self.assertCountEqual(result['artifact_types'], expected)

    def test_explicit_html_deck_and_followup_switch_are_preserved(self):
        for request in ['生成HTML形式的PPT', '生成网页PPT']:
            self.assertEqual(requested_output_formats(request), ['.html'])
        self.assertEqual(requested_output_formats('继续生成', ['生成一个ppt'], 'followup'), ['.pptx'])
        self.assertEqual(requested_output_formats('改成HTML网页', ['生成一个ppt'], 'followup'), ['.html'])
        self.assertEqual(requested_output_formats('随便聊聊', ['生成一个ppt']), [])

    def test_consultation_and_export_negation_do_not_create_artifacts(self):
        for request in ['解释如何生成ppt', '不要生成PPT，只在聊天中说明']:
            contract = self.contract(request)
            contract.update(task_mode='consult', output_mode='conversation', artifact_types=[])
            result = validate_intent(deepcopy(contract), request, [], [])
            self.assertEqual(result['artifact_types'], [])

    def test_followup_chart_promotion_cannot_add_html_to_native_ppt(self):
        request = '按部门统计金额生成柱状图的ppt'
        response = {'content': json.dumps(self.contract(request, relation='followup')), 'finish_reason': 'stop'}
        with patch('dsh_modules.semantic_decision.call_model_proxy', return_value=response):
            result = extract_task_intent(request, ['按部门统计金额生成ppt'], 'test', None, TelemetryStats(), None)
        self.assertEqual(result['artifact_types'], ['.pptx'])

    def test_sent_html_does_not_satisfy_missing_pptx_contract(self):
        from dsh_modules import agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        responses = [{'content': '', 'tool_calls': [{'id': 'send', 'type': 'function',
            'function': {'name': 'send_file', 'arguments': '{}'}}]},
            {'content': '已生成HTML网页', 'finish_reason': 'stop'}]
        def dispatch(**kwargs):
            kwargs['outbound_files'].append(json.dumps({'filePath': '/workspace/slides.html'}))
            return True
        with tempfile.TemporaryDirectory() as workspace, \
             patch.object(agent_loop, 'WORKSPACE_DIR', workspace), \
             patch.object(agent_loop, 'call_model_proxy', side_effect=responses), \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch.object(agent_loop, '_finalize_agent_text', return_value=('已生成HTML网页', [])), \
             patch.object(agent_loop, 'detect_missing_requested_deliverable', return_value='.pptx'), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop([{'role': 'system', 'content': ''},
                {'role': 'user', 'content': '生成PPT'}], model='test', policy=RuntimePolicy(),
                max_rounds=1, expected_deliverables=['.pptx'], is_generate_intent=True,
                user_prompt='生成PPT')
        self.assertTrue(result.outbound_files)
        self.assertTrue(any(g['guard'] == 'deliverable_contract' and g['action'] == 'reject'
                            for g in result.telemetry.guard_decisions))
