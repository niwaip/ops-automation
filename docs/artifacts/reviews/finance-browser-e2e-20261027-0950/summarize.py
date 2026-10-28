"""Extract metrics from saved browser responses; never calls product APIs."""
import json
from pathlib import Path

root = Path(__file__).parent
def decode(value):
    if isinstance(value, str):
        for _ in range(2):
            try:
                raw = b''.join(bytes([ord(c)]) if ord(c)<256 else c.encode('cp1252') for c in value)
                value = raw.decode('utf-8')
            except UnicodeError:
                break
        return value
    if isinstance(value, dict):
        return {k: decode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value
summaries = []
for path in sorted(root.glob('F[0-9][0-9].json')):
    data = json.loads(path.read_text())
    streams = data.get('events') or [data.get('event', {})]
    events = []
    for stream in streams:
        body = stream.get('body', '')
        # Playwright response.text() may decode this SSE without its charset.
        try:
            body = body.encode('latin1').decode('utf-8')
        except (UnicodeError, ValueError):
            pass
        for line in body.splitlines():
            if line.startswith('data: '):
                try:
                    events.append(decode(json.loads(line[6:])))
                except json.JSONDecodeError:
                    pass
    result = next((e for e in reversed(events) if e.get('type') == 'result'), {})
    evidence_source = 'browser_sse'
    if path.stem == 'F08' and not result:
        history = json.loads((root / 'F10-history.json').read_text())['messages'][-1]
        metadata = history.get('metadata', {})
        result = {'content': history['content'], 'data': {
            'sandbox': metadata.get('executionTrace', {}),
            'usage': metadata.get('usage'),
        }}
        evidence_source = 'persisted_history; SSE inspector cache evicted'
    sandbox = result.get('data', {}).get('sandbox', {})
    metrics = sandbox.get('metrics', {})
    summaries.append({
        'case': path.stem,
        'evidence_source': evidence_source,
        'http_status': [s.get('status') for s in streams],
        'done': any(e.get('type') == 'done' for e in events),
        'duration_ms': sandbox.get('durationMs'),
        'exit_code': sandbox.get('exitCode'),
        'usage': result.get('data', {}).get('usage'),
        'finish_reason': metrics.get('finishReason'),
        'tools': metrics.get('toolCalls'),
        'guard_decisions': metrics.get('guardDecisions'),
        'event_types': sorted({e.get('type', '') for e in events}),
        'answer': result.get('content'),
    })
    (root / f'{path.stem}-ui.txt').write_text(data.get('text', ''))
(root / 'stream-summary.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2))
for summary in summaries:
    print(json.dumps({k: v for k, v in summary.items() if k not in {'answer', 'guard_decisions', 'tools'}}, ensure_ascii=False))
