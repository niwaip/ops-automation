"""One runtime-owned checkpoint retry under the original task deadline."""
from pathlib import Path
import shlex
import time

from .config import SKILL_DIR
from .pdf_translation_command import parse_installed_command


def recover_pdf_translation(result, job, cmd, workspace, deadline, execute_once):
    script = Path(SKILL_DIR) / 'pdf/scripts/flow_pdf_translate.py'
    args = parse_installed_command(cmd, workspace, script)
    if not args or args.command != 'auto' or args.resume:
        return result
    tracker = job.telemetry
    key = (job.context['input_path'], job.context['output_path'])
    attempted = getattr(tracker, '_pdf_checkpoint_retries', set()) if tracker else set()
    stage_attempted = getattr(tracker, '_pdf_stage_retries', set()) if tracker else set()
    current = result
    current_job_id = job.job_id
    current_manifest = str(job.manifest_path)
    while current.is_error and current.error_code in (
            'translation_incomplete', 'layout_unresolved', 'budget_exhausted'):
        resume = (current.data or {}).get('resume_dir')
        if not resume or (deadline is not None and deadline - time.monotonic() <= 45):
            break
        stage = 'layout' if current.error_code == 'layout_unresolved' else 'translate'
        stage_key = (*key, stage)
        if stage_key in stage_attempted:
            break
        attempted.add(key)
        stage_attempted.add(stage_key)
        if tracker:
            tracker._pdf_checkpoint_retries = attempted
            tracker._pdf_stage_retries = stage_attempted
            tracker.record_guard('pdf_checkpoint_recovery', 'resume',
                {'failed_job': current_job_id, 'error_code': current.error_code, 'resume_dir': resume})
        command = shlex.join(['python3', str(script), 'auto', key[0], key[1],
                              '--lang', args.lang, '--layout', args.layout, '--resume', resume])
        prev_manifest = current_manifest
        current = execute_once(command).tool_result
        if isinstance(current.data, dict):
            current.data['recovered_from'] = prev_manifest
            current_job_id = current.data.get('job_id') or current_job_id
            if current.data.get('resume_dir'):
                current_manifest = str(Path(current.data['resume_dir']) / 'manifest.json')
    return current


def exhausted_recovery(cmd, workspace):
    """A model cannot start another attempt after the runtime consumed recovery."""
    from .telemetry import get_active_telemetry
    from .tool_result import ToolResult
    tracker = get_active_telemetry()
    attempted = getattr(tracker, '_pdf_checkpoint_retries', set())
    if not attempted:
        return None
    script = Path(SKILL_DIR) / 'pdf/scripts/flow_pdf_translate.py'
    args = parse_installed_command(cmd, workspace, script)
    if not args or args.command != 'auto':
        return None
    key = (str((Path(workspace) / args.input_pdf).resolve()),
           str((Path(workspace) / args.output_pdf).resolve()))
    if key in attempted:
        return ToolResult.error('pdf_recovery_exhausted',
            '本轮PDF翻译的检查点恢复已执行，不能再次重新解析或补译。'
            '候选若已就绪则等待最终验收；否则报告失败，不复制历史PDF。', provenance={'tool': 'bash'})
    return None
