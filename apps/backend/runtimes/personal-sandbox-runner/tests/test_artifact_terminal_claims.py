"""Final artifact checks cannot be skipped by an unrelated tool success or intent routing."""
import os
import io
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import redirect_stdout

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules import agent_loop
from dsh_modules.runtime_policy import RuntimePolicy


class TerminalArtifactClaimTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.start = time.time()

    def verify(self, text):
        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
                patch.object(agent_loop, 'KNOWLEDGE_DIR', str(self.root / 'knowledge')):
            return agent_loop.detect_missing_claimed_artifacts(
                text, is_generate_intent=True, turn_start_time=self.start, verify_claims_only=True)

    def test_exact_failed_turn_claim_is_missing(self):
        text = '已按照您的要求，基于原始数据表完成了数据清洗、分组统计，并生成了文件 **`/workspace/部门别有偿统计.xlsx`**。'
        self.assertIn('部门别有偿统计.xlsx', self.verify(text))

    def test_dependency_install_and_script_are_not_the_report(self):
        (self.root / 'generate_report.py').write_text('import pandas')
        self.assertIn('report.xlsx', self.verify('已生成文件 `/workspace/report.xlsx`。'))

    def test_stale_and_empty_files_cannot_satisfy_a_new_claim(self):
        report = self.root / 'report.xlsx'
        report.write_bytes(b'')
        self.assertIn('report.xlsx', self.verify('已生成文件 `/workspace/report.xlsx`。'))
        report.write_bytes(b'old')
        os.utime(report, (self.start - 100, self.start - 100))
        self.assertIn('report.xlsx', self.verify('已生成文件 `/workspace/report.xlsx`。'))

    def test_existing_current_file_can_be_delivered(self):
        (self.root / 'report.txt').write_text('complete')
        self.assertEqual(self.verify('已生成文件 `/workspace/report.txt`。'), [])

    def test_references_questions_and_explicit_failure_are_not_success_claims(self):
        for text in ['来源：`/workspace/source.xlsx`。', '请查看 `/workspace/example.xlsx` 是否存在。',
                     '尚未生成文件 report.xlsx。', '示例路径：`/workspace/example.xlsx`。']:
            with self.subTest(text=text):
                self.assertEqual(self.verify(text), [])

    def test_loop_rejects_claim_even_after_normal_guards_allow_completion(self):
        reply = {'content': '已生成文件 `/workspace/report.xlsx`。', 'finish_reason': 'stop'}
        with patch.object(agent_loop, 'WORKSPACE_DIR', str(self.root)), \
                patch.object(agent_loop, 'KNOWLEDGE_DIR', str(self.root / 'knowledge')), \
                patch.object(agent_loop, 'call_model_proxy', return_value=reply), \
                patch.object(agent_loop, 'parse_tool_calls', return_value=[]), \
                patch.object(agent_loop, '_check_no_tool_assertion_guard', return_value=('pass', None, 1)), \
                patch.object(agent_loop, '_finalize_agent_text', return_value=(reply['content'], [])), \
                redirect_stdout(io.StringIO()):
            result = agent_loop.run_agent_loop(
                [{'role': 'user', 'content': '保存为报告的skill'}], model='test',
                policy=RuntimePolicy(), tools=[], max_rounds=1,
                is_generate_intent=False, is_inspect_intent=True, turn_start_time=self.start)
        self.assertIn('本次文件生成未完成', result.final_text)
        self.assertNotIn('已生成文件', result.final_text)
        self.assertTrue(any(d['guard'] == 'artifact_delivery' for d in result.telemetry.guard_decisions))


if __name__ == '__main__':
    unittest.main()
