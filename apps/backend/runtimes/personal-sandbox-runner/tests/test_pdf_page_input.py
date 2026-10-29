import json
import unittest

from dsh_modules.pdf_page_input import normalize_pages, flow_markdown_chunks


class PageInputTests(unittest.TestCase):
    def test_split_table_rows_remain_one_markdown_table(self):
        self.assertEqual(flow_markdown_chunks(['## 榜单','| 排名 | 标题 |',
            '|---|---|','|1|视频|','说明']),
            '## 榜单\n\n| 排名 | 标题 |\n|---|---|\n|1|视频|\n\n说明')

    def test_recorded_failure_shapes(self):
        pages = ['# 热搜\n正文', '# 视频\n正文', '']
        for value in (pages, json.dumps(pages, ensure_ascii=False)):
            normalized, repairs = normalize_pages(value)
            self.assertEqual(normalized, pages[:2])
            self.assertIn('removed_trailing_empty_pages:1', repairs)
        self.assertEqual(pages[-1], '')

    def test_adjacent_tables_do_not_merge(self):
        first = ['| A | B |','|---|---|','|1|2|']
        second = ['| C | D |','|---|---|','|3|4|']
        self.assertEqual(flow_markdown_chunks(first+second),
                         '\n'.join(first)+'\n\n'+'\n'.join(second))

    def test_valid_content_is_preserved_exactly(self):
        pages = ['  # 标题\n\n正文  ', '_END_']
        self.assertEqual(normalize_pages(pages), (pages, []))

    def test_ambiguous_and_invalid_content_stays_rejected(self):
        for value in ([], ['', ' '], ['正文', '', '第二页'], [None], [{}],
                      '正文', '["正文", "">说明"]', '{"pages":["正文"]}', ['x'] * 101, ['x' * 200001]):
            with self.subTest(value=str(value)[:40]), self.assertRaises(ValueError):
                normalize_pages(value)

    def test_error_identifies_the_invalid_item(self):
        with self.assertRaisesRegex(ValueError, '第2项'):
            normalize_pages(['正文', None])
