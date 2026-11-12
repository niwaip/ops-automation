import json
import unittest
from unittest.mock import patch
from dsh_modules import mcp_runtime
from dsh_modules.mcp_tools import execute_mcp_tool
from dsh_modules.mcp_sources import finalize_mcp_sources
from dsh_modules.tool_result import ToolResult


class McpOptimizationTests(unittest.TestCase):
    def setUp(self):
        mcp_runtime._contracts.clear()

    def test_contract_is_required_before_any_network_call(self):
        with patch('dsh_modules.mcp_tools.urlopen') as call:
            result = json.loads(execute_mcp_tool('call_external_tool', {'binding_id': 'guessed', 'arguments': {}}))
        self.assertEqual(result['code'], 'MCP_CONTRACT_REQUIRED')
        call.assert_not_called()

    def test_receipt_is_kept_out_of_model_text(self):
        safe = mcp_runtime.remember_contract({'id': 'binding', 'inputSchema': {}, 'contractToken': 'signed'})
        self.assertNotIn('contractToken', safe)
        self.assertEqual(mcp_runtime.contract_for('binding')['contractToken'], 'signed')

    def test_documents_are_deduplicated_bounded_and_attributed(self):
        docs = [{'title': 'Gateway', 'contentUrl': 'https://docs.example/guide#one', 'content': 'x' * 20000},
                {'title': 'Gateway', 'contentUrl': 'https://docs.example/guide#two', 'content': 'other'}]
        value = {'status': 'completed', 'invocationId': 'receipt', 'result': {
            'structuredContent': {'results': docs}, 'content': [{'type': 'text', 'text': json.dumps({'results': docs})}]}}
        result = mcp_runtime.render_mcp_response(value, 'binding')
        self.assertTrue(result.tool_result.is_success)
        self.assertLess(len(result), 3000)
        self.assertEqual(len(result.tool_result.provenance['sources']), 1)
        footer = finalize_mcp_sources('answer\n---\n### 📚 资料与引用来源\n- unrelated.pdf', [result.tool_result], selected=True)
        self.assertIn('https://docs.example/guide#one', footer)
        self.assertNotIn('unrelated', footer)
        self.assertIn('不代表已阅读全文', footer)

    def test_failed_or_fabricated_results_cannot_supply_sources(self):
        failed = ToolResult.error('timeout', provenance={'tool': 'call_external_tool', 'sources': [{'url': 'https://bad.example'}]})
        self.assertNotIn('bad.example', finalize_mcp_sources('already configured', [failed], selected=True))
        self.assertIn('未取得成功', finalize_mcp_sources('already configured', [], selected=True))

    def test_generic_success_without_document_urls_is_not_fabricated_as_a_citation(self):
        value = {'status': 'completed', 'invocationId': 'r', 'result': {'structuredContent': {'balance': 10}}}
        result = mcp_runtime.render_mcp_response(value, 'binding')
        self.assertEqual(finalize_mcp_sources('10', [result.tool_result]), '10')

    def test_configuration_identifiers_need_source_or_user_evidence(self):
        identifier = '11111111-2222-3333-4444-555555555555'
        ev = ToolResult.success(data={'result': 'official excerpt'}, provenance={'tool': 'call_external_tool', 'sources': [{'title': 'Docs', 'url': 'https://docs.example/guide'}]})
        self.assertNotIn(identifier, finalize_mcp_sources('Audience: ' + identifier, [ev]))
        self.assertIn(identifier, finalize_mcp_sources('Tenant: ' + identifier, [ev], prompt='My tenant is ' + identifier))

    def test_confirmation_and_tool_error_are_not_success_evidence(self):
        pending = mcp_runtime.render_mcp_response({'status': 'awaiting_confirmation', 'invocationId': 'p'}, 'binding')
        self.assertTrue(pending.tool_result.is_partial)
        self.assertIn('尚未执行', finalize_mcp_sources('done', [pending.tool_result], selected=True))
        failed = mcp_runtime.render_mcp_response({'status': 'tool_error', 'result': {'isError': True}}, 'binding')
        self.assertTrue(failed.tool_result.is_error)
        self.assertIn('未取得成功', finalize_mcp_sources('done', [failed.tool_result], selected=True))

    def test_fetched_markdown_uses_requested_resource_as_source(self):
        value = {'status': 'completed', 'invocationId': 'r', 'result': {'content': [{'type': 'text', 'text': 'Documentation site notice.\n\n# VPN Guide\n' + 'text ' * 4000}]}}
        result = mcp_runtime.render_mcp_response(value, 'binding', {'url': 'https://docs.example/tutorial'})
        self.assertEqual(result.tool_result.provenance['sources'][0]['url'], 'https://docs.example/tutorial')
        self.assertTrue(json.loads(result)['result']['truncated'])
        self.assertLess(len(result), 15000)

    def test_source_rejects_credential_and_script_urls(self):
        for url in ['javascript:alert(1)', 'https://user:pass@example.com/a', 'https://example.com/\nattack']:
            self.assertIsNone(mcp_runtime.safe_source_url(url))


if __name__ == '__main__':
    unittest.main()
