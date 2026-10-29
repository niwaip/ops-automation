import tempfile
import unittest
from unittest.mock import patch
from dsh_modules.pdf_content_workflow import run_pdf_content_workflow
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.tool_result import ToolResult, TextToolOutput


class PDFContentWorkflowTests(unittest.TestCase):
    def test_model_only_writes_body_runtime_binds_metadata_and_delivers_after_reviews(self):
        source = '## 简介\n正文\n<!-- pagebreak -->\n## 记录\n正文'
        t=TelemetryStats()
        render=TextToolOutput('',ToolResult.success(data={'kind':'pdf_render'},provenance={'tool':'render_pdf'}))
        reviews=[ToolResult.success(data={'kind':'pdf_page_review'})]
        with tempfile.TemporaryDirectory() as folder, \
             patch('dsh_modules.pdf_content_workflow.call_model_proxy',return_value={'content':source,'finish_reason':'stop','call_id':'one','usage':{'total_tokens':4}}) as model, \
             patch('dsh_modules.pdf_content_workflow.render_pdf',return_value=render) as compile_pdf, \
             patch('dsh_modules.pdf_content_workflow.review_current_pdf_pages',return_value=reviews), \
             patch('dsh_modules.pdf_content_workflow.pdf_delivery_result',return_value=('已检查',['file'])):
            text,files,evidence=run_pdf_content_workflow('生成《手册》，共2页，handout 暖色，不要独立封面',
                                                       'default',RuntimePolicy(),folder,folder,None,t)
        self.assertEqual(files,['file']);self.assertEqual(len(evidence),2)
        self.assertNotIn('tools',model.call_args.kwargs)
        self.assertFalse(model.call_args.kwargs['stream_deltas'])
        params=compile_pdf.call_args.args[0]
        self.assertEqual(params['markdown'],source);self.assertEqual(params['title'],'手册')
        self.assertEqual((params['min_pages'],params['max_pages']),(2,2))
        self.assertEqual(t.llm_invocations,1)

    def test_feedback_keeps_all_failed_pages_and_never_accepts_old_artifact(self):
        errors=[ToolResult.error('pdf_preview_failed','第1页重复'),ToolResult.error('pdf_preview_failed','第2页不可填写')]
        t=TelemetryStats()
        with tempfile.TemporaryDirectory() as folder, \
             patch('dsh_modules.pdf_content_workflow.call_model_proxy',return_value={'content':'正文','finish_reason':'stop'}) as model, \
             patch('dsh_modules.pdf_content_workflow.render_pdf',return_value=TextToolOutput('',ToolResult.success(provenance={'tool':'render_pdf'}))), \
             patch('dsh_modules.pdf_content_workflow.review_current_pdf_pages',return_value=errors), \
             patch('dsh_modules.pdf_content_workflow.pdf_delivery_result',return_value=('未发布',[])):
            text,files,evidence=run_pdf_content_workflow('生成PDF','default',RuntimePolicy(),folder,folder,None,t)
        self.assertEqual(model.call_count,4);self.assertEqual(files,[])
        feedback=model.call_args.args[0][-1]['content']
        self.assertIn('第1页重复',feedback);self.assertIn('第2页不可填写',feedback)

    def test_brief_export_injects_prior_assistant_context(self):
        source = '# 微博热点\n正文'
        t = TelemetryStats()
        render = TextToolOutput('', ToolResult.success(data={'kind': 'pdf_render'}, provenance={'tool': 'render_pdf'}))
        reviews = [ToolResult.success(data={'kind': 'pdf_page_review'})]
        history = [
            {'role': 'user', 'content': '查看今天微博的热点新闻'},
            {'role': 'assistant', 'content': '# 今日微博热点新闻摘要\n\n1. 外交部回应\n2. 热点事件\n\n---\n**说明**：请使用 pdf 技能转为 A4 PDF。'},
            {'role': 'user', 'content': '生成pdf文件'},
        ]
        with tempfile.TemporaryDirectory() as folder, \
             patch('dsh_modules.pdf_content_workflow.call_model_proxy', return_value={'content': source, 'finish_reason': 'stop', 'call_id': 'one', 'usage': {'total_tokens': 4}}) as model, \
             patch('dsh_modules.pdf_content_workflow.render_pdf', return_value=render), \
             patch('dsh_modules.pdf_content_workflow.review_current_pdf_pages', return_value=reviews), \
             patch('dsh_modules.pdf_content_workflow.pdf_delivery_result', return_value=('已检查', ['file'])):
            text, files, evidence = run_pdf_content_workflow(
                '生成pdf文件', 'default', RuntimePolicy(), folder, folder, None, t, conversation_history=history
            )
        self.assertEqual(files, ['file'])
        called_messages = model.call_args.args[0]
        user_message = called_messages[1]['content']
        self.assertIn('今日微博热点新闻摘要', user_message)
        self.assertIn('外交部回应', user_message)
        self.assertNotIn('请使用 pdf 技能转为 A4 PDF', user_message)

