"""Distinguish an upstream stop, transport EOF, and content cleanup without logging content."""
import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from dsh_modules.llm import call_model_proxy
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats


class StreamResponse:
    def __init__(self, frames):
        self.frames = frames

    def __enter__(self):
        return iter(self.frames)

    def __exit__(self, *args):
        pass


class ResponseObservabilityTests(unittest.TestCase):
    def test_stream_termination_source_is_not_inferred_as_upstream_stop(self):
        content = b'data: {"choices":[{"delta":{"content":"answer"}}]}\n'
        stop = b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'
        done = b'data: [DONE]\n'
        for frames, reason, source, received_done in [
            ([content, stop, done], "stop", "upstream", True),
            ([content, done], "stop", "done_fallback", True),
            ([content], "stream_closed_prematurely", "stream_closed", False),
        ]:
            with self.subTest(source=source), patch("urllib.request.urlopen", return_value=StreamResponse(frames)), redirect_stdout(io.StringIO()):
                result = call_model_proxy([{"role": "user", "content": "test"}], policy=RuntimePolicy(), stream_deltas=False)
            self.assertEqual(result["finish_reason"], reason)
            self.assertEqual(result["finish_reason_source"], source)
            self.assertIs(result["received_done"], received_done)

    def test_cleanup_loss_is_visible_without_persisting_raw_response(self):
        stats = TelemetryStats()
        raw = '今日新闻速览\n<tool_call>{"name":"web_search","arguments":{"query":"private-query"}}</tool_call>'
        stats.record_llm_response({"content": raw, "finish_reason": "stop", "received_done": True,
                                   "finish_reason_source": "upstream"})
        data = json.loads(stats.to_metrics_json())
        response = data["modelResponses"][0]
        self.assertGreater(response["rawChars"], response["cleanChars"])
        self.assertNotEqual(response["rawSha256"], response["cleanSha256"])
        self.assertNotIn("private-query", stats.to_metrics_json())
        self.assertEqual(response["finishReasonSource"], "upstream")
        self.assertTrue(response["receivedDone"])


if __name__ == "__main__":
    unittest.main()
