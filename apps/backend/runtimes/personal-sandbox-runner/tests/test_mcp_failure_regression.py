"""Regression for the 10:27 failure: Skill read succeeded, second model stream broke."""
import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch
from urllib.error import URLError
from dsh_modules.agent_loop import run_agent_loop
from dsh_modules.llm import call_model_proxy, ModelRepetitionLoopError
from dsh_modules.mcp_execution import McpExecutionGate
from dsh_modules.mcp_sources import finalize_mcp_sources
from dsh_modules import mcp_runtime
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult, TextToolOutput
from dsh_modules.tools import get_sandbox_tools
from dsh_modules.mcp_tools import execute_mcp_tool
from dsh_modules.tool_result import adapt_tool_output


class Response:
    def __init__(self, *frames):
        self.frames = [b'data: ' + json.dumps(f).encode() + b'\n' for f in frames]

    def __enter__(self):
        return iter(self.frames + [b'data: [DONE]\n'])

    def __exit__(self, *args):
        pass


class McpFailureRegression(unittest.TestCase):
    def setUp(self):
        mcp_runtime._contracts.clear()
        self.tools = get_sandbox_tools(allowed_names={'read_skill', 'list_external_tools', 'call_external_tool'})

    def test_skill_read_then_repetition_preserves_cause_and_counts_both_requests(self):
        first = Response({'choices': [{'delta': {'tool_calls': [{'index': 0, 'id': 'call-one', 'function': {
            'name': 'read_skill', 'arguments': json.dumps({'skill_name': 'mcp-selected'})}}]}, 'finish_reason': 'tool_calls'}],
            'usage': {'prompt_tokens': 2124, 'completion_tokens': 62, 'total_tokens': 2186}})
        second = Response({'error': {'code': 'MODEL_REPETITION', 'details': {
            'target': 'content', 'patternLength': 65, 'repeatCount': 3, 'patternSha256': 'a' * 64}}})
        stats = TelemetryStats()
        skill = TextToolOutput('selected Skill index', ToolResult.success(data='index', provenance={'tool': 'read_skill'}))
        with patch('urllib.request.urlopen', side_effect=[first, second]) as network, \
             patch('dsh_modules.agent_loop.execute_tool', return_value=skill), redirect_stdout(io.StringIO()):
            result = run_agent_loop([{'role': 'user', 'content': '使用指定MCP查询VPN'}], 'default', RuntimePolicy(),
                5, tools=self.tools, telemetry=stats, mcp_readonly_skill_id='mcp-selected')
        self.assertEqual(result.stop_reason, 'MODEL_REPETITION')
        final = finalize_mcp_sources(result.final_text, result.execution_evidence, selected=True, stop_reason=result.stop_reason)
        self.assertIn('模型重复输出', final)
        self.assertNotIn('检查连接', final)
        self.assertEqual(stats.llm_invocations, 2)
        self.assertEqual(stats.calls_ledger[-1]['error_code'], 'MODEL_REPETITION')
        self.assertEqual(stats.finish_reason, 'MODEL_REPETITION')
        self.assertFalse(stats.calls_ledger[-1]['usageKnown'])
        self.assertFalse(json.loads(stats.to_metrics_json())['tokenUsageComplete'])
        self.assertEqual(stats.tokens['total_tokens'], 2186)
        self.assertEqual([x['name'] for x in stats.tool_calls_detail], ['read_skill'])
        payloads = [json.loads(c.args[0].data) for c in network.call_args_list]
        self.assertEqual(payloads[1]['tool_choice']['function']['name'], 'list_external_tools')
        self.assertEqual(len(payloads[1]['tools']), 1)

    def test_timeout_is_accounted_without_making_up_token_usage(self):
        stats = TelemetryStats()
        with patch('urllib.request.urlopen', side_effect=TimeoutError()), self.assertRaises(TimeoutError):
            call_model_proxy([{'role': 'user', 'content': 'query'}], telemetry=stats)
        self.assertEqual(stats.llm_invocations, 1)
        self.assertGreater(stats.total_ms, 0)
        self.assertEqual(stats.tokens, {})
        self.assertEqual(stats.calls_ledger[0]['error_code'], 'MODEL_REQUEST_TIMEOUT')

    def test_termination_is_not_replaced_even_with_prior_successful_evidence(self):
        evidence = [ToolResult.success(data={'status': 'completed'}, provenance={'tool': 'call_external_tool'})]
        self.assertIn('时间上限', finalize_mcp_sources('draft', evidence, selected=True, stop_reason='MODEL_GENERATION_BUDGET'))
        self.assertNotIn('检查连接', finalize_mcp_sources('draft', [], selected=True))

    def test_contract_disclosure_is_scoped_and_does_not_inflate_the_catalog(self):
        gate = McpExecutionGate('mcp-selected')
        tools, choice = gate.select(self.tools, [])
        self.assertEqual(choice['function']['name'], 'read_skill')
        self.assertEqual(tools[0]['function']['parameters']['properties']['skill_name']['enum'], ['mcp-selected'])
        read = ToolResult.success(data='index', provenance={'tool': 'read_skill'})
        mcp_runtime.remember_contract({'id': 'other', 'inputSchema': {}, 'contractToken': 'private'}, 'mcp-other')
        tools, choice = gate.select(self.tools, [read])
        self.assertEqual(choice['function']['name'], 'list_external_tools')
        self.assertIn('tool_name', tools[0]['function']['parameters']['required'])
        mcp_runtime.remember_contract({'id': 'selected', 'inputSchema': {}, 'contractToken': 'private', 'effect': 'read'}, 'mcp-selected')
        tools, choice = gate.select(self.tools, [read])
        self.assertEqual(choice['function']['name'], 'call_external_tool')
        self.assertEqual(tools[0]['function']['parameters']['properties']['binding_id']['enum'], ['selected'])
        self.assertNotIn('private', json.dumps(tools))

    def test_completed_failed_pending_and_unadmitted_write_tasks_are_not_forced(self):
        gate = McpExecutionGate('mcp-selected')
        for receipt in [ToolResult.success(data={}, provenance={'tool': 'call_external_tool'}),
                        ToolResult.error('failed', provenance={'tool': 'list_external_tools'}),
                        ToolResult.partial(data={}, provenance={'tool': 'call_external_tool', 'mcp_status': 'awaiting_confirmation'})]:
            self.assertIsNone(gate.select(self.tools, [receipt])[1])
        self.assertIsNone(McpExecutionGate().select(self.tools, [])[1])

    def test_disclosed_input_schema_is_reused_and_invalid_arguments_do_not_reach_network(self):
        schema = {'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}
        mcp_runtime.remember_contract({'id': 'selected', 'inputSchema': schema, 'contractToken': 'private', 'effect': 'read'}, 'mcp-selected')
        tools, _ = McpExecutionGate('mcp-selected').select(self.tools, [])
        self.assertEqual(tools[0]['function']['parameters']['properties']['arguments'], schema)
        with patch('dsh_modules.mcp_tools.urlopen') as network:
            result = execute_mcp_tool('call_external_tool', {'binding_id': 'selected', 'arguments': ''})
        self.assertTrue(adapt_tool_output(result).is_error)
        self.assertEqual(result.error_code, 'MCP_ARGUMENTS_INVALID')
        network.assert_not_called()

    def test_bridge_transport_failure_is_typed_and_cannot_be_counted_as_success(self):
        with patch('dsh_modules.mcp_tools.urlopen', side_effect=URLError('secret upstream detail')):
            result = execute_mcp_tool('list_external_tools', {'skill_id': 'mcp-selected'})
        self.assertTrue(adapt_tool_output(result).is_error)
        self.assertEqual(result.error_code, 'MCP_TRANSPORT_UNCONFIRMED')
        self.assertNotIn('secret', str(result))
        self.assertIn('通信未完成', finalize_mcp_sources('draft', [result.tool_result], selected=True))
        self.assertNotIn('检查连接', finalize_mcp_sources('draft', [result.tool_result], selected=True))


if __name__ == '__main__':
    unittest.main()
