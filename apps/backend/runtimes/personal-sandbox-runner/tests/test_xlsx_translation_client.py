"""Reject incomplete translations and bound request size and retry amplification."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'skills/xlsx/scripts'))
import xlsx_translation_client as client


class Response(io.BytesIO):
    def __init__(self, value, reason='stop', usage=None):
        messages = [dict(choices=[dict(delta=dict(content=json.dumps(value)), finish_reason=reason)])]
        if usage:
            messages.append(dict(choices=[], usage=usage))
        data = ''.join('data: ' + json.dumps(item) + '\n\n' for item in messages)
        super().__init__((data + 'data: [DONE]\n\n').encode())


class TranslationClientTests(unittest.TestCase):
    def test_context_review_corrects_prose_and_preserves_legitimate_lowercase_names(self):
        cases = [
            ({'a': '外部業者のセキュリティ'}, {'a': '外部机构的 security 状况'},
             {'a': '外部机构的安全状况'}, 'zh-CN'),
            ({'brand': 'エンジン名はnginxです'}, {'brand': '引擎名称是nginx'},
             {'brand': '引擎名称是nginx'}, 'zh-CN'),
            ({'caption': '显示配置'}, {'caption': 'Afficher la configuration'},
             {'caption': 'Afficher la configuration'}, 'fr-FR'),
        ]
        for source, candidate, expected, language in cases:
            events = []
            def capture(request, **kwargs):
                payload = json.loads(request.data)
                self.assertEqual(json.loads(payload['messages'][1]['content']),
                                 {key: {'source': value, 'candidate': candidate[key]} for key, value in source.items()})
                system = payload['messages'][0]['content']
                self.assertIn(language, system)
                self.assertIn('never word length or case alone', system)
                self.assertNotIn('security', system)
                return Response(expected)
            with self.subTest(language=language, candidate=candidate), \
                 patch.object(client.urllib.request, 'urlopen', side_effect=capture), \
                 patch.object(client, 'OBSERVER', lambda event, data: events.append((event, data))):
                actual = client.review_batch(source, candidate, language, 'http://model', 'key')
            self.assertEqual(actual, expected)
            self.assertEqual(events[-1][1]['purpose'], 'xlsx_translation_review')

    def test_review_failure_is_bounded_and_never_returns_unreviewed_candidate(self):
        for response in ({'wrong': '候选译文'}, {'a': ''}):
            with self.subTest(response=response), \
                 patch.object(client.urllib.request, 'urlopen', side_effect=lambda *a, **kw: Response(response)) as request, \
                 patch.object(client.time, 'sleep'):
                with self.assertRaises(client.TranslationStreamError):
                    client.review_batch({'a': '原文'}, {'a': '候选译文'}, 'zh-CN', 'http://model', 'key')
                self.assertEqual(request.call_count, 2)

    def test_character_budget_splits_long_rows_without_dropping_keys(self):
        items = [(str(i), '字' * 1000) for i in range(20)]
        batches = list(client.make_batches(items, max_items=50, max_chars=4500))
        self.assertEqual(len(batches), 5)
        self.assertEqual({k: v for batch in batches for k, v in batch.items()}, dict(items))
        self.assertTrue(all(len(json.dumps(batch, ensure_ascii=False)) <= 4500 for batch in batches))

    def test_incomplete_keys_and_truncated_stream_never_pass(self):
        for response in [Response({'a': '译文'}), Response({'a': '译文', 'b': '文本'}, reason='length')]:
            with patch.object(client.urllib.request, 'urlopen', return_value=response):
                with self.assertRaises(client.TranslationFailure):
                    client._request({'a': '原文', 'b': '源文'}, 'zh-CN', 'http://model', 'key', 'default')

    def test_transport_outage_does_not_expand_into_recursive_requests(self):
        with patch.object(client, '_request', side_effect=urllib.error.URLError('offline')) as request:
            with patch.object(client.time, 'sleep'):
                with self.assertRaises(client.TranslationFailure):
                    client.translate_batch({str(i): '原文' for i in range(50)}, 'zh-CN', 'http://model', 'key')
        self.assertEqual(request.call_count, 2)

    def test_auth_rejection_is_not_retried_or_split(self):
        error = urllib.error.HTTPError('http://model', 401, 'Unauthorized', {}, None)
        with patch.object(client, '_request', side_effect=error) as request:
            with self.assertRaises(client.TranslationFailure):
                client.translate_batch({'a': '原文', 'b': '原文'}, 'zh-CN', 'http://model', 'key')
        self.assertEqual(request.call_count, 1)

    def test_upstream_stream_error_retries_without_recursive_split(self):
        with patch.object(client, '_request', side_effect=client.TranslationStreamError('Upstream stream error')) as request:
            with patch.object(client.time, 'sleep'):
                with self.assertRaises(client.TranslationFailure):
                    client.translate_batch({str(i): '原文' for i in range(50)}, 'zh-CN', 'http://model', 'key')
        self.assertEqual(request.call_count, 2)

    def test_urls_exclude_sentence_wrappers_but_keep_balanced_path_parentheses(self):
        sources = ['(网站：https://example.test/guide/)', '请参考"https://example.test/path"',
                   '参考：https://example.test/wiki/Foo_(bar)。']
        expected = ['https://example.test/guide/', 'https://example.test/path',
                    'https://example.test/wiki/Foo_(bar)']
        for source, url in zip(sources, expected):
            self.assertEqual(client.source_urls(source), [url])
            with patch.object(client.urllib.request, 'urlopen', return_value=Response({'a': '网站：' + url})):
                client._request({'a': source}, 'zh-CN', 'http://model', 'key', 'default')
        with patch.object(client.urllib.request, 'urlopen', return_value=Response({'a': 'https://wrong.test/guide/'})):
            with self.assertRaises(client.TranslationFailure):
                client._request({'a': sources[0]}, 'zh-CN', 'http://model', 'key', 'default')

    def test_request_contains_only_current_document_and_no_assumed_industry(self):
        def capture(request, **kwargs):
            payload = json.loads(request.data)
            self.assertEqual([m['role'] for m in payload['messages']], ['system', 'user'])
            self.assertEqual(json.loads(payload['messages'][1]['content']), {'a': '菜单'})
            self.assertNotIn('enterprise IT security', payload['messages'][0]['content'])
            self.assertEqual(payload['stream_visibility'], 'internal')
            return Response({'a': 'Menu'})
        with patch.object(client.urllib.request, 'urlopen', side_effect=capture):
            client._request({'a': '菜单'}, 'en-US', 'http://model', 'key', 'default')

    def test_success_accounts_usage_and_preserves_url(self):
        usage = dict(prompt_tokens=10, completion_tokens=5, total_tokens=15)
        events = []
        text = '译文 https://example.test/ページ'
        with patch.object(client, 'OBSERVER', lambda event, data: events.append((event, data))):
            with patch.object(client.urllib.request, 'urlopen', return_value=Response({'a': text}, usage=usage)):
                result = client._request({'a': '原文 https://example.test/ページ'}, 'zh-CN', 'http://model', 'key', 'default')
        self.assertEqual(result, {'a': text})
        self.assertEqual(events[-1][0], 'model_completed')
        self.assertEqual(events[-1][1]['usage'], usage)
        self.assertFalse(client.has_untranslated_kana(text))
        self.assertEqual(events[0][1]['request_summary']['history_items'], 0)
        self.assertEqual(events[0][1]['request_summary']['input_items'], 1)

    def test_chinese_prompt_selection_repair_mode_and_control_char_json_fallback(self):
        import io
        import json as _json
        from unittest.mock import patch
        import xlsx_translation_client as _client

        captured_payloads = []

        class _FakeResp:
            def __init__(self, body_bytes):
                self._bio = io.BytesIO(body_bytes)
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self, *args):
                return self._bio.read(*args)
            def __iter__(self):
                return iter(self._bio)

        def _fake_urlopen(req, timeout=None):
            payload = _json.loads(req.data.decode('utf-8'))
            captured_payloads.append(payload)
            if payload['messages'][0]['content'].startswith('你是专业文档翻译器'):
                # Simulate fenced JSON with a literal raw newline inside string value (strict=False case)
                raw_json = '```json\n{"k1": "第一行\n第二行"}\n```'
            else:
                raw_json = '{"k1": "Hello"}'
            sse = (
                b'data: ' + _json.dumps({'choices': [{'delta': {'content': raw_json}}]}).encode() + b'\n\n'
                b'data: ' + _json.dumps({'choices': [{'delta': {}}], 'usage': {'prompt_tokens': 10, 'completion_tokens': 5}}).encode() + b'\n\n'
                b'data: [DONE]\n\n'
            )
            return _FakeResp(sse)

        with patch('urllib.request.urlopen', side_effect=_fake_urlopen):
            res_cn = _client.translate_batch({'k1': 'テスト'}, 'zh-CN', 'http://localhost', 'k')
            res_repair = _client.translate_batch({'k1': 'テスト'}, 'zh-TW', 'http://localhost', 'k', repair=True)
            res_en = _client.translate_batch({'k1': 'テスト'}, 'en', 'http://localhost', 'k')

        self.assertEqual(res_cn, {'k1': '第一行\n第二行'})
        self.assertEqual(res_repair, {'k1': '第一行\n第二行'})
        self.assertEqual(res_en, {'k1': 'Hello'})
        self.assertIn('简体中文', captured_payloads[0]['messages'][0]['content'])
        self.assertIn('不要预设特定行业', captured_payloads[0]['messages'][0]['content'])
        self.assertEqual(captured_payloads[0]['temperature'], 0.1)
        self.assertIn('繁体中文', captured_payloads[1]['messages'][0]['content'])
        self.assertIn('【逐条复译】', captured_payloads[1]['messages'][0]['content'])
        self.assertEqual(captured_payloads[1]['temperature'], 0.2)
        self.assertTrue(captured_payloads[2]['messages'][0]['content'].startswith('Translate the values'))

    def test_single_item_format_failure_retries_up_to_two_times_and_recovers(self):
        side_effects = [
            client.TranslationFailure('Translation keys do not cover the batch'),
            json.JSONDecodeError('Expecting value', 'bad', 0),
            {'k1': '译文'},
        ]
        with patch.object(client, '_request', side_effect=side_effects) as request:
            with patch.object(client.time, 'sleep'):
                result = client.translate_batch(
                    {'k1': '原文'}, 'zh-CN', 'http://model', 'key', retries=1, repair=True,
                )
        self.assertEqual(result, {'k1': '译文'})
        self.assertEqual(request.call_count, 3)

    def test_split_leaf_gets_single_item_format_retry_and_transport_stays_bounded(self):
        seen_keys = []

        def flaky_request(batch, target_lang, api_base, api_key, model, *, repair=False):
            seen_keys.append(list(batch.keys()))
            if len(batch) == 2:
                raise client.TranslationFailure('Translation keys do not cover the batch')
            if list(batch.keys()) == ['a'] and seen_keys.count(['a']) == 1:
                raise client.TranslationFailure('Translation keys do not cover the batch')
            return {key: '译文_' + key for key in batch}

        with patch.object(client, '_request', side_effect=flaky_request):
            with patch.object(client.time, 'sleep'):
                result = client.translate_batch(
                    {'a': '原文A', 'b': '原文B'}, 'zh-CN', 'http://model', 'key', retries=1, repair=True,
                )
        self.assertEqual(result, {'a': '译文_a', 'b': '译文_b'})
        self.assertEqual(seen_keys, [['a', 'b'], ['a'], ['a'], ['b']])

        with patch.object(client, '_request', side_effect=urllib.error.URLError('offline')) as request:
            with patch.object(client.time, 'sleep'):
                with self.assertRaises(client.TranslationFailure):
                    client.translate_batch({'a': '原文A'}, 'zh-CN', 'http://model', 'key', retries=1)
        self.assertEqual(request.call_count, 2)

    def test_split_subbatch_retains_transport_retry_after_format_split(self):
        seen_keys = []

        def flaky_split(batch, *args, **kwargs):
            keys = list(batch)
            seen_keys.append(keys)
            if keys == ['a', 'b', 'c', 'd']:
                raise client.TranslationFailure('Translation keys do not cover the batch')
            if keys == ['a', 'b'] and seen_keys.count(['a', 'b']) == 1:
                raise client.TranslationStreamError('aborted')
            return {k: f'译文_{k}' for k in keys}

        with patch.object(client, '_request', side_effect=flaky_split), patch.object(client.time, 'sleep'):
            result = client.translate_batch(
                {'a': '原文A', 'b': '原文B', 'c': '原文C', 'd': '原文D'},
                'zh-CN', 'http://model', 'key', retries=1,
            )

        self.assertEqual(result, {'a': '译文_a', 'b': '译文_b', 'c': '译文_c', 'd': '译文_d'})
        self.assertEqual(seen_keys, [['a', 'b', 'c', 'd'], ['a', 'b'], ['a', 'b'], ['c', 'd']])

    def test_parse_json_object_extracts_embedded_json_and_repair_prompt_guards_keys(self):
        sse = (
            'data: ' + json.dumps(dict(choices=[dict(
                delta=dict(content='说明如下：\n```json\n{"k1": "译文"}\n```\n完成。'),
                finish_reason='stop',
            )])) + '\n\ndata: [DONE]\n\n'
        ).encode()
        with patch.object(client.urllib.request, 'urlopen', return_value=io.BytesIO(sse)):
            result = client._request({'k1': '原文'}, 'zh-CN', 'http://model', 'key', 'default')
        self.assertEqual(result, {'k1': '译文'})
        self.assertIn('不要改成 "ex"', client._system_prompt('zh-CN', repair=True))
        self.assertIn('preserve every input JSON key verbatim', client._system_prompt('en-US', repair=True))


if __name__ == '__main__':
    unittest.main()
