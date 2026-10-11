"""Per-turn execution archive and bounded, source-validated historical task context."""

import hashlib
import json
import os
import time
import uuid
from pathlib import Path


def _atomic_json(path, payload):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as handle:
            json.dump(payload, handle, ensure_ascii=False, default=str)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def persist_turn_evidence(history_file, source_hashes, query, receipts, guard_decisions):
    """The immutable archive is authoritative; the latest sidecar is compatibility only."""
    history_file = Path(history_file)
    archive = history_file.with_suffix('.evidence')
    archive.mkdir(parents=True, exist_ok=True)
    turn_id = f'{time.time_ns()}-{uuid.uuid4().hex}'
    accepted = any(d.get('guard') in {'spreadsheet_evidence', 'comparison_evidence'}
                   and d.get('action') == 'accept' for d in guard_decisions)
    # A later rejection must not inherit an earlier acceptance.
    decisions = [d for d in guard_decisions if d.get('guard') in {'spreadsheet_evidence', 'comparison_evidence'}]
    if decisions:
        accepted = decisions[-1].get('action') == 'accept'
    payload = {'schema_version': 1, 'turn_id': turn_id, 'created_at_ns': time.time_ns(),
               'source_hashes': source_hashes, 'query': query, 'verified': accepted,
               'guard_decisions': guard_decisions, 'receipts': [r.to_dict() for r in receipts]}
    _atomic_json(archive / (turn_id + '.json'), payload)
    _atomic_json(history_file.with_suffix('.evidence.json'), payload)
    return {'verified': accepted, 'turn_id': turn_id,
            'evidence_ids': list(dict.fromkeys(r.data['evidence_id'] for r in receipts
                if r.is_success and isinstance(r.data, dict) and r.data.get('evidence_id')))}


def load_task_context(history_file, source_hashes, max_chars=4500, max_turns=4):
    """Only matching current attachments may contribute history; never current proof.

    Session-broker may replace conversational history with role/content entries.
    Keeping task state beside immutable receipts preserves provenance independently.
    Failed plans stay visible for recovery but are never labelled verified facts.
    """
    if not history_file or not source_hashes or max_chars < 500:
        return ''
    archive = Path(history_file).with_suffix('.evidence')
    if not archive.is_dir():
        return ''
    header = ('[Historical Execution State]: 历史执行状态仅帮助定位来源和修复计划，不构成本轮完成证据；'
              '本轮结论仍需重新执行。文件未匹配或已变化的历史结果不注入。\n')
    rows = []; used = len(header); hashes = {}
    # Inspect at most the recent 12 turns, and inject at most max_turns.
    for path in sorted(archive.glob('*.json'), reverse=True)[:12]:
        if len(rows) >= max_turns:
            break
        try:
            payload = json.loads(path.read_text(encoding='utf-8'))
            sources = payload.get('source_hashes', {})
            if not sources or any(source_hashes.get(name) != value for name, value in sources.items()):
                continue
            state = {'turn_id': payload['turn_id'], 'request': payload['query'][:400],
                     'verified': payload.get('verified') is True, 'evidence': [], 'unresolved': []}
            for receipt in payload.get('receipts', []):
                data = receipt.get('data') or {}
                if not isinstance(data, dict):
                    continue
                if receipt.get('status') != 'success':
                    failure=receipt.get('error') or {}
                    plan=data.get('requested_plan') or {}
                    state['unresolved'].append({'error':{'code':failure.get('code'),
                        'message':str(failure.get('message',''))[:400]},
                        'tables':plan.get('tables',[])[:4],
                        'comparison':{k:plan[k] for k in ('sheet','data_range','basis','rank_by','extreme','comparisons') if k in plan},
                        'items':[{k:item.get(k) for k in ('id','label')} for key in ('calculations','checks','rules')
                                 for item in plan.get(key,[])][:16]})
                    continue
                provenance = receipt.get('provenance') or {}
                filename = provenance.get('file_path')
                expected_hash = provenance.get('workbook_id')
                if not filename or expected_hash not in sources.values():
                    continue
                if filename not in hashes:
                    hashes[filename] = hashlib.sha256(Path(filename).read_bytes()).hexdigest()
                if hashes[filename] != expected_hash:
                    continue
                summary = {k: data[k] for k in ('kind', 'evidence_id', 'semantic_domain') if k in data}
                summary['source'] = {'file_path': filename, 'workbook_id': expected_hash}
                summary['scopes'] = [{k: c[k] for k in ('sheet', 'data_range', 'filters') if k in c}
                                     for c in data.get('coverage', [])]
                if data.get('scope'):
                    summary['scopes'].append({'sheet': provenance.get('sheet'), **data['scope']})
                if state['verified']:
                    summary['facts'] = [{k: f[k] for k in ('label', 'value', 'unit', 'metric_id') if k in f}
                                        for f in data.get('facts', [])[:16]]
                    summary['results'] = data.get('results', [])[:8]
                    summary['facts_truncated'] = len(data.get('facts',[]))>16
                    summary['results_truncated'] = len(data.get('results',[]))>8
                state['evidence'].append(summary)
            if not state['evidence'] and not state['unresolved']:
                continue
            # Drop oversized state as a unit, never clip JSON or fabricate coverage.
            rendered = json.dumps(state, ensure_ascii=False, default=str)
            if used + len(rendered) + 1 > max_chars:
                continue
            rows.append(rendered); used += len(rendered) + 1
        except (OSError, ValueError, KeyError, TypeError):
            continue
    return header + '\n'.join(rows) if rows else ''
