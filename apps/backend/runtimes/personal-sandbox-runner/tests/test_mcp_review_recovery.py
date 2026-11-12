"""One bounded supplemental read and one quote repair; no write recovery or hidden retry."""
import time
import unittest
from unittest.mock import patch
from dsh_modules import mcp_runtime as runtime
from dsh_modules.mcp_answer_review import review_mcp_answer
from dsh_modules.mcp_review_sources import source_id
from dsh_modules.mcp_review_recovery import supplement_document
from dsh_modules.model_failures import ModelRepetitionLoopError
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult, TextToolOutput

URL = 'https://docs.example/vpn'
QUOTE = 'Create a virtual network before creating the gateway.'


class McpReviewRecoveryTests(unittest.TestCase):
    def setUp(self):
        runtime._contracts.clear()
        runtime._indexes.clear()
        runtime.configure_steps('mcp-one')
        runtime.remember_contract({'id': 'search', 'name': 'search', 'effect': 'read',
                                  'inputSchema': {}, 'contractToken': 'private'}, 'mcp-one')
        runtime.consume_contract('search')
        self.evidence = [ToolResult.success(data={'result': {'results': [
            {'title': 'VPN guide', 'contentUrl': URL, 'content': 'A short overview of gateway configuration.'}]}},
            provenance={'tool': 'call_external_tool', 'binding_id': 'search', 'invocation_id': 'search-receipt', 'skill_id': 'mcp-one'})]
        runtime.remember_index('mcp-one', [{'id': 'fetch', 'name': 'fetch_page', 'effect': 'read'}])
        self.stats = TelemetryStats()

    def gateway(self, name, params, deadline=None):
        if name == 'list_external_tools':
            safe = runtime.remember_contract({'id': 'fetch', 'name': 'fetch_page', 'effect': 'read', 'contractToken': 'private',
                'inputSchema': {'type': 'object', 'properties': {'url': {'type': 'string'}}, 'required': ['url']}}, 'mcp-one')
            return ToolResult.success(data=safe, provenance={'tool': name})
        self.assertEqual(params, {'binding_id': 'fetch', 'arguments': {'url': URL}})
        runtime.consume_contract('fetch')
        return runtime.render_mcp_response({'status': 'completed', 'invocationId': 'fetch-receipt',
            'result': {'content': [{'type': 'text', 'text': '# VPN Guide\n\n' + QUOTE}]}}, 'fetch', {'url': URL})

    def test_zero_initial_claims_reads_one_document_and_repairs_with_real_provenance(self):
        verdicts = [{'claims': []}, {'claims': [{'statement': '先创建虚拟网络。', 'source_id': source_id(URL), 'quote': QUOTE}]}]
        with patch('dsh_modules.mcp_answer_review.structured_decision', side_effect=verdicts) as review, \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool', side_effect=self.gateway) as network:
            answer = review_mcp_answer('unverified draft', 'VPN', self.evidence, 'model', None,
                                      self.stats, None, readonly_skill_id='mcp-one')
        self.assertIn('先创建虚拟网络', answer)
        self.assertEqual(review.call_count, 2)
        self.assertEqual(network.call_count, 2)  # one disclosure and one read
        self.assertEqual(len(self.evidence), 3)
        self.assertEqual(self.stats.tool_invocations, 2)
        accepted = self.stats.guard_decisions[-1]['reason']
        self.assertEqual(accepted['attempt'], 2)
        self.assertEqual(accepted['claims'][0]['invocationId'], 'fetch-receipt')
        self.assertIn('empty_claims', review.call_args_list[1].args[1]['previous_rejections']['rejection_counts'])
        self.assertNotIn('excerpt', review.call_args_list[1].args[1]['sources'][0])
        self.assertIn('spans', review.call_args_list[1].args[1]['sources'][0])

    def test_two_empty_reviews_stop_without_repeating_the_read(self):
        with patch('dsh_modules.mcp_answer_review.structured_decision', return_value={'claims': []}) as review, \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool', side_effect=self.gateway) as network:
            answer = review_mcp_answer('unsupported', 'VPN', self.evidence, 'model', None,
                                      self.stats, None, readonly_skill_id='mcp-one')
        self.assertIn('未完成', answer)
        self.assertNotIn('unsupported', answer)
        self.assertEqual(review.call_count, 2)
        self.assertEqual(network.call_count, 2)

    def test_write_or_unknown_disclosed_contract_never_executes(self):
        for effect in ('write', 'unknown'):
            def changed(name, params, deadline=None):
                safe = runtime.remember_contract({'id': 'fetch', 'name': 'fetch_page', 'effect': effect,
                    'inputSchema': {'properties': {'url': {'type': 'string'}}}, 'contractToken': 'private'}, 'mcp-one')
                return ToolResult.success(data=safe)
            with patch('dsh_modules.mcp_answer_review.structured_decision', return_value={'claims': []}), \
                 patch('dsh_modules.mcp_review_recovery.execute_mcp_tool', side_effect=changed) as network:
                review_mcp_answer('draft', 'VPN', list(self.evidence), 'model', None, TelemetryStats(), None, readonly_skill_id='mcp-one')
            self.assertEqual([c.args[0] for c in network.call_args_list], ['list_external_tools'])

    def test_non_admitted_query_and_existing_full_page_do_not_trigger_network_recovery(self):
        with patch('dsh_modules.mcp_answer_review.structured_decision', return_value={'claims': []}), \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool') as network:
            review_mcp_answer('draft', 'VPN', self.evidence, 'model', None, self.stats, None)
            network.assert_not_called()
        self.evidence.append(ToolResult.success(data={'result': {'title': 'VPN', 'url': URL, 'content': QUOTE}},
            provenance={'tool': 'call_external_tool', 'binding_id': 'fetch', 'invocation_id': 'prior-fetch', 'skill_id': 'mcp-one'}))
        with patch('dsh_modules.mcp_answer_review.structured_decision', return_value={'claims': []}), \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool') as network:
            review_mcp_answer('draft', 'VPN', self.evidence, 'model', None, self.stats, None, readonly_skill_id='mcp-one')
            network.assert_not_called()

    def test_exhausted_budget_stops_before_model_or_tool_calls(self):
        with patch('dsh_modules.mcp_answer_review.structured_decision') as review, \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool') as network:
            answer = review_mcp_answer('draft', 'VPN', self.evidence, 'model', None, self.stats, time.monotonic() - 1, readonly_skill_id='mcp-one')
        review.assert_not_called()
        network.assert_not_called()
        self.assertIn('未完成', answer)

    def test_model_stream_termination_keeps_its_cause_without_retry_or_supplement(self):
        with patch('dsh_modules.mcp_answer_review.structured_decision', side_effect=ModelRepetitionLoopError()) as review, \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool') as network:
            answer = review_mcp_answer('draft', 'VPN', self.evidence, 'model', None, self.stats, None, readonly_skill_id='mcp-one')
        self.assertIn('重复输出', answer)
        self.assertEqual(review.call_count, 1)
        network.assert_not_called()

    def test_failed_supplement_is_not_retried_and_repair_still_has_a_finite_budget(self):
        failed = ToolResult.error('MCP_ACCESS_DENIED', 'denied')
        with patch('dsh_modules.mcp_answer_review.structured_decision', return_value={'claims': []}) as review, \
             patch('dsh_modules.mcp_review_recovery.execute_mcp_tool', return_value=failed) as network:
            review_mcp_answer('draft', 'VPN', self.evidence, 'model', None, self.stats, None, readonly_skill_id='mcp-one')
        self.assertEqual(review.call_count, 2)
        self.assertEqual(network.call_count, 1)
        deadlines = [c.args[6] for c in review.call_args_list]
        self.assertLessEqual(max(deadlines) - time.monotonic(), 40)
