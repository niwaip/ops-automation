"""The model chooses presentation focus but cannot introduce unverified claims."""

import io
import json
import sys
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.personal_skill_presentation import observation_catalog, select_observations, present_verified_workflow
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats


class PersonalSkillPresentationTests(unittest.TestCase):
    def setUp(self):
        self.data = {'unit': 'K', 'measure': '金额(K)', 'included_rows': 3, 'excluded_rows': 2,
                     'total': '40.00000', 'evidence_id': 'verified-id',
                     'groups': [{'key': 'A', 'amount': '30.00000', 'count': 2}, {'key': 'B', 'amount': '10.00000', 'count': 1}]}
        self.telemetry = TelemetryStats()

    def invoke(self, response, prompt='查看部门汇总'):
        with patch('dsh_modules.personal_skill_presentation.call_model_proxy', return_value=response) as call, redirect_stdout(io.StringIO()):
            result = present_verified_workflow(self.data, 'VERIFIED TABLE', prompt, 'selected-model', RuntimePolicy(), self.telemetry, time.monotonic() + 30)
        return result, call

    def test_model_selects_insights_without_rewriting_verified_table_or_numbers(self):
        result, call = self.invoke({'content': json.dumps({'fact_ids': ['largest', 'top_two_share']}), 'finish_reason': 'stop'})
        self.assertTrue(result.startswith('VERIFIED TABLE'))
        self.assertIn('30.00000 K', result); self.assertIn('100.00%', result)
        self.assertEqual(self.telemetry.llm_invocations, 1)
        self.assertFalse(call.call_args.kwargs['stream_deltas'])
        self.assertEqual(call.call_args.kwargs['model'], 'selected-model')

    def test_fake_numbers_arbitrary_text_and_unknown_facts_fall_back_to_verified_table(self):
        for raw in [{'fact_ids': ['largest'], 'text': '合计114.87346'}, {'fact_ids': ['invented']}, {'fact_ids': ['largest', 'largest']}]:
            result, _ = self.invoke({'content': json.dumps(raw), 'finish_reason': 'stop'})
            self.assertEqual(result, 'VERIFIED TABLE')
            self.assertEqual(self.telemetry.guard_decisions[-1]['action'], 'fallback')

    def test_results_only_avoids_the_model_call(self):
        result, call = self.invoke({}, '只要表格，无需解读')
        self.assertEqual(result, 'VERIFIED TABLE'); call.assert_not_called()

    def test_verified_table_is_streamed_in_broker_format_before_model_call(self):
        output = io.StringIO()
        def model(*args, **kwargs):
            line = output.getvalue().strip()
            self.assertEqual(json.loads(line[13:-3]), 'VERIFIED TABLE\n\n')
            return {'content': '{"fact_ids":["total"]}', 'finish_reason': 'stop'}
        with patch('dsh_modules.personal_skill_presentation.call_model_proxy', side_effect=model), redirect_stdout(output):
            present_verified_workflow(self.data, 'VERIFIED TABLE', '解读结果', 'model', RuntimePolicy(), self.telemetry)

    def test_model_failure_preserves_computation(self):
        with patch('dsh_modules.personal_skill_presentation.call_model_proxy', side_effect=TimeoutError), redirect_stdout(io.StringIO()):
            result = present_verified_workflow(self.data, 'VERIFIED TABLE', '查看结果', 'model', RuntimePolicy(), self.telemetry)
        self.assertEqual(result, 'VERIFIED TABLE')
        self.assertEqual(self.telemetry.llm_invocations, 1)

    def test_ties_and_negative_amounts_are_not_misrepresented(self):
        self.data['groups'][1]['amount'] = '30.00000'
        facts = observation_catalog(self.data)
        self.assertIn('并列最高', select_observations({'fact_ids': ['largest']}, facts))
        self.data['groups'][1]['amount'] = '-30'
        facts = observation_catalog(self.data)
        self.assertNotIn('top_two_share', [f['id'] for f in facts])
        self.assertIn('negative', [f['id'] for f in facts])


if __name__ == '__main__':
    unittest.main()
