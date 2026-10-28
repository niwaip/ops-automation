"""Count one proxy completion once across auxiliary and response telemetry layers."""
import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from dsh_modules.llm import call_model_proxy
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats


class StreamResponse:
    def __enter__(self):
        return iter([
            b'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":16524,"completion_tokens":217,"total_tokens":16741}}\n',
            b'data: [DONE]\n',
        ])

    def __exit__(self, *args):
        pass


class LlmAccountingTests(unittest.TestCase):
    def test_salvage_response_adds_observability_without_double_counting(self):
        stats = TelemetryStats()
        with patch('urllib.request.urlopen', return_value=StreamResponse()) as network, redirect_stdout(io.StringIO()):
            response = call_model_proxy([{'role': 'user', 'content': 'aggregate'}], model='test',
                policy=RuntimePolicy(), purpose='chart_salvage', stream_deltas=False, telemetry=stats)
        stats.record_llm_response(response, purpose='chart_salvage', is_first_round=True)
        stats.record_llm_response(response, purpose='chart_salvage')
        self.assertEqual(network.call_count, 1)
        self.assertEqual(stats.llm_invocations, 1)
        self.assertEqual(stats.auxiliary_invocations, 1)
        self.assertEqual(stats.tokens['total_tokens'], 16741)
        self.assertAlmostEqual(stats.total_ms, response['total_ms'], places=2)
        self.assertEqual(stats.ttft_ms, response['ttft_ms'])
        metrics = json.loads(stats.to_metrics_json())
        self.assertEqual(len(metrics['callsLedger']), 1)
        self.assertEqual(metrics['callsLedger'][0]['call_id'], response['call_id'])
        self.assertEqual(metrics['callsLedger'][0]['model'], 'test')
        self.assertEqual(metrics['roundFinishReasons'], ['tool_calls'])
        self.assertEqual(len(metrics['modelResponses']), 1)

    def test_equal_usage_and_shared_parent_span_are_distinct_calls(self):
        stats = TelemetryStats()
        with patch('urllib.request.urlopen', side_effect=lambda *a, **kw: StreamResponse()), redirect_stdout(io.StringIO()):
            responses = [call_model_proxy([{'role': 'user', 'content': 'aggregate'}],
                policy=RuntimePolicy(), purpose='chart_salvage', parent_span_id='same-parent',
                stream_deltas=False, telemetry=stats) for _ in range(2)]
        for response in responses:
            stats.record_llm_response(response, purpose='chart_salvage')
        self.assertNotEqual(responses[0]['call_id'], responses[1]['call_id'])
        self.assertEqual(stats.llm_invocations, 2)
        self.assertEqual(stats.auxiliary_invocations, 2)
        self.assertEqual(stats.tokens['total_tokens'], 33482)
        self.assertEqual(len(stats.calls_ledger), 2)
        self.assertEqual(len(stats.model_responses), 2)

    def test_legacy_responses_without_ids_are_not_deduplicated_by_usage(self):
        stats = TelemetryStats()
        response = {'usage': {'total_tokens': 42}, 'total_ms': 100, 'finish_reason': 'stop'}
        stats.record_llm_response(response)
        stats.record_llm_response(response)
        self.assertEqual(stats.llm_invocations, 2)
        self.assertEqual(stats.tokens['total_tokens'], 84)
        self.assertEqual(stats.total_ms, 200)
