"""A real summary request must never become a document export through postprocessing."""

import hashlib
import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from dsh_modules.artifact_exporter import ArtifactExporter
from dsh_modules.deliverable_contract import materialize_pdf_from_markdown, resolve_pdf_page_bounds
from dsh_modules.pdf_external_delivery import _stage_and_check, enforce_external_pdf_delivery
from dsh_modules.pdf_output_contract import requests_pdf_output
from dsh_modules.pdf_task_contract import bind_pdf_request, has_explicit_page_requirement
from dsh_modules.skill_router import SkillRouter
from dsh_modules.agent_loop import run_agent_loop
from dsh_modules.runtime_policy import RuntimePolicy


SOURCE = '85页_GHF组委会&沙利文_AI医学影像行业发展现状与未来趋势蓝皮书.pdf'
ENVELOPE = f'【当前轮次用户上传附件】: {SOURCE}（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n用户指令：'
PROMPT = ENVELOPE + '查看和归纳内容'
SUMMARY = '# 归纳结果\n\n' + '根据已读取的附件内容归纳主要观点。' * 20


class PDFReadonlyDeliveryTests(unittest.TestCase):
    def test_native_document_loop_can_finish_after_more_than_eight_reads(self):
        responses = [{'content': '', 'finish_reason': 'tool_calls', 'tool_calls': [{
            'id': f'read-{i}', 'type': 'function', 'function': {'name': 'read_file',
            'arguments': json.dumps({'file_path': SOURCE, 'start_line': 1 + i * 300})}}]}
            for i in range(10)] + [{'content': SUMMARY, 'finish_reason': 'stop'}]
        with tempfile.TemporaryDirectory() as folder, \
                patch('dsh_modules.agent_loop.WORKSPACE_DIR', folder), \
                patch('dsh_modules.agent_loop.call_model_proxy', side_effect=responses) as model, \
                patch('dsh_modules.agent_loop.execute_tool', return_value='已读取当前正文切片') as reader:
            result = run_agent_loop([{'role': 'user', 'content': PROMPT}], 'test',
                RuntimePolicy(), max_rounds=11, is_inspect_intent=True,
                is_generate_intent=False, expected_deliverables=[],
                tools=[{'type': 'function', 'function': {'name': 'read_file'}}])
        self.assertEqual(reader.call_count, 10)
        self.assertEqual(model.call_count, 11)
        self.assertEqual(result.final_text, SUMMARY)
        self.assertEqual(result.outbound_files, [])

    def test_actual_request_remains_readonly_and_has_no_pdf_output_contract(self):
        route = SkillRouter.route(PROMPT, [], files=[SOURCE], load_skill_context=False)
        self.assertTrue(route.is_inspect_intent)
        self.assertFalse(route.is_generate_intent)
        self.assertEqual(route.deliverables, [])
        self.assertFalse(requests_pdf_output(PROMPT, route.deliverables))

    def test_both_legacy_entrypoints_reject_reading_requests_without_creating_files(self):
        for prompt in (PROMPT, '查看并归纳这个PDF', '分析“生成85页报告.pdf”的主要内容',
                       '查看PDF并生成三条归纳意见', '不要生成PDF，只在聊天里归纳'):
            with self.subTest(prompt=prompt), tempfile.TemporaryDirectory() as folder, \
                    patch('subprocess.run') as compiler:
                self.assertIsNone(materialize_pdf_from_markdown(prompt, folder, final_text=SUMMARY))
                self.assertEqual(ArtifactExporter.export_deliverables(folder, SUMMARY, prompt=prompt), [])
                self.assertEqual(list(Path(folder).iterdir()), [])
                compiler.assert_not_called()

    def test_explicit_output_is_still_authorized_and_negation_overrides_contract(self):
        for prompt in (ENVELOPE + '归纳内容并导出PDF', '生成一份PDF报告', '导出为摘要.pdf'):
            with self.subTest(prompt=prompt):
                self.assertTrue(requests_pdf_output(prompt))
        self.assertTrue(requests_pdf_output('把结果保存下来', ['.pdf']))
        self.assertFalse(requests_pdf_output('不要生成PDF', ['.pdf']))

    def test_readonly_route_overrides_stale_contract_and_new_candidate_files(self):
        with tempfile.TemporaryDirectory() as folder, patch('subprocess.run') as compiler:
            target = Path(folder) / 'result.pdf'
            target.write_bytes(b'%PDF-1.4 accidental candidate')
            loop = SimpleNamespace(final_text=SUMMARY, outbound_files=[], execution_evidence=[])
            self.assertEqual(ArtifactExporter.export_deliverables(folder, SUMMARY,
                expected_deliverables=['.pdf'], prompt=PROMPT,
                is_inspect_intent=True, is_generate_intent=False), [])
            self.assertFalse(enforce_external_pdf_delivery(loop, folder, folder,
                time.time() - 1, PROMPT, is_inspect_intent=True, is_generate_intent=False))
            self.assertEqual(loop.final_text, SUMMARY)
            self.assertTrue(target.exists())
            compiler.assert_not_called()

    def test_filenames_cannot_supply_page_requirements(self):
        for prompt in (PROMPT, ENVELOPE + '归纳并生成摘要PDF',
                       '根据“共85页_资料.pdf”生成摘要PDF，文件名“85页_摘要.pdf”',
                       '归纳共85页_资料.pdf的内容并生成摘要PDF'):
            with self.subTest(prompt=prompt):
                self.assertFalse(has_explicit_page_requirement(prompt))
                self.assertEqual(resolve_pdf_page_bounds(prompt), (None, None))
        self.assertEqual(resolve_pdf_page_bounds(ENVELOPE + '生成摘要PDF，共3页'), (3, 3))
        self.assertEqual(resolve_pdf_page_bounds(ENVELOPE + '生成摘要PDF，2至4页'), (2, 4))

    def test_judge_page_hallucination_is_rejected_when_only_filename_has_number(self):
        with patch('dsh_modules.pdf_contract_judge.PdfContractJudge.judge_pdf_contract',
                   return_value={'min_pages': 85, 'max_pages': 85, 'template': 'report'}) as judge:
            result = bind_pdf_request({}, ENVELOPE + '归纳并导出PDF')
        self.assertNotIn('min_pages', result)
        self.assertNotIn('max_pages', result)
        self.assertEqual(judge.call_args.args[0], '归纳并导出PDF')

    def test_external_acceptance_uses_output_pages_and_not_source_filename(self):
        for request, bounds in (('归纳并导出PDF', []),
                                ('归纳并导出PDF，共3页', ['--min-pages', '3', '--max-pages', '3']),
                                ('归纳并导出PDF，不超过3页', ['--max-pages', '3'])):
            with self.subTest(request=request), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                target = root / 'result.pdf'
                target.write_bytes(b'%PDF-1.4 candidate')

                def check(command, **kwargs):
                    staged = Path(command[2])
                    (staged.parent / 'qa.json').write_text(json.dumps({
                        'valid': True, 'sha256': hashlib.sha256(staged.read_bytes()).hexdigest(),
                        'page_count': 1, 'previews': ['page-1.png']}))
                    self.assertEqual(command[5:], bounds)
                    return SimpleNamespace(returncode=0, stderr='')

                with patch('subprocess.run', side_effect=check):
                    _stage_and_check(target, root, folder, ENVELOPE + request, None)


if __name__ == '__main__':
    unittest.main()
