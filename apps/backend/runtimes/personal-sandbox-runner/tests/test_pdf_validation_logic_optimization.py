"""Tests for PDF translation validation logic optimization and audit alignment."""
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock

from pdf_translation.translation_validation import validate_value, numbers, numbers_compatible
from pdf_translation.contracts import TranslationError
from pdf_translation.node_repair import repair_nodes
from dsh_modules.pdf_review_contract import validate_review
from dsh_modules.pdf_review_resolution import validate_confirmation
from dsh_modules.pdf_issue_triage import triage_review_issues
from dsh_modules.pdf_publication import has_verified_pdf_publication


class TranslationValidationOptimizationTests(unittest.TestCase):
    def test_cid_glyph_not_treated_as_numeric_fact(self):
        # (cid:80) is a font character code, not a numeral
        err = validate_value('Value (cid:80) 8', '数值 ∑ 8', 'zh-CN')
        self.assertIsNone(err)

    def test_thousands_separator_compatible(self):
        # 1,000 in source should match 1000 in translation
        err = validate_value('Value 1,000', '数值 1000', 'zh-CN')
        self.assertIsNone(err)

    def test_decimal_representation_compatible(self):
        # 1.0 in source should match 1 in translation
        err = validate_value('Value 1.0', '数值 1', 'zh-CN')
        self.assertIsNone(err)

    def test_scientific_notation_compatible(self):
        # 1e3 should match 1000
        err = validate_value('Value 1e3', '数值 1000', 'zh-CN')
        self.assertIsNone(err)

    def test_space_compacted_domain_not_falsely_flagged(self):
        # "See a.b" contains internal space, should not be compacted into domain
        err = validate_value('See a.b', '见 a.b', 'zh-CN')
        self.assertIsNone(err)

    def test_literal_shortcut_rejected_for_sentence(self):
        # A full sentence returned as bare '7' must be rejected
        err = validate_value('The value is 7 and this is the input block', '7', 'zh-CN')
        self.assertIsNotNone(err)
        self.assertIn('literal', err)

    def test_titlecase_sentence_not_exempted_as_brand(self):
        # "This Is A Sentence" should not pass untranslated
        err = validate_value('This Is A Sentence', 'This Is A Sentence', 'zh-CN')
        self.assertEqual(err, 'source text returned unchanged')

    def test_url_prefix_match_strictly_tokenized(self):
        # Substring /a in /attack must be detected as URL changed
        err = validate_value('See https://example.com/a', '见 https://example.com/attack', 'zh-CN')
        self.assertEqual(err, 'URL changed')

    def test_normalized_key_collision_preserves_counts(self):
        # "1" and "01" shouldn't overwrite each other in counter
        err = validate_value('Value 1 01', '数值 1', 'zh-CN')
        self.assertEqual(err, 'numeric values changed')

    def test_cn_num_words_count_bound(self):
        # Two '1's in source cannot be waived by a single '一'
        err = validate_value('Value 1 1', '任意一个句子', 'zh-CN')
        self.assertEqual(err, 'numeric values changed')

    def test_month_extra_counts_bound(self):
        # 'January' can only account for at most one extra '1', not three
        err = validate_value('See January', '见 1 1 1', 'zh-CN')
        self.assertEqual(err, 'numeric values changed')

    def test_real_number_change_still_detected(self):
        err = validate_value('Costs 10.50 dollars.', '费用为10.60美元。', 'zh-CN', strict_numbers=True)
        self.assertEqual(err, 'numeric values changed')

    def test_url_with_chinese_fullwidth_period_accepted(self):
        # Chinese period at end of sentence must not cause 'URL changed' false positive
        src = '[15] Kexin Yi et al. Clevrer, 2020. URL https://arxiv.org/abs/1910.01442.'
        trans = '[15] Kexin Yi 等人。Clevrer：用于视频表征与推理，2020。URL https://arxiv.org/abs/1910.01442。'
        err = validate_value(src, trans, 'zh-CN')
        self.assertIsNone(err)

    def test_academic_citation_in_english_accepted(self):
        # Bibliography citation entry kept in English must not be rejected as 'source text returned unchanged'
        src = '[16] Kevin Ellis, Catherine Wong, Maxwell Nye. Dreamcoder, 2020. URL https://arxiv.org/abs/2006.08381.'
        err = validate_value(src, src, 'zh-CN')
        self.assertIsNone(err)

    def test_real_brand_exemption_preserved(self):
        err = validate_value('IMT: Immersive Translate PDF Pro.', 'IMT：Immersive Translate PDF Pro。', 'zh-CN')
        self.assertIsNone(err)

    def test_spelled_out_english_cardinal_word_to_arabic_numeral_accepted(self):
        # "Forty of these cases" in source translated to "其中 40 个案例" must not trigger 'numeric values changed'
        src = ('The right objects in the wrong places. In 89 of the 154 parseable errors (57.8%), '
               'the prediction can be reproduced exactly. Forty of these cases also reproduce required '
               'appearance changes. For example, a two-cell-high object')
        trans = ('物体正确，位置错误。在 154 个可解析的错误中，有 89 个（57.8%）的预测仅通过改变位置即可被精确复现。'
                 '其中 40 个案例还复现了所需的外观变化。例如，一个两格高的物体')
        err = validate_value(src, trans, 'zh-CN')
        self.assertIsNone(err)

    def test_compound_english_cardinal_word_accepted(self):
        # Hyphenated English compound words like 'twenty-one' to '21'
        src = 'Twenty-one distinct models were evaluated.'
        trans = '评估了 21 个不同的模型。'
        err = validate_value(src, trans, 'zh-CN')
        self.assertIsNone(err)

    def test_arabic_numeral_to_chinese_cardinal_accepted(self):
        # Arabic numeral '40' to Chinese cardinal '四十'
        src = 'In 40 cases, the behavior was observed.'
        trans = '在四十个案例中，观察到了该行为。'
        err = validate_value(src, trans, 'zh-CN')
        self.assertIsNone(err)

    def test_real_number_mismatch_with_word_still_caught(self):
        # English word 'Forty' translated as wrong numeral '50' must still be caught
        src = 'Forty of these cases reproduced the behavior.'
        trans = '其中 50 个案例复现了该行为。'
        err = validate_value(src, trans, 'zh-CN')
        self.assertEqual(err, 'numeric values changed')


class ReviewAndResolutionOptimizationTests(unittest.TestCase):
    def test_review_negated_duplicate_accepted(self):
        # "PASS\n不存在重复内容。" should pass without keyword false positive
        validate_review('PASS\n不存在重复内容。')

    def test_review_negated_suggestion_accepted(self):
        # "PASS\n不建议修改。" should pass without keyword false positive
        validate_review('PASS\n不建议修改。')

    def test_review_genuine_issue_rejected(self):
        with self.assertRaises(ValueError):
            validate_review('PASS\n存在重复内容，需要修改。')

    def test_duplicate_resolution_target_rejected(self):
        initial = 'REPAIR\n1. ALPHA issue\n2. BETA issue'
        records = {str(i): dict(status='refuted', quote='ALPHA issue',
                                evidence='这是用于校验协议长度条件的固定占位证据文字。') for i in (1, 2)}
        confirmation = 'PASS\nRESOLUTIONS: ' + json.dumps(records, ensure_ascii=False)
        with self.assertRaises(ValueError):
            validate_confirmation(initial, confirmation)

    def test_valid_confirmation_both_issues_refuted_accepted(self):
        initial = 'REPAIR\n1. ALPHA issue\n2. BETA issue'
        records = {
            '1': dict(status='refuted', quote='ALPHA issue', evidence='这是用于校验协议长度条件的ALPHA反驳证据文字。'),
            '2': dict(status='refuted', quote='BETA issue', evidence='这是用于校验协议长度条件的BETA反驳证据文字。')
        }
        confirmation = 'PASS\nRESOLUTIONS: ' + json.dumps(records, ensure_ascii=False)
        validate_confirmation(initial, confirmation)

    def test_validate_confirmation_translation_mode_accepts_pass_without_evidence(self):
        initial = 'REPAIR\nISSUES: [{"kind": "layout", "anchor": "p1", "quote": "txt", "evidence": "err"}]'
        # In translation mode, PASS without resolutions is accepted immediately
        validate_confirmation(initial, 'PASS', is_translation=True)
        validate_confirmation(initial, '【文档/图片 (page-11.png) 视觉分析与内容识别结果】:\nPASS', is_translation=True)

    def test_extract_review_issues_unclosed_array(self):
        from dsh_modules.pdf_review_contract import extract_review_issues
        bad_json = 'REPAIR\nISSUES: [{"kind": "layout", "anchor": "p1", "quote": "txt", "evidence": "err"}'
        issues = extract_review_issues(bad_json, page_number=11)
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]['kind'], 'layout')


class TriageAndRepairOptimizationTests(unittest.TestCase):
    def test_table_triage_targets_specific_table_by_anchor_and_quote(self):
        ir = {'nodes': [dict(id='t1', type='table', text='table alpha', page_id='p1'),
                        dict(id='t2', type='table', text='table beta', page_id='p1')]}
        issue = dict(page=1, kind='table', quote='table beta', anchor='t2', evidence='columns')
        plan = triage_review_issues([issue], ir,
            {'pages': [dict(page=1, nodes=['t1', 't2'], tables=['t1', 't2'])]})
        self.assertEqual(plan['tables_to_rebuild'], ['t2'])

    def test_repair_nodes_rejects_empty_translation_for_single_node(self):
        gateway = MagicMock()
        gateway.translate.return_value = {'n1': ''}
        with tempfile.TemporaryDirectory() as folder:
            ir = {'nodes': [dict(id='n1', type='paragraph', text='Value 7')], 'translations': {'n1': '数值7'}}
            with self.assertRaises(TranslationError):
                repair_nodes(ir, ['n1'], gateway, Path(folder), None)

    def test_publication_verification_with_repaired_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'output.pdf'
            path.write_bytes(b'new candidate bytes')
            old = hashlib.sha256(b'old candidate bytes').hexdigest()
            new = hashlib.sha256(path.read_bytes()).hexdigest()
            # Old render receipt fails verification
            receipts = [
                SimpleNamespace(is_success=True, data=dict(kind='pdf_render', file_path=str(path), sha256=old, page_count=1)),
                SimpleNamespace(is_success=True, data=dict(kind='pdf_page_review', file_path=str(path), sha256=new, page=1, published=True)),
            ]
            self.assertFalse(has_verified_pdf_publication(receipts))
            # New render receipt succeeds verification
            receipts[0].data['sha256'] = new
            self.assertTrue(has_verified_pdf_publication(receipts))


if __name__ == '__main__':
    unittest.main()
