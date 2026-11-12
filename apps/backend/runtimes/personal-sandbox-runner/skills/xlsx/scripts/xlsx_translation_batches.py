"""Deduplication, resumable checkpoints and language acceptance for XLSX text."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import hashlib
import os
from pathlib import Path
import socket
import urllib.error
import uuid

import inspect
from xlsx_formula_references import apply_protected_prefix
import xlsx_translation_client as client
from xlsx_translation_client import (
    TranslationFailure,
    TranslationStreamError,
    translation_is_accepted,
    make_balanced_batches,
    make_batches,
)


def _error_chain(error):
    current, seen = error, set()
    while current is not None and id(current) not in seen and len(seen) < 10:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def _deadline_reached():
    return client.DEADLINE is not None and client.time.monotonic() >= client.DEADLINE


def _is_isolatable_format_error(error):
    for current in _error_chain(error):
        if isinstance(current, (TimeoutError, socket.timeout, OSError, urllib.error.URLError,
                                urllib.error.HTTPError, TranslationStreamError)):
            return False
        message = str(current)
        if 'Model request rejected:' in message or 'Model transport unavailable' in message:
            return False
    return isinstance(error, (TranslationFailure, ValueError))


def _is_transient_transport_error(error):
    if _deadline_reached():
        return False
    transient = False
    for current in _error_chain(error):
        message = str(current)
        if 'Model request rejected:' in message or 'Translation deadline exceeded' in message:
            return False
        if isinstance(current, urllib.error.HTTPError):
            if current.code in (400, 401, 403, 404):
                return False
            if current.code == 429 or current.code >= 500:
                transient = True
        elif isinstance(current, (TranslationStreamError, urllib.error.URLError,
                                  socket.timeout, TimeoutError, OSError)):
            transient = True
        elif 'Model transport unavailable' in message:
            transient = True
    return transient


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, path)


def cache_identity(input_json_path, target_lang, session_id=None, protected_prefixes=None):
    scope = session_id or os.getenv('DSH_SESSION_ID') or 'unscoped:' + uuid.uuid4().hex
    identity = dict(
        schema='xlsx-text-cache/6',
        session_id=str(scope),
        target_lang=target_lang.lower(),
        input_sha256=hashlib.sha256(Path(input_json_path).read_bytes()).hexdigest(),
        model=os.getenv('DSH_MODEL') or 'default',
    )
    if protected_prefixes:
        payload = json.dumps(sorted(protected_prefixes.items()), ensure_ascii=False).encode()
        identity['prefix_sha256'] = hashlib.sha256(payload).hexdigest()
    return identity


def load_protected_prefixes(input_json_path):
    mapping = Path(input_json_path).with_name('ooxml_mapping.json')
    if not mapping.is_file():
        return {}
    data = json.loads(mapping.read_text(encoding='utf-8'))
    return {key: meta['protected_prefix'] for key, meta in data.items()
            if isinstance(meta, dict) and meta.get('protected_prefix')}


def translation_units(all_texts, prefix_map, is_passthrough):
    parts = {}
    for key, value in all_texts.items():
        prefix = prefix_map.get(key, '')
        if not (prefix and isinstance(value, str) and value.startswith(prefix)):
            prefix = ''
        parts[key] = (prefix, value[len(prefix):] if isinstance(value, str) else value)
    sources = list(dict.fromkeys(body for _, body in parts.values()
                                if isinstance(body, str) and body.strip() and not is_passthrough(body)))
    return parts, sources


def translate_texts(input_json_path, output_json_path, target_lang='zh-CN', batch_size=50,
                    concurrency=4, *, is_passthrough, translate_batch_fn, session_id=None,
                    protected_prefixes=None, review_batch_fn=None):
    if batch_size < 1 or concurrency < 1:
        raise ValueError('Batch size and concurrency must be positive')
    all_texts = json.loads(Path(input_json_path).read_text(encoding='utf-8'))
    prefix_map = protected_prefixes or {}
    cache_file = Path(output_json_path).parent / '.translation_cache.json'
    metadata_file = cache_file.with_name('.translation_cache.meta.json')
    identity = cache_identity(input_json_path, target_lang, session_id, protected_prefixes=prefix_map)

    unit_parts, sources = translation_units(all_texts, prefix_map, is_passthrough)

    translations = {}
    try:
        if json.loads(metadata_file.read_text()) == identity:
            cached = json.loads(cache_file.read_text())
            translations = {key: value for key, value in cached.items()
                            if translation_is_accepted(key, value, target_lang)}
    except (OSError, ValueError, AttributeError):
        pass
    source_set = set(sources)
    translations = {key: value for key, value in translations.items() if key in source_set}
    by_id = {f't_{index}': value for index, value in enumerate(sources)}
    pending = [(key, value) for key, value in by_id.items() if value not in translations]
    api_base = os.getenv('OPENAI_BASE_URL') or os.getenv('DEEPSEEK_BASE_URL') or 'http://ops-ai-orchestrator:3007/ai/proxy/v1'
    api_key = os.getenv('OPENAI_API_KEY') or os.getenv('DEEPSEEK_API_KEY') or ''
    model = os.getenv('DSH_MODEL') or 'default'
    print(f'🌐 本地化文本：{len(sources)}，复用检查点：{len(translations)}，待处理：{len(pending)}', flush=True)

    def flush():
        atomic_json(metadata_file, identity)
        atomic_json(cache_file, translations)

    def _supports_repair(fn):
        try:
            params = inspect.signature(fn).parameters.values()
        except (TypeError, ValueError):
            return False
        return any(p.kind is inspect.Parameter.VAR_KEYWORD or p.name == 'repair' for p in params)

    def _collect_unresolved():
        seen_sources = set()
        items = []
        for key, source in by_id.items():
            if source in seen_sources:
                continue
            translated = translations.get(source)
            needs_work = not translation_is_accepted(source, translated, target_lang)
            if needs_work:
                seen_sources.add(source)
                items.append((key, source))
        return items

    def run_wave(items, label, *, max_items, max_chars, repair, allow_partial, workers):
        if not repair and workers > 1:
            batches = list(make_balanced_batches(items, concurrency=workers, max_items=max_items, max_chars=max_chars))
        else:
            batches = list(make_batches(items, max_items=max_items, max_chars=max_chars))
        if not batches:
            return 0, None, None
        fatal_failures, transient_failures, isolated_failures = [], [], []
        call_kwargs = {'model': model}
        if repair and _supports_repair(translate_batch_fn):
            call_kwargs['repair'] = True

        def translate_and_review(batch):
            result = translate_batch_fn(batch, target_lang, api_base, api_key, **call_kwargs)
            if review_batch_fn is not None:
                result = review_batch_fn(batch, result, target_lang, api_base, api_key, model=model)
            return result

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(translate_and_review, batch): batch for batch in batches}
            completed, consecutive_transient = 0, 0
            for future in as_completed(futures):
                if future.cancelled():
                    continue
                try:
                    batch = futures[future]
                    result = future.result()
                    if set(result) != set(batch) or any(not isinstance(value, str) or not value.strip()
                                                       for value in result.values()):
                        raise TranslationFailure('Incomplete translation batch')
                    for key, value in result.items():
                        translations[by_id[key]] = value
                    flush()
                    completed += 1
                    consecutive_transient = 0
                    print(f'✓ 本地化{label}进度: {completed}/{len(batches)}', flush=True)
                    print('<<<DSH_PROGRESS>>>', flush=True)
                except Exception as error:
                    if allow_partial and _is_isolatable_format_error(error):
                        isolated_failures.append(error)
                        consecutive_transient = 0
                        continue
                    if _is_transient_transport_error(error):
                        transient_failures.append(error)
                        consecutive_transient += 1
                        if consecutive_transient >= max(2, workers):
                            # Cancel remaining queued work only after consecutive transient failures suggest an outage.
                            for queued in futures:
                                queued.cancel()
                        continue
                    fatal_failures.append(error)
                    for queued in futures:
                        queued.cancel()
            if fatal_failures:
                raise TranslationFailure('Translation batch failed; completed checkpoints retained') from fatal_failures[0]
        return (
            completed,
            isolated_failures[0] if isolated_failures else None,
            transient_failures[0] if transient_failures else None,
        )

    def process(items, label, *, max_items=batch_size, max_chars=4500, repair=False, allow_partial=False):
        completed, format_err, transient_err = run_wave(
            items, label, max_items=max_items, max_chars=max_chars,
            repair=repair, allow_partial=allow_partial, workers=concurrency,
        )
        if transient_err is not None and not _deadline_reached() and (completed > 0 or label != '处理'):
            remaining = [
                (key, source) for key, source in items
                if not translation_is_accepted(source, translations.get(source), target_lang)
            ]
            if remaining:
                print(f'🔄 瞬态恢复重试（{label}）：{len(remaining)} 条', flush=True)
                wait_seconds = 1.5
                if client.DEADLINE is not None:
                    wait_seconds = max(0.0, min(wait_seconds, client.DEADLINE - client.time.monotonic() - 1.0))
                if wait_seconds > 0:
                    client.time.sleep(wait_seconds)
                rec_completed, rec_format_err, rec_transient_err = run_wave(
                    remaining, f'{label}恢复', max_items=min(max_items, 20),
                    max_chars=min(max_chars, 1800), repair=repair,
                    allow_partial=allow_partial, workers=max(1, min(concurrency, 2)),
                )
                completed += rec_completed
                format_err = rec_format_err or format_err
                transient_err = rec_transient_err
        if transient_err is not None:
            raise TranslationFailure('Translation batch failed; completed checkpoints retained') from transient_err
        if format_err is not None and (not allow_partial or (label == '处理' and completed == 0)):
            raise TranslationFailure('Translation batch failed; completed checkpoints retained') from format_err
        return format_err

    last_format_error = process(pending, '处理', allow_partial=True)
    missed = _collect_unresolved()
    if missed:
        print(f'🔍 靶向补译：{len(missed)}', flush=True)
        err = process(missed, '补译', max_items=min(batch_size, 5), max_chars=1800, repair=True, allow_partial=True)
        last_format_error = err or last_format_error
        retry_single = _collect_unresolved()
        if 0 < len(retry_single) <= 80:
            print(f'🔍 逐条复译：{len(retry_single)}', flush=True)
            err = process(retry_single, '复译', max_items=1, max_chars=1500, repair=True, allow_partial=True)
            last_format_error = err or last_format_error
            final_retry = _collect_unresolved()
            if 0 < len(final_retry) <= 20:
                print(f'🔍 末轮逐条复译：{len(final_retry)}', flush=True)
                err = process(final_retry, '终轮复译', max_items=1, max_chars=1500, repair=True, allow_partial=True)
                last_format_error = err or last_format_error
        auto_heal = _collect_unresolved()
        if 0 < len(auto_heal) <= 20:
            print(f'🔄 自动复核：{len(auto_heal)}', flush=True)
            err = process(auto_heal, '自动复核', max_items=min(batch_size, 5), max_chars=1800, repair=False, allow_partial=True)
            last_format_error = err or last_format_error
            clean_single = _collect_unresolved()
            if 0 < len(clean_single) <= 10:
                print(f'🔄 兜底复译：{len(clean_single)}', flush=True)
                err = process(clean_single, '兜底复译', max_items=1, max_chars=1500, repair=False, allow_partial=True)
                last_format_error = err or last_format_error
    unresolved = [key for key, source in by_id.items()
                  if not translation_is_accepted(source, translations.get(source), target_lang)]
    if unresolved:
        failure = TranslationFailure(f'Translation acceptance failed for {len(unresolved)} items; checkpoint retained')
        if last_format_error is not None:
            raise failure from last_format_error
        raise failure
    output = {}
    for key, source in all_texts.items():
        prefix, body_text = unit_parts[key]
        if not isinstance(body_text, str) or not body_text.strip() or is_passthrough(body_text):
            output[key] = source
        else:
            output[key] = apply_protected_prefix(prefix, translations[body_text])
    atomic_json(output_json_path, output)
    print('✓ 文本本地化验收通过', flush=True)
    return output
