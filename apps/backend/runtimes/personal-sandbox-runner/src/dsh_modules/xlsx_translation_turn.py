"""Run admitted whole-workbook translations without a free-text planning loop."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import time
import uuid
import zipfile

from .telemetry import TelemetryStats
from .tool_result import ToolResult
from .xlsx_translation_routing import translation_language, translation_request


def fixed_xlsx_translation(skill, files, prompt, history=None):
    return translation_request(skill, files, prompt, history) is not None


def _engine(skill_dir):
    folder = Path(skill_dir) / 'xlsx/scripts'
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))
    spec = importlib.util.spec_from_file_location('xlsx_owned_engine', folder / 'ooxml_xlsx_translate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _publish_candidate(candidate, target, manifest, manifest_path):
    from xlsx_translation_batches import atomic_json
    backup = candidate.parent / '.previous-output'
    had_previous = target.is_file()
    if had_previous:
        shutil.copy2(target, backup)
    replaced = False
    try:
        os.replace(candidate, target)
        replaced = True
        manifest['state'] = 'published'
        atomic_json(manifest_path, manifest)
    except Exception:
        if replaced:
            if had_previous:
                os.replace(backup, target)
            else:
                target.unlink()
        raise
    else:
        try:
            backup.unlink(missing_ok=True)
        except OSError:
            pass


def execute_translation(source, target, language, workspace, skill_dir, telemetry, deadline=None, *, session_id=None):
    engine = _engine(skill_dir)
    import xlsx_translation_client as client
    from xlsx_translation_batches import atomic_json, cache_identity, load_protected_prefixes, translation_units
    from xlsx_translation_quality import validate_delivery
    root = Path(workspace).resolve()
    source, target = Path(source).resolve(), Path(target).resolve()
    if (not source.is_relative_to(root) or not source.is_file() or not target.is_relative_to(root)
            or source == target or source.is_symlink() or target.is_symlink()):
        raise ValueError('Translation input/output paths are invalid')
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    journal = getattr(getattr(telemetry, '_journal', None), 'path', None)
    run_id = Path(journal).stem if journal else uuid.uuid4().hex
    folder = root / '.dsh/xlsx-jobs' / run_id
    folder.mkdir(parents=True, exist_ok=False)
    package, candidate = folder / 'package', folder / target.name
    scope = str(session_id) if session_id else 'unscoped:' + run_id
    cache_binding = dict(schema='xlsx-cache/5', session_id=scope, source_sha256=source_hash, lang=language,
                         model=os.getenv('DSH_MODEL') or 'default')
    cache_id = hashlib.sha256(json.dumps(cache_binding, sort_keys=True).encode()).hexdigest()
    cache = root / '.dsh/xlsx-cache' / (cache_id + '.json')
    manifest = dict(cache_binding, state='running', input_path=str(source), output_path=str(target), stages={},
                    cache=dict(file=cache.name, status='miss', entries_loaded=0))

    def checkpoint_progress():
        checkpoint = package / '.translation_cache.json'
        completed = json.loads(checkpoint.read_text()) if checkpoint.is_file() else {}
        inputs_path = package / 'translation_input.json'
        if inputs_path.is_file():
            inputs = json.loads(inputs_path.read_text())
            _, sources = translation_units(inputs, load_protected_prefixes(inputs_path), engine._is_passthrough_text)
            valid = sum(client.translation_is_accepted(text, completed.get(text), language) for text in sources)
            manifest['progress'] = dict(total=len(sources), completed=valid, remaining=len(sources) - valid)
        return completed

    def stage(name, operation):
        started = time.monotonic()
        manifest['active_stage'] = name
        atomic_json(folder / 'manifest.json', manifest)
        telemetry.checkpoint('xlsx_stage_started', {'stage': name})
        result = operation()
        manifest['stages'][name] = round((time.monotonic() - started) * 1000, 2)
        telemetry.record_guard('xlsx_stage', 'completed', dict(stage=name, durationMs=manifest['stages'][name]))
        atomic_json(folder / 'manifest.json', manifest)
        return result

    def observer(event, data):
        if event == 'model_started':
            telemetry.checkpoint(event, data)
        elif event == 'model_completed':
            telemetry.record_auxiliary_call(data['purpose'], data.get('usage'), data['total_ms'],
                                            data['model'], call_id=data['call_id'])
        else:
            telemetry.record_model_failure(call_id=data['call_id'], purpose=data['purpose'],
                model=data['model'], total_ms=data['total_ms'], code=data['error_code'], usage=data.get('usage'),
                details={'message': data.get('error_message')})

    previous = client.OBSERVER, client.DEADLINE
    client.OBSERVER, client.DEADLINE = observer, deadline
    try:
        extracted = stage('extract', lambda: engine.unpack_xlsx(str(source), str(package), str(package / 'translation_input.json')))
        try:
            saved = json.loads(cache.read_text())
            if saved['binding'] == cache_binding:
                atomic_json(package / '.translation_cache.json', saved['translations'])
                atomic_json(package / '.translation_cache.meta.json',
                            cache_identity(package / 'translation_input.json', language, scope,
                                           load_protected_prefixes(package / 'translation_input.json')))
                manifest['cache'].update(status='hit', entries_loaded=len(saved['translations']))
            else:
                manifest['cache']['status'] = 'binding_mismatch'
        except (OSError, ValueError, KeyError):
            pass
        telemetry.record_guard('xlsx_cache_scope', 'bound',
                               dict(session_id=scope, source_sha256=source_hash, **manifest['cache']))
        atomic_json(folder / 'manifest.json', manifest)
        translated = stage('translate', lambda: engine.translate_texts(str(package / 'translation_input.json'),
            str(package / 'translation_output.json'), target_lang=language, batch_size=50, concurrency=4,
            session_id=scope))
        stage('pack', lambda: engine.pack_xlsx(str(package), str(package / 'translation_output.json'),
                                             str(candidate), lang=language, run_recalc=False))
        mapping = json.loads((package / 'ooxml_mapping.json').read_text())
        qa = stage('validate', lambda: validate_delivery(source, candidate, mapping, translated, language))
        qa.update(semantic_reviewed=True, semantic_review_method='model_batch')
        if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash:
            raise ValueError('Source workbook changed during translation')
        atomic_json(folder / 'quality.json', qa)
        checkpoint_progress()
        target.parent.mkdir(parents=True, exist_ok=True)
        manifest['quality'] = qa
        manifest['active_stage'] = 'publish'
        atomic_json(folder / 'manifest.json', manifest)
        _publish_candidate(candidate, target, manifest, folder / 'manifest.json')
        return dict(kind='xlsx_translation', state='published', filePath=str(target), fileName=target.name,
                    sha256=qa['output_sha256'], manifest_path=str(folder / 'manifest.json'), quality=qa)
    except Exception as error:
        manifest['state'] = 'failed'
        manifest['error'] = {'type': type(error).__name__, 'message': str(error)[:300]}
        if error.__cause__:
            manifest['error']['cause'] = str(error.__cause__)[:300]
        from .xlsx_translation_failure import exception_chain
        manifest['error']['chain'] = [dict(type=type(item).__name__, message=str(item)[:300])
                                      for item in exception_chain(error)]
        error.xlsx_manifest = manifest
        atomic_json(folder / 'manifest.json', manifest)
        raise
    finally:
        client.OBSERVER, client.DEADLINE = previous
        try:
            completed = checkpoint_progress()
            if (package / '.translation_cache.json').is_file():
                atomic_json(cache, dict(binding=cache_binding, translations=completed))
            if manifest['state'] != 'published':
                atomic_json(folder / 'manifest.json', manifest)
        except (OSError, ValueError) as checkpoint_error:
            telemetry.record_guard('xlsx_checkpoint', 'warning', type(checkpoint_error).__name__)


def try_run_xlsx_translation(skill, files, prompt, history_file, history, start, deadline,
                             telemetry, workspace, skill_dir):
    request = translation_request(skill, files, prompt, history)
    if request is None:
        return False
    root = Path(workspace).resolve()
    source = root / files[0]
    language = translation_language(request)
    names = [str(name) for name in (getattr(skill, 'deliverables', None) or []) if str(name) != '.xlsx']
    output = Path(names[0]).name if names else source.stem + '_' + language.replace('-', '_') + '.xlsx'
    hashes, receipts, outbound = {}, [], []
    try:
        hashes[files[0]] = hashlib.sha256(source.read_bytes()).hexdigest()
        telemetry.record_guard('xlsx_translation_workflow', 'direct_execution',
                               {'source': source.name, 'language': language,
                                'inherited_request': request != prompt.split('用户指令：')[-1].strip()})
        telemetry.record_tool_call('translate_xlsx', {'source': source.name, 'language': language})
        session_id = Path(history_file).stem if history_file else None
        result = execute_translation(source, root / output, language, root, skill_dir, telemetry, deadline,
                                     session_id=session_id)
        receipt = ToolResult.success(data=result, provenance={'tool': 'translate_xlsx', 'execution_origin': 'runtime_workflow'})
        telemetry.record_guard('workbook_delivery', 'accept',
                               {'fileName': result['fileName'], 'sha256': result['sha256'],
                                'text_readback_verified': result['quality']['text_readback_verified']})
        outbound.append(json.dumps({'filePath': result['filePath'], 'fileName': result['fileName']}, ensure_ascii=False))
        text = ('已完成 Excel 翻译及模型复核，已核对译文回填和原生表格结构。'
                '未进行人工或视觉复核；公式将在 Excel 打开时重新计算。')
        telemetry.finish_reason = 'verified_xlsx_translation'
    except (OSError, ValueError, TimeoutError, zipfile.BadZipFile) as error:
        from .xlsx_translation_failure import failure_feedback
        details = failure_feedback(error)
        receipt = ToolResult.error('xlsx_translation_failed', details['message'],
                                   data=dict(kind='xlsx_translation_failure', **details),
                                   provenance={'tool': 'translate_xlsx'})
        text = receipt.error_message
        telemetry.record_guard('xlsx_translation_workflow', 'reject', type(error).__name__)
        telemetry.finish_reason = 'xlsx_translation_failed'
    receipts.append(receipt)
    telemetry.record_execution_result(receipt)
    if history_file:
        from .evidence_store import persist_turn_evidence
        evidence = persist_turn_evidence(history_file, hashes, prompt, receipts, telemetry.guard_decisions)
        history.extend([{'role': 'user', 'content': prompt}, {'role': 'assistant', 'content': text, 'verification': evidence}])
        Path(history_file).write_text(json.dumps(history[-20:], ensure_ascii=False), encoding='utf-8')
    telemetry.set_wall_clock_duration((time.time() - start) * 1000)
    TelemetryStats.emit_outbound_files(outbound)
    telemetry.emit_metrics_event()
    TelemetryStats.emit_final_output(text)
    return True
