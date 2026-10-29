"""Regression coverage for the 300s handout failure: route, bounded renderer and honest QA."""

import json
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from dsh_modules.pdf_workflow import is_template_pdf_task
from dsh_modules.pdf_render_tool import render_pdf
from dsh_modules.planning_phase import should_run_planning_phase
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.runner import select_active_tools


class PDFTemplateRoutingTests(unittest.TestCase):
    def setUp(self):
        self.skill = SimpleNamespace(skill_id='pdf', is_generate_intent=True, deliverables=['.pdf', 'handout.pdf'],
                                     is_guide_intent=False, is_research_intent=False, is_send_intent=False,
                                     is_inspect_intent=False, requires_execution=False, is_modify_intent=False)
        self.prompt = '/pdf 生成两页自然观察手册，handout 暖色，时间天气记录卡，如何写观察记录'

    def test_template_task_skips_long_planning_and_exposes_renderer_not_bash(self):
        self.assertTrue(is_template_pdf_task(self.prompt, self.skill))
        self.assertEqual(should_run_planning_phase(self.prompt, self.skill, RuntimePolicy(thinking=True)),
                         (False, True))
        tools = select_active_tools(self.prompt, self.skill, False, True)
        self.assertEqual({t['function']['name'] for t in tools}, {'render_pdf', 'read_file', 'inspect_pdf_page'})

    def test_conversion_research_custom_engine_and_other_formats_keep_existing_workflows(self):
        for prompt in ('/pdf 将 Word 转为 PDF', '/pdf 填写表单', '/pdf 搜索最新自然新闻生成PDF',
                       '/pdf 使用 FPDF 精确坐标绘制', '/pdf 基于 1.pdf 生成报告.pdf',
                       '/pdf 读取 sales.xlsx 统计生成 PDF', '/pdf 绘制折线图报告',
                       '查看今天的bilibili热点，生成一页的pdf ，需要a4 美观，便于阅读',
                       '总结本周科技热点生成PDF', '查一下今天的热搜生成一页pdf'):
            with self.subTest(prompt=prompt):
                self.assertFalse(is_template_pdf_task(prompt, self.skill))
        self.skill.deliverables.append('report.docx')
        self.assertFalse(is_template_pdf_task(self.prompt, self.skill))

    def test_dynamic_information_task_preserves_full_toolset_including_web_search(self):
        dynamic_prompt = '查看今天的bilibili热点，生成一页的pdf ，需要a4 美观，便于阅读'
        self.skill.is_search_intent = True
        self.assertFalse(is_template_pdf_task(dynamic_prompt, self.skill))
        tools = select_active_tools(dynamic_prompt, self.skill, is_search_intent=True, has_web_search_permission=True)
        tool_names = {t['function']['name'] for t in tools}
        self.assertIn('render_pdf', tool_names)
        self.assertIn('web_search', tool_names)
        self.assertIn('fetch_page', tool_names)
        self.assertIn('read_file', tool_names)



class PDFRenderAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.skill = self.root / 'skills/pdf'
        (self.skill / 'scripts').mkdir(parents=True)
        (self.skill / 'scripts/generate_report_pdf.py').write_text('')
        (self.skill / 'examples').mkdir()
        (self.skill / 'examples/leaf.svg').write_text('<svg/>')
        self.params = {'markdown': '# 观察\n\n![叶片](leaf.svg)', 'output_path': 'handout.pdf',
                       'template': 'handout', 'theme': 'warm', 'min_pages': 2, 'max_pages': 2}

    def call(self, params=None, deadline=None):
        return render_pdf(params or self.params, self.root, self.root / 'skills', deadline).tool_result

    def test_success_returns_current_run_previews_and_no_early_delivery_marker(self):
        def generate(cmd, **kwargs):
            output = Path(cmd[cmd.index('--output') + 1])
            folder = Path(cmd[cmd.index('--preview-dir') + 1])
            folder.mkdir(parents=True)
            output.write_bytes(b'%PDF-test')
            (folder / 'qa.json').write_text(json.dumps({'valid': True, 'page_count': 2, 'sha256': 'hash',
                'previews': [str(folder / 'page-1.png'), str(folder / 'page-2.png')], 'pages': []}))
            source = Path(cmd[cmd.index('--input') + 1])
            self.assertIn('data:image/svg+xml;base64,', source.read_text())
            self.assertLessEqual(kwargs['timeout'], 30)
            return SimpleNamespace(returncode=0, stderr='')
        with patch('dsh_modules.pdf_render_tool.subprocess.run', side_effect=generate):
            result = self.call()
        self.assertTrue(result.is_success)
        self.assertEqual(result.data['visual_review'], 'required')
        self.assertNotIn('DSH_OUTBOUND_FILE', result.render_text())

    def test_invalid_destination_bounds_and_expired_deadline_never_execute(self):
        with patch('dsh_modules.pdf_render_tool.subprocess.run') as run:
            for changes in ({'output_path': '../escape.pdf'}, {'output_path': '.dsh/session.pdf'},
                            {'min_pages': 3, 'max_pages': 2}, {'cover': 'false'}):
                self.assertTrue(self.call({**self.params, **changes}).is_error)
            self.assertTrue(self.call(deadline=time.monotonic() - 1).is_error)
            run.assert_not_called()

    def test_failed_render_preserves_existing_pdf_and_cannot_read_stale_qa(self):
        target = self.root / 'handout.pdf'
        target.write_bytes(b'original')
        stale = self.root / '.pdf-preview/handout'
        stale.mkdir(parents=True)
        (stale / 'qa.json').write_text('{"valid":true}')
        with patch('dsh_modules.pdf_render_tool.subprocess.run',
                   return_value=SimpleNamespace(returncode=1, stderr='Page count must be at most 2')):
            result = self.call()
        self.assertTrue(result.is_error)
        self.assertIn('at most 2', result.error_message)
        self.assertEqual(target.read_bytes(), b'original')

    def test_symlink_output_escape_and_uploaded_file_are_rejected(self):
        with tempfile.TemporaryDirectory() as outside:
            (self.root / 'linked').symlink_to(outside, target_is_directory=True)
            self.assertTrue(self.call({**self.params, 'output_path': 'linked/result.pdf'}).is_error)
        with patch.dict(os.environ, {'DSH_SESSION_ATTACHMENTS': 'handout.pdf'}):
            self.assertTrue(self.call().is_error)


@unittest.skipUnless(os.environ.get('PDF_DESIGN_SCRIPTS'), 'Run in the PDF runtime image')
class PDFRenderRuntimeTests(unittest.TestCase):
    def test_native_tool_renders_real_two_page_handout_with_cjk_and_leaf(self):
        with tempfile.TemporaryDirectory() as directory:
            scripts = Path(os.environ['PDF_DESIGN_SCRIPTS'])
            result = render_pdf({
                'markdown': '# 城市自然观察手册\n\n## 观察提示\n\n> 安全观察。\n\n'
                            '![叶片示意](leaf.svg)\n\n<!-- pagebreak -->\n\n'
                            '## 我的记录卡\n\n| 项目 | 记录 |\n| --- | --- |\n| 时间天气 | ______ |',
                'output_path': 'handout.pdf', 'template': 'handout', 'theme': 'warm',
                'min_pages': 2, 'max_pages': 2, 'subtitle': '观察、记录与分享', 'author': '阅读与实践',
            }, directory, scripts.parent.parent, time.monotonic() + 30).tool_result
            self.assertTrue(result.is_success, result.error_message)
            self.assertEqual(result.data['page_count'], 2)
            self.assertTrue(all(Path(p).is_file() for p in result.data['previews']))
            qa = json.loads(Path(result.data['qa_path']).read_text())
            self.assertTrue(qa['valid'])
            self.assertIn('观察、记录与分享', qa['pages'][0]['text'])
            self.assertIn('时间天气', qa['pages'][1]['text'])
            self.assertTrue(all(font['embedded'] for p in qa['pages'] for font in p['fonts']))
            self.assertFalse((Path(directory) / 'handout.pdf').exists())
            from dsh_modules.pdf_preview_tool import inspect_pdf_page
            with patch('dsh_modules.pdf_preview_tool.inspect_pdf_image', return_value='【文档/图片 视觉分析与内容识别结果】:\nPASS\n字形和布局正常。') as inspect:
                for page in (1, 2):
                    reviewed = inspect_pdf_page({'file_path': 'handout.pdf', 'page': page}, directory).tool_result
                    self.assertTrue(reviewed.is_success, reviewed.error_message)
                    self.assertEqual(reviewed.data['published'], page == 2)
                self.assertEqual(inspect.call_args_list[0].args[0], result.data['previews'][0])
            self.assertTrue((Path(directory) / 'handout.pdf').is_file())


if __name__ == '__main__':
    unittest.main()
