"""Explicit user layout and named content must survive a model's page-budget repair."""

from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from dsh_modules.pdf_task_contract import bind_pdf_request, validate_pdf_content, remove_unrequested_emoji, remove_metadata_echoes, prepare_handout_content

PROMPT = ('/pdf 生成《城市自然观察手册》，共2页，handout 暖色，不要独立封面，文件名 handout.pdf。'
          '副标题为“观察、记录与分享”，署名“阅读与实践”。'
          '第1页：一幅简洁的叶片示意图，以及“观察对象 / 可以记录什么 / 一个小提示”三列表格，包含树木、鸟类、天空。'
          '第2页：三个引导问题，以及时间天气、地点、有趣发现、待探索问题四项记录卡。')
CONTENT = ('# 城市自然观察手册\n\n![叶片](leaf.svg)\n\n'
           '| 观察对象 | 可以记录什么 | 一个小提示 |\n| --- | --- | --- |\n'
           '| 树木 | 叶片 | 比较 |\n| 鸟类 | 声音 | 安静 |\n| 天空 | 云 | 看变化 |\n\n'
           '<!-- pagebreak -->\n\n1. 看到了什么？\n2. 为什么会变化？\n3. 如何进一步观察？\n\n'
           '| 项目 | 记录 |\n| --- | --- |\n| 时间天气 | |\n| 地点 | |\n| 有趣发现 | |\n| 待探索问题 | |')


class PDFTaskContractTests(unittest.TestCase):
    def test_explicit_parameters_override_conflicting_model_arguments(self):
        result = bind_pdf_request({'output_path': 'other.pdf', 'theme': 'emerald',
                                   'max_pages': 4, 'cover': True}, PROMPT)
        self.assertEqual(result, {'output_path': 'handout.pdf', 'theme': 'warm', 'min_pages': 2,
            'max_pages': 2, 'cover': False, 'template': 'handout', 'title': '城市自然观察手册',
            'subtitle': '观察、记录与分享', 'author': '阅读与实践'})

    def test_complete_content_passes_and_omissions_cannot_be_fixed_by_deleting_requirements(self):
        validate_pdf_content(CONTENT, PROMPT)
        for before, after, expected in (
            ('可以记录什么', '记录内容', '表头'), ('天空', '花朵', '天空'),
            ('待探索问题', '改进', '待探索问题'), ('![叶片](leaf.svg)', '', '插图'),
            ('3. 如何进一步观察？', '', '引导问题'),
        ):
            with self.subTest(expected=expected), self.assertRaisesRegex(ValueError, expected):
                validate_pdf_content(CONTENT.replace(before, after), PROMPT)

    def test_symbols_are_preserved_for_font_independent_renderer(self):
        self.assertEqual(remove_unrequested_emoji('# 🌿 自然\n\n✅ 准备', PROMPT), '# 🌿 自然\n\n✅ 准备')
        self.assertEqual(remove_unrequested_emoji('🌿 叶片', '保留 🌿 叶片'), '🌿 叶片')

    def test_template_metadata_is_not_duplicated_in_the_body(self):
        content = '# 城市自然观察手册\n\n> 观察、记录与分享\n> 署名：阅读与实践\n\n真正的正文。'
        result = remove_metadata_echoes(content, bind_pdf_request({}, PROMPT))
        self.assertNotIn('城市自然观察手册', result)
        self.assertNotIn('署名', result)
        self.assertIn('真正的正文', result)

    def test_handout_removes_spacing_hacks_but_keeps_content_and_table_rules(self):
        text = '---\n</br>\n<block type="tip">\n注意安全\n</block>\n\n| 对象 | 记录 |\n| --- | --- |\n________________'
        result = prepare_handout_content(text)
        self.assertNotIn('</br>', result)
        self.assertNotIn('<block', result)
        self.assertIn('> 注意安全', result)
        self.assertIn('| --- | --- |', result)
        self.assertIn('________________', result)

    def test_preparation_method_and_blank_record_card_requirements_are_preserved(self):
        for request, body, error in (
            ('第1页：出发前的准备清单。', '带一本本子。', '准备清单'),
            ('第1页：观察时的温馨提示。', '安静观察。', '温馨提示'),
            ('第2页：如何写观察记录。', '<!-- pagebreak -->\n随便记录。', '记录方法'),
            ('第1页：四项记录卡。', '时间天气：2024年4月15日，晴。', '具体日期'),
        ):
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, error):
                validate_pdf_content(body, request)

    def test_judge_resolves_chinese_phrasing_without_hardcoded_mapping(self):
        from unittest.mock import patch
        chinese_prompt = (
            '帮我生成一份《城市自然观察手册》的pdf，面向小学生，共2页，A4打印版，使用 讲义版式和暖色主题，不要独立封面\n'
            '副标题为“观察、记录与分享”，署名“阅读与实践”。'
        )
        mock_decision = {
            'title': '城市自然观察手册',
            'subtitle': '观察、记录与分享',
            'author': '阅读与实践',
            'template': 'handout',
            'theme': 'warm',
            'min_pages': 2,
            'max_pages': 2,
            'cover': False,
            'output_path': '城市自然观察手册.pdf',
        }
        with patch('dsh_modules.pdf_contract_judge.PdfContractJudge.judge_pdf_contract', return_value=mock_decision) as judge_mock:
            bound = bind_pdf_request({'output_path': 'document.pdf'}, chinese_prompt)
            judge_mock.assert_called_once()
            self.assertEqual(bound.get('template'), 'handout')
            self.assertEqual(bound.get('theme'), 'warm')
            self.assertEqual(bound.get('cover'), False)
            self.assertEqual(bound.get('min_pages'), 2)
            self.assertEqual(bound.get('max_pages'), 2)
            self.assertEqual(bound.get('title'), '城市自然观察手册')
            self.assertEqual(bound.get('subtitle'), '观察、记录与分享')
            self.assertEqual(bound.get('author'), '阅读与实践')
            self.assertEqual(bound.get('output_path'), '城市自然观察手册.pdf')

    def test_unrequested_page_limits_are_not_bound(self):
        prompt = '生成pdf文件'
        hallucinated_decision = {
            'template': 'handout',
            'theme': 'blue',
            'min_pages': 1,
            'max_pages': 1,
            'cover': False,
            'output_path': 'document.pdf',
        }
        with patch('dsh_modules.pdf_contract_judge.PdfContractJudge.judge_pdf_contract', return_value=hallucinated_decision):
            bound = bind_pdf_request({'output_path': 'document.pdf'}, prompt)
            self.assertEqual(bound.get('template'), 'handout')
            self.assertNotIn('min_pages', bound)
            self.assertNotIn('max_pages', bound)

    def test_judge_caching_and_telemetry_isolation(self):
        from dsh_modules.pdf_contract_judge import PdfContractJudge
        from dsh_modules.telemetry import TelemetryStats
        import tempfile
        import json

        prompt = '测试缓存与隔离的提示词《演示文档》讲义版式'
        mock_result = {
            'template': 'handout',
            'theme': 'blue',
            'title': '演示文档',
            'subtitle': None,
            'author': None,
            'min_pages': 1,
            'max_pages': 2,
            'cover': False,
            'output_path': '演示文档.pdf',
        }
        with tempfile.TemporaryDirectory() as cache_dir:
            orig_cache_dir = PdfContractJudge._FALLBACK_CACHE_DIR
            PdfContractJudge._FALLBACK_CACHE_DIR = Path(cache_dir)
            PdfContractJudge._CACHE_DIR = Path(cache_dir)
            try:
                # Pre-populate cache
                cache_path = PdfContractJudge._cache_path(prompt)
                cache_path.write_text(json.dumps(mock_result), encoding='utf-8')

                t = TelemetryStats()
                result = PdfContractJudge.judge_pdf_contract(prompt, telemetry=t)
                self.assertEqual(result, mock_result)
                # Ensure parent telemetry invocations not incremented by cache read
                self.assertEqual(t.llm_invocations, 0)
            finally:
                PdfContractJudge._FALLBACK_CACHE_DIR = orig_cache_dir



if __name__ == '__main__':
    unittest.main()
