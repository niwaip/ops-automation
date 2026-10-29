"""Summary cost and receipt-owned completion regressions, without model calls."""
import io
from contextlib import redirect_stdout
from unittest.mock import patch
import tempfile
import unittest

from dsh_modules.summary_context import build_summary_messages
from dsh_modules.tool_result import ToolResult
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules import agent_loop


class SummaryDeliveryTests(unittest.TestCase):
    def test_summary_input_excludes_system_prompt_and_bounds_tool_history(self):
        messages = [{'role': 'system', 'content': 'old-system-secret' * 10000}]
        messages += [{'role': 'tool', 'content': 'x' * 50000} for _ in range(30)]
        receipt = ToolResult.success(data={'status': 'published', 'summary': '更新11项',
                   'warnings': ['保留旧预测2.87059 K'], 'published_file': 'result.xlsx'})
        compact = build_summary_messages('本轮用户要求', messages, [receipt])
        self.assertEqual(len(compact), 2)
        self.assertLess(sum(len(m['content']) for m in compact), 22000)
        self.assertNotIn('old-system-secret', str(compact))
        self.assertIn('保留旧预测2.87059 K', str(compact))
        self.assertNotIn('x' * 100, str(compact))

    def test_native_published_receipt_finishes_before_another_model_summary(self):
        reply = {'content': '', 'tool_calls': [{'id': '1', 'type': 'function',
                 'function': {'name': 'execute_spreadsheet_update', 'arguments': '{"plan_id":"p1"}'}}]}
        receipt = ToolResult.success(data={'status': 'published', 'published_file': 'result.xlsx'},
                                     provenance={'tool': 'execute_spreadsheet_update'})
        def dispatch(*a, **kwargs):
            kwargs['execution_evidence'].append(receipt)
            kwargs['outbound_files'].append('{"filePath":"result.xlsx","fileName":"result.xlsx"}')
            return False
        with tempfile.TemporaryDirectory() as root, \
             patch.object(agent_loop, 'WORKSPACE_DIR', root), \
             patch.object(agent_loop, 'call_model_proxy', return_value=reply) as model, \
             patch.object(agent_loop, '_dispatch_tool_calls', side_effect=dispatch), \
             patch('dsh_modules.spreadsheet_update.presentation.render_published_update', return_value='核验通过，保留旧预测2.87059 K。'), \
             patch.object(agent_loop, '_finalize_agent_text', side_effect=AssertionError('no second finalization')), \
             redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop([{'role': 'system', 'content': ''}, {'role': 'user', 'content': '更新工作簿'}],
                model='test', policy=RuntimePolicy(), max_rounds=3, tools=[])
        self.assertEqual(model.call_count, 1)
        self.assertIn('保留旧预测2.87059 K', result.final_text)
        self.assertEqual(len(result.outbound_files), 1)
        self.assertTrue(any(g['guard']=='answer_delivery' and g['action']=='receipt_owned' for g in result.telemetry.guard_decisions))


if __name__ == '__main__': unittest.main()
