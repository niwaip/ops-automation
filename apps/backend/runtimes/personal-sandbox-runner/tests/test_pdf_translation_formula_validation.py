"""Tests for mathematical formula and CID symbol handling in PDF translation."""
import unittest

from pdf_translation.contracts import is_formula, text_units
from pdf_translation.translation_validation import needs_translation, validate_value, validate_translation


class FormulaValidationTests(unittest.TestCase):
    def test_formula_identification_and_bypass(self):
        # 1. 真实论文中公式 (4) 包含 CID 符号与数学变量
        formula_cid = "K (cid:89) p θ (τ,s | x) = p θ (s 1 | x) k=1"
        self.assertTrue(is_formula(formula_cid))
        self.assertFalse(needs_translation(formula_cid))
        # 原样返回公式时不应报错
        self.assertIsNone(validate_value(formula_cid, formula_cid, 'zh-CN'))

        # 2. 积分公式
        integral = "(cid:90) p θ (y | x) ="
        self.assertTrue(is_formula(integral))
        self.assertFalse(needs_translation(integral))
        self.assertIsNone(validate_value(integral, integral, 'zh-CN'))

        # 3. 复杂损失函数/算子公式
        mdl = "λk MDL ℓ(y,yˆ k ), k⋆ = arg min k∈{1,...,K+1}"
        self.assertTrue(is_formula(mdl))
        self.assertFalse(needs_translation(mdl))
        self.assertIsNone(validate_value(mdl, mdl, 'zh-CN'))

    def test_natural_language_not_misidentified_as_formula(self):
        # 普通英文段落
        paragraph = (
            "Current visual reasoning benchmarks focus on the second. "
            "ARC-AGI [1–3], Bongard problems [4, 5], and Raven-style suites [6] "
            "each present a task as a pre-grouped support set sharing a hidden rule."
        )
        self.assertFalse(is_formula(paragraph))
        self.assertTrue(needs_translation(paragraph))
        self.assertEqual(validate_value(paragraph, paragraph, 'zh-CN'), 'source text returned unchanged')

        # 中文翻译文本（数字必须完整对应）
        chinese = (
            "当前的视觉推理基准侧重于第二种能力。ARC-AGI [1–3]、邦戈德问题 [4, 5] "
            "以及类似瑞文智力测验的套件 [6] 均将任务呈现为由共享隐藏规则预分组的支持集。"
        )
        self.assertFalse(is_formula(chinese))
        self.assertIsNone(validate_value(paragraph, chinese, 'zh-CN'))

    def test_figure_with_formula_asset_exempt_from_text_units(self):
        ir = {
            'schema_version': 'pdf-document-ir/1',
            'nodes': [
                {
                    'id': 'p20_b10',
                    'page_id': 'p20',
                    'type': 'figure',
                    'text': 'K (cid:89) p θ (τ,s | x) = p θ (s 1 | x) k=1',
                    'asset': '/tmp/p20_b10.png',
                    'line_ids': ['l1']
                },
                {
                    'id': 'p20_b1',
                    'page_id': 'p20',
                    'type': 'paragraph',
                    'text': 'This is a regular paragraph that needs translation.',
                    'line_ids': ['l2']
                }
            ],
            'pages': [{'id': 'p20', 'lines': [{'id': 'l1'}, {'id': 'l2'}]}],
            'reading_order': ['p20_b10', 'p20_b1'],
            'translations': {
                'p20_b1': '这是一个需要翻译的普通段落。'
            }
        }
        units = list(text_units(ir))
        unit_ids = [u['id'] for u in units]
        # p20_b10 带有 asset 且为公式，应免除普通 text unit 翻译派发
        self.assertNotIn('p20_b10', unit_ids)
        self.assertIn('p20_b1', unit_ids)


if __name__ == '__main__':
    unittest.main()
