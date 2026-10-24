"""Shared admission behavior across unknown skills, formats and execution engines."""

import io
import json
import sys
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.skill_admission import admit_skill, validate_decision, AdmissionClarification
from dsh_modules.skill_router import SkillRouter
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.spreadsheet_analysis_evidence import requires_spreadsheet_analysis


class SkillAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.skills = [
            {'id': 'alpha-policy', 'name': '限定范围汇总', 'description': '按已确认范围过滤后汇总金额', 'type': 'custom',
             'execution_mode': 'verified_workflow', 'requires_execution': True},
            {'id': 'beta-method', 'name': '通用明细分析', 'description': '按当前要求分析明细，不附加业务过滤', 'type': 'certified'},
            {'id': 'gamma-writing', 'name': '叙述整理', 'description': '整理段落，不执行数值统计', 'type': 'custom'},
        ]
        self.request = '统计全部部门金额，仅输出表格'
        self.telemetry = TelemetryStats()

    def decision(self, action='use', skill='alpha-policy', defaults=False, request=None):
        return {'action': action, 'skill_id': skill, 'use_default_rules': defaults,
                'rule_basis': request or self.request if defaults else '',
                'output_mode': 'conversation', 'artifact_types': [], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
                'task_mode': 'execute',
                'requirements': [{'id': 'goal', 'quote': request or self.request}],
                'reason': 'applicable' if action == 'use' else 'scope_mismatch', 'question': ''}

    def invoke(self, responder, prompt=None, files=None):
        prompt = prompt or self.request; bodies = []; decisions = []
        with redirect_stdout(io.StringIO()):
            provisional = SkillRouter.route(prompt, available_skills=self.skills, selection={'skill_id': 'alpha-policy'},
                                             load_skill_context=False)
        def body(identifier):
            bodies.append(identifier)
            return f'技能 {identifier} 的真实方法与适用范围'
        def model(messages, **kwargs):
            payload = json.loads(messages[-1]['content'])
            if kwargs['tools'][0]['function']['name'] == 'submit_task_intent':
                result = {'task_mode': getattr(self, 'intent_mode', 'execute'), 'output_mode': 'conversation',
                          'artifact_types': [], 'skill_invocation': getattr(self, 'intent_invocation', {'mode': 'none', 'name': '', 'replace_defaults': False}), 'requirements': [{'id': 'goal', 'quote': prompt}]}
            else:
                decisions.append(payload)
                result = responder(payload, len(decisions))
                result = {k: v for k, v in result.items() if k not in {'task_mode','output_mode','artifact_types','skill_invocation','requirements'}}
            return {'finish_reason': 'tool_calls', 'content': '', 'tool_calls': [{'type': 'function',
                'function': {'name': kwargs['tools'][0]['function']['name'], 'arguments': json.dumps(result)}}]}
        with patch('dsh_modules.semantic_decision.call_model_proxy', side_effect=model), redirect_stdout(io.StringIO()):
            route = admit_skill(prompt, [], files or [], provisional, 'configured-model', None, self.telemetry,
                                time.monotonic()+60, available_skills=self.skills, read_body=body)
        return route, bodies, decisions

    def test_unknown_skill_can_be_admitted_without_new_code_or_name_branch(self):
        self.skills.append({'id': 'newly-installed-47', 'name': '新方法', 'description': '分析用户要求的部门明细', 'type': 'custom'})
        route, bodies, calls = self.invoke(lambda p, n: self.decision(skill='newly-installed-47'))
        self.assertEqual(route.skill_id, 'newly-installed-47')
        self.assertEqual(bodies, ['alpha-policy', 'newly-installed-47']); self.assertEqual(len(calls), 2)
        self.assertEqual(route.skill_context, '')
        self.assertEqual(route.admission['skill_id'], 'newly-installed-47')

    def test_wrong_match_is_replaced_and_new_body_is_reviewed_before_execution(self):
        route, bodies, calls = self.invoke(lambda p, n: self.decision(skill='beta-method'))
        self.assertEqual(route.skill_id, 'beta-method')
        self.assertNotIn('alpha-policy', route.skill_context)
        self.assertIn('beta-method', calls[1]['inspected_skills'])
        self.assertFalse(route.requires_execution, 'rejected custom engine contract must not survive')

    def test_whole_skill_invocation_cannot_silently_drop_its_rules(self):
        request = '使用限定范围汇总，追加结果排序'
        self.intent_invocation = {'mode': 'execute', 'name': '限定范围汇总', 'replace_defaults': False}
        def respond(payload, attempt):
            if attempt == 2:
                self.assertIn('error', payload['feedback'])
            return self.decision(defaults=attempt == 2, request=request)
        route, _, calls = self.invoke(respond, prompt=request)
        self.assertEqual(len(calls), 2)
        self.assertTrue(route.admission['use_default_rules'])

    def test_explicit_scope_override_can_use_method_without_default_rules(self):
        request = '使用限定范围汇总的方法，但取消其过滤规则'
        self.intent_invocation = {'mode': 'execute', 'name': '限定范围汇总', 'replace_defaults': True}
        route, _, calls = self.invoke(lambda p, n: self.decision(request=request), prompt=request)
        self.assertEqual(len(calls), 1)
        self.assertFalse(route.admission['use_default_rules'])

    def test_defaults_cannot_be_granted_without_whole_skill_call(self):
        with self.assertRaises(ValueError):
            self.invoke(lambda p, n: self.decision(defaults=True))

    def test_reference_only_does_not_inherit_business_instructions(self):
        route, _, _ = self.invoke(lambda p, n: self.decision())
        self.assertEqual(route.skill_context, '')
        self.assertFalse(route.admission['use_default_rules'])

    def test_mentioning_a_skill_name_does_not_force_default_rules(self):
        request = '不要使用alpha-policy的过滤规则，只参考方法统计全部数据'
        route, _, _ = self.invoke(lambda p, n: self.decision(request=request), prompt=request)
        self.assertFalse(route.admission['use_default_rules']); self.assertEqual(route.skill_context, '')

    def test_general_replanning_clears_wrong_skill_and_keeps_native_input_evidence_gate(self):
        route, _, _ = self.invoke(lambda p, n: self.decision(action='general', skill=None), files=['fresh.xlsx'])
        self.assertIsNone(route.skill_id); self.assertEqual(route.skill_context, '')
        self.assertEqual(route.deliverables, []); self.assertFalse(route.requires_execution)
        self.assertTrue(requires_spreadsheet_analysis(self.request, route))
        from dsh_modules.runner import select_active_tools
        tools = select_active_tools(self.request, route, False, False)
        names = {t['function']['name'] for t in tools}
        self.assertIn('aggregate_spreadsheet', names)
        self.assertNotIn('bash', names)

    def test_same_admission_contract_works_for_writing_without_spreadsheets(self):
        request = '整理这段说明为三个简短段落'
        route, _, _ = self.invoke(lambda p, n: self.decision(skill='gamma-writing', request=request), prompt=request)
        self.assertEqual(route.skill_id, 'gamma-writing'); self.assertEqual(route.skill_context, '')
        self.assertEqual(route.source_formats, [])

    def test_format_and_slash_are_candidates_not_bypasses(self):
        request = '/alpha-policy 解释其用途，暂不执行'
        route, _, calls = self.invoke(lambda p, n: self.decision(action='general', skill=None, request=request), prompt=request, files=['source.pdf'])
        self.assertIsNone(route.skill_id); self.assertEqual(len(calls), 1)

    def test_consulting_a_skill_never_starts_its_specialized_executor(self):
        from dsh_modules.personal_skill_workflow import try_run_personal_workflow
        self.intent_mode = 'consult'
        request = '解释alpha-policy的用途，不执行'
        route, _, _ = self.invoke(lambda p, n: {**self.decision(request=request), 'task_mode': 'consult'}, prompt=request)
        self.assertFalse(route.requires_execution)
        self.assertFalse(try_run_personal_workflow(route, [], request, None, [], time.time(), None))

    def test_clarify_stops_before_skill_execution(self):
        with self.assertRaisesRegex(AdmissionClarification, '哪个期间'):
            self.invoke(lambda p, n: {**self.decision(action='clarify', skill=None), 'question': '需要统计哪个期间？'})

    def test_clarify_forbids_output_format_inquiry(self):
        with self.assertRaisesRegex(ValueError, '交付格式已由任务契约锁定'):
            validate_decision(
                {**self.decision(action='clarify', skill=None),
                 'question': '请问您希望将统计结果输出为什么格式？例如：1. 纯文本列表；2. 汇总表格图片；3. 生成新的 Excel 报表。'},
                {s['id'] for s in self.skills},
                [self.request]
            )

    def test_schema_or_quote_error_gets_one_recheck_without_execution(self):
        def responder(p, n):
            if n == 1:
                return {**self.decision(defaults=True), 'rule_basis': '伪造的用户口径'}
            self.assertIn('error', p['feedback'])
            return self.decision()
        route, _, calls = self.invoke(responder)
        self.assertEqual(len(calls), 2); self.assertFalse(route.admission['use_default_rules'])

    def test_unreviewed_second_alternative_never_executes(self):
        with self.assertRaisesRegex(ValueError, '经复核仍未通过'):
            self.invoke(lambda p, n: self.decision(skill='beta-method' if n == 1 else 'gamma-writing'))

    def test_unknown_skill_forged_defaults_and_invalid_quotes_fail_closed(self):
        for value in [self.decision(skill='not-installed'),
                      {**self.decision(defaults=True), 'rule_basis': '不存在的授权'},
                      {**self.decision(action='general', skill=None), 'use_default_rules': True}]:
            with self.assertRaises(ValueError): validate_decision(value, {s['id'] for s in self.skills}, [self.request])

    def test_provisional_discovery_does_not_load_skill_into_execution_prompt(self):
        with patch('dsh_modules.skill_router.read_skill') as read, redirect_stdout(io.StringIO()):
            route = SkillRouter.route('按范围汇总金额', available_skills=self.skills, files=['data.xlsx'],
                                      selection={'skill_id': 'alpha-policy'}, load_skill_context=False)
        self.assertIsNotNone(route.skill_id); self.assertEqual(route.skill_context, ''); read.assert_not_called()

    def test_skill_stage_cannot_rewrite_the_user_output_contract(self):
        intent = {'task_mode': 'execute', 'output_mode': 'conversation', 'artifact_types': [], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
                  'requirements': [{'id': 'goal', 'quote': self.request}], 'question': ''}
        decision = {k: v for k, v in self.decision().items() if k not in intent}
        decision['output_mode'] = 'artifact'
        from types import SimpleNamespace
        with patch('dsh_modules.skill_admission.extract_task_intent', return_value=intent), \
             patch('dsh_modules.skill_admission.structured_decision', return_value=decision), redirect_stdout(io.StringIO()):
            with self.assertRaises(ValueError):
                admit_skill(self.request, [], [], SimpleNamespace(skill_id='alpha-policy'), 'model', None,
                    self.telemetry, time.monotonic()+30, available_skills=self.skills, read_body=lambda _: '实际技能正文')

    def test_admission_failure_falls_back_with_locked_goal_and_no_stale_skill_flags(self):
        from dsh_modules.skill_admission import general_route
        intent = {'task_mode': 'execute', 'output_mode': 'conversation', 'artifact_types': [], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
                  'requirements': [{'id': 'r', 'quote': self.request}]}
        with redirect_stdout(io.StringIO()):
            route = general_route(self.request, [], ['source.xlsx'], intent)
        self.assertIsNone(route.skill_id)
        self.assertFalse(route.is_generate_intent)
        self.assertFalse(route.requires_execution)
        self.assertEqual(route.admission['requirements'], intent['requirements'])
        self.assertTrue(requires_spreadsheet_analysis(self.request, route))


    def test_nonempty_question_is_rechecked_instead_of_silently_discarded(self):
        def responder(p, n):
            res = self.decision(action='use', skill='alpha-policy', defaults=False)
            res['question'] = '是否需要生成柱状图？'
            return res
        with self.assertRaisesRegex(AdmissionClarification, '是否需要生成柱状图'):
            self.invoke(responder)

    def test_admission_normalizes_leftover_skill_fields_when_action_is_general(self):
        # 验证当模型设置 action='general' 但未清除 skill_id 或 use_default_rules 时自动对齐
        def responder(p, n):
            res = self.decision(action='general', skill='alpha-policy', defaults=True)
            res['question'] = ''
            return res
        route, _, calls = self.invoke(responder)
        self.assertEqual(len(calls), 1)
        self.assertIsNone(route.skill_id)
        self.assertFalse(route.admission['use_default_rules'])
        self.assertEqual(route.admission['question'], '')


if __name__ == '__main__': unittest.main()
