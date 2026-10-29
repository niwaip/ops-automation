"""Bounded PDF CLI adapter: model supplies content, owned templates supply typography and QA."""

import base64
import html
import hashlib
import os
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

from .tool_result import ToolResult, TextToolOutput


PDF_RENDER_TOOL = {
    'type': 'function',
    'function': {
        'name': 'render_pdf',
        'description': '从 Markdown 生成中文 PDF，自动检查页数/字体/文字并生成每页 PNG；运行时自动逐页检查后发布。无需编写排版脚本。',
        'parameters': {
            'type': 'object',
            'properties': {
                'pages': {'type': 'array', 'minItems': 1, 'maxItems': 100, 'items': {'type': 'string'}, 'description': '必填：每项为一页完整 Markdown，程序自动插入分页；必须实际撰写所有页的正文，不能传空数组或内容占位说明'},
                'output_path': {'type': 'string', 'description': '/workspace/ 内的目标 PDF，如 /workspace/handout.pdf'},
                'template': {'type': 'string', 'enum': ['report', 'handout', 'editorial', 'mobile']},
                'theme': {'type': 'string', 'enum': ['blue', 'emerald', 'slate', 'burgundy', 'warm']},
                'title': {'type': 'string'}, 'subtitle': {'type': 'string'}, 'author': {'type': 'string'},
                'min_pages': {'type': 'integer', 'minimum': 1},
                'max_pages': {'type': 'integer', 'minimum': 1},
                'cover': {'type': 'boolean', 'description': '默认 false；仅明确要求独立封面时 true'},
            },
            'required': ['pages', 'output_path'],
            'additionalProperties': False,
        },
    },
}


def render_pdf(params, workspace_dir, skill_dir, deadline=None, user_prompt=''):
    provenance = {'tool': 'render_pdf'}
    audit = {}
    stage = 'input'
    try:
        from .pdf_task_contract import bind_pdf_request, validate_pdf_content, remove_unrequested_emoji, remove_metadata_echoes, prepare_handout_content, align_requested_page_headings
        params = bind_pdf_request(params, user_prompt, deadline=deadline)
        root = Path(workspace_dir).resolve()
        # Audit every invocation, including malformed model arguments.
        folder = root / '.dsh' / 'pdf-attempts'
        if folder.is_symlink() or (root / '.dsh').is_symlink():
            raise ValueError('审计目录不得为符号链接')
        folder.mkdir(parents=True, exist_ok=True)
        attempt = folder / (uuid.uuid4().hex + '.json')
        with attempt.open('x', encoding='utf-8') as stream:
            os.chmod(attempt, 0o600)
            json.dump({'params': params}, stream, ensure_ascii=False)
        audit = {'attempt_path': str(attempt)}
        name = params.get('output_path')
        content = params.get('markdown')
        pages = params.get('pages')
        if pages is not None:
            if content is not None:
                raise ValueError('pages 与 markdown 二选一，不要同时提交')
            if not isinstance(pages, list) or not 1 <= len(pages) <= 100 or any(not isinstance(p, str) or not p.strip() for p in pages):
                raise ValueError('pages 必须为1至100项非空 Markdown 字符串')
            if params.get('min_pages') == params.get('max_pages') and params.get('max_pages') and len(pages) != params['max_pages']:
                raise ValueError(f'pages 数组必须恰好有{params["max_pages"]}项，每项是一整页完整 Markdown，不是一行或一个HTML标签；请将每页所有段落合并为一个字符串')
            if any('<!-- pagebreak -->' in p for p in pages):
                raise ValueError('pages 每项仅放一页，不要在项内再次插入分页标记')
            content = '\n\n<!-- pagebreak -->\n\n'.join(pages)
        if not isinstance(name, str) or not isinstance(content, str) or not content.strip():
            raise ValueError('必须提交完整 pages 数组（或 markdown 正文）以及非空 output_path；不能仅提交参数或引用内容')
        if len(content) > 200_000:
            raise ValueError('单次 Markdown 内容不得超过 200000 字符')
        raw_content = content
        content = remove_unrequested_emoji(content, user_prompt)
        content = remove_metadata_echoes(content, params)
        if params.get('template') == 'handout':
            content = prepare_handout_content(content, params.get('max_pages') if params.get('min_pages') == params.get('max_pages') else None)
        if params.get('cover') is False:
            content = align_requested_page_headings(content, user_prompt)
        target = (root / name).resolve()
        if not target.is_relative_to(root) or target.suffix.lower() != '.pdf':
            raise ValueError(f'输出必须是工作区 {root} 内的 .pdf 文件')
        if any(part.startswith('.') for part in target.relative_to(root).parts):
            raise ValueError('不能向隐藏会话或内部目录写入 PDF')
        if params.get('template') == 'handout':
            from .pdf_handout_quality import expand_record_tables
            content = expand_record_tables(content, user_prompt)
        from .pdf_preview_tool import discard_pdf_render
        discard_pdf_render(target)
        payload = {'params': params, 'raw_markdown': raw_content, 'normalized_markdown': content,
                   'sha256': hashlib.sha256(raw_content.encode()).hexdigest(),
                   'page_char_counts': [len(p) for p in content.split('<!-- pagebreak -->')]}
        attempt.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
        audit.update(sha256=payload['sha256'], page_char_counts=payload['page_char_counts'])
        stage = 'content_precheck'
        validate_pdf_content(content, user_prompt)
        stage = 'render'
        from .file_tools import is_protected_session_file
        if is_protected_session_file(target):
            raise ValueError('不能覆盖用户上传的原始附件，请使用新的文件名')
        template = params.get('template', 'report')
        theme = params.get('theme')
        if template not in ('report', 'handout', 'editorial', 'mobile'):
            raise ValueError('未知 PDF 版式')
        if template == 'handout':
            from .pdf_handout_quality import emphasize_requested_tips
            content = emphasize_requested_tips(prepare_handout_content(content, params.get('max_pages') if params.get('min_pages') == params.get('max_pages') else None), user_prompt)
        if theme is not None and theme not in ('blue', 'emerald', 'slate', 'burgundy', 'warm'):
            raise ValueError('未知 PDF 主题')
        bounds = [params.get(key) for key in ('min_pages', 'max_pages')]
        if any(v is not None and (type(v) is not int or v < 1) for v in bounds):
            raise ValueError('页数范围必须为正整数')
        if all(v is not None for v in bounds) and bounds[0] > bounds[1]:
            raise ValueError('min_pages 不能大于 max_pages')
        if 'cover' in params and type(params['cover']) is not bool:
            raise ValueError('cover 必须为布尔值')
        remaining = deadline - time.monotonic() if deadline is not None else 30
        if remaining <= 0:
            raise TimeoutError('PDF 渲染前总预算已耗尽')
        skill = Path(skill_dir) / 'pdf'
        generator = skill / 'scripts/generate_report_pdf.py'
        if not generator.is_file():
            raise FileNotFoundError('PDF 模板生成器缺失，请检查沙箱镜像')
        import re
        for asset in sorted((skill / 'examples').glob('*.svg')):
            if not asset.is_file() or asset.is_symlink() or asset.stat().st_size > 512_000:
                continue
            data = base64.b64encode(asset.read_bytes()).decode('ascii')
            pattern = r'!\[([^\]]*)\]\((?:' + re.escape(asset.name) + r'|data:image/svg\+xml;base64,' + re.escape(data) + r')\)'
            content = re.sub(pattern,
                lambda match: f'<img class="handout-illustration" alt="{html.escape(match[1], quote=True)}" src="data:image/svg+xml;base64,{data}">', content)
        target.parent.mkdir(parents=True, exist_ok=True)
        # Unique hidden source/preview paths preserve inputs and avoid reusing stale QA on failure.
        run_id = uuid.uuid4().hex
        source = target.parent / f'.pdf-source-{run_id}.md'
        source.write_text(content, encoding='utf-8')
        preview = target.parent / '.pdf-preview' / target.stem / run_id
        staged = preview / 'candidate.pdf'
        cmd = [sys.executable, str(generator), '--input', str(source), '--output', str(staged),
               '--template', template, '--preview-dir', str(preview)]
        for key in ('theme', 'title', 'subtitle', 'author', 'min_pages', 'max_pages'):
            if params.get(key) is not None:
                cmd.extend(['--' + key.replace('_', '-'), str(params[key])])
        if params.get('cover', False):
            cmd.append('--cover')
        proc = subprocess.run(cmd, cwd=root, capture_output=True, text=True,
                              timeout=min(30, max(.01, remaining)))
        qa_path = preview / 'qa.json'
        qa = json.loads(qa_path.read_text()) if qa_path.is_file() else {}
        if proc.returncode or qa.get('valid') is not True:
            raise ValueError('; '.join(qa.get('errors', [])) or proc.stderr[-4000:] or '未取得有效 PDF 质量回执')
        if not staged.is_file() or not qa.get('previews'):
            raise ValueError('PDF 或逐页预览缺失')
        data = {'kind': 'pdf_render', 'file_path': str(target), 'source': str(source),
                'qa_path': str(qa_path), 'page_count': qa['page_count'], 'sha256': qa['sha256'],
                'previews': qa['previews'], 'pages': qa['pages'], 'visual_review': 'required',
                'user_prompt': user_prompt, 'published': False, 'next_step': '逐页调用 inspect_pdf_page(file_path, page)，全部通过后自动发布最终文件'}
        from .pdf_preview_tool import register_pdf_render
        register_pdf_render(data, staged)
        result = ToolResult.success(data=data, text=json.dumps(data, ensure_ascii=False), provenance=provenance)
    except Exception as error:
        from .pdf_preview_tool import record_pdf_failure
        record_pdf_failure(stage, str(error))
        result = ToolResult.error('pdf_render_failed', str(error)[:4000], provenance=provenance,
                                  data={**audit, 'stage': stage, 'guidance': ('尚未渲染 PDF；按错误修正分页或缺失内容，优先用 pages 数组逐页提交。' if stage == 'content_precheck' else '按错误修正参数或内容后重试；无需重写字体和排版代码。')})
    return TextToolOutput(result.render_text(), result)
