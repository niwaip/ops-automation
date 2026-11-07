"""Opt-in full DSH validation using the existing sandbox identity, isolated output."""
import collections
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


def main():
    started = time.time()
    root = Path('/workspace/.dsh/validation') / f'pdf-optimization-{int(started)}'
    root.mkdir(parents=True, exist_ok=False)
    shutil.copyfile('/workspace/2507.03009v4.pdf', root / 'source.pdf')
    environment = dict(os.environ, WORKSPACE=str(root), DSH_TOTAL_TIMEOUT_SECONDS='900')
    command = ['dsh', 'run', '翻译这个文档，保持格式不变，生成中文版的pdf',
               '--files', 'source.pdf', '--session-id', 'pdf-optimization-validation',
               '--model', 'default', '--model-display-name', 'qwen36-35b-a3b',
               '--thinking', '--reasoning-effort', 'medium', '--web-search']
    print(json.dumps({'root': str(root), 'started': started}), flush=True)
    with (root / 'harness.log').open('w') as log:
        result = subprocess.run(command, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=930)
    events = [json.loads(line) for path in root.glob('.dsh/sessions/*.events/*.jsonl')
              for line in path.read_text().splitlines()]
    metrics = next((event['data'] for event in reversed(events) if event['event'] == 'metrics'), {})
    jobs = [json.loads(path.read_text()) for path in root.glob('.dsh/pdf-jobs/*/*/manifest.json')]
    completed = [event['data'] for event in events if event['event'] == 'model_completed']
    summary = dict(root=str(root), elapsed_s=round(time.time() - started, 3), exit_code=result.returncode,
        accepted=any(job['state'] == 'published' for job in jobs), jobs=jobs, metrics=metrics,
        purposes=dict(collections.Counter(call['purpose'] for call in completed)))
    (root / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({key: summary[key] for key in ('root', 'elapsed_s', 'exit_code', 'accepted', 'purposes')}, ensure_ascii=False), flush=True)
    return 0 if summary['accepted'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
