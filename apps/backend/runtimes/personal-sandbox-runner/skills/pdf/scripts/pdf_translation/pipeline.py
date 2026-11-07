"""A bounded, checkpointed translation job; only the existing DSH gate publishes."""
import os
from pathlib import Path
import time
import uuid

from .contracts import SCHEMA, TranslationError, check_time, digest, read_json, write_json
from .native_parser import parse_native
from .layout_analyzer import analyze_layout
from .asset_extractor import extract_assets
from .model_gateway import ModelGateway
from .text_translator import translate_document
from .translation_validation import validate_translation
from .html_renderer import render_document
from .checkpoints import IMPLEMENTATION_VERSION, load_checkpoint, export_preparation, load_layout_checkpoint


def safe_target(source, output, workspace):
    root = Path(workspace).resolve()
    raw = Path(output) if Path(output).is_absolute() else root / output
    target = raw.resolve()
    if (target == Path(source).resolve() or target.suffix.lower() != '.pdf'
            or not target.is_relative_to(root) or any(p.startswith('.') for p in target.relative_to(root).parts)):
        raise TranslationError('invalid_output', '输出须为工作区内的新PDF文件，不能覆盖输入或写入隐藏目录')
    for path in [raw, *raw.parents]:
        if path.is_symlink():
            raise TranslationError('invalid_output', '输出目录不能使用符号链接')
        if path == root:
            break
    return target


def run_job(source, output=None, *, lang='zh-CN', layout='balanced', mode='auto',
            work_dir=None, gateway_factory=ModelGateway, resume=None):
    source = Path(source).resolve()
    workspace = Path(os.getenv('WORKSPACE', '/workspace' if Path('/workspace').is_dir() else Path.cwd())).resolve()
    context_path = os.getenv('DSH_PDF_JOB_CONTEXT')
    context = read_json(context_path) if context_path else {'schema_version': SCHEMA,
        'job_id': uuid.uuid4().hex, 'parent_run_id': 'standalone'}
    if context.get('schema_version') != SCHEMA:
        raise TranslationError('manifest_mismatch', '无效PDF运行上下文')
    if context_path:
        folder = Path(context_path).resolve().parent
    else:
        folder = workspace / '.dsh' / 'pdf-jobs' / context['parent_run_id'] / context['job_id']
        folder.mkdir(parents=True, exist_ok=False)
    target = safe_target(source, output, workspace) if output else None
    if context.get('input_path') and (str(source) != context['input_path'] or
            (str(target) if target else None) != context['output_path']):
        raise TranslationError('manifest_mismatch', 'CLI参数与父进程上下文不匹配')
    if not source.is_file():
        raise TranslationError('source_unavailable', '输入PDF不存在')
    manifest = {'schema_version': SCHEMA, 'engine': 'layout-html-v1',
        'implementation_version': IMPLEMENTATION_VERSION, 'mode': mode, 'job_id': context['job_id'],
        'parent_run_id': context['parent_run_id'], 'input_path': str(source), 'input_sha256': digest(source),
        'output_path': str(target) if target else None, 'lang': lang, 'layout': layout,
        'created_at': time.time(), 'state': 'running', 'stage': 'extract'}
    write_json(folder / 'manifest.json', manifest)
    deadline = min(float(context.get('deadline_monotonic', float('inf'))),
                   time.monotonic() + float(os.getenv('DSH_PDF_TOOL_TIMEOUT', '300')))
    try:
        if mode == 'unpack' and Path(work_dir).exists() and any(Path(work_dir).iterdir()):
            raise TranslationError('checkpoint_exists', '准备目录已存在；请使用auto --resume继续，不要覆盖或混写尝试')
        gateway = gateway_factory(folder, context, deadline)
        layout_resume = (resume and (Path(resume) / 'manifest.json').is_file()
                         and read_json(Path(resume) / 'manifest.json').get('layout_ir_sha256')
                         and not read_json(Path(resume) / 'manifest.json').get('source_ir_sha256'))
        if layout_resume and mode != 'pack':
            manifest.update(stage='layout', resumed_from=str(resume))
            write_json(folder / 'manifest.json', manifest)
            ir = load_layout_checkpoint(resume, source, folder, deadline)
            write_json(folder / 'source.ir.json', ir)
            ir = analyze_layout(ir, gateway, folder, deadline)
            ir = extract_assets(ir, folder)
            write_json(folder / 'source.ir.json', ir)
        elif mode == 'pack' or resume:
            ir, previous = load_checkpoint(work_dir if mode == 'pack' else resume, source, folder, pack=mode == 'pack')
            if previous.get('lang') != lang and mode != 'pack':
                ir['translations'] = {}
            manifest['resumed_from'] = str(work_dir if mode == 'pack' else resume)
            write_json(folder / 'source.ir.json', dict(ir, translations={}))
        else:
            print('🔍 正在解析PDF文字、布局与图文关系', flush=True)
            ir = parse_native(source, folder, deadline)
            manifest['stage'] = 'layout'
            write_json(folder / 'manifest.json', manifest)
            ir = analyze_layout(ir, gateway, folder, deadline)
            ir = extract_assets(ir, folder)
            write_json(folder / 'source.ir.json', ir)
        manifest['source_ir_sha256'] = digest(folder / 'source.ir.json')
        if mode == 'unpack':
            manifest.update(state='unpacked', stage='layout', work_dir=str(Path(work_dir).resolve()))
            export_preparation(folder, work_dir, manifest)
            write_json(folder / 'manifest.json', manifest)
            return folder / 'manifest.json'
        manifest['stage'] = 'translate'
        ir['target_language'] = lang
        write_json(folder / 'manifest.json', manifest)
        if mode != 'pack':
            ir = translate_document(ir, gateway, folder, deadline, lang)
        qa = validate_translation(ir, lang)
        write_json(folder / 'translation-qa.json', qa)
        if not qa['valid']:
            raise TranslationError('translation_incomplete', f'译文未通过内容核对: {qa["errors"]}')
        check_time(deadline)
        if digest(source) != manifest['input_sha256']:
            raise TranslationError('source_changed', '执行中原文件发生变化')
        manifest['stage'] = 'render'
        write_json(folder / 'manifest.json', manifest)
        write_json(folder / 'translated.ir.json', ir)
        candidate, render_qa = render_document(ir, folder / 'versions' / 'v1', layout)
        check_time(deadline)
        manifest.update(state='candidate_ready', stage='awaiting_publication',
            candidate_path=str(candidate), candidate_sha256=digest(candidate),
            source_ir_sha256=digest(folder / 'source.ir.json'),
            translated_ir_sha256=digest(folder / 'translated.ir.json'),
            translation_qa_sha256=digest(folder / 'translation-qa.json'),
            page_count=render_qa['page_count'], completed_at=time.time())
        write_json(folder / 'manifest.json', manifest)
        print('✓ PDF候选已生成；尚未发布，须由运行时完成全部页面验收。', flush=True)
        return folder / 'manifest.json'
    except Exception as error:
        if manifest.get('stage') == 'layout' and (folder / 'source.ir.json').is_file():
            manifest['layout_ir_sha256'] = digest(folder / 'source.ir.json')
        manifest.update(state='failed', error_code=str(getattr(error, 'code', 'pdf_translation_failed')),
                        message=str(error)[:1600], completed_at=time.time())
        write_json(folder / 'manifest.json', manifest)
        raise
