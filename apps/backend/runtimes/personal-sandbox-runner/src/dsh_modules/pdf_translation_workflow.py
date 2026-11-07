"""Deterministic single-PDF translation and candidate handoff; no free-text planner."""
import hashlib
import json
from pathlib import Path
import re
import shlex


def target_language(prompt):
    request = (prompt or '').split('用户指令：')[-1]
    matches = re.findall(r'中文|英文|英语|日文|日语|\bzh-CN\b|\ben(?:-US)?\b|\bja\b', request, re.I)
    if not matches:
        return None
    last = matches[-1].lower()
    return 'zh-CN' if last in ('中文', 'zh-cn') else 'ja' if last in ('日文', '日语', 'ja') else 'en'


def fixed_translation(prompt, files, deliverables=None):
    from .pdf_translation_bridge import is_pdf_translation_request
    request = (prompt or '').split('用户指令：')[-1]
    return (len(files or []) == 1 and Path(files[0]).suffix.lower() == '.pdf'
        and is_pdf_translation_request(prompt, files)
        and target_language(prompt) is not None
        and not re.search(r'摘要|总结|对比|比较|检索|联网|发送|邮件|逐字定位|像素|填写|合并|删除|提取.*表格', request)
        and len(deliverables or []) <= 1
        and not re.search(r'(?:仅|只)(?:翻译|处理)|第\s*[\d一二三四五六七八九十]+.{0,12}页', request)
        and all(str(item).lower().endswith('.pdf') for item in (deliverables or [])))


def attachment_metadata(path):
    from pypdf import PdfReader
    from pypdf.errors import PyPdfError
    path = Path(path)
    metadata = dict(file=path.name, sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                    workflow='native_pdf_translation')
    try:
        metadata['pages'] = len(PdfReader(path).pages)
    except (PyPdfError, ValueError, OSError) as error:
        metadata.update(readable=False, error=str(error)[:200])
    return json.dumps(metadata, ensure_ascii=False)


def run_fixed_translation(prompt, files, deliverables, workspace, skill_dir, start, deadline, telemetry):
    from .shell_tools import execute_shell
    from .pdf_external_delivery import enforce_external_pdf_delivery
    from types import SimpleNamespace
    source = (Path(workspace) / files[0]).resolve()
    language = target_language(prompt) or 'zh-CN'
    named = [str(item) for item in (deliverables or []) if str(item) != '.pdf']
    output = named[0] if len(named) == 1 else source.stem + '_' + language.split('-')[0] + '.pdf'
    # A user-specified .pdf basename is an output only when distinct from the input.
    names = re.findall(r'([\w\u4e00-\u9fff.-]+\.pdf)\b', (prompt or '').split('用户指令：')[-1], re.I)
    requested = [name for name in names if name != source.name]
    if not named and len(set(requested)) == 1:
        output = requested[0]
    target = Path(workspace) / output
    layout = 'preserve' if re.search(r'页数不变|严格保页|保持(?:原)?页数', prompt) else 'balanced'
    command = shlex.join(['python3', str(Path(skill_dir) / 'pdf/scripts/flow_pdf_translate.py'),
        'auto', str(source), str(target), '--lang', language, '--layout', layout])
    telemetry.record_guard('pdf_translation_workflow', 'direct_execution', {'file': source.name})
    telemetry.checkpoint('tool_started', {'name': 'bash', 'execution_origin': 'runtime_workflow'})
    receipt = execute_shell(command, workspace, deadline).tool_result
    receipt.provenance.update(tool='bash', execution_origin='runtime_workflow')
    telemetry.record_tool_call('bash', {'cmd': command}, receipt.status)
    telemetry.record_execution_result(receipt)
    if receipt.is_error:
        import time
        remaining_time = deadline - time.monotonic() if deadline is not None else 60
        if remaining_time > 20:
            jobs = getattr(telemetry, '_pdf_translation_jobs', [])
            if jobs:
                last_job_dir = Path(jobs[-1]).parent
                manifest_file = last_job_dir / 'manifest.json'
                if manifest_file.is_file():
                    try:
                        mf = json.loads(manifest_file.read_text())
                        if mf.get('state') == 'failed' and mf.get('stage') == 'translate':
                            resume_cmd = shlex.join(['python3', str(Path(skill_dir) / 'pdf/scripts/flow_pdf_translate.py'),
                                'auto', str(source), str(target), '--resume', str(last_job_dir),
                                '--lang', language, '--layout', layout])
                            telemetry.record_guard('pdf_translation_recovery', 'auto_resume', {'job_id': mf.get('job_id')})
                            retry_receipt = execute_shell(resume_cmd, workspace, deadline).tool_result
                            retry_receipt.provenance.update(tool='bash', execution_origin='runtime_workflow')
                            telemetry.record_tool_call('bash', {'cmd': resume_cmd}, retry_receipt.status)
                            telemetry.record_execution_result(retry_receipt)
                            if retry_receipt.is_success:
                                receipt = retry_receipt
                    except Exception:
                        pass
    loop = SimpleNamespace(telemetry=telemetry, execution_evidence=[receipt], final_text='', outbound_files=[])
    enforce_external_pdf_delivery(loop, workspace, skill_dir, start, prompt, deadline, files)
    return loop


def reusable_candidate(cmd, workspace):
    """Only reuse an intact candidate already registered to this active run."""
    from .config import SKILL_DIR
    from .pdf_translation_command import parse_installed_command
    from .telemetry import get_active_telemetry
    from .tool_result import ToolResult
    args = parse_installed_command(cmd, workspace, Path(SKILL_DIR) / 'pdf/scripts/flow_pdf_translate.py')
    if not args or args.command != 'auto' or args.resume:
        return None
    tracker = get_active_telemetry()
    root = Path(workspace).resolve()
    source, target = (root / args.input_pdf).resolve(), (root / args.output_pdf).resolve()
    for context in reversed(getattr(tracker, '_pdf_translation_jobs', [])):
        folder = Path(context).parent
        try:
            manifest = json.loads((folder / 'manifest.json').read_text())
            if (manifest.get('input_path'), manifest.get('output_path'), manifest.get('lang'), manifest.get('layout')) != (
                    str(source), str(target), args.lang, args.layout):
                continue
            if manifest.get('state') != 'candidate_ready':
                return None
            from .pdf_translation_delivery import verify_candidate
            verify_candidate(context, root)
            tracker.record_guard('pdf_translation_dedup', 'reuse', {'job_id': manifest['job_id']})
            return ToolResult.success(data=dict(kind='pdf_translation', state='candidate_ready',
                job_id=manifest['job_id'], parent_run_id=manifest['parent_run_id'],
                manifest_path=str(folder / 'manifest.json'), resume_dir=str(folder), reused=True),
                text='本轮相同翻译候选已就绪，复用已有结果，直接交给运行时验收。', provenance={'tool': 'bash'})
        except (OSError, ValueError, KeyError):
            return None
    return None


def candidate_handoff(evidence, telemetry, deliverables):
    if not deliverables or any(not str(item).lower().endswith('.pdf') for item in deliverables):
        return False
    registered = {str(Path(path).parent / 'manifest.json') for path in
                  getattr(telemetry, '_pdf_translation_jobs', [])}
    receipts = [item for item in evidence if item.is_success and isinstance(item.data, dict)
                and item.data.get('kind') == 'pdf_translation' and item.data.get('state') == 'candidate_ready'
                and item.data.get('manifest_path') in registered]
    return len({item.data['manifest_path'] for item in receipts}) >= len(deliverables)
