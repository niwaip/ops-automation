"""Never substitute an old similarly named image for a current PDF page."""

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.pdf_preview_tool import (
    reset_pdf_renders, register_pdf_render, inspect_pdf_page, pdf_review_feedback,
)


class PDFPreviewBindingTests(unittest.TestCase):
    def setUp(self):
        reset_pdf_renders()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.target = self.root / 'handout.pdf'
        self.target.write_bytes(b'old accepted version')
        self.staged = self.root / 'candidate.pdf'
        self.staged.write_bytes(b'new candidate')
        self.images = [self.root / f'current-{page}.png' for page in (1, 2)]
        for image in self.images:
            image.write_bytes(b'current preview')
        self.qa = self.root / 'qa.json'
        self.qa.write_text('{}')
        self.data = {'file_path': str(self.target), 'page_count': 2,
            'sha256': hashlib.sha256(self.staged.read_bytes()).hexdigest(),
            'previews': [str(p) for p in self.images], 'qa_path': str(self.qa), 'published': False}

    def test_unknown_render_is_rejected_without_any_image_lookup(self):
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image') as inspect:
            result = inspect_pdf_page({'file_path': 'handout.pdf', 'page': 1}, self.root).tool_result
            self.assertTrue(result.is_error)
            inspect.assert_not_called()
            self.assertEqual(self.target.read_bytes(), b'old accepted version')

    def test_each_exact_page_must_pass_before_old_pdf_is_replaced(self):
        register_pdf_render(self.data, self.staged)
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】:\nPASS\n无缺字。') as inspect:
            first = inspect_pdf_page({'file_path': 'handout.pdf', 'page': 1}, self.root).tool_result
            self.assertFalse(first.data['published'])
            self.assertEqual(self.target.read_bytes(), b'old accepted version')
            second = inspect_pdf_page({'file_path': 'handout.pdf', 'page': 2}, self.root).tool_result
            self.assertTrue(second.data['published'])
            self.assertEqual([call.args[0] for call in inspect.call_args_list], [str(p) for p in self.images])
        self.assertEqual(self.target.read_bytes(), b'new candidate')
        self.assertIsNone(pdf_review_feedback())
        self.assertFalse(self.data['published'])  # Render receipts stay immutable.

    def test_runtime_checks_all_current_pages_without_a_second_tool_selection_round(self):
        from dsh_modules.pdf_preview_tool import review_current_pdf_pages
        from dsh_modules.telemetry import TelemetryStats
        register_pdf_render(self.data, self.staged)
        telemetry = TelemetryStats()
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】:\nPASS\n布局正常。') as inspect:
            receipts = review_current_pdf_pages(self.root, None, telemetry, 0)
        self.assertEqual(inspect.call_count, 2)
        self.assertEqual([r.data['page'] for r in receipts], [1, 2])
        self.assertTrue(all(r.provenance['execution_origin'] == 'runtime_workflow' for r in receipts))
        self.assertEqual(telemetry.tool_invocations, 2)
        self.assertIsNone(pdf_review_feedback())

    def test_changed_pdf_and_failed_vision_cannot_publish(self):
        register_pdf_render(self.data, self.staged)
        self.staged.write_bytes(b'changed')
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image') as inspect:
            self.assertTrue(inspect_pdf_page({'file_path': 'handout.pdf', 'page': 1}, self.root).is_error)
            inspect.assert_not_called()
        self.staged.write_bytes(b'new candidate')
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【系统提示】图像分析网络请求失败'):
            self.assertTrue(inspect_pdf_page({'file_path': 'handout.pdf', 'page': 1}, self.root).is_error)
        self.assertEqual(self.target.read_bytes(), b'old accepted version')

    def test_unreviewed_workflow_cannot_use_legacy_pdf_compiler_to_bypass_page_limits(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.pdf_render_tool import PDF_RENDER_TOOL
        with patch('dsh_modules.agent_loop.WORKSPACE_DIR', str(self.root)), \
             patch('dsh_modules.pdf_content_workflow.call_model_proxy', return_value={'content': '', 'tool_calls': []}) as call_model, \
             patch('dsh_modules.agent_loop._finalize_agent_text') as finalize, \
             patch('dsh_modules.agent_loop.materialize_post_loop_deliverables') as compile_pdf:
            result = run_agent_loop([{'role': 'system', 'content': '生成PDF'},
                {'role': 'user', 'content': '生成handout.pdf'}], 'test', RuntimePolicy(), 1,
                tools=[PDF_RENDER_TOOL], expected_deliverables=['.pdf'], is_generate_intent=True)
        self.assertEqual(result.outbound_files, [])
        self.assertNotIn('tools', call_model.call_args_list[0].kwargs)
        self.assertFalse(call_model.call_args_list[0].kwargs['stream_deltas'])
        self.assertIn('未发布', result.final_text)
        finalize.assert_not_called()
        compile_pdf.assert_not_called()
        self.assertEqual(self.target.read_bytes(), b'old accepted version')


if __name__ == '__main__':
    unittest.main()
