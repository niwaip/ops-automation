"""Render fallbacks, page schemas and repair budgets across real failure stages."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from dsh_modules.tool_result import ToolResult
from dsh_modules.tool_failure_recovery import repeated_execution_failure


class PDFRepairBudgetTests(unittest.TestCase):
    def failure(self, stage, message):
        return ToolResult.error('pdf_render_failed', message, data={'stage': stage},
                                provenance={'tool': 'render_pdf'})

    def test_new_failure_stage_gets_its_own_bounded_repair_budget(self):
        wrong_pages = self.failure('input', 'pages 数组必须恰好有1项')
        unknown = self.failure('render', 'Unsupported PDF symbol U+1F4F0')
        self.assertIsNone(repeated_execution_failure([wrong_pages, wrong_pages, unknown]))
        self.assertEqual(repeated_execution_failure([wrong_pages] * 3)['attempts'], 3)

    def test_different_render_causes_do_not_share_one_counter(self):
        font = self.failure('render', 'missing glyph')
        pages = self.failure('render', 'Expected at most 1 pages, got 2')
        self.assertIsNone(repeated_execution_failure([font, font, pages]))

    def test_changing_failure_reasons_still_has_a_total_budget(self):
        errors = [self.failure(f'stage-{i}', 'render error') for i in range(9)]
        result = repeated_execution_failure(errors)
        self.assertEqual(result['error'], 'total_failure_budget')
        self.assertEqual(result['attempts'], 9)

    def test_live_pdf_schema_and_first_render_failure_use_pdf_terminal(self):
        from dsh_modules.agent_loop import run_agent_loop
        from dsh_modules.pdf_render_tool import PDF_RENDER_TOOL
        from dsh_modules.runtime_policy import RuntimePolicy
        replies = [{'content': '', 'tool_calls': [{'id': f'call-{i}', 'type': 'function',
                    'function': {'name': 'render_pdf', 'arguments': json.dumps({
                        'pages': ['正文', '_END_'], 'output_path': f'new-{i}.pdf'})}}]}
                    for i in range(3)]
        def bind(params, prompt, **kwargs):
            return {**params, 'min_pages': 1, 'max_pages': 1}
        with tempfile.TemporaryDirectory() as root, \
             patch('dsh_modules.agent_loop.WORKSPACE_DIR', root), \
             patch('dsh_modules.pdf_task_contract.bind_pdf_request', side_effect=bind), \
             patch('dsh_modules.agent_loop.call_model_proxy', side_effect=replies) as model:
            result = run_agent_loop([{'role':'user','content':'查询实时资讯并生成一页PDF'}],
                'test', RuntimePolicy(), 3, tools=[PDF_RENDER_TOOL,
                {'type':'function','function':{'name':'web_search'}}],
                expected_deliverables=['.pdf'], is_generate_intent=True,
                user_prompt='查询实时资讯并生成一页PDF')
        pages = model.call_args_list[0].kwargs['tools'][0]['function']['parameters']['properties']['pages']
        self.assertEqual((pages['minItems'], pages['maxItems']), (1, 1))
        self.assertEqual(result.outbound_files, [])
        self.assertIn('pages 数组必须恰好有1项', result.final_text)
        self.assertNotIn('补充条件', result.final_text)
        self.assertTrue(any(d['guard']=='pdf_delivery' and d['action']=='reject'
                            for d in result.telemetry.guard_decisions))


@unittest.skipUnless(os.environ.get('PDF_DESIGN_SCRIPTS'), 'PDF runtime required')
class PDFSymbolFallbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, os.environ['PDF_DESIGN_SCRIPTS'])

    def test_common_news_symbols_are_vectors_and_rare_sequences_remain_readable(self):
        from pdf_design.symbols import symbol_html
        from pdf_design.content import plain_text
        icons = '📰🏀🌎💰📍🚗📢✈️'
        self.assertEqual(symbol_html(icons).count('class="pdf-symbol"'), 8)
        html = symbol_html('🇪🇸 🦄 👩🏽\u200d💻 1️⃣ <script>')
        text = plain_text(html)
        self.assertIn('[ES]', text)
        self.assertIn('UNICORN FACE', text)
        self.assertIn('WOMAN', text)
        self.assertIn('SKIN TONE', text)
        self.assertIn('PERSONAL COMPUTER', text)
        self.assertNotIn('<script>', html)
        self.assertNotIn('\u200d', html)
        self.assertIn('1', text)

    def test_real_pdf_displays_known_and_unknown_symbols_without_replacement_glyphs(self):
        from pdf_design import render_report
        from pdf_design.quality import inspect_pdf
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'fallback.pdf'
            render_report(['# 📰 实时资讯', '',
                '| 排名 | 分类 | 状态 |', '|---|---|---|',
                '| 🥇 NO.1 | 🏀 体育 | 📈 上升 |',
                '| 🥈 | 🌎 国际 🇪🇸 | ➖ 持平 |',
                '| 🥉 | 💰 财经 🚗 汽车 | 📍 定位 |', '',
                '未收录图标也显示：🦄，组合图标：👩🏽\u200d💻。'],
                str(path), template='handout', min_pages=1, max_pages=1)
            qa = inspect_pdf(path)
            self.assertTrue(qa['valid'], qa['errors'])
            self.assertIn('UNICORN FACE', qa['pages'][0]['text'])
            self.assertIn('ES', qa['pages'][0]['text'])


if __name__ == '__main__':
    unittest.main()
