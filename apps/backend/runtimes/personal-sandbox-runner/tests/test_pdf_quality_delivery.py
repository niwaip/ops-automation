import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from dsh_modules.pdf_handout_quality import expand_record_tables
from dsh_modules.pdf_preview_tool import reset_pdf_renders, register_pdf_render, review_current_pdf_pages
from dsh_modules.evidence_store import persist_turn_evidence
from dsh_modules.tool_result import ToolResult
from dsh_modules.telemetry import TelemetryStats


class PDFQualityDeliveryTests(unittest.TestCase):
    def test_exact_page_count_is_bound_to_model_schema_without_mutating_registry(self):
        from dsh_modules.pdf_workflow import configure_pdf_tools
        from dsh_modules.pdf_render_tool import PDF_RENDER_TOOL
        tools = configure_pdf_tools([PDF_RENDER_TOOL], '共2页')
        pages = tools[0]['function']['parameters']['properties']['pages']
        self.assertEqual((pages['minItems'], pages['maxItems']), (2, 2))
        self.assertEqual(PDF_RENDER_TOOL['function']['parameters']['properties']['pages']['maxItems'], 100)

    def test_explicit_page_anchors_keep_introduction_with_page_one(self):
        from dsh_modules.pdf_task_contract import align_requested_page_headings
        source='简介。\n<!-- pagebreak -->\n## 温馨提示\n注意安全。\n## 如何写观察记录\n用笔记录。'
        result=align_requested_page_headings(source,'第1页：介绍、提示。第2页：如何写观察记录、分享。')
        self.assertEqual(result.count('<!-- pagebreak -->'),1)
        self.assertLess(result.index('注意安全'),result.index('<!-- pagebreak -->'))
        self.assertLess(result.index('<!-- pagebreak -->'),result.index('## 如何写观察记录'))
        ambiguous=source+'\n## 如何写观察记录\n重复'
        self.assertEqual(align_requested_page_headings(ambiguous,'第1页：介绍。第2页：如何写观察记录。'),ambiguous)

    def test_metadata_only_cover_does_not_shift_page_content(self):
        from dsh_modules.pdf_task_contract import remove_metadata_echoes
        body = '# 手册\n观察与记录\n署名：作者\n<!-- pagebreak -->\n真实正文\n<!-- pagebreak -->\n第二页'
        result = remove_metadata_echoes(body, {'title':'手册','subtitle':'观察与记录','author':'作者'})
        self.assertTrue(result.startswith('真实正文'))
        self.assertEqual(result.count('<!-- pagebreak -->'), 1)

    def test_missing_introduction_is_rejected_before_visual_review(self):
        from dsh_modules.pdf_task_contract import validate_pdf_content
        with self.assertRaisesRegex(ValueError,'简短介绍'):
            validate_pdf_content('## 温馨提示\n安静观察。','第1页：简短介绍、温馨提示。')
        validate_pdf_content('城市里处处有自然。\n## 温馨提示\n安静观察。','第1页：简短介绍、温馨提示。')

    def test_sharing_slogan_is_not_an_actionable_section_and_lists_stay_lists(self):
        from dsh_modules.pdf_task_contract import validate_pdf_content, prepare_handout_content
        with self.assertRaisesRegex(ValueError,'可操作'):
            validate_pdf_content('## 交流与分享建议\n分享要快乐。','第1页：交流与分享建议。')
        validate_pdf_content('## 交流与分享建议\n把画展示给同学，一起讨论发现。','第1页：交流与分享建议。')
        validate_pdf_content('## 记录与分享\n\n### 如何写观察记录\n画出发现。\n\n### 交流与分享\n把记录分享给朋友或老师。', '第1页：交流与分享建议。')
        self.assertIn('**准备**\n\n- 带笔',prepare_handout_content('**准备**\n- 带笔\n- 带水'))

    def test_generated_numeric_footers_are_removed_without_stripping_body_numbers(self):
        from dsh_modules.pdf_task_contract import prepare_handout_content
        source='正文中的数字1。\n---\n\n1\n\n## 记录\n正文2。\n---\n\n2'
        result=prepare_handout_content(source,2)
        self.assertNotIn('\n1\n',result);self.assertFalse(result.endswith('\n2'))
        self.assertIn('正文中的数字1',result);self.assertIn('正文2',result)
        self.assertEqual(prepare_handout_content('正文\n1',2),'正文\n1')

    def test_body_headings_are_not_consumed_as_document_metadata(self):
        from dsh_modules.pdf_task_contract import prepare_handout_content
        self.assertEqual(prepare_handout_content('# 如何写观察记录'), '## 如何写观察记录')

    def test_explicit_blank_record_fields_and_tip_style_are_owned_by_renderer(self):
        from dsh_modules.pdf_handout_quality import emphasize_requested_tips
        source='|项目|内容|\n|---|---|\n|时间||\n|天气||\n|地点||\n|发现||\n|问题||'
        result=expand_record_tables(source,'以及时间天气、地点、有趣发现、待探索问题四项记录卡。')
        self.assertEqual(result.count('<tr>'),5)
        self.assertIn('<td>时间天气</td>',result)
        self.assertIn('<td>待探索问题</td>',result)
        blanks=source.replace('|发现||','|发现||\n|||')
        self.assertEqual(expand_record_tables(blanks,'以及时间天气、地点、有趣发现、待探索问题四项记录卡。').count('<tr>'),5)
        tip=emphasize_requested_tips('## 温馨提示\n- 安静观察\n\n## 准备\n- 带笔','提示语用浅色块强调')
        self.assertIn('> - 安静观察',tip)
        self.assertIn('## 准备\n- 带笔',tip)
        self.assertIn('> 安静观察', emphasize_requested_tips('**温馨提示**\n安静观察\n## 准备','浅色块'))

    def test_blank_record_tables_expand_but_real_data_tables_are_preserved(self):
        blank = '|项目|内容|\n|---|---|\n|时间天气||\n|发现|____|'
        self.assertIn('class="record-card"', expand_record_tables(blank, '四项记录卡'))
        self.assertNotIn('**', expand_record_tables(blank.replace('时间天气', '**时间天气**'), '记录卡'))
        filled = blank.replace('|时间天气||', '|时间天气|晴|')
        self.assertEqual(expand_record_tables(filled, '记录卡'), filled)
        self.assertEqual(expand_record_tables(blank, '报告'), blank)

    def exercise(self, fail=False):
        reset_pdf_renders()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); target = root/'handout.pdf'; staged = root/'candidate.pdf'
            target.write_bytes(b'old'); staged.write_bytes(b'new'); sha = hashlib.sha256(b'new').hexdigest()
            qa = root/'qa.json';qa.write_text('{}')
            images = [root/f'{page}.png' for page in (1, 2)]
            for image in images:image.write_bytes(b'image')
            data = {'kind':'pdf_render','file_path':str(target),'page_count':2,'sha256':sha,
                    'previews':[str(p) for p in images],'qa_path':str(qa),'user_prompt':'面向小学生，四项记录卡'}
            register_pdf_render(data, staged)
            barrier = threading.Barrier(2)
            def inspect(image, prompt, deadline=None, model_events=None):
                self.assertIn('清单重复', prompt);self.assertIn('面向小学生', prompt)
                barrier.wait(timeout=3)
                model_events.append({'purpose':'pdf_page_review','usage':{'total_tokens':12},'total_ms':10,
                                     'model':'default','call_id':image})
                return '【文档/图片】:\n' + ('FAIL\n重复清单' if fail and image == str(images[0]) else 'PASS\n通过')
            t = TelemetryStats()
            with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image',side_effect=inspect):
                reviews = review_current_pdf_pages(root, None, t, 0)
            self.assertEqual(t.llm_invocations,2);self.assertEqual(t.tokens['total_tokens'],24)
            self.assertEqual(target.read_bytes(),b'old' if fail else b'new')
            self.assertEqual(reviews[-1].is_error,fail)
            if not fail:
                # A published receipt may occur before the other page's receipt in
                # page-ordered output; verification must tolerate completion order.
                reviews.sort(key=lambda r:not r.data['published'])
                receipts = [ToolResult.success(data=data)] + reviews
                result = persist_turn_evidence(root/'session.json',{},'生成PDF',receipts,
                                              [{'guard':'pdf_delivery','action':'accept'}])
                self.assertTrue(result['verified']);self.assertEqual(len(result['evidence_ids']),2)
                target.write_bytes(b'changed')
                result = persist_turn_evidence(root/'session.json',{},'生成PDF',receipts,
                                              [{'guard':'pdf_delivery','action':'accept'}])
                self.assertFalse(result['verified'])
    def test_concurrent_pages_publish_only_when_all_pass_and_meter_both_calls(self):
        self.exercise()
    def test_one_failed_page_prevents_publication_and_stays_last_for_repair(self):
        self.exercise(fail=True)

    def test_nonstreaming_image_transport_records_real_response_usage(self):
        from dsh_modules.file_tools import inspect_image
        from unittest.mock import MagicMock
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder)/'image.png'; image.write_bytes(b'png')
            response = MagicMock()
            response.__enter__.return_value = response
            response.read.return_value = json.dumps({'choices':[{'finish_reason':'stop','message':{'content':'PASS'}}],
                                                     'usage':{'total_tokens':22}}).encode()
            tracker=TelemetryStats()
            with patch('dsh_modules.file_tools.resolve_sandboxed_path', return_value=(image,None)), \
                 patch('dsh_modules.file_tools.validate_image_bytes',return_value=None), \
                 patch('dsh_modules.file_tools._optimize_image_bytes_for_vision',return_value=(b'png','image/png')), \
                 patch('dsh_modules.file_tools.urllib.request.urlopen',return_value=response) as send:
                self.assertIn('PASS',inspect_image(str(image),'检查',max_tokens=350,
                                                  telemetry=tracker,purpose='pdf_page_review'))
            self.assertFalse(json.loads(send.call_args.args[0].data)['stream'])
            self.assertEqual(tracker.tokens['total_tokens'],22)
            self.assertEqual(tracker.llm_invocations,1)

    def test_metered_review_preserves_nonstreaming_transport_and_collects_usage(self):
        from dsh_modules.pdf_review_model import inspect_pdf_image
        def inspect(*args, **kwargs):
            self.assertEqual(kwargs['max_tokens'],1200)
            self.assertEqual(kwargs['model_name'],'vision')
            kwargs['telemetry'].record_auxiliary_call('pdf_page_review',{'total_tokens':9},5,'default',call_id='one')
            return '【文档/图片】:\nPASS\n通过'
        events=[]
        with patch('dsh_modules.pdf_review_model.inspect_image',side_effect=inspect):
            self.assertIn('PASS',inspect_pdf_image('a.png','检查',model_events=events))
        self.assertEqual(len(events),1);self.assertEqual(events[0]['usage']['total_tokens'],9)


class PDFWritingSpaceRuntimeTests(unittest.TestCase):
    @unittest.skipUnless(__import__('os').environ.get('PDF_DESIGN_SCRIPTS'), 'Requires PDF runtime')
    def test_four_fields_reserve_handwriting_space_within_two_pages(self):
        import os
        import pdfplumber
        from dsh_modules.pdf_render_tool import render_pdf
        with tempfile.TemporaryDirectory() as folder:
            result = render_pdf({'pages':['观察自然。',
                '## 观察记录卡\n\n|项目|内容|\n|---|---|\n|时间天气||\n|地点||\n|有趣发现||\n|待探索问题||'],
                'output_path':'record.pdf','template':'handout'}, folder,
                Path(os.environ['PDF_DESIGN_SCRIPTS']).parent.parent,
                user_prompt='共2页，handout，四项记录卡').tool_result
            self.assertTrue(result.is_success,result.error_message)
            self.assertEqual(result.data['page_count'],2)
            with pdfplumber.open(Path(result.data['qa_path']).parent/'candidate.pdf') as pdf:
                cards=[r for r in pdf.pages[1].rects if r['width']>400 and r['height']>45]
                self.assertGreaterEqual(len(cards),2)
                self.assertTrue(all(r['height']*25.4/72 >=17 for r in cards))
