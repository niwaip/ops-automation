"""Bridge only the installed PDF CLI into existing shell budgets and telemetry."""
import json
import math
import os
from pathlib import Path
import re
import time
import uuid

from .config import SKILL_DIR
from .telemetry import get_active_telemetry
from .tool_result import ToolResult

SCHEMA = 'pdf-translation/1'


def atomic_json(path, data):
    path = Path(path)
    temp = path.with_name('.' + path.name + '.' + uuid.uuid4().hex)
    try:
        with temp.open('x', encoding='utf-8') as stream:
            os.chmod(temp, 0o600)
            json.dump(data, stream, ensure_ascii=False, allow_nan=False)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def recognized_command(cmd, workspace):
    from .pdf_translation_command import parse_installed_command
    installed = Path(SKILL_DIR) / 'pdf/scripts/flow_pdf_translate.py'
    args = parse_installed_command(cmd, workspace, installed)
    if not args:
        return None
    root = Path(workspace).resolve()
    source = getattr(args, 'input_pdf', None)
    if args.command == 'pack':
        try:
            source = json.loads((root / args.work_dir / 'source.ir.json').read_text())['source']['path']
        except (OSError, KeyError, ValueError, TypeError):
            return None
    output = getattr(args, 'output_pdf', None)
    return str((root / source).resolve()), str((root / output).resolve()) if output else None


class PdfTranslationBridge:
    def __init__(self, paths, workspace, deadline, options=None):
        self.telemetry = get_active_telemetry()
        journal = getattr(self.telemetry, '_journal', None)
        journal_path = getattr(journal, 'path', None)
        self.run_id = Path(journal_path).stem if journal_path else uuid.uuid4().hex
        self.job_id = uuid.uuid4().hex
        self.folder = Path(workspace).resolve() / '.dsh' / 'pdf-jobs' / self.run_id / self.job_id
        for parent in [self.folder, *self.folder.parents]:
            if parent.is_symlink():
                raise ValueError('PDF job目录不能使用符号链接')
            if parent == Path(workspace).resolve():
                break
        self.folder.mkdir(parents=True, exist_ok=False)
        self.context_path = self.folder / 'context.json'
        self.manifest_path = self.folder / 'manifest.json'
        budget = float(os.getenv('DSH_PDF_TOOL_TIMEOUT', '300'))
        if not math.isfinite(budget) or budget <= 0:
            raise ValueError('PDF工具预算必须为正数')
        self.timeout = min(budget, max(0, deadline - time.monotonic() - 40)) if deadline else budget
        self.context = {'mode': getattr(options, 'command', 'auto'),
            'work_dir': str((Path(workspace) / options.work_dir).resolve()) if options and getattr(options, 'work_dir', None) else None,
            'schema_version': SCHEMA, 'job_id': self.job_id, 'parent_run_id': self.run_id,
            'input_path': paths[0], 'output_path': paths[1],
            'model': os.getenv('DSH_MODEL') or 'default',
            'vision_model': os.getenv('DSH_VISION_MODEL') or 'vision',
            'deadline_monotonic': time.monotonic() + self.timeout}
        atomic_json(self.context_path, self.context)
        atomic_json(self.manifest_path, dict(self.context, state='running', created_at=time.time()))
        if self.telemetry:
            jobs = getattr(self.telemetry, '_pdf_translation_jobs', [])
            jobs.append(str(self.context_path))
            self.telemetry._pdf_translation_jobs = jobs
        self.offset, self.pending = 0, {}

    def environment(self):
        return dict(os.environ, DSH_PDF_JOB_CONTEXT=str(self.context_path))

    def poll(self):
        path = self.folder / 'model-events.jsonl'
        if not self.telemetry or not path.is_file() or path.is_symlink():
            return
        with path.open('rb') as stream:
            stream.seek(self.offset)
            for _ in range(200):
                raw = stream.readline(1_000_001)
                if not raw.endswith(b'\n') or len(raw) > 1_000_000:
                    break
                self.offset = stream.tell()
                try:
                    event = json.loads(raw)
                    data = event['data']
                    cid = data.get('call_id', '')
                    if event.get('job_id') != self.job_id or not re.fullmatch('[0-9a-f]{32}', cid):
                        continue
                    purpose = data.get('purpose')
                    if purpose not in ('pdf_layout_analysis', 'pdf_translation'):
                        continue
                    if event['event'] == 'model_started':
                        self.pending[cid] = data
                        self.telemetry.checkpoint('model_started', data)
                    elif event['event'] in ('model_completed', 'model_failed'):
                        usage = data.get('usage') or {}
                        ms = float(data.get('total_ms', 0))
                        if not math.isfinite(ms) or ms < 0:
                            continue
                        if event['event'] == 'model_failed':
                            self.telemetry.record_model_failure(call_id=cid, purpose=purpose,
                                model=data.get('model'), total_ms=ms, code=data.get('error_code') or 'model_failed', usage=usage)
                        else:
                            self.telemetry.record_auxiliary_call(purpose, usage, ms, data.get('model'), call_id=cid)
                        self.pending.pop(cid, None)
                except (ValueError, KeyError, TypeError):
                    continue

    def finish(self, failed, message, error_code=None):
        self.poll()
        for cid, data in self.pending.items():
            self.telemetry.record_model_failure(call_id=cid, purpose=data['purpose'],
                model=data.get('model'), total_ms=0, code='child_interrupted')
        self.pending.clear()
        try:
            manifest = json.loads(self.manifest_path.read_text())
        except (OSError, ValueError):
            manifest = dict(self.context, state='failed', error_code='manifest_missing')
        if failed or manifest.get('state') not in ('candidate_ready', 'unpacked'):
            manifest.update(state='failed', error_code=manifest.get('error_code') or error_code or 'pdf_translation_failed',
                            message=manifest.get('message') or str(message)[-1200:])
            atomic_json(self.manifest_path, manifest)
        data = {'kind': 'pdf_translation', 'manifest_path': str(self.manifest_path),
                'parent_run_id': self.run_id, 'job_id': self.job_id, 'state': manifest.get('state')}
        if manifest.get('source_ir_sha256') or manifest.get('layout_ir_sha256'):
            data['resume_dir'] = str(self.folder)
        elif manifest.get('stage') == 'layout':
            data['recovery'] = 'restart_layout'
            data['recovery_instruction'] = ('布局尚未完整，不能使用--resume或pack。仅可用auto重新解析一次；'
                '失败后停止并报告原因，不得查找、复制或重命名历史PDF作为本轮译文。')
        if manifest.get('state') == 'unpacked':
            data['work_dir'] = manifest.get('work_dir')
            return ToolResult.success(data=data, provenance={'tool': 'bash'},
                text='布局准备完成，尚未翻译或发布。后续使用auto --resume恢复并自动补译；pack仅接受已完整填写的translated.json。')
        if manifest.get('state') == 'candidate_ready':
            return ToolResult.success(data=data, provenance={'tool': 'bash'},
                text='PDF候选已完成结构化翻译和程序检查，尚未发布；不要查找或重写目标文件，运行时将执行最终逐页验收。')
        return ToolResult.error(str(manifest.get('error_code') or 'pdf_translation_failed'),
            'PDF翻译未完成，未发布文件：' + manifest.get('message', '')[:1200],
            data=data, provenance={'tool': 'bash'})


def prepare_pdf_translation(cmd, workspace, deadline):
    paths = recognized_command(cmd, workspace)
    if not paths:
        return None
    from .pdf_translation_command import parse_installed_command
    options = parse_installed_command(cmd, workspace, Path(SKILL_DIR) / 'pdf/scripts/flow_pdf_translate.py')
    return PdfTranslationBridge(paths, workspace, deadline, options)


def has_pdf_translation(telemetry=None):
    tracker = telemetry if telemetry is not None else get_active_telemetry()
    return bool(getattr(tracker, '_pdf_translation_jobs', []))


_TRANSLATION_INTENT = re.compile(r'翻译|译成|译为|中文版|translate|translation', re.I)
_ATTACHED_PDF = re.compile(
    r'【(?:当前轮次用户上传附件|当前会话有效附件清单|当前上下文聚焦文档)】:[^\n]*?\.pdf', re.I)


def is_pdf_translation_request(prompt, session_files=None):
    """An uploaded PDF translation must come from the layout engine, never a text-to-PDF draft."""
    text = prompt or ''
    if not _TRANSLATION_INTENT.search(text.split('用户指令：')[-1]):
        return False
    if any(Path(p).suffix.lower() == '.pdf' for p in (session_files or [])):
        return True
    return bool(_ATTACHED_PDF.search(text))
