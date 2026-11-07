"""Reproduce the 23:38 evidence, including adjacent tokens and cross-ID contamination."""
import json
from pathlib import Path
import time
import unittest

import test_pdf_translation_engine as fixture
from pdf_translation.protected_numbers import protect_prompt, restore_response, ProtectedResponse
from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
from pdf_translation.layout_analyzer import materialize_page
from pdf_translation.pipeline import run_job
from pdf_translation.contracts import read_json

FIXTURES = Path(__file__).parent / 'fixtures/pdf_translation'


class NumericBoundaryTests(unittest.TestCase):
    def test_exact_saved_response_accepts_adjacent_tokens_but_rejects_cross_id(self):
        evidence = read_json(FIXTURES / '2338-translation-response.json')
        _, maps = protect_prompt('\nInput:\n' + json.dumps(evidence['source']))
        result = restore_response(evidence['response'], maps)
        self.assertNotIn('p1_b8', result.validation_errors)
        self.assertEqual(result['p1_b8'], evidence['source']['p1_b8'])
        for key in ('p1_b13', 'p1_b14'):
            self.assertIn(key, result.validation_errors)
            self.assertIn('unknown', result.validation_errors[key])

    def test_boundaries_and_independent_failure_categories(self):
        _, maps = protect_prompt('\nInput:\n' + json.dumps({'id': '4v2507.03009'}))
        a, b = list(maps['id'])
        for separator in ('', 'v', 'abc_', '-', '.'):
            result = restore_response({'id': a + separator + b}, maps)
            self.assertFalse(result.validation_errors)
            self.assertEqual(result['id'], '4' + separator + '2507.03009')
        cases = [(a, 'missing'), (a + b + b, 'duplicated'),
                 (a + b + '__PDF_NUM_abcdef123456_99__', 'unknown'),
                 (a + b + '__PDF_NUM_badsignature_0__', 'malformed')]
        for value, category in cases:
            result = restore_response({'id': value}, maps)
            self.assertIn('id', result.validation_errors)
            details = json.loads(result.validation_errors['id'].split(': ', 1)[1])
            self.assertTrue(details[category])

    def test_ordinal_century_literal_and_stuttered_prefix_recovery(self):
        from pdf_translation.translation_validation import validate_value
        src = ('Rainald Von Gizycki. 1973. Centre and Periphery in the International '
               'Scientific Community: Germany, France and Great Britain in the 19th Century. 11(4):474–494.')
        _, maps = protect_prompt('\nInput:\n' + json.dumps({'p6_b20': src}))
        t = list(maps['p6_b20'])
        attempt1 = (f'雷纳尔·冯·吉齐茨基. {t[0]}. 国际科学共同体中的中心与边缘：'
                    f'19世纪的德国、法国和大不列颠. {t[2]}({t[3]}):{t[4]}–{t[5]}.')
        res1 = restore_response({'p6_b20': attempt1}, maps)
        self.assertEqual(res1.validation_errors, {})
        self.assertIsNone(validate_value(src, res1['p6_b20'], 'zh-CN'))
        attempt2 = (f'莱纳德·冯·吉齐茨基。{t[0]}。《国际科学共同体中的中心与边缘：'
                    f'1{t[1]}世纪的德国、法国和大不列颠》。{t[2]}（{t[3]}）：{t[4]}–{t[5]}。')
        res2 = restore_response({'p6_b20': attempt2}, maps)
        self.assertEqual(res2.validation_errors, {})
        self.assertIn('19世纪', res2['p6_b20'])
        self.assertNotIn('119世纪', res2['p6_b20'])
        self.assertIsNone(validate_value(src, res2['p6_b20'], 'zh-CN'))

    def test_references_heading_promotes_bibliography_paragraphs_to_reference(self):
        page = dict(
            id='p6', width_pt=595, height_pt=842, table_candidates=[],
            lines=[
                dict(id='l1', text='References', bbox=[70, 316, 126, 328]),
                dict(id='l2', text='Weishu Liu. The changing role. 30(2):115–123.', bbox=[70, 336, 290, 360]),
                dict(id='l3', text='Rainald Von Gizycki. 1973. Centre and Periphery. 11(4):474–494.', bbox=[306, 339, 524, 370]),
            ],
        )
        blocks = [
            dict(type='heading', line_ids=['l1'], bbox=[70, 316, 126, 328], column=1),
            dict(type='paragraph', line_ids=['l2'], bbox=[70, 336, 290, 360], column=1),
            dict(type='paragraph', line_ids=['l3'], bbox=[306, 339, 524, 370], column=2),
        ]
        nodes = materialize_page(dict(columns=2, blocks=blocks), page)
        self.assertEqual([n['type'] for n in nodes], ['heading', 'reference', 'reference'])

    def test_figure_detached_body_paragraph_does_not_trigger_label_clipping(self):
        page = read_json(FIXTURES / '2338-verification-page2.json')
        cands = candidate_lines(page)
        bad_layout = {
            'columns': 2,
            'blocks': [
                {'type': 'figure', 'line_ids': ['p2_g17', 'p2_g18'],
                 'bbox': [70.59, 70.87, 580.41, 349.86], 'column': 0},
                {'type': 'caption', 'line_ids': ['p2_g19'],
                 'bbox': [155.84, 355.86, 442.54, 363.16], 'column': 0},
                {'type': 'heading', 'line_ids': ['p2_g15'],
                 'bbox': [70.87, 394.03, 193.1, 404.94], 'column': 1},
                {'type': 'paragraph', 'line_ids': ['p2_g16', 'p2_g20', 'p2_g21', 'p2_g22'],
                 'bbox': [70.53, 413.04, 291.04, 774.77], 'column': 1},
                {'type': 'paragraph', 'line_ids': ['p2_g26', 'p2_g27', 'p2_g28', 'p2_g29', 'p2_g30', 'p2_g31', 'p2_g32'],
                 'bbox': [305.8, 394.11, 526.23, 774.77], 'column': 2},
            ],
        }
        nodes = materialize_page(expand_candidates(bad_layout, cands, page), page)
        fig = next(n for n in nodes if n['type'] == 'figure')
        self.assertLessEqual(fig['bbox'][3], 350.0)
        cap = next(n for n in nodes if n['type'] == 'caption')
        self.assertIn('Figure 1:', cap['text'])

    def test_actual_mixed_rotated_block_is_separated_without_dropping_dagger(self):
        page = read_json(FIXTURES / '2338-page1.json')
        response = read_json(FIXTURES / '2338-layout1.json')
        nodes = materialize_page(expand_candidates(response, candidate_lines(page), page), page)
        margin = {l['id'] for l in page['lines'] if l['rotated']}
        furniture = {lid for n in nodes if n['type'] == 'furniture' for lid in n['line_ids']}
        self.assertTrue(margin <= furniture)
        for n in nodes:
            if n['type'] != 'furniture':
                self.assertFalse(set(n['line_ids']) & margin)
        assigned = [lid for n in nodes for lid in n['line_ids']]
        self.assertEqual(set(assigned), {l['id'] for l in page['lines']})
        self.assertEqual(len(assigned), len(set(assigned)))
        dagger = next(l['id'] for l in page['lines'] if l['text'] == '†')
        self.assertNotIn(dagger, furniture)


class IsolatedCorrectionTests(unittest.TestCase):
    setUp = fixture.TranslationEngineTests.setUp
    tearDown = fixture.TranslationEngineTests.tearDown

    def test_cross_id_feedback_is_not_reintroduced_and_corrections_are_singletons(self):
        requests = []
        class Gateway(fixture.FixtureGateway):
            def translate(self, prompt):
                source = json.loads(prompt.split('\nInput:\n')[1])
                requests.append((source, prompt))
                if len(requests) == 1:
                    result = super().translate(prompt)
                    return ProtectedResponse(result, {k: 'protected numeric tokens invalid: FOREIGN_TOKEN'
                                                       for k in source})
                self.assert_singleton(source)
                return super().translate(prompt)
            def assert_singleton(self, source):
                if len(source) != 1:
                    raise AssertionError('retry must contain exactly one ID')
        result = run_job(self.source, self.root / 'out.pdf', gateway_factory=Gateway)
        self.assertEqual(read_json(result)['state'], 'candidate_ready')
        self.assertEqual(len(requests), 4)
        for source, prompt in requests[1:]:
            self.assertNotIn('FOREIGN_TOKEN', prompt)
        self.assertEqual(len(list((result.parent / 'translation-attempts').glob('*.json'))), 4)


class FigureAssociationTests(unittest.TestCase):
    def test_real_failed_preview_separates_caption_workflow_and_example_quote(self):
        from pdf_translation.contracts import validate_ir, IR_SCHEMA, text_units
        page = read_json(FIXTURES / '2338-verification-page2.json')
        response = read_json(FIXTURES / '2338-verification-layout2.json')
        nodes = materialize_page(expand_candidates(response, candidate_lines(page), page), page)
        figure = next(n for n in nodes if n['type'] == 'figure')
        caption = next(n for n in nodes if n['type'] == 'caption')
        self.assertNotIn('Figure 1:', figure['text'])
        self.assertIn('Figure 1:', caption['text'])
        self.assertLess(figure['bbox'][3], caption['bbox'][1])
        legends = figure['legend_units']
        labels = [u['text'] for u in legends[:5]]
        self.assertEqual(labels[0], '1. File-reading')
        self.assertEqual(labels[2], '3. Streamlining')
        self.assertNotIn('China', labels[0])
        self.assertIn('China', legends[-1]['text'])
        ir = dict(schema_version=IR_SCHEMA, source={'page_count': 1}, pages=[page],
                  nodes=nodes, reading_order=[n['id'] for n in nodes])
        validate_ir(ir)
        ids = {n['id'] for n in text_units(ir)}
        self.assertNotIn(figure['id'], ids)
        self.assertTrue({u['id'] for u in legends} <= ids)
        self.assertEqual(next(n for n in nodes if n['text'].startswith('2.1 Precise'))['type'], 'heading')
        body = next(n for n in nodes if n['text'].startswith('To increase'))
        self.assertIn('Neural Network Exchange', body['text'])
        legends[0]['text'] += 'invented source'
        with self.assertRaisesRegex(Exception, '图例文字与原生行不一致'):
            validate_ir(ir)
