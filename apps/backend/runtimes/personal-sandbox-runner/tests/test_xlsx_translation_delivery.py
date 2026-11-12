"""Regressions for source context, actual output text, cache reuse and publication."""
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
import zipfile

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / 'src'))
sys.path.insert(0, str(BASE / 'skills/xlsx/scripts'))
import test_xlsx_translation_fixes as prefix_fixtures
import test_xlsx_translation_turn as workflow_fixtures
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.xlsx_translation_turn import execute_translation, try_run_xlsx_translation
import xlsx_translation_batches as batches
import xlsx_translation_client as client
from xlsx_formula_references import split_protected_prefix
from xlsx_translation_quality import validate_delivery

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
VALUES = {'選択': '选择', 'あり': '有', 'なし': '无', '元表': '源表', '結果': '结果',
          'システム': '系统', '管理': '管理', '合格': '合格', '不合格': '不合格',
          'セキュリティ計画': '安全计划'}
PREFIX_VALUES = {'クラウド設定確認': '云配置确认', 'チェックリスト': '检查清单',
                 '選択': '选择', '（その他）': '（其他）', '（未対応）': '（未应对）',
                 '（対応済）': '（已应对）', '1年に1回以上見直しを実施する': '至少每年开展一次审查',
                 '重要項目': '重要项目', '運用手順': '运维流程'}


def replace_parts(source, target, change):
    with zipfile.ZipFile(source) as before:
        parts = {name: before.read(name) for name in before.namelist()}
    change(parts)
    with zipfile.ZipFile(target, 'w') as after:
        for name, data in parts.items():
            after.writestr(name, data)


class XlsxTranslationDeliveryTests(unittest.TestCase):
    def setUp(self):
        review = patch.object(client, 'review_batch', side_effect=lambda source, candidate, *a, **kw: candidate)
        review.start()
        self.addCleanup(review.stop)

    def test_review_receives_source_and_candidate_and_only_reviewed_text_is_cached(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            inputs = root / 'input.json'
            inputs.write_text(json.dumps({'a': '外部業者のセキュリティ'}))
            def model(batch, *args, **kwargs):
                return {key: '外部机构的 security 状况' for key in batch}
            def review(source, candidate, target_lang, *args, **kwargs):
                self.assertEqual(list(source.values()), ['外部業者のセキュリティ'])
                self.assertEqual(list(candidate.values()), ['外部机构的 security 状况'])
                self.assertEqual(target_lang, 'zh-CN')
                return {key: '外部机构的安全状况' for key in source}
            with contextlib.redirect_stdout(io.StringIO()):
                result = batches.translate_texts(inputs, root / 'output.json', concurrency=1,
                    is_passthrough=lambda _: False, translate_batch_fn=model, review_batch_fn=review,
                    session_id='language-check')
            self.assertEqual(result['a'], '外部机构的安全状况')
            saved = json.loads((root / '.translation_cache.json').read_text())
            self.assertEqual(saved, {'外部業者のセキュリティ': '外部机构的安全状况'})

    def test_failed_review_does_not_cache_candidate_or_replace_previous_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            inputs, output = root / 'input.json', root / 'output.json'
            inputs.write_text(json.dumps({'a': '翻訳対象'}))
            output.write_text('previous approved output')
            def review(*args, **kwargs):
                raise client.TranslationStreamError('review unavailable')
            with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(client.TranslationFailure):
                batches.translate_texts(inputs, output, concurrency=1, is_passthrough=lambda _: False,
                    translate_batch_fn=lambda batch, *a, **kw: {key: '候选译文' for key in batch},
                    review_batch_fn=review, session_id='review-failure')
            self.assertFalse((root / '.translation_cache.json').exists())
            self.assertEqual(output.read_text(), 'previous approved output')

    def fixture(self, root):
        return workflow_fixtures.XlsxTranslationTurnTests().fixture(root)

    def run_translation(self, root, source, target, values=VALUES, telemetry=None):
        with patch.object(client, '_request', side_effect=lambda batch, *a, **kw: {k: values[v] for k, v in batch.items()}):
            with contextlib.redirect_stdout(io.StringIO()):
                return execute_translation(source, target, 'zh-CN', root, BASE / 'skills',
                                           telemetry or TelemetryStats(), session_id='delivery-test')

    def test_column_range_and_prose_reach_model_intact_but_code_labels_stay_protected(self):
        sentence = 'C-D列の選択肢をよく読み、一番近い選択肢をE列から選んでください。'
        self.assertEqual(split_protected_prefix(sentence, {'C', 'N'}), ('', sentence))
        prose = 'C*は適合、N*は不適合です。'
        self.assertEqual(split_protected_prefix(prose, {'C', 'N'}), ('', prose))
        self.assertEqual(split_protected_prefix('C＊（適合）', {'C'}), ('C＊', '（適合）'))
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source.xlsx'
            prefix_fixtures._build_fixture_xlsx(source)
            def modify(parts):
                parts['xl/sharedStrings.xml'] = parts['xl/sharedStrings.xml'].replace(
                    'クラウド設定確認'.encode(), sentence.encode()).replace('N（その他）'.encode(), 'N＊（その他）'.encode())
            replace_parts(source, source, modify)
            values = dict(PREFIX_VALUES, **{sentence: '请仔细阅读C-D列的选项，并从E列选择最接近的一项。'})
            sent = []
            def model(batch, *args, **kwargs):
                sent.extend(batch.values())
                return {key: values[value] for key, value in batch.items()}
            with patch.object(client, '_request', side_effect=model), contextlib.redirect_stdout(io.StringIO()):
                result = execute_translation(source, root / 'out.xlsx', 'zh-CN', root,
                                             BASE / 'skills', TelemetryStats(), session_id='prefix')
            self.assertIn(sentence, sent)
            with zipfile.ZipFile(result['filePath']) as archive:
                strings = archive.read('xl/sharedStrings.xml').decode()
                self.assertIn('请仔细阅读C-D列', strings)
                self.assertIn('N＊（其他）', strings)

    def test_actual_output_text_must_match_accepted_translations(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            def add_plain_string(parts):
                tree = ET.fromstring(parts['xl/sharedStrings.xml'])
                item = ET.SubElement(tree, '{' + NS['m'] + '}si')
                ET.SubElement(item, '{' + NS['m'] + '}t').text = '選択'
                parts['xl/sharedStrings.xml'] = ET.tostring(tree)
            replace_parts(source, source, add_plain_string)
            target = root / 'translated.xlsx'
            result = self.run_translation(root, source, target)
            package = Path(result['manifest_path']).parent / 'package'
            mapping = json.loads((package / 'ooxml_mapping.json').read_text())
            translations = json.loads((package / 'translation_output.json').read_text())
            mutations = {
                'shared_run': ('xl/sharedStrings.xml', '系统', '错误正文'),
                'shared_plain': ('xl/sharedStrings.xml', '>选择<', '>错误正文<'),
                'inline': ('xl/worksheets/sheet1.xml', '>选择<', '>错误正文<'),
                'drawing': ('xl/drawings/drawing1.xml', '安全计划', '错误正文'),
                'sheet_name': ('xl/workbook.xml', 'name="源表"', 'name="错误正文"'),
                'dropdown': ('xl/worksheets/sheet1.xml', '有,无', '错误正文,无'),
            }
            self.assertTrue(result['quality']['text_readback_verified'])
            for name, (part, old, new) in mutations.items():
                with self.subTest(name=name):
                    def mutate(parts):
                        self.assertIn(old.encode(), parts[part])
                        parts[part] = parts[part].replace(old.encode(), new.encode())
                        if name == 'sheet_name':
                            for path in parts:
                                if path.startswith('xl/worksheets/'):
                                    parts[path] = parts[path].replace('源表'.encode(), '错误正文'.encode())
                    changed = root / 'tampered.xlsx'
                    replace_parts(target, changed, mutate)
                    with self.assertRaisesRegex(client.TranslationFailure, 'Output text differs'):
                        validate_delivery(source, changed, mapping, translations, 'zh-CN')

    def test_prefix_bound_cache_reused_and_progress_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source.xlsx'
            prefix_fixtures._build_fixture_xlsx(source)
            target = root / 'translated.xlsx'
            first = self.run_translation(root, source, target, PREFIX_VALUES)
            with patch.object(client, '_request', side_effect=AssertionError('warm cache must not call model')):
                with contextlib.redirect_stdout(io.StringIO()):
                    second = execute_translation(source, target, 'zh-CN', root, BASE / 'skills',
                                                 TelemetryStats(), session_id='delivery-test')
            for result in (first, second):
                manifest = json.loads(Path(result['manifest_path']).read_text())
                progress = manifest['progress']
                self.assertGreater(progress['total'], 0)
                self.assertEqual(progress['remaining'], 0)
                self.assertEqual(progress['completed'], progress['total'])
            self.assertEqual(manifest['cache']['status'], 'hit')

    def test_manifest_failure_rolls_back_new_and_existing_outputs(self):
        for previous in (None, b'previous approved artifact'):
            with self.subTest(had_previous=previous is not None), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                source = self.fixture(root)
                target = root / 'translated.xlsx'
                if previous is not None:
                    target.write_bytes(previous)
                original_atomic = batches.atomic_json
                failed = []
                def fail_commit(path, data):
                    if Path(path).name == 'manifest.json' and data.get('state') == 'published' and not failed:
                        failed.append(True)
                        raise OSError('simulated publication failure')
                    return original_atomic(path, data)
                with patch.object(batches, 'atomic_json', side_effect=fail_commit):
                    with self.assertRaisesRegex(OSError, 'publication failure'):
                        self.run_translation(root, source, target)
                self.assertEqual(target.exists(), previous is not None)
                if previous is not None:
                    self.assertEqual(target.read_bytes(), previous)
                manifest = json.loads(next((root / '.dsh/xlsx-jobs').glob('*/manifest.json')).read_text())
                self.assertEqual(manifest['state'], 'failed')

    def test_auxiliary_cache_write_failure_does_not_turn_published_work_into_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = self.fixture(root)
            telemetry = TelemetryStats()
            original_atomic = batches.atomic_json
            def fail_cache(path, data):
                if Path(path).parent.name == 'xlsx-cache':
                    raise OSError('simulated auxiliary cache failure')
                return original_atomic(path, data)
            with patch.object(batches, 'atomic_json', side_effect=fail_cache):
                result = self.run_translation(root, source, root / 'out.xlsx', telemetry=telemetry)
            self.assertEqual(result['state'], 'published')
            self.assertTrue(Path(result['filePath']).is_file())
            self.assertTrue(any(g['guard'] == 'xlsx_checkpoint' and g['action'] == 'warning'
                                for g in telemetry.guard_decisions))

    def test_success_evidence_and_answer_reflect_actual_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.fixture(root)
            history_file = root / 'session.json'
            skill = workflow_fixtures.XlsxTranslationTurnTests().skill()
            with patch.object(client, '_request', side_effect=lambda batch, *a, **kw: {k: VALUES[v] for k, v in batch.items()}):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertTrue(try_run_xlsx_translation(skill, ['source.xlsx'], '翻译成中文',
                        history_file, [], time.time(), None, TelemetryStats(), root, BASE / 'skills'))
            evidence = json.loads(history_file.with_suffix('.evidence.json').read_text())
            self.assertTrue(evidence['verified'])
            answer = json.loads(history_file.read_text())[-1]['content']
            self.assertNotIn('图形标签', answer)
            self.assertIn('模型复核', answer)
            self.assertIn('未进行人工或视觉复核', answer)


if __name__ == '__main__':
    unittest.main()
