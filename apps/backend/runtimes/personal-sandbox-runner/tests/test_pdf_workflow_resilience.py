"""Failures seen in the real PDF workflow must terminate without rewriting prose."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from unittest.mock import MagicMock
from contextlib import ExitStack
import io
import urllib.error

from dsh_modules.pdf_preview_tool import (reset_pdf_renders, register_pdf_render,
    review_current_pdf_pages, pdf_delivery_result)
from dsh_modules.telemetry import TelemetryStats


class ReviewResilienceTests(unittest.TestCase):
    def setUp(self):
        reset_pdf_renders()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def register(self, pages=50, version='new'):
        staged = self.root / 'candidate.pdf'; staged.write_bytes(version.encode())
        images = [self.root / f'{n}.png' for n in range(pages)]
        for image in images: image.write_bytes(b'image')
        qa = self.root / 'qa.json'; qa.write_text('{}')
        data = {'file_path': str(self.root/'final.pdf'), 'page_count': pages,
                'sha256': hashlib.sha256(staged.read_bytes()).hexdigest(),
                'previews': list(map(str, images)), 'qa_path': str(qa)}
        register_pdf_render(data, staged)
        return data

    def test_service_failure_stops_queue_and_survives_new_render(self):
        self.register()
        telemetry = TelemetryStats()
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='服务空正文') as inspect:
            results = review_current_pdf_pages(self.root, None, telemetry, 0)
            self.assertLessEqual(inspect.call_count, 2)
            self.assertTrue(all(r.error_code=='pdf_review_unavailable' for r in results))
            self.register(version='another')
            count = inspect.call_count
            again = review_current_pdf_pages(self.root, None, telemetry, 1)
            self.assertEqual(inspect.call_count, count)
            self.assertEqual(again[0].error_code, 'pdf_review_unavailable')
        self.assertFalse((self.root/'final.pdf').exists())

    def test_real_content_repairs_have_cross_version_limit(self):
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】\nREPAIR\n表格重叠') as inspect:
            for attempt in range(4):
                self.register(pages=1, version=str(attempt))
                results = review_current_pdf_pages(self.root, None, TelemetryStats(), attempt)
            self.assertEqual(inspect.call_count, 3)
            self.assertEqual(results[-1].error_code, 'pdf_review_budget_exhausted')
            self.assertIn('3个版本', pdf_delivery_result()[0])

    def test_protocol_failure_is_not_a_content_repair(self):
        self.register(pages=1)
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片】\n看起来很好'):
            result = review_current_pdf_pages(self.root, None, TelemetryStats(), 0)[0]
        self.assertEqual(result.error_code, 'pdf_review_unavailable')

    def test_expired_review_budget_never_calls_the_model(self):
        self.register(pages=2)
        with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image') as inspect:
            results = review_current_pdf_pages(self.root, time.monotonic()-1, TelemetryStats(), 0)
        inspect.assert_not_called()
        self.assertTrue(all(r.error_code=='pdf_review_unavailable' for r in results))

    def test_agent_ends_after_one_render_on_service_failure(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.pdf_render_tool import PDF_RENDER_TOOL
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.tool_result import ToolResult, TextToolOutput
        response = {'content':'', 'tool_calls':[{'id':'once','type':'function','function':{
            'name':'render_pdf','arguments':json.dumps({'markdown':'正文','output_path':'final.pdf'})}}]}
        def render(*args, **kwargs):
            data = self.register(pages=2)
            return TextToolOutput('candidate', ToolResult.success(data={**data,'kind':'pdf_render'}, provenance={'tool':'render_pdf'}))
        with patch('dsh_modules.agent_loop.WORKSPACE_DIR', str(self.root)), \
             patch('dsh_modules.pdf_task_contract.bind_pdf_request', side_effect=lambda p,*a,**k:p), \
             patch('dsh_modules.agent_loop.call_model_proxy',return_value=response) as model, \
             patch('dsh_modules.pdf_render_tool.render_pdf',side_effect=render), \
             patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='服务不可用'):
            result = run_agent_loop([{'role':'user','content':'查询热点生成PDF'}], 'test', RuntimePolicy(), 5,
                tools=[PDF_RENDER_TOOL,{'type':'function','function':{'name':'web_search'}}],
                expected_deliverables=['.pdf'],is_generate_intent=True,user_prompt='查询热点生成PDF')
        self.assertEqual(model.call_count,1)
        self.assertEqual(result.outbound_files,[])
        self.assertIn('服务不可用',result.final_text)


@unittest.skipUnless(os.environ.get('PDF_DESIGN_SCRIPTS'), 'PDF renderer required')
class FlowPaginationTests(unittest.TestCase):
    def test_paragraph_array_flows_but_explicit_page_count_keeps_boundaries(self):
        from dsh_modules.pdf_render_tool import render_pdf
        skill = Path(os.environ['PDF_DESIGN_SCRIPTS']).parent.parent
        with tempfile.TemporaryDirectory() as folder, \
             patch('dsh_modules.pdf_task_contract.bind_pdf_request',side_effect=lambda p,*a,**k:p):
            for prompt, expected in [('整理热点生成PDF',1),('共12页生成PDF',12)]:
                result = render_pdf({'pages':['## 栏目'+str(i) for i in range(12)],
                    'output_path':'flow.pdf','template':'handout'},folder,skill,user_prompt=prompt).tool_result
                self.assertTrue(result.is_success,result.error_message)
                self.assertEqual(result.data['page_count'],expected)

    def test_unsolicited_markdown_breaks_do_not_create_empty_pages(self):
        from dsh_modules.pdf_render_tool import render_pdf
        skill = Path(os.environ['PDF_DESIGN_SCRIPTS']).parent.parent
        with tempfile.TemporaryDirectory() as folder, \
             patch('dsh_modules.pdf_task_contract.bind_pdf_request',side_effect=lambda p,*a,**k:p):
            result = render_pdf({'markdown':'\n<!-- pagebreak -->\n'.join(['## 栏目']*12),
                'output_path':'flow.pdf','min_pages':12,'max_pages':12},folder,skill,
                user_prompt='整理热点生成PDF').tool_result
            self.assertTrue(result.is_success,result.error_message)
            self.assertEqual(result.data['page_count'],1)


class VisionTransportDiagnosticsTests(unittest.TestCase):
    def test_same_page_can_recover_once_without_rerendering(self):
        from dsh_modules.pdf_review_model import inspect_pdf_image, PDFReviewUnavailable
        passed='【文档/图片】\nPASS'
        with patch('dsh_modules.pdf_review_model.inspect_image',side_effect=[TimeoutError('timeout'),passed]) as inspect:
            self.assertEqual(inspect_pdf_image('page.png','检查'),passed)
            self.assertEqual(inspect.call_count,2)
        with patch('dsh_modules.pdf_review_model.inspect_image',return_value='空正文') as inspect:
            with self.assertRaises(PDFReviewUnavailable):
                inspect_pdf_image('page.png','检查')
            self.assertEqual(inspect.call_count,2)

    def test_response_metadata_and_http_error_details_survive_transport(self):
        from dsh_modules.file_tools import inspect_image
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            image = Path(directory)/'page.png'; image.write_bytes(b'png')
            stack.enter_context(patch('dsh_modules.file_tools.resolve_sandboxed_path',return_value=(image,None)))
            stack.enter_context(patch('dsh_modules.file_tools.validate_image_bytes',return_value=None))
            stack.enter_context(patch('dsh_modules.file_tools._optimize_image_bytes_for_vision',return_value=(b'png','image/png')))
            response = MagicMock(); response.__enter__.return_value = response
            for finish, content in [('stop','PASS'),('length','PASS'),('stop','')]:
                response.read.return_value=json.dumps({'model':'actual-vision','choices':[
                    {'finish_reason':finish,'message':{'content':content}}]}).encode()
                telemetry = TelemetryStats()
                with patch('dsh_modules.file_tools.urllib.request.urlopen',return_value=response):
                    result=inspect_image(str(image),purpose='pdf_page_review',telemetry=telemetry)
                self.assertEqual(telemetry.calls_ledger[0]['model'],'actual-vision')
                self.assertEqual(result.startswith('【文档/图片'),finish=='stop' and bool(content))
            error=urllib.error.HTTPError('http://proxy',503,'Unavailable',{},
                io.BytesIO(b'{"message":"Vision upstream ECONNREFUSED"}'))
            with patch('dsh_modules.file_tools.urllib.request.urlopen',side_effect=error):
                result=inspect_image(str(image),purpose='pdf_page_review')
            self.assertIn('ECONNREFUSED',result)
            self.assertIn('503',result)
