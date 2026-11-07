"""Regress the actual author, geometry, recovery and accounting failures."""
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import patch

import test_pdf_translation_engine as engine_fixture
import test_pdf_translation_delivery as delivery_fixture
from test_pdf_translation_engine import FixtureGateway
from pdf_translation.contracts import read_json, TranslationError
from pdf_translation.pipeline import run_job
from pdf_translation.region_validation import validate_regions
from pdf_translation.native_parser import page_lines
from dsh_modules.shell_tools import execute_shell
from dsh_modules.pdf_translation_bridge import recognized_command


class RepairEngineTests(unittest.TestCase):
    setUp = engine_fixture.TranslationEngineTests.setUp
    tearDown = engine_fixture.TranslationEngineTests.tearDown
    def test_caption_misclassified_as_figure_recovers_native_image(self):
        from pdf_translation.graphic_candidates import reconcile_graphic_candidates
        candidate = dict(id='c1', text='Figure 3: Major commands for CLI', bbox=[344, 305, 486, 316])
        page = dict(width_pt=595, height_pt=842, lines=[], visual_bounds=[[306, 259, 524, 295]])
        blocks = [dict(type='figure', line_ids=['c1'], bbox=[344, 305, 486, 316], column=2)]
        with self.assertRaisesRegex(ValueError, 'native graphic is omitted'):
            validate_regions([dict(blocks[0], id='b1')], page)
        result = reconcile_graphic_candidates(blocks, [candidate], page)
        self.assertEqual(result[0]['bbox'], [306, 259, 524, 295])
        self.assertEqual(result[0]['line_ids'], [])
        self.assertEqual(result[1]['type'], 'caption')
        self.assertEqual(result[1]['line_ids'], ['c1'])
        validate_regions([dict(result[0], id='b1')], page)

    def test_resume_reuses_layout_and_translates_only_rejected_unit(self):
        class RejectOne(FixtureGateway):
            def translate(self, prompt):
                result = super().translate(prompt)
                if 'p1_b2' in result:
                    result['p1_b2'] = 'First paragraph 10.'
                return result
        with self.assertRaisesRegex(TranslationError, 'source text returned unchanged'):
            run_job(self.source, self.root / 'out.pdf', gateway_factory=RejectOne)
        folder = next(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json')).parent
        errors = read_json(folder / 'translation-failures.json')
        self.assertEqual(errors['errors'], {'p1_b2': 'source text returned unchanged'})
        self.assertEqual(len(list((folder / 'translation-attempts').glob('*.json'))), 2)
        requested = []
        class Resume(FixtureGateway):
            def layout(self, *args):
                raise AssertionError('resume must not repeat layout analysis')
            def translate(self, prompt):
                requested.extend(json.loads(prompt.split('\nInput:\n')[1]))
                return super().translate(prompt)
        manifest = run_job(self.source, self.root / 'out.pdf', resume=folder, gateway_factory=Resume)
        self.assertEqual(read_json(manifest)['state'], 'candidate_ready')
        self.assertEqual(requested, ['p1_b2'])

    def test_author_baseline_preserves_names_and_affiliation_order(self):
        class Page:
            def extract_words(self, **kwargs):
                return [dict(text=t, x0=x, x1=x + 20, top=top, bottom=122.3, upright=True)
                        for t, x, top in [('Rongxin', 100, 110.4), ('Ouyang1,†,', 121, 109.1),
                                          ('Chang', 142, 110.4), ('Chu2,†,*', 163, 109.1)]]
        lines = page_lines(Page(), 'p1')
        self.assertEqual([l['text'] for l in lines], ['Rongxin Ouyang1,†, Chang Chu2,†,*'])

    def test_original_paper_author_line_is_read_in_visual_order(self):
        import pdfplumber
        source = Path('/repo/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.sessions/chat-session-1793948895385-0czd8fvz/2507.03009v4.pdf')
        with pdfplumber.open(source) as pdf:
            lines = page_lines(pdf.pages[0], 'p1')
        authors = next(l['text'] for l in lines if 'Rongxin' in l['text'])
        self.assertLess(authors.index('Rongxin'), authors.index('Ouyang'))
        self.assertLess(authors.index('Ouyang'), authors.index('Chang'))
        self.assertLess(authors.index('Chang'), authors.index('Chu'))
        self.assertNotIn('Funstory', authors)

    def test_repeated_unpack_cannot_mix_event_files_or_overwrite_checkpoint(self):
        directory = self.root / 'prepared'
        run_job(self.source, mode='unpack', work_dir=directory, gateway_factory=FixtureGateway)
        before = (directory / 'source.ir.json').read_bytes()
        with self.assertRaisesRegex(TranslationError, '准备目录已存在'):
            run_job(self.source, mode='unpack', work_dir=directory, gateway_factory=FixtureGateway)
        self.assertEqual((directory / 'source.ir.json').read_bytes(), before)
        self.assertEqual(len(list(self.root.glob('.dsh/pdf-jobs/*/*/manifest.json'))), 2)

    def test_final_geometry_rejects_collapsed_regions(self):
        page = {'width_pt': 595, 'height_pt': 842, 'lines': []}
        for box in ([344.28, 316.72, 486.27, 315.72], [344.28, 315.72, 486.27, 316.72]):
            with self.assertRaises(ValueError):
                validate_regions([dict(id='figure', type='figure', bbox=box, line_ids=[])], page)

    def test_numeric_protection_preserves_footnote_and_rejects_dropped_token(self):
        from pdf_translation.protected_numbers import protect_prompt, restore_response
        from pdf_translation.translation_validation import validate_value
        source = {'paragraph': 'Open Neural Net- 2 work Exchange (2024).'}
        prompt, mappings = protect_prompt('\nInput:\n' + json.dumps(source))
        tokens = list(mappings['paragraph'])
        result = restore_response({'paragraph': f'开放神经网络交换{tokens[0]}（{tokens[1]}）。'}, mappings)
        self.assertEqual(result.validation_errors, {})
        self.assertIsNone(validate_value(source['paragraph'], result['paragraph'], 'zh-CN'))
        rejected = restore_response({'paragraph': f'开放神经网络交换（{tokens[1]}）。'}, mappings)
        self.assertIn('paragraph', rejected.validation_errors)

    def test_real_page_graphic_keeps_vector_frame_and_separates_section_heading(self):
        from pdf_translation.native_parser import parse_native
        from pdf_translation.paragraph_candidates import candidate_lines, expand_candidates
        from pdf_translation.layout_analyzer import materialize_page
        source = Path('/repo/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.sessions/chat-session-1793948895385-0czd8fvz/2507.03009v4.pdf')
        page = parse_native(source, self.root, time.monotonic() + 30)['pages'][1]
        response = read_json(Path(__file__).parent / 'fixtures/pdf_translation/p2-layout-v2.json')
        nodes = materialize_page(expand_candidates(response, candidate_lines(page), page), page)
        figure = next(n for n in nodes if n['type'] == 'figure')
        caption = next(n for n in nodes if n['type'] == 'caption')
        heading = next(n for n in nodes if n['text'].startswith('2.1 Precise'))
        body = next(n for n in nodes if n['text'].startswith('Preserving layouts'))
        self.assertGreaterEqual(figure['bbox'][3], 349.85)
        self.assertLess(figure['bbox'][3], caption['bbox'][1])
        self.assertEqual(heading['type'], 'heading')
        self.assertLess(nodes.index(heading), nodes.index(body))
        self.assertNotIn('2.1 Precise', figure['text'])

    def test_author_role_error_is_repaired_before_translation(self):
        from pdf_translation.layout_analyzer import materialize_page
        page = dict(id='p1', width_pt=595, height_pt=842, table_candidates=[],
            lines=[dict(id='p1_l1', text='Rongxin Ouyang1,†, Chang Chu2,†,*', bbox=[100, 110, 400, 124])])
        block = dict(type='paragraph', line_ids=['p1_l1'], column=0)
        with self.assertRaisesRegex(ValueError, 'author name row'):
            materialize_page(dict(columns=1, blocks=[block]), page)
        block['type'] = 'author'
        self.assertEqual(materialize_page(dict(columns=1, blocks=[block]), page)[0]['type'], 'author')

    def test_pack_requires_translation_and_completed_checkpoint(self):
        directory = self.root / 'prepared'
        run_job(self.source, mode='unpack', work_dir=directory, gateway_factory=FixtureGateway)
        with self.assertRaisesRegex(TranslationError, 'auto INPUT OUTPUT --resume'):
            run_job(self.source, self.root / 'out.pdf', mode='pack', work_dir=directory,
                    gateway_factory=FixtureGateway)


class RepairBridgeTests(unittest.TestCase):
    setUp = delivery_fixture.TranslationDeliveryTests.setUp
    tearDown = delivery_fixture.TranslationDeliveryTests.tearDown
    def test_unpack_uses_same_budget_and_parent_ledger(self):
        directory = self.root / 'prepared'
        script = '/opt/dsh/skills/pdf/scripts/flow_pdf_translate.py'
        cmd = f'timeout 120 python3 {script} unpack {self.source} {directory} 2>&1'
        with patch.dict(os.environ, {'DSH_BASH_TIMEOUT': '.01'}):
            receipt = execute_shell(cmd, str(self.root), time.monotonic() + 100)
        self.assertTrue(receipt.tool_result.is_success, str(receipt))
        self.assertEqual(receipt.tool_result.data['state'], 'unpacked')
        self.assertEqual(len(self.telemetry.calls_ledger), 1)
        self.assertEqual(self.telemetry.tokens['total_tokens'], 140)
        self.assertEqual(read_json(directory / 'manifest.json')['parent_run_id'],
                         receipt.tool_result.data['parent_run_id'])
        self.assertTrue((directory / 'source.ir.json').is_file())
        self.assertEqual(len(list(self.root.glob('.dsh/pdf-jobs/*/*/model-events.jsonl'))), 1)

    def test_shared_grammar_rejects_bad_options_and_accepts_continuations(self):
        script = '/opt/dsh/skills/pdf/scripts/flow_pdf_translate.py'
        self.assertIsNone(recognized_command(f'python3 {script} auto --unpack source.pdf /tmp/work', self.root))
        self.assertEqual(recognized_command(f'python3 {script} auto \\\n {self.source} {self.target}', self.root),
                         (str(self.source), str(self.target)))

    def test_bad_cli_option_does_not_create_fake_source_or_output_job(self):
        receipt = execute_shell('python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py '
            f'auto --unpack {self.source} /tmp/work', str(self.root), time.monotonic() + 60)
        self.assertTrue(receipt.tool_result.is_error)
        self.assertIn('invalid_arguments', str(receipt))
        self.assertEqual(list(self.root.glob('.dsh/pdf-jobs/*/*/context.json')), [])
