"""User clarifications resume native workbook updates without a domain skill."""
import copy
import unittest
from unittest.mock import patch

import openpyxl

from dsh_modules.user_declarations import bind_user_declarations, validate_unit_confirmation
from dsh_modules.spreadsheet_update.tools import reset_turn_results, tool_plan_spreadsheet_update
from dsh_modules.spreadsheet_update.semantic_plan import build_semantic_plan
from dsh_modules.spreadsheet_update.routing import is_workbook_update
from dsh_modules.task_intent import validate_intent


class UserConfirmationTests(unittest.TestCase):
    def setUp(self):
        from test_spreadsheet_update_semantic_api import SemanticUpdateTests
        self.fixture = SemanticUpdateTests()
        self.fixture.setUp()
        wb = openpyxl.load_workbook(self.fixture.target)
        wb['1019']['F1'] = None
        wb.save(self.fixture.target)
        wb.close()
        self.request = {k: v for k, v in self.fixture.request.items() if k != 'unit_cell'}

    def tearDown(self):
        self.fixture.tearDown()

    def test_missing_unit_then_user_confirmation_produces_a_verified_plan(self):
        first = tool_plan_spreadsheet_update(self.request)
        self.assertTrue(first.is_partial)
        bind_user_declarations({'unit_confirmation': {'unit': 'K', 'quote': 'k单位'},
                                'user_statements': ['k单位']})
        plan, facts, payload, preview, warnings = build_semantic_plan(self.request, self.fixture.ws)
        self.assertEqual(plan['semantic_bindings']['unit_basis'],
                         {'source': 'user', 'unit': 'K', 'quote': 'k单位'})
        self.assertEqual(preview[0]['value'], '67.0353')
        self.assertFalse((self.fixture.ws / 'target_1023.xlsx').exists())

    def test_confirmation_can_convert_without_modifying_the_source_template(self):
        bind_user_declarations({'unit_confirmation': {'unit': '万元', 'quote': '目标按万元更新'},
                                'user_statements': ['目标按万元更新']})
        before = self.fixture.target.read_bytes()
        plan, facts, payload, preview, warnings = build_semantic_plan(
            {**self.request, 'target_unit': '万元'}, self.fixture.ws)
        self.assertEqual(preview[0]['value'], '6.70353')
        self.assertEqual(self.fixture.target.read_bytes(), before)

    def test_model_target_unit_without_user_basis_still_cannot_write(self):
        for unit in ('K', '万元'):
            result = tool_plan_spreadsheet_update({**self.request, 'target_unit': unit})
            self.assertTrue(result.is_partial)
            self.assertEqual(result.data['status'], 'needs_input')

    def test_period_mistaken_for_block_title_returns_actual_title_candidates(self):
        bind_user_declarations({'unit_confirmation': {'unit': 'K', 'quote': 'k单位'},
                                'user_statements': ['k单位']})
        result = tool_plan_spreadsheet_update({**self.request, 'section': self.request['period']})
        self.assertTrue(result.is_error)
        self.assertIn('section 被误填成 period', str(result))
        self.assertIn('A1=有偿', str(result))
        self.assertIn('不要反复缩小', str(result))

    def test_forged_or_unrelated_user_quote_is_rejected(self):
        for declaration, texts in [({'unit': 'K', 'quote': 'k单位'}, ['继续']),
                                   ({'unit': 'K', 'quote': '万元单位'}, ['万元单位']),
                                   ({'unit': '元', 'quote': '万元单位'}, ['万元单位'])]:
            with self.assertRaises(ValueError):
                bind_user_declarations({'unit_confirmation': declaration, 'user_statements': texts})

    def test_aliases_and_varied_user_phrasing_are_normalized(self):
        for unit, quote, expected in [('K', 'k单位', 'K'), ('千元', '目标单位千元', 'K'),
                                      ('万元', '按万元填入', '万元'), ('M', 'Use M for target', 'M')]:
            self.assertEqual(validate_unit_confirmation({'unit': unit, 'quote': quote}, [quote])['unit'], expected)

    def test_confirmation_does_not_silently_override_a_conflicting_workbook(self):
        wb = openpyxl.load_workbook(self.fixture.target)
        wb['1019']['F1'] = '单位：万元'
        wb.save(self.fixture.target)
        wb.close()
        bind_user_declarations({'unit_confirmation': {'unit': 'K', 'quote': 'k单位'},
                                'user_statements': ['k单位']})
        result = tool_plan_spreadsheet_update(self.request)
        self.assertTrue(result.is_partial)
        self.assertIn('冲突', str(result))

    def test_declarations_are_cleared_between_turns(self):
        from dsh_modules.user_declarations import unit_confirmation
        bind_user_declarations({'unit_confirmation': {'unit': 'K', 'quote': 'k单位'},
                                'user_statements': ['k单位']})
        reset_turn_results()
        self.assertIsNone(unit_confirmation())
        self.assertTrue(tool_plan_spreadsheet_update(self.request).is_partial)

    def test_default_output_name_avoids_an_existing_delivery_without_overwriting_it(self):
        existing = self.fixture.ws / 'target_1023.xlsx'
        existing.write_bytes(b'historical delivery')
        bind_user_declarations({'unit_confirmation': {'unit': 'K', 'quote': 'k单位'},
                                'user_statements': ['k单位']})
        plan, *_ = build_semantic_plan(self.request, self.fixture.ws)
        self.assertEqual(plan['output']['display_name'], 'target_1023_2.xlsx')
        self.assertEqual(existing.read_bytes(), b'historical delivery')
        rejected = tool_plan_spreadsheet_update({**self.request, 'output_name': existing.name})
        self.assertTrue(rejected.is_error)


class NativeUpdateRoutingTests(unittest.TestCase):
    def contract(self, relation='followup'):
        return {'instruction_relation': relation, 'task_mode': 'execute', 'output_mode': 'artifact',
                'artifact_types': ['.xlsx'], 'skill_invocation': {'mode': 'none', 'name': '', 'replace_defaults': False},
                'unit_confirmation': {'unit': 'K', 'quote': 'k单位'},
                'requirements': [{'id': 'update', 'quote': '复制最新sheet后更新预测'},
                                 {'id': 'unit', 'quote': 'k单位'}]}

    def test_short_confirmation_uses_reviewed_update_requirements(self):
        from dsh_modules.runner import select_active_tools
        from dsh_modules.skill_router import SkillRoutingResult
        route = SkillRoutingResult()
        route.source_formats = ['.xlsx']
        route.admission = self.contract()
        route.is_generate_intent = route.requires_execution = True
        tools = select_active_tools('k单位', route, False, False)
        self.assertIn('execute_spreadsheet_update', [tool['function']['name'] for tool in tools])
        self.assertTrue(is_workbook_update('k单位', route.admission))

    def test_standalone_and_consultation_do_not_inherit_update(self):
        self.assertFalse(is_workbook_update('k单位', self.contract('standalone')))
        self.assertFalse(is_workbook_update('解释更新方法', {**self.contract(), 'task_mode': 'consult'}))

    def test_unit_only_requirement_recovers_the_immediate_user_task(self):
        from dsh_modules.skill_admission import general_route
        from dsh_modules.runner import select_active_tools
        contract = self.contract()
        contract['requirements'] = [{'id': 'unit', 'quote': 'k单位'}]
        history = [{'role': 'user', 'content': '复制最新sheet后更新预测'},
                   {'role': 'assistant', 'content': '请确认单位'}]
        route = general_route('k单位', history, ['target.xlsx', 'income.xlsx'], contract)
        self.assertTrue(route.is_modify_intent)
        self.assertIsNone(route.skill_id)
        tools = select_active_tools('k单位', route, False, False)
        self.assertIn('execute_spreadsheet_update', [tool['function']['name'] for tool in tools])
        self.assertFalse(is_workbook_update('k单位', {**contract, 'instruction_relation': 'standalone'}, history))

    def test_standalone_cannot_inherit_a_user_unit_from_another_task(self):
        with self.assertRaises(ValueError):
            validate_intent(self.contract('standalone'), '分析数据', ['k单位'], [])

    def test_current_unit_only_reply_survives_a_model_omission_or_malformed_unit(self):
        for proposal in (None, {'unit': 'k单位', 'quote': 'k单位'}):
            contract = self.contract()
            contract['unit_confirmation'] = proposal
            checked = validate_intent(contract, 'k单位', ['复制最新sheet后更新预测'], [])
            self.assertEqual(checked['unit_confirmation'], {'unit': 'K', 'quote': 'k单位'})

    def test_direct_reply_uses_all_supported_units_and_rejects_questions_and_negation(self):
        from dsh_modules.user_declarations import direct_unit_reply
        for text in ('k单位', '单位：千元', '万元', 'M单位。', 'hours', '单位是元'):
            self.assertIsNotNone(direct_unit_reply(text), text)
        for text in ('K?', 'k单位吗', '不要K单位', '金额(K)', '来源单位K，目标万元', 'work'):
            self.assertIsNone(direct_unit_reply(text), text)

    def test_invalid_optional_unit_grants_no_authority_but_can_use_workbook_evidence(self):
        request = '复制最新sheet后更新预测，按工作簿声明的单位'
        contract = self.contract('standalone')
        contract['requirements'] = [{'id': 'update', 'quote': request}]
        contract['unit_confirmation'] = {'unit': 'K', 'quote': '按工作簿声明的单位'}
        result = validate_intent(contract, request, [], [], allow_sanitize=True)
        self.assertIsNone(result['unit_confirmation'])
        self.assertEqual(result['output_mode'], 'artifact')

    def test_native_update_skips_domain_skill_body_and_admission(self):
        from dsh_modules.skill_admission import admit_skill
        from dsh_modules.skill_router import SkillRoutingResult
        from dsh_modules.telemetry import TelemetryStats
        route = SkillRoutingResult()
        route.skill_id = 'some-domain-skill'
        with patch('dsh_modules.skill_admission.extract_task_intent', return_value=self.contract()), \
             patch('dsh_modules.skill_admission.structured_decision') as decide, \
             patch('dsh_modules.skill_admission.read_skill') as body:
            result = admit_skill('k单位', [{'role': 'user', 'content': '复制最新sheet后更新预测'}],
                                 ['arbitrary.xlsx', 'data.xlsx'], route, None, None, TelemetryStats(), None,
                                 available_skills=[])
        self.assertIsNone(result.skill_id)
        self.assertEqual(result.admission['action'], 'general')
        self.assertTrue(result.is_generate_intent)
        self.assertTrue(result.requires_execution)
        self.assertEqual(result.deliverables, ['.xlsx'])
        decide.assert_not_called()
        body.assert_not_called()

    def test_native_aggregation_schema_is_flat_after_a_short_followup(self):
        from dsh_modules.spreadsheet_update.agent_protocol import select_update_tools
        from dsh_modules.tools import get_sandbox_tools
        tools = select_update_tools(get_sandbox_tools())
        aggregate = next(tool['function']['parameters'] for tool in tools
                         if tool['function']['name'] == 'aggregate_spreadsheet')
        self.assertIn('filters', aggregate['properties'])
        self.assertNotIn('query', aggregate['properties'])
        self.assertNotIn('bash', [tool['function']['name'] for tool in tools])


if __name__ == '__main__':
    unittest.main()
