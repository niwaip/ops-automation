"""Supplementary translation reports committed work and survives interruption."""
import contextlib
import importlib.util
import io
import json
import os
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / 'skills/xlsx/scripts/ooxml_xlsx_translate.py'
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location('xlsx_translation', SCRIPT)
translation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(translation)
from xlsx_translation_batches import cache_identity


class TranslationCheckpointTests(unittest.TestCase):
    def setUp(self):
        review = patch('xlsx_translation_client.review_batch', side_effect=lambda source, candidate, *a, **kw: candidate)
        review.start()
        self.addCleanup(review.stop)
        scoped = patch.dict(os.environ, {'DSH_SESSION_ID': 'checkpoint-test'})
        scoped.start()
        self.addCleanup(scoped.stop)

    def test_sweep_commits_before_next_batch_and_resumes_after_interruption(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = {str(i): f'セキュリティ項目{i}' for i in range(26)}
            (root / 'input.json').write_text(json.dumps(source))
            cache = root / '.translation_cache.json'
            cache.write_text(json.dumps({text: text for text in source.values()}))
            (root / '.translation_cache.meta.json').write_text(json.dumps(
                cache_identity(root / 'input.json', 'zh-CN')))
            calls = []

            def interrupted(batch, *args, **kwargs):
                calls.append(batch)
                if len(calls) == 2:
                    raise KeyboardInterrupt('simulated interruption')
                return {key: '安全事项' for key in batch}

            stdout = io.StringIO()
            with patch.object(translation, '_translate_single_batch_streaming', interrupted):
                with contextlib.redirect_stdout(stdout), self.assertRaises(KeyboardInterrupt):
                    translation.translate_texts(str(root / 'input.json'), str(root / 'output.json'), batch_size=25, concurrency=1)
            saved = json.loads(cache.read_text())
            self.assertEqual(sum(value == '安全事项' for value in saved.values()), 25)
            self.assertIn('<<<DSH_PROGRESS>>>', stdout.getvalue())

            resumed = []

            def success(batch, *args, **kwargs):
                resumed.extend(batch.values())
                return {key: '安全事项' for key in batch}

            with patch.object(translation, '_translate_single_batch_streaming', success):
                with contextlib.redirect_stdout(io.StringIO()):
                    output = translation.translate_texts(str(root / 'input.json'), str(root / 'output.json'), concurrency=1)
            self.assertEqual(resumed, ['セキュリティ項目25'])
            self.assertEqual(set(output.values()), {'安全事项'})

    def test_auto_cli_uses_same_batch_defaults_as_python_entry(self):
        with patch('sys.argv', ['translate', 'auto', 'input.xlsx', 'output.xlsx']):
            with patch.object(translation, 'auto_translate_xlsx') as run:
                translation.main()
        self.assertEqual(run.call_args.kwargs['batch_size'], 50)
        self.assertEqual(run.call_args.kwargs['concurrency'], 4)

    def test_preserved_bullets_do_not_trigger_retranslation(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = {'text': '・セキュリティ規則'}
            (root / 'input.json').write_text(json.dumps(source))
            translated = '・安全规则 https://example.test/ページ'
            (root / '.translation_cache.json').write_text(json.dumps({source['text']: translated}))
            (root / '.translation_cache.meta.json').write_text(json.dumps(
                cache_identity(root / 'input.json', 'zh-CN')))
            with patch.object(translation, '_translate_single_batch_streaming') as model:
                with contextlib.redirect_stdout(io.StringIO()):
                    output = translation.translate_texts(str(root / 'input.json'), str(root / 'output.json'))
            model.assert_not_called()
            self.assertEqual(output['text'], translated)

    def test_localized_sheet_references_and_comparisons_stay_consistent(self):
        from xlsx_formula_references import translate_formula
        formula = 'IF(\'1_基本情報\'!F39="あり",表紙!AQ1,"表紙!AQ1")'
        result = translate_formula(formula, {'1_基本情報': '1_基本信息', '表紙': '封面'}, {'あり': '有'})
        self.assertEqual(result, 'IF(\'1_基本信息\'!F39="有",\'封面\'!AQ1,"表紙!AQ1")')

    def test_cache_from_another_language_is_not_reused(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'input.json').write_text(json.dumps({'a': '選択'}))
            (root / '.translation_cache.json').write_text(json.dumps({'選択': '选择'}))
            (root / '.translation_cache.meta.json').write_text(json.dumps(
                cache_identity(root / 'input.json', 'zh-CN')))
            with patch.object(translation, '_translate_single_batch_streaming', return_value={'t_0': 'Select'}) as model:
                with contextlib.redirect_stdout(io.StringIO()):
                    output = translation.translate_texts(str(root / 'input.json'), str(root / 'output.json'), 'en-US')
            model.assert_called_once()
            self.assertEqual(output['a'], 'Select')

    def test_cli_checkpoint_cannot_cross_sessions_even_with_same_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'input.json').write_text(json.dumps({'a': '選択'}))
            for session, translated in (('session-a', '选择'), ('session-b', '选取')):
                with patch.dict(os.environ, {'DSH_SESSION_ID': session}):
                    with patch.object(translation, '_translate_single_batch_streaming', return_value={'t_0': translated}) as model:
                        with contextlib.redirect_stdout(io.StringIO()):
                            output = translation.translate_texts(str(root / 'input.json'), str(root / 'output.json'))
                        model.assert_called_once()
                        self.assertEqual(output['a'], translated)

    def test_cached_untranslated_japanese_is_pending_not_completed(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = {'a': 'セキュリティ', 'b': 'なまえ'}
            (root / 'input.json').write_text(json.dumps(source))
            (root / '.translation_cache.json').write_text(json.dumps({'セキュリティ': 'セキュリティ', 'なまえ': '名称'}))
            (root / '.translation_cache.meta.json').write_text(json.dumps(cache_identity(root / 'input.json', 'zh-CN')))
            stdout = io.StringIO()
            def model(batch, *args, **kwargs):
                self.assertEqual(list(batch.values()), ['セキュリティ'])
                return {key: '安全' for key in batch}
            with patch.object(translation, '_translate_single_batch_streaming', side_effect=model):
                with contextlib.redirect_stdout(stdout):
                    output = translation.translate_texts(str(root / 'input.json'), str(root / 'output.json'))
            self.assertIn('复用检查点：1，待处理：1', stdout.getvalue())
            self.assertEqual(output, {'a': '安全', 'b': '名称'})

    def test_package_reference_patch_preserves_xml_extensions(self):
        from xlsx_formula_references import update_package_references
        import xml.etree.ElementTree as ET
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder, 'xl', 'workbook.xml')
            path.parent.mkdir()
            path.write_text('<workbook xmlns:x="urn:extension" x:keep="yes"><definedName name="range">'
                            "'表紙'!$A$1&amp;\"あり\"</definedName><calcPr calcId=\"1\"/></workbook>")
            update_package_references(folder, {'表紙': '封面'}, {'あり': '有'})
            source = path.read_text()
            self.assertIn('x:keep="yes"', source)
            self.assertIn("'封面'!$A$1&amp;\"有\"", source)
            self.assertEqual(ET.fromstring(source).find('calcPr').get('fullCalcOnLoad'), '1')
            self.assertEqual(ET.fromstring(source).find('calcPr').get('calcId'), '1')

    def test_targeted_repair_deduplicates_and_escalates_to_single_item_pass(self):
        import json as _json
        import tempfile
        from pathlib import Path
        import xlsx_translation_batches as _batches

        calls = []

        def fake_translate(batch, target_lang, api_base, api_key, model='default', *, repair=False):
            calls.append((dict(batch), repair))
            if not repair:
                return {k: v for k, v in batch.items()}
            if len(batch) > 1:
                return {k: ('测试A' if v == 'テストA' else v) for k, v in batch.items()}
            return {k: '测试B' for k in batch}

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(_json.dumps({'k1': 'テストA', 'k2': 'テストA', 'k3': 'テストB'}, ensure_ascii=False), encoding='utf-8')
            _batches.translate_texts(
                in_path,
                out_path,
                target_lang='zh-CN',
                batch_size=10,
                concurrency=1,
                is_passthrough=lambda _: False,
                translate_batch_fn=fake_translate,
                session_id='chat-session-repair-test',
            )
            result = _json.loads(out_path.read_text(encoding='utf-8'))

        self.assertEqual(result, {'k1': '测试A', 'k2': '测试A', 'k3': '测试B'})
        # Pass 1 (repair=False, 2 unique sources), Pass 2 (repair=True, 2 unique sources), Pass 3 (repair=True, 1 item)
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0][1], False)
        self.assertEqual(len(calls[0][0]), 2)
        self.assertEqual(calls[1][1], True)
        self.assertEqual(len(calls[1][0]), 2)
        self.assertEqual(calls[2][1], True)
        self.assertEqual(len(calls[2][0]), 1)

    def test_translate_texts_supports_legacy_fn_without_repair_kwarg(self):
        import json as _json
        import tempfile
        from pathlib import Path
        import xlsx_translation_batches as _batches

        stages = []

        def legacy_translate(batch, target_lang, api_base, api_key, model='default'):
            stages.append(len(stages))
            if len(stages) == 1:
                return {k: v for k, v in batch.items()}
            return {k: '已译' for k in batch}

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(_json.dumps({'k1': 'テスト'}, ensure_ascii=False), encoding='utf-8')
            _batches.translate_texts(
                in_path,
                out_path,
                target_lang='zh-CN',
                batch_size=10,
                concurrency=1,
                is_passthrough=lambda _: False,
                translate_batch_fn=legacy_translate,
                session_id='chat-session-legacy-fn',
            )
            result = _json.loads(out_path.read_text(encoding='utf-8'))

        self.assertEqual(result, {'k1': '已译'})
        self.assertEqual(len(stages), 2)

    def test_single_item_repair_performs_bounded_second_round_on_stochastic_miss(self):
        import json as _json
        import tempfile
        from pathlib import Path
        import xlsx_translation_batches as _batches

        single_calls = []

        def flaky_translate(batch, target_lang, api_base, api_key, model='default', *, repair=False):
            if repair and len(batch) == 1:
                single_calls.append(next(iter(batch.values())))
                # Pass 3 round 1 fixes テストA but leaves テストB; Pass 3 round 2 fixes テストB.
                if next(iter(batch.values())) == 'テストA':
                    return {k: '测试A' for k in batch}
                if single_calls.count('テストB') >= 2:
                    return {k: '测试B' for k in batch}
            return {k: v for k, v in batch.items()}

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(_json.dumps({'k1': 'テストA', 'k2': 'テストB'}, ensure_ascii=False), encoding='utf-8')
            _batches.translate_texts(
                in_path,
                out_path,
                target_lang='zh-CN',
                batch_size=10,
                concurrency=1,
                is_passthrough=lambda _: False,
                translate_batch_fn=flaky_translate,
                session_id='chat-session-second-single-round',
            )
            result = _json.loads(out_path.read_text(encoding='utf-8'))

        self.assertEqual(result, {'k1': '测试A', 'k2': '测试B'})
        self.assertEqual(single_calls, ['テストA', 'テストB', 'テストB'])

    def test_isolated_format_failure_does_not_abort_repair_and_clean_prompt_heals_residue(self):
        import json as _json
        import tempfile
        from pathlib import Path
        import xlsx_translation_batches as _batches
        from xlsx_translation_client import TranslationFailure

        call_log = []

        def tracked_translate(batch, target_lang, api_base, api_key, model='default', *, repair=False):
            values = list(batch.values())
            call_log.append((repair, values))
            if not repair and len(values) == 3:
                return {k: '测试C' if v == 'テストC' else v for k, v in batch.items()}
            if repair and len(values) == 1 and values[0] == 'テストA':
                raise TranslationFailure('Translation keys do not cover the batch')
            if not repair and set(values) == {'テストA', 'テストB'}:
                return {k: '测试A' if v == 'テストA' else '测试B' for k, v in batch.items()}
            return dict(batch)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(
                _json.dumps({'k1': 'テストA', 'k2': 'テストB', 'k3': 'テストC'}, ensure_ascii=False),
                encoding='utf-8',
            )
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                _batches.translate_texts(
                    in_path,
                    out_path,
                    target_lang='zh-CN',
                    batch_size=10,
                    concurrency=2,
                    is_passthrough=lambda _: False,
                    translate_batch_fn=tracked_translate,
                    session_id='chat-session-format-and-clean-heal',
                )
            result = _json.loads(out_path.read_text(encoding='utf-8'))

        self.assertEqual(result, {'k1': '测试A', 'k2': '测试B', 'k3': '测试C'})
        self.assertEqual(call_log.count((True, ['テストB'])), 2)
        self.assertIn((False, ['テストA', 'テストB']), call_log)
        self.assertIn('自动复核', stdout.getvalue())

    def test_unresolved_format_failure_preserves_root_cause_chain(self):
        import json as _json
        import tempfile
        from pathlib import Path
        import xlsx_translation_batches as _batches
        from xlsx_translation_client import TranslationFailure

        def partial_format_fail(batch, target_lang, api_base, api_key, model='default', *, repair=False):
            key, value = next(iter(batch.items()))
            if value == 'テストA':
                return {key: '测试A'}
            raise TranslationFailure('Translation keys do not cover the batch')

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(
                _json.dumps({'k1': 'テストA', 'k2': 'テストB'}, ensure_ascii=False),
                encoding='utf-8',
            )
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                with self.assertRaises(TranslationFailure) as ctx:
                    _batches.translate_texts(
                        in_path,
                        out_path,
                        target_lang='zh-CN',
                        batch_size=1,
                        concurrency=1,
                        is_passthrough=lambda _: False,
                        translate_batch_fn=partial_format_fail,
                        session_id='chat-session-format-chain',
                    )
            cache = _json.loads((tmp_path / '.translation_cache.json').read_text(encoding='utf-8'))

        self.assertIn('Translation acceptance failed for 1 items', str(ctx.exception))
        self.assertIsNotNone(ctx.exception.__cause__)
        self.assertIn('Translation keys do not cover the batch', str(ctx.exception.__cause__))
        self.assertEqual(cache, {'テストA': '测试A'})

    def test_transient_batch_stream_error_with_working_siblings_recovers_in_bounded_pass(self):
        import json as _json
        import tempfile
        import threading
        from pathlib import Path
        from unittest.mock import patch
        import xlsx_translation_batches as _batches
        import xlsx_translation_client as _client
        from xlsx_translation_client import TranslationStreamError

        attempts = {}
        lock = threading.Lock()
        translated_map = {
            'Security policy one': '安全策略一',
            'Security policy two': '安全策略二',
            'Security policy three': '安全策略三',
            'Security policy four': '安全策略四',
        }

        def flaky_stream(batch, target_lang, api_base, api_key, model='default', *, repair=False):
            key, source = next(iter(batch.items()))
            with lock:
                attempts[source] = attempts.get(source, 0) + 1
                count = attempts[source]
            if source == 'Security policy two' and count == 1:
                raise TranslationStreamError('aborted')
            return {key: translated_map[source]}

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(
                _json.dumps({f'k{i}': s for i, s in enumerate(translated_map, 1)}, ensure_ascii=False),
                encoding='utf-8',
            )
            with patch.object(_client.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
                result = _batches.translate_texts(
                    in_path,
                    out_path,
                    target_lang='zh-CN',
                    batch_size=1,
                    concurrency=2,
                    is_passthrough=lambda _: False,
                    translate_batch_fn=flaky_stream,
                    session_id='chat-session-transient-recover',
                )
            cache = _json.loads((tmp_path / '.translation_cache.json').read_text(encoding='utf-8'))

        self.assertEqual(result, {f'k{i}': v for i, v in enumerate(translated_map.values(), 1)})
        self.assertEqual(cache, translated_map)
        self.assertEqual(attempts['Security policy two'], 2)

    def test_persistent_auth_or_total_outage_fails_fast_without_recovery_loop(self):
        import json as _json
        import tempfile
        import threading
        import urllib.error
        from pathlib import Path
        from unittest.mock import patch
        import xlsx_translation_batches as _batches
        import xlsx_translation_client as _client
        from xlsx_translation_client import TranslationFailure, TranslationStreamError

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            in_path = tmp_path / 'input.json'
            out_path = tmp_path / 'output.json'
            in_path.write_text(
                _json.dumps({'k1': 'Security policy one', 'k2': 'Security policy two'}, ensure_ascii=False),
                encoding='utf-8',
            )
            auth_calls = 0

            def auth_fail(batch, *args, **kwargs):
                nonlocal auth_calls
                auth_calls += 1
                key, source = next(iter(batch.items()))
                if source == 'Security policy one':
                    return {key: '安全策略一'}
                raise urllib.error.HTTPError('http://model', 401, 'Unauthorized', {}, None)

            with patch.object(_client.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(TranslationFailure):
                    _batches.translate_texts(
                        in_path,
                        out_path,
                        target_lang='zh-CN',
                        batch_size=1,
                        concurrency=1,
                        is_passthrough=lambda _: False,
                        translate_batch_fn=auth_fail,
                        session_id='chat-session-auth-fail',
                    )
            self.assertEqual(auth_calls, 2)

            in_outage = tmp_path / 'outage_in.json'
            out_outage = tmp_path / 'outage_out.json'
            in_outage.write_text(
                _json.dumps({f'k{i}': f'Policy item {i}' for i in range(1, 7)}, ensure_ascii=False),
                encoding='utf-8',
            )
            outage_calls = 0
            lock = threading.Lock()

            def total_outage(batch, *args, **kwargs):
                nonlocal outage_calls
                with lock:
                    outage_calls += 1
                raise TranslationStreamError('upstream down')

            with patch.object(_client.time, 'sleep'), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(TranslationFailure):
                    _batches.translate_texts(
                        in_outage,
                        out_outage,
                        target_lang='zh-CN',
                        batch_size=1,
                        concurrency=2,
                        is_passthrough=lambda _: False,
                        translate_batch_fn=total_outage,
                        session_id='chat-session-total-outage',
                    )
            self.assertLessEqual(outage_calls, 4)


if __name__ == '__main__':
    unittest.main()
