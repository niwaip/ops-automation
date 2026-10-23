"""Observable semantic admission, bounded repair, scope and aggregation regressions."""

import io
import json
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'src'))
from dsh_modules.personal_skill_gate import validate_proposal, review_candidate
from dsh_modules.personal_skill_workflow import try_run_personal_workflow
from dsh_modules.telemetry import TelemetryStats, extract_dsh_markers
import test_personal_skill_workflow as fixture


class PersonalSkillGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.source = self.root / 'input.xlsx'
        self.plan = {'schema_version': 1, 'engine': 'spreadsheet-group-sum-v1', 'group_by': '部门编号',
                     'measure': '金额(K)', 'filters': [{'field': 'WBS编号', 'op': 'exclude_prefix', 'values': ['ex']}],
                     'instructions': ['按部门汇总并排除ex'], 'steps': ['核算验收'],
                     'verification': {'source_hash': True, 'row_accounting': True, 'group_total': True}}
        book = openpyxl.Workbook(); sheet = book.active; sheet.title = '明细'
        sheet.append(['部门编号', 'WBS编号', '金额(K)'])
        for row in [('A', 'ok', 300), ('A', 'ok', 300), ('A', 'ex-1', 100),
                    ('B', 'ok', 500), ('C', 'ok', 499)]:
            sheet.append(row)
        book.save(self.source); book.close()
        fixture.PersonalSkillWorkflowTests.install(self)
        self.request = '按部门编号统计金额合计超过500k的部门有哪些'

    def proposal(self, threshold=500, op='gt', unit='K', filters=False):
        query = {'source': {'sheet': '明细', 'header_row': 1, 'data_range': 'A2:C6'},
                 'group_by': ['部门编号'], 'metrics': [
                     {'id': 'amount', 'label': '金额合计', 'op': 'sum', 'field': '金额(K)', 'unit': unit},
                     {'id': 'records', 'label': '条数', 'op': 'count_rows'}],
                 'having': {'metric': 'amount', 'op': op, 'value': threshold}}
        if filters:
            query['where'] = {'field': 'WBS编号', 'op': 'not_starts_with', 'values': ['ex']}
        return {'mode': 'query', 'requirements': [
            {'id': 'group', 'quote': '部门编号', 'target': '/group_by'},
            {'id': 'threshold', 'quote': '超过500k', 'target': '/having'}], 'query': query, 'question': ''}

    def invoke(self, responder, request=None, use_defaults=False):
        calls = []
        def model(messages, **kwargs):
            payload = json.loads(messages[-1]['content']); calls.append(payload)
            if 'execution' in payload:
                self.assertNotIn('<<<DSH_DELTA:', out.getvalue(), 'results must remain buffered until review accepts')
            result = responder(payload, len(calls))
            return {'content': '', 'finish_reason': 'tool_calls', 'tool_calls': [{'type': 'function',
                    'function': {'name': kwargs['tools'][0]['function']['name'], 'arguments': json.dumps(result)}}]}
        out = io.StringIO(); history_path = self.root / 'session.json'
        route = SimpleNamespace(skill_id='custom-sum', admission={'action': 'use', 'skill_id': 'custom-sum', 'use_default_rules': use_defaults})
        with patch('dsh_modules.personal_skill_workflow.CUSTOM_SKILL_DIR', self.root / 'skills'), \
             patch('dsh_modules.personal_skill_workflow.WORKSPACE_DIR', self.root), \
             patch('dsh_modules.personal_skill_gate.call_model_proxy', side_effect=model), redirect_stdout(out):
            handled = try_run_personal_workflow(route, [self.source.name], request or self.request,
                history_path, [], time.time(), time.monotonic() + 60, model='test-model')
        if not handled:
            return None, None, calls, route
        history = json.loads(history_path.read_text()); answer = history[-1]
        archive = json.loads(history_path.with_suffix('.evidence.json').read_text())
        metrics = json.loads(extract_dsh_markers(out.getvalue(), 'METRICS')[0][0])
        return answer, archive, calls, metrics

    def accept(self, payload):
        return {'status': 'accept', 'evidence_id': payload['execution']['evidence_id'],
                'covered': [r['id'] for r in payload['proposal']['requirements']], 'reason': '', 'question': ''}

    def test_implicit_match_uses_full_scope_then_having_and_exact_boundary(self):
        result, archive, calls, metrics = self.invoke(lambda p, _: self.accept(p) if 'execution' in p else self.proposal())
        self.assertTrue(result['verification']['verified'])
        self.assertIn('| A | 700 | 3 |', result['content'])
        self.assertIn('| 部门编号 | 金额合计 (K)', result['content'])
        self.assertNotIn('| B |', result['content']); self.assertNotIn('| C |', result['content'])
        data = archive['receipts'][-1]['data']
        self.assertEqual(data['stages']['where_rows'], 5)
        self.assertEqual(data['stages']['having_groups_count'], 1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(metrics['llmInvocations'], 2)

    def test_unsupported_aggregate_projection_is_replanned_before_execution(self):
        def responder(payload, attempt):
            if attempt == 1:
                proposal = self.proposal()
                proposal['query']['fields'] = ['部门编号', 'amount']
                return proposal
            if attempt == 2:
                self.assertIn('删除fields', payload['repair_feedback']['error'])
                return self.proposal()
            return self.accept(payload)
        answer, archive, calls, metrics = self.invoke(responder)
        self.assertTrue(answer['verification']['verified'])
        self.assertEqual(len(calls), 3)
        self.assertEqual(sum(r['status'] == 'success' for r in archive['receipts']), 1)

    def test_review_rejects_unrequested_filter_and_replans_from_original_request(self):
        def responder(p, n):
            if n == 1:
                return self.proposal(filters=True)
            if n == 2:
                return {**self.accept(p), 'status': 'revise', 'reason': '用户未要求排除WBS'}
            if n == 3:
                self.assertIn('用户未要求排除WBS', p['repair_feedback']['review']['reason'])
                return self.proposal()
            return self.accept(p)
        answer, archive, calls, _ = self.invoke(responder)
        self.assertTrue(answer['verification']['verified'])
        self.assertIn('| A | 700 | 3 |', answer['content'])
        self.assertEqual([r['status'] for r in archive['receipts']], ['partial', 'success'])
        self.assertEqual(len(answer['verification']['evidence_ids']), 1)
        self.assertEqual(len(calls), 4)

    def test_repeated_review_failure_cannot_claim_completion_or_publish_old_table(self):
        def responder(p, _):
            return {**self.accept(p), 'status': 'revise', 'reason': '阈值未满足'} if 'execution' in p else self.proposal()
        answer, archive, calls, _ = self.invoke(responder)
        self.assertFalse(answer['verification']['verified'])
        self.assertNotIn('| A |', answer['content']); self.assertEqual(len(calls), 4)
        self.assertFalse(archive['verified'])

    def test_units_are_converted_before_having(self):
        answer, archive, _, _ = self.invoke(lambda p, _: self.accept(p) if 'execution' in p else self.proposal(500000, unit='元'))
        self.assertTrue(answer['verification']['verified'])
        self.assertIn('| A | 700000 | 3 |', answer['content'])
        self.assertNotIn('| B |', answer['content'])

    def test_empty_result_is_valid_without_fabricating_a_group(self):
        answer, archive, _, _ = self.invoke(lambda p, _: self.accept(p) if 'execution' in p else self.proposal(1000))
        self.assertTrue(answer['verification']['verified'])
        self.assertIn('没有符合条件', answer['content'])
        self.assertEqual(archive['receipts'][-1]['data']['rows'], [])

    def test_explicit_skill_preserves_saved_filters_for_transient_query(self):
        original_plan = (self.root / 'skills/custom-sum/references/workflow.json').read_bytes()
        answer, _, _, _ = self.invoke(lambda p, _: self.accept(p) if 'execution' in p else self.proposal(filters=True),
                                     '用custom-sum，' + self.request, use_defaults=True)
        self.assertTrue(answer['verification']['verified'])
        self.assertIn('| A | 600 | 2 |', answer['content'])
        self.assertEqual(original_plan, (self.root / 'skills/custom-sum/references/workflow.json').read_bytes())

    def test_accept_with_missing_coverage_cannot_mark_task_verified(self):
        def responder(p, _):
            return {**self.accept(p), 'covered': ['group']} if 'execution' in p else self.proposal()
        answer, _, calls, _ = self.invoke(responder)
        self.assertFalse(answer['verification']['verified']); self.assertEqual(len(calls), 4)

    def test_clarification_does_not_execute_or_report_completion(self):
        answer, _, calls, metrics = self.invoke(lambda p, _: {'mode': 'clarify', 'requirements': [],
            'query': None, 'question': '请明确金额单位'})
        self.assertFalse(answer['verification']['verified']); self.assertIn('请明确金额单位', answer['content'])
        self.assertEqual(len(calls), 1); self.assertEqual(metrics['toolCallsCount'], 0)

    def test_implicit_match_cannot_silently_execute_saved_business_rules(self):
        def responder(p, _):
            return {'mode': 'saved', 'requirements': [{'id': 'r', 'quote': '部门编号', 'target': '/saved'}],
                    'query': None, 'question': ''}
        answer, archive, calls, metrics = self.invoke(responder)
        self.assertFalse(answer['verification']['verified']); self.assertEqual(metrics['toolCallsCount'], 0)
        self.assertEqual(len(calls), 2)

    def test_fake_quote_missing_binding_and_fake_evidence_do_not_pass(self):
        context = {'request': self.request, 'user_history': [], 'use_saved_rules': False}
        proposal = self.proposal(); proposal['requirements'][0]['quote'] = '不存在的原话'
        with self.assertRaises(ValueError): validate_proposal(proposal, context)
        proposal = self.proposal(); proposal['requirements'][0]['target'] = '/no_such_field'
        with self.assertRaises(ValueError): validate_proposal(proposal, context)
        def responder(p, _):
            return {**self.accept(p), 'evidence_id': 'invented'} if 'execution' in p else self.proposal()
        answer, _, _, _ = self.invoke(responder)
        self.assertFalse(answer['verification']['verified'])

    def test_source_mutated_during_review_is_rejected(self):
        def responder(p, _):
            if 'execution' not in p:
                return self.proposal()
            book = openpyxl.load_workbook(self.source); book.active['C2'] = 9999; book.save(self.source); book.close()
            return self.accept(p)
        answer, _, calls, _ = self.invoke(responder)
        self.assertFalse(answer['verification']['verified']); self.assertEqual(len(calls), 2)

    def test_gate_unavailable_never_falls_back_to_successful_fixed_execution(self):
        def responder(p, _): raise TimeoutError('model unavailable')
        answer, _, calls, metrics = self.invoke(responder)
        self.assertFalse(answer['verification']['verified']); self.assertEqual(len(calls), 2)
        self.assertEqual(metrics['toolCallsCount'], 0)

    def test_irrelevant_candidate_falls_back_without_business_rule_context(self):
        result, _, _, route = self.invoke(lambda p, _: {'mode': 'fallback', 'requirements': [], 'query': None, 'question': ''})
        self.assertIsNone(result); self.assertIsNone(route.skill_id)
        self.assertFalse(route.requires_execution)


if __name__ == '__main__': unittest.main()
