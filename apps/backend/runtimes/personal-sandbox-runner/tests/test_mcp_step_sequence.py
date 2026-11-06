"""Subsequent disclosures must bind the next read, even after a successful search."""
import json
import time
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError
from dsh_modules import mcp_runtime as runtime
from dsh_modules.mcp_execution import McpExecutionGate
from dsh_modules.mcp_tools import execute_mcp_tool
from dsh_modules.tool_result import ToolResult
from dsh_modules.tools import get_sandbox_tools


class McpStepSequenceTests(unittest.TestCase):
    def setUp(self):
        runtime._contracts.clear()
        runtime.configure_steps(None)
        self.gate = McpExecutionGate('mcp-one')
        self.tools = get_sandbox_tools(allowed_names={'read_skill', 'list_external_tools', 'call_external_tool'})

    def disclose(self, name, effect='read'):
        runtime.remember_contract({'id': name, 'name': name, 'effect': effect,
            'inputSchema': {'type': 'object', 'properties': {'url': {'type': 'string'}}},
            'contractToken': 'private'}, 'mcp-one')

    def test_success_then_fetch_disclosure_constrains_and_blocks_old_binding(self):
        self.disclose('search')
        runtime.consume_contract('search')
        completed = ToolResult.success(data={}, provenance={'tool': 'call_external_tool', 'binding_id': 'search'})
        self.disclose('fetch')
        tools, choice = self.gate.select(self.tools, [completed])
        self.assertEqual(choice['function']['name'], 'call_external_tool')
        self.assertEqual(tools[0]['function']['parameters']['properties']['binding_id']['enum'], ['fetch'])
        with patch('dsh_modules.mcp_tools.urlopen') as network:
            blocked = execute_mcp_tool('call_external_tool', {'binding_id': 'search', 'arguments': {'query': 'repeat'}})
        self.assertTrue(blocked.is_error)
        self.assertEqual(blocked.error_code, 'MCP_STEP_MISMATCH')
        network.assert_not_called()
        self.assertEqual(runtime.pending_contract()['id'], 'fetch')

    def test_transport_failure_consumes_step_and_never_forces_automatic_retry(self):
        self.disclose('fetch')
        with patch('dsh_modules.mcp_tools.urlopen', side_effect=URLError('unavailable')):
            failed = execute_mcp_tool('call_external_tool', {'binding_id': 'fetch', 'arguments': {'url': 'https://docs.example/page'}})
        self.assertTrue(failed.is_error)
        self.assertIsNone(runtime.pending_contract())
        self.assertIsNone(self.gate.select(self.tools, [failed.tool_result])[1])

    def test_parallel_calls_cannot_repeat_or_switch_binding_inside_one_forced_step(self):
        self.disclose('search')
        runtime.consume_contract('search')
        self.disclose('fetch')
        self.gate.select(self.tools, [])
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'status': 'completed', 'invocationId': 'one',
            'result': {'content': [{'type': 'text', 'text': '# VPN\nActual page content.'}]}}).encode()
        with patch('dsh_modules.mcp_tools.urlopen', return_value=response) as network:
            first = execute_mcp_tool('call_external_tool', {'binding_id': 'fetch', 'arguments': {'url': 'https://docs.example/vpn'}})
            repeated = execute_mcp_tool('call_external_tool', {'binding_id': 'fetch', 'arguments': {'url': 'https://docs.example/vpn'}})
            switched = execute_mcp_tool('call_external_tool', {'binding_id': 'search', 'arguments': {'query': 'again'}})
        self.assertTrue(first.is_success)
        self.assertEqual(repeated.error_code, 'MCP_STEP_ALREADY_ATTEMPTED')
        self.assertEqual(switched.error_code, 'MCP_STEP_MISMATCH')
        network.assert_called_once()

    def test_write_unknown_pending_confirmation_and_foreign_skill_are_not_forced(self):
        for effect in ('write', 'unknown'):
            self.disclose('operation', effect)
            self.assertIsNone(self.gate.select(self.tools, [])[1])
        self.disclose('fetch')
        pending = ToolResult.partial(data={}, provenance={'tool': 'call_external_tool', 'mcp_status': 'awaiting_confirmation'})
        self.assertIsNone(self.gate.select(self.tools, [pending])[1])
        runtime.remember_contract({'id': 'foreign', 'name': 'foreign', 'effect': 'read', 'inputSchema': {}, 'contractToken': 'private'}, 'mcp-two')
        self.assertEqual(runtime.pending_contract('mcp-one')['id'], 'fetch')

    def test_expired_latest_disclosure_does_not_reactivate_an_older_step(self):
        self.disclose('search')
        self.disclose('fetch')
        runtime._contracts['fetch']['_until'] = time.monotonic() - 1
        self.assertIsNone(runtime.pending_contract())
