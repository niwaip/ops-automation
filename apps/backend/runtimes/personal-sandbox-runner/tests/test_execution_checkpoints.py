"""Events remain available before finalization and deterministic failures cannot spin forever."""

import json
from pathlib import Path
import sys
import tempfile
import subprocess
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult
from dsh_modules.tool_failure_recovery import repeated_execution_failure


class ExecutionCheckpointTests(unittest.TestCase):
    def test_checkpoint_survives_forced_process_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            script = ('import sys,time\n'
                      'from dsh_modules.telemetry import TelemetryStats\n'
                      't=TelemetryStats();t.bind_journal(sys.argv[1])\n'
                      't.checkpoint("tool_started", {"name":"render_pdf"})\n'
                      'print("ready",flush=True);time.sleep(30)\n')
            source = str(Path(__file__).resolve().parents[1] / 'src')
            import os
            proc = subprocess.Popen([sys.executable, '-c', script, str(Path(directory) / 'killed.json')],
                env={**os.environ, 'PYTHONPATH': source}, stdout=subprocess.PIPE, text=True)
            try:
                self.assertEqual(proc.stdout.readline().strip(), 'ready')
                proc.kill()
                proc.wait(timeout=5)
                events = [json.loads(line) for line in next(Path(directory).glob('killed.events/*.jsonl')).read_text().splitlines()]
                self.assertEqual(events[-1]['event'], 'tool_started')
                self.assertFalse((Path(directory) / 'killed.json').exists())
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=5)
                proc.stdout.close()

    def test_records_completed_calls_and_error_before_session_finalization(self):
        with tempfile.TemporaryDirectory() as directory:
            history = Path(directory) / 'session.json'
            tracker = TelemetryStats()
            tracker.bind_journal(history)
            tracker.record_llm_response({'call_id': 'one', 'total_ms': 10, 'usage': {'total_tokens': 12}})
            tracker.record_llm_response({'call_id': 'one', 'total_ms': 10, 'usage': {'total_tokens': 12}})
            tracker.record_execution_result(ToolResult.error('font', 'Undefined font: nB', provenance={'tool': 'bash'}))
            self.assertFalse(history.exists())
            events = [json.loads(line) for line in next(Path(directory).glob('session.events/*.jsonl')).read_text().splitlines()]
            self.assertEqual([e['event'] for e in events], ['started', 'model_completed', 'tool_completed'])
            self.assertEqual(events[-1]['data']['error']['message'], 'Undefined font: nB')
            self.assertEqual(events[1]['data']['usage']['total_tokens'], 12)

    def test_rewritten_scripts_and_intervening_reads_do_not_reset_font_failure(self):
        receipts = []
        for font in ('aB', 'bB', 'cB'):
            receipts.append(ToolResult.error('legacy_error', f'FPDFException: Undefined font: {font}',
                                             provenance={'tool': 'bash'}))
            receipts.append(ToolResult.success(provenance={'tool': 'read_file'}))
        self.assertEqual(repeated_execution_failure(receipts)['attempts'], 3)
        receipts.append(ToolResult.success(provenance={'tool': 'bash'}))
        self.assertEqual(repeated_execution_failure(receipts)['attempts'], 3)
        receipts.append(ToolResult.success(data={'kind': 'pdf_page_review', 'published': True}, provenance={'tool': 'inspect_pdf_page'}))
        self.assertIsNone(repeated_execution_failure(receipts))

    def test_provider_reasoning_and_cache_details_accumulate_without_double_counting(self):
        tracker=TelemetryStats()
        tracker.record_auxiliary_call('pdf_page_review',{'total_tokens':8,
            'completion_tokens_details':{'reasoning_tokens':5},'prompt_tokens_details':{'cached_tokens':4}},call_id='first')
        tracker.record_auxiliary_call('pdf_page_review',{'total_tokens':11,
            'completion_tokens_details':{'reasoning_tokens':6},'prompt_tokens_details':{'cached_tokens':2}},call_id='second')
        tracker.record_auxiliary_call('pdf_page_review',{'total_tokens':11,
            'completion_tokens_details':{'reasoning_tokens':6}},call_id='second')
        self.assertEqual(tracker.tokens['total_tokens'],19)
        self.assertEqual(tracker.tokens['completion_tokens_details']['reasoning_tokens'],11)
        self.assertEqual(tracker.tokens['prompt_tokens_details']['cached_tokens'],6)
        self.assertEqual(tracker.llm_invocations,2)

    def test_transient_network_errors_are_not_deterministic_script_failures(self):
        receipts = [ToolResult.error('legacy_error', 'socket timeout', provenance={'tool': 'bash'})] * 5
        self.assertIsNone(repeated_execution_failure(receipts))


class ProgressPolicyTests(unittest.TestCase):
    def test_total_deadline_is_opt_in(self):
        import os
        from unittest.mock import patch
        from dsh_modules.runtime_policy import RuntimePolicy
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(RuntimePolicy.from_env().total_task_timeout, 0)
        with patch.dict(os.environ, {'DSH_TOTAL_TIMEOUT_SECONDS': '900'}, clear=True):
            self.assertEqual(RuntimePolicy.from_env().total_task_timeout, 900)

    def test_only_completed_runtime_work_renews_progress(self):
        from contextlib import redirect_stdout
        from io import StringIO
        from dsh_modules.execution_journal import ExecutionJournal
        output = StringIO()
        with redirect_stdout(output):
            journal = ExecutionJournal(None)
            journal.append('model_started', {'call_id': 'a'})
            journal.append('model_completed', {'call_id': None})
            journal.append('tool_completed', {'status': 'error'})
            journal.append('tool_completed', {'status': 'success'})
            journal.append('model_completed', {'call_id': 'a'})
        self.assertEqual(output.getvalue().count('<<<DSH_PROGRESS>>>'), 2)


class ArtifactRepairBudgetTests(unittest.TestCase):
    def test_different_script_errors_and_successful_diagnostics_share_budget(self):
        receipts = []
        for error in ('Undefined font: nB', "TypeError: 'dict' object is not callable", "NameError: name 'pdf' is not defined"):
            receipts.append(ToolResult.error('shell_command_failed', error, provenance={'tool': 'bash'}))
            receipts.append(ToolResult.success(text='help output', provenance={'tool': 'bash'}))
        self.assertEqual(repeated_execution_failure(receipts)['attempts'], 3)

    def test_non_artifact_debugging_is_not_stopped_for_changing_script_errors(self):
        receipts = [ToolResult.error('shell_command_failed', 'TypeError: bad argument', provenance={'tool': 'bash'})] * 3
        self.assertIsNone(repeated_execution_failure(receipts, artifact_task=False))

    def test_renderer_success_resets_render_errors_but_not_bash_errors(self):
        failure = ToolResult.error('pdf_render_failed', 'bad layout', provenance={'tool': 'render_pdf'})
        receipts = [failure] * 3
        self.assertIsNotNone(repeated_execution_failure(receipts))
        receipts.append(ToolResult.success(data={'kind':'pdf_render'}, provenance={'tool':'render_pdf'}))
        self.assertIsNone(repeated_execution_failure(receipts))


if __name__ == '__main__':
    unittest.main()
