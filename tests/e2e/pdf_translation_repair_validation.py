"""Run with the existing sandbox identity; no credential extraction or new model endpoint."""
import json
import argparse
import os
from pathlib import Path
import shutil
import sys
import time
from types import SimpleNamespace


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--resume')
    parser.add_argument('--tool-timeout', type=int, default=300)
    args = parser.parse_args()
    started = time.time()
    root = Path('/workspace/.dsh/validation') / ('pdf-repair-' + str(int(started)))
    root.mkdir(parents=True, exist_ok=False)
    original = Path('/workspace/2507.03009v4.pdf')
    shutil.copyfile(original, root / 'source.pdf')
    os.environ['WORKSPACE'] = str(root)
    os.environ['DSH_PDF_TOOL_TIMEOUT'] = str(args.tool_timeout)
    os.environ['DSH_MODEL'] = 'qwen36-35b-a3b'
    os.environ['DSH_VISION_MODEL'] = 'qwen36-35b-a3b'
    sys.path.insert(0, '/usr/local/bin')
    from dsh_modules.shell_tools import execute_shell
    from dsh_modules.telemetry import TelemetryStats
    from dsh_modules.pdf_external_delivery import enforce_external_pdf_delivery
    from dsh_modules.pdf_preview_tool import reset_pdf_renders
    telemetry = TelemetryStats()
    telemetry.bind_journal(root / 'validation.json')
    reset_pdf_renders()
    deadline = time.monotonic() + 900
    command = ('python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto '
               f'{root}/source.pdf {root}/translated.pdf --lang zh-CN')
    if args.resume:
        command += ' --resume ' + args.resume
    receipts = [execute_shell(command, str(root), deadline)]
    # Runtime owns at most one checkpoint recovery under this deadline.
    loop = SimpleNamespace(telemetry=telemetry, execution_evidence=[r.tool_result for r in receipts],
                           final_text='', outbound_files=[])
    enforce_external_pdf_delivery(loop, str(root), '/opt/dsh/skills', started,
        '翻译完整原PDF，保留章节、表格、公式和图注关联，阅读体验优先，允许自然跨页；生成中文版PDF。',
        deadline, ['source.pdf'])
    calls = telemetry.calls_ledger
    jobs = []
    for context in getattr(telemetry, '_pdf_translation_jobs', []):
        manifest = json.loads((Path(context).parent / 'manifest.json').read_text())
        jobs.append(manifest)
    summary = {'accepted': bool(loop.outbound_files), 'root': str(root),
        'seconds': time.time() - started, 'final_text': loop.final_text,
        'calls': calls, 'tokens': telemetry.tokens, 'guards': telemetry.guard_decisions,
        'jobs': jobs, 'outbound_files': loop.outbound_files}
    (root / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({k: summary[k] for k in ('accepted', 'root', 'seconds', 'final_text')}, ensure_ascii=False))
    return 0 if summary['accepted'] else 1


if __name__ == '__main__':
    sys.exit(main())
