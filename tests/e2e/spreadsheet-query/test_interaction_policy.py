import unittest
from interaction_policy import answer_hash, review_interaction


class ClarificationPolicyTests(unittest.TestCase):
    def setUp(self):
        self.answer = '请提供收入和净利润数据，以便计算净利润率。'
        self.review = dict(id='C01', session_id='session-a', answer_sha256=answer_hash(self.answer),
                           disposition='grounded_data_gap', reason='附件仅有工数及金额，缺少收入及净利润。',
                           context_evidence=['C01.request.json', 'workbook columns'])

    def grade(self, reviews, answer=None, **kwargs):
        return review_interaction('C01', 'session-a', answer or self.answer, reviews,
                                  stream_ok=kwargs.get('stream_ok', True), displayed=kwargs.get('displayed', 'inconclusive'))

    def test_grounded_question_is_valid_awaiting_user(self):
        result = self.grade([self.review])
        self.assertEqual(result['end_to_end'], 'awaiting_user')
        self.assertEqual(result['primary_display'], 'not_applicable')

    def test_keyword_does_not_auto_pass(self):
        self.assertEqual(self.grade([])['end_to_end'], 'inconclusive')
        result = self.grade([], '总金额已核验为999999 K。请问需要导出吗？', displayed='fail')
        self.assertNotIn('end_to_end', result)

    def test_review_is_bound_to_session_and_exact_answer(self):
        for field, value in [('session_id', 'session-b'), ('answer_sha256', 'stale')]:
            result = self.grade([{**self.review, field: value}])
            self.assertEqual(result['interaction_outcome'], 'clarification_needs_review')

    def test_review_requires_reason_and_grounding(self):
        self.assertEqual(self.grade([{**self.review, 'context_evidence': []}])['task_status'], 'unresolved')

    def test_clarification_cannot_hide_execution_error(self):
        result = self.grade([self.review], stream_ok=False)
        self.assertEqual(result['task_status'], 'blocked_engineering')

    def test_reasonable_information_attempt_blocked_by_gate_is_engineering(self):
        review={**self.review,'disposition':'engineering_blocked_clarification_attempt'}
        result=self.grade([review])
        self.assertEqual(result['interaction_outcome'],'grounded_clarification_attempt_blocked')
        self.assertEqual(result['end_to_end'],'blocked')

    def test_reviewed_answer_still_needs_numeric_and_runtime_checks(self):
        review={**self.review,'disposition':'grounded_complete_answer'}
        result=self.grade([review])
        self.assertNotIn('end_to_end',result)
        self.assertEqual(result['task_status'],'completion_reviewed')

    def test_assumption_requires_explicit_definition_and_separate_comparison(self):
        review={**self.review,'disposition':'answer_with_stated_assumption'}
        self.assertEqual(self.grade([review])['task_status'],'unresolved')
        result=self.grade([{**review,'accepted_definition':'visible_blank'}])
        self.assertEqual(result['task_status'],'definition_reviewed')
        self.assertNotIn('end_to_end',result)


if __name__ == '__main__':
    unittest.main()
