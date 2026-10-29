"""Pipeline failures must survive tail, while explicitly handled failures remain valid."""
import tempfile
import unittest
from unittest.mock import patch

from dsh_modules.tools import execute_tool
from dsh_modules.tool_result import adapt_tool_output


class ShellExitStatusTests(unittest.TestCase):
    def test_failed_pipeline_has_structured_error_even_when_tail_succeeds(self):
        with tempfile.TemporaryDirectory() as workspace, patch('dsh_modules.tools.WORKSPACE_DIR', workspace):
            result = adapt_tool_output(execute_tool('bash', {'cmd': "(echo 'installation failed'; exit 7) 2>&1 | tail -5"}))
        self.assertTrue(result.is_error)
        self.assertEqual(result.error_code, 'shell_command_failed')
        self.assertEqual(result.error['exit_code'], 7)
        self.assertIn('退出码 7', result.error_message)
        self.assertIn('installation failed', result.error_message)

    def test_successful_pipeline_and_explicit_recovery_still_succeed(self):
        with tempfile.TemporaryDirectory() as workspace, patch('dsh_modules.tools.WORKSPACE_DIR', workspace):
            for command in ["printf 'ok\\n' | tail -1", "false | tail -1 || echo handled"]:
                with self.subTest(command=command):
                    self.assertTrue(adapt_tool_output(execute_tool('bash', {'cmd': command})).is_success)

    def test_markdown_tool_rejecting_html_is_a_structured_failure(self):
        with tempfile.TemporaryDirectory() as workspace, patch('dsh_modules.tools.WORKSPACE_DIR', workspace):
            result = adapt_tool_output(execute_tool('write_markdown', {'file_path': 'slides.html', 'content': '<html/>'}))
        self.assertTrue(result.is_error)
        self.assertEqual(result.error_code, 'artifact_write_failed')

    def test_missing_builtin_dependency_reports_environment_repair_not_pip_loop(self):
        command = '''printf "ModuleNotFoundError: No module named 'pptx'\\n"; exit 1'''
        result = adapt_tool_output(execute_tool('bash', {'cmd': command}))
        self.assertTrue(result.is_error)
        self.assertIn('更新镜像', result.error_message)
        self.assertNotIn('pip install', result.error_message)
