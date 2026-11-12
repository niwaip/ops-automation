"""Opt-in live PDF pipeline verification in the isolated pdf-translation-test container."""
import argparse
import json
from pathlib import Path
import shutil
import sys
import time
from types import SimpleNamespace

from pypdf import PdfReader, PdfWriter
from dsh_modules.shell_tools import execute_shell
from dsh_modules.telemetry import TelemetryStats
from dsh_modules.pdf_external_delivery import enforce_external_pdf_delivery


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pages', type=int, default=1)
    args = parser.parse_args()
    source = Path('/repo/data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.sessions/chat-session-1793948895385-0czd8fvz/2507.03009v4.pdf')
    root = Path('/workspace')
    incoming = root / 'source.pdf'
    writer = PdfWriter()
    for page in list(PdfReader(source).pages)[:args.pages]:
        writer.add_page(page)
    writer.write(incoming)
    telemetry = TelemetryStats()
    telemetry.bind_journal(root / 'live-smoke.json')
    started = time.time()
    receipt = execute_shell('python3 /opt/dsh/skills/pdf/scripts/flow_pdf_translate.py auto '
                            '/workspace/source.pdf /workspace/translated.pdf --lang zh-CN',
                            str(root), time.monotonic() + 540)
    loop = SimpleNamespace(telemetry=telemetry, execution_evidence=[receipt.tool_result],
                           final_text='', outbound_files=[])
    enforce_external_pdf_delivery(loop, str(root), '/opt/dsh/skills', started,
        '翻译附件中的完整正文，保持图表和章节结构，阅读体验优先，生成中文版PDF；允许自然跨页。',
        time.monotonic() + 180, ['source.pdf'])
    destination = Path('/artifacts') / f'live-{args.pages}pages-{int(started)}'
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copytree(root / '.dsh', destination / 'dsh')
    if (root / '.pdf-preview').exists():
        shutil.copytree(root / '.pdf-preview', destination / 'previews')
    if (root / 'translated.pdf').exists():
        shutil.copyfile(root / 'translated.pdf', destination / 'translated.pdf')
    summary = {'accepted': bool(loop.outbound_files), 'seconds': time.time() - started,
        'tool_status': receipt.tool_result.status, 'text': loop.final_text,
        'calls': telemetry.calls_ledger, 'guards': telemetry.guard_decisions}
    (destination / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps({'accepted': summary['accepted'], 'seconds': summary['seconds'],
        'tool_status': summary['tool_status'], 'text': summary['text'], 'evidence': str(destination)}, ensure_ascii=False))
    return 0 if summary['accepted'] else 1


if __name__ == '__main__':
    sys.exit(main())
