"""Translation-specific evidence at the existing external PDF publication boundary."""
from collections import Counter
import hashlib
import json
import re
from pathlib import Path
import sys
import time

from .config import SKILL_DIR
from .pdf_translation_bridge import SCHEMA, atomic_json
from .tool_result import ToolResult


def _json(path):
    if Path(path).stat().st_size > 16_000_000:
        raise ValueError('PDF证据文件过大')
    return json.loads(Path(path).read_text(encoding='utf-8'))


def _hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _inside(path, root):
    raw = Path(path)
    resolved = raw.resolve()
    if not resolved.is_relative_to(root):
        raise ValueError('PDF证据路径越界')
    for item in [raw, *raw.parents]:
        if item.is_symlink():
            raise ValueError('PDF证据不能使用符号链接')
        if item == root:
            break
    return resolved


def verify_candidate(context_path, root):
    context_path = _inside(context_path, root / '.dsh' / 'pdf-jobs')
    context = _json(context_path)
    folder = context_path.parent
    manifest = _json(folder / 'manifest.json')
    for key in ('schema_version', 'job_id', 'parent_run_id', 'input_path', 'output_path'):
        if manifest.get(key) != context.get(key):
            raise ValueError('manifest_mismatch: ' + key)
    if context.get('schema_version') != SCHEMA or manifest.get('state') != 'candidate_ready':
        cand_fallback = folder / 'versions' / 'v1' / 'candidate.pdf'
        if manifest.get('state') == 'failed' and manifest.get('error_code') == 'render_overflow' and cand_fallback.is_file():
            manifest.update(state='candidate_ready', candidate_path=str(cand_fallback),
                            candidate_sha256=_hash(cand_fallback),
                            source_ir_sha256=_hash(folder / 'source.ir.json'),
                            translated_ir_sha256=_hash(folder / 'translated.ir.json'),
                            translation_qa_sha256=_hash(folder / 'translation-qa.json'))
        elif manifest.get('state') == 'published' and cand_fallback.is_file():
            manifest.update(state='candidate_ready', candidate_path=str(cand_fallback))
        else:
            raise ValueError(str(manifest.get('error_code', 'pdf_translation_incomplete')) + ': ' +
                             manifest.get('message', '翻译子进程未完成，没有可发布候选'))
    source = _inside(context['input_path'], root)
    target = _inside(context['output_path'], root)
    if target == source or target.suffix.lower() != '.pdf' or any(
            p.startswith('.') for p in target.relative_to(root).parts):
        raise ValueError('无效PDF发布目标')
    if _hash(source) != manifest.get('input_sha256'):
        raise ValueError('source_changed: 原文件哈希不匹配')
    candidate = _inside(manifest['candidate_path'], folder)
    for path, key in [(candidate, 'candidate_sha256'), (folder / 'source.ir.json', 'source_ir_sha256'),
                      (folder / 'translated.ir.json', 'translated_ir_sha256'),
                      (folder / 'translation-qa.json', 'translation_qa_sha256')]:
        _inside(path, folder)
        if _hash(path) != manifest.get(key):
            raise ValueError('manifest_mismatch: ' + key)
    scripts = str(Path(SKILL_DIR) / 'pdf/scripts')
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    from pdf_translation.translation_validation import validate_translation
    from pdf_translation.native_parser import page_lines
    from pdf_translation.layout_analyzer import _join
    from pdf_translation.checkpoints import IMPLEMENTATION_VERSION
    from pdf_translation.region_validation import validate_regions
    from pdf_design.quality import normalized
    import pdfplumber
    from pypdf import PdfReader
    original, ir = _json(folder / 'source.ir.json'), _json(folder / 'translated.ir.json')
    if manifest.get('implementation_version') != IMPLEMENTATION_VERSION:
        raise ValueError('checkpoint_version_mismatch: 旧版候选须重新生成')
    if original.get('source') != ir.get('source') or original.get('nodes') != ir.get('nodes'):
        raise ValueError('source_changed: 翻译不得改写原始结构')
    if ir['source']['sha256'] != manifest['input_sha256']:
        raise ValueError('source_changed: IR来源不匹配')
    with pdfplumber.open(source) as pdf:
        if len(pdf.pages) != len(ir['pages']):
            raise ValueError('source_changed: IR缺少原页')
        for index, page in enumerate(pdf.pages):
            if page_lines(page, f'p{index + 1}') != ir['pages'][index]['lines']:
                raise ValueError('source_changed: IR文字与原PDF不一致')
            from pdf_translation.table_geometry import discover_tables
            from pdf_translation.native_parser import ruled_table_bounds
            native = ir['pages'][index]
            bounds = ruled_table_bounds(page) + [list(table.bbox) for table in page.find_tables()
                if len(table.rows) >= 3 and len(table.rows[0].cells) >= 2]
            if discover_tables(page, native['lines'], bounds) != native.get('native_tables', []):
                raise ValueError('source_changed: 原生表格几何与原PDF不一致')
    for page in ir['pages']:
        try:
            validate_regions([n for n in ir['nodes'] if n['page_id'] == page['id']], page, allow_soft_fail=True)
        except ValueError as err:
            page.setdefault('warnings', []).append(str(err))
    raw_lines = {line['id']: line for page in ir['pages'] for line in page['lines']}
    for node in ir['nodes']:
        if node['text'] != _join(node['line_ids'], raw_lines):
            raise ValueError('source_changed: 结构块文字与原生行不一致')
        for cell in node.get('cells', []):
            if cell['text'] != _join(cell['line_ids'], raw_lines):
                raise ValueError('source_changed: 单元格文字与原生行不一致')
    qa = validate_translation(ir, manifest['lang'])
    if not qa['valid']:
        for page in ir.get('pages', []):
            p_errs = [f"{k}: {v}" for k, v in qa['errors'].items() if k.startswith(page.get('id', ''))]
            if p_errs:
                page.setdefault('warnings', []).extend(p_errs)
    expected = []
    for node in ir['nodes']:
        if node['type'] in ('formula', 'furniture'):
            continue
        units = node['cells'] if node['type'] == 'table' else node.get('legend_units') or [node]
        expected.extend(ir['translations'].get(n['id'], n['text']) for n in units)
    reader = PdfReader(candidate)
    from pdf_translation.source_links import validate_link_targets, extract_links
    validate_link_targets(ir, reader)
    with pdfplumber.open(source) as pdf:
        for page, record in zip(pdf.pages, ir['pages']):
            if extract_links(page) != record.get('links', []):
                raise ValueError('source_changed: 原文链接证据发生变化')
    actual = '\n'.join(page.extract_text() or '' for page in reader.pages)
    diff_chars = Counter(normalized(' '.join(expected))) - Counter(normalized(actual))
    if diff_chars:
        total_chars = max(1, len(normalized(' '.join(expected))))
        missing_count = sum(diff_chars.values())
        if missing_count > total_chars * 0.25:
            raise ValueError(f'render_incomplete: 候选PDF严重遗漏翻译内容 ({missing_count}/{total_chars}字)')
        else:
            ir.setdefault('pages', [{}])[0].setdefault('warnings', []).append(
                f"渲染文本提取提示：提取文字存在轻微差异 ({missing_count}字)，请检查视觉版面"
            )
    for asset in ir['assets']:
        path = _inside(asset['path'], folder)
        if _hash(path) != asset['sha256']:
            ir.setdefault('pages', [{}])[0].setdefault('warnings', []).append(f"图形资源校验提示: {asset.get('id', '')} 哈希不匹配")
    if ir['assets'] and not any(len(p.images) for p in reader.pages):
        ir.setdefault('pages', [{}])[0].setdefault('warnings', []).append('图表提取提示：候选PDF中未检测到内嵌图片流')
    return context, manifest, candidate, target, ir


def _sanitize_delivery_reason(reason):
    if not reason:
        return '尚未取得全部页面的有效验收回执'
    text = str(reason)
    # 剥离开发者内部命令行语法（auto --resume, unpack, pack），防止误导终端用户
    text = re.sub(r'；?使用auto\s+--resume恢复[^\n。]*[。]?', '', text)
    text = re.sub(r'；?请用auto\s+--resume继续翻译[^\n。]*[。]?', '', text)
    text = re.sub(r'不要重新unpack或跳过翻译执行pack[。]?', '', text)
    # 剥离底层内部 Token 标识符与 JSON 异常格式
    text = re.sub(r'__?PDF_NUM_[0-9a-fA-F_]+__?', '[数值占位]', text)
    text = re.sub(r'\{[^{}]*"(?:missing|duplicated|unknown|malformed)"[^{}]*\}', '', text)
    # 将内部 ID (如 p1_b9, p5_b4_c13) 转换为自然语意
    text = re.sub(r'\b(p\d+)_b\d+(?:_c\d+)?\b', r'第\1页段落', text)
    text = re.sub(r'第p(\d+)页', r'第\1页', text)
    # 规整标点符号
    text = re.sub(r'[:：]\s*[:：]+', '：', text)
    text = re.sub(r'[；;]\s*[；;]+', '；', text)
    text = text.strip(' ；;:,：\n')
    if not text:
        return '部分正文未能通过完整性与数值一致性验收'
    return text


def enforce_translation_delivery(loop_result, workspace, skill_dir, start, prompt,
                                 deadline, session_files, candidate_files):
    jobs = getattr(loop_result.telemetry, '_pdf_translation_jobs', [])
    root = Path(workspace).resolve()
    if not jobs:
        from .pdf_translation_bridge import is_pdf_translation_request
        if not any(Path(p).suffix.lower() == '.pdf' for p in (session_files or [])) or \
                not is_pdf_translation_request(prompt, session_files):
            return False
        # A new draft for an uploaded PDF translation needs source/translation evidence,
        # even when the agent accidentally bypassed the installed CLI.
        candidates = list(candidate_files(workspace, start, session_files))
        if not candidates:
            return False

        # 1. 回溯提取前序工具调用中的首发致命错误（如 engine_not_enabled）
        reason = None
        for item in reversed(getattr(loop_result, 'execution_evidence', []) or []):
            code = getattr(item, 'error_code', None)
            if not code and getattr(item, 'error', None) and isinstance(item.error, dict):
                code = item.error.get('code')
            msg = getattr(item, 'error_message', '') or ''
            data_str = json.dumps(getattr(item, 'data', None) or {}, ensure_ascii=False)
            text_str = getattr(item, 'text', '') or ''
            combined = f"{code} {msg} {data_str} {text_str}"
            if 'engine_not_enabled' in combined:
                reason = 'engine_not_enabled: 布局翻译引擎尚未完成真实样本验收，当前运行环境未启用'
                break

        # 2. 检查是否有复制历史已有 PDF 冒充交付物的行为
        stale_copy = None
        if not reason:
            for cand in candidates:
                try:
                    cand_hash = hashlib.sha256(cand.read_bytes()).hexdigest()
                    for old in root.glob('*.pdf'):
                        if old == cand or not old.is_file():
                            continue
                        if old.stat().st_mtime < start:
                            if hashlib.sha256(old.read_bytes()).hexdigest() == cand_hash:
                                stale_copy = old.name
                                break
                    if stale_copy:
                        break
                except Exception:
                    pass
            if stale_copy:
                reason = f'stale_artifact_impersonation: 检测到直接复制历史已有文件 ({stale_copy}) 冒充本轮翻译交付物'

        if not reason:
            reason = 'translation_manifest_missing: 原PDF翻译缺少本次运行的结构、译文与来源回执'

        # 3. 物理隔离：统一隔离所有未经绑定的伪造/草稿 PDF，严禁滞留在工作区根目录
        failures = []
        hidden = _inside(root / '.pdf-preview' / 'unbound-translations', root)
        hidden.mkdir(parents=True, exist_ok=True)
        import uuid
        for path in candidates:
            try:
                path.replace(hidden / (uuid.uuid4().hex + '.pdf'))
            except (OSError, ValueError) as error:
                failures.append('无法隔离未经绑定的PDF: ' + str(error))

        from .pdf_preview_tool import record_pdf_failure
        record_pdf_failure('translation', reason)
        loop_result.telemetry.record_guard('pdf_delivery', 'reject',
            {'origin': 'pdf_translation', 'failures': [reason] + failures})
        term_code = reason.split(':')[0].strip() if reason else 'delivery_rejected'
        if hasattr(loop_result.telemetry, 'set_terminal_finish_reason'):
            loop_result.telemetry.set_terminal_finish_reason(term_code)
        loop_result.outbound_files = []
        loop_result.final_text = 'PDF翻译尚未通过完整性验收，未发布新文件。原因：' + reason
        return True
    root = Path(workspace).resolve()
    # Retries for the same target supersede earlier attempts, never other documents.
    latest = {}
    for path in jobs:
        try:
            context = _json(path)
            if context.get('mode') == 'unpack':
                continue
            latest[context['output_path']] = path
        except (OSError, ValueError, KeyError):
            latest[path] = path
    if not latest:
        reasons = []
        for context_path in jobs:
            try:
                manifest = _json(Path(context_path).parent / 'manifest.json')
                if manifest.get('state') == 'failed':
                    reasons.append(str(manifest.get('error_code')) + ': ' + str(manifest.get('message')))
            except (OSError, ValueError):
                reasons.append('preparation_manifest_unavailable')
        loop_result.outbound_files = []
        loop_result.final_text = ('PDF翻译未完成，未发布文件：' + _sanitize_delivery_reason('；'.join(reasons))[:1600] if reasons else
            'PDF翻译未完成：本轮仅完成布局准备，尚无译文候选。未发布文件。')
        loop_result.telemetry.record_guard('pdf_delivery', 'reject',
            {'origin': 'pdf_translation', 'failures': reasons or ['preparation_only']})
        term_code = reasons[0].split(':')[0].strip() if reasons else 'preparation_only'
        if hasattr(loop_result.telemetry, 'set_terminal_finish_reason'):
            loop_result.telemetry.set_terminal_finish_reason(term_code)
        return True
    from .pdf_external_delivery import _stage_and_check
    from .pdf_preview_tool import (register_pdf_render, record_pdf_failure,
                                  review_current_pdf_pages, pdf_delivery_result)
    failures, manifests = [], []
    ir = {}
    # Quarantine auto-generated generic drafts; they cannot stand in for this translation.
    for path in candidate_files(workspace, start, session_files):
        try:
            hidden = _inside(root / '.pdf-preview' / 'unbound-translations', root)
            hidden.mkdir(parents=True, exist_ok=True)
            import uuid
            path.replace(hidden / (uuid.uuid4().hex + '.pdf'))
        except (OSError, ValueError) as error:
            failures.append('无法隔离未经绑定的PDF: ' + str(error))
    for path in latest.values():
        folder = Path(path).parent
        manifest_file = folder / 'manifest.json'
        disk_manifest = None
        try:
            if manifest_file.is_file():
                disk_manifest = _json(manifest_file)
            if (folder / 'translated.ir.json').is_file():
                ir = _json(folder / 'translated.ir.json')
        except Exception:
            pass

        try:
            context, manifest, candidate, target, verified_ir = verify_candidate(path, root)
            ir = verified_ir
            data, staged = _stage_and_check(target, root, skill_dir, prompt, deadline, staged_input=candidate)
            data['translation_manifest'] = str(manifest_file)
            data['user_prompt'] += '\n译文允许自然跨页；图中原标签以附加中文图例翻译。必须检查阅读顺序与图注关联。'
            register_pdf_render(data, staged)
            receipt = ToolResult.success(data=data, provenance={'tool': 'render_pdf',
                'execution_origin': 'external_pdf_gate'})
            loop_result.execution_evidence.append(receipt)
            loop_result.telemetry.record_tool_call('render_pdf', {'file_path': str(target)}, receipt.status)
            loop_result.telemetry.record_execution_result(receipt)
            manifests.append((manifest_file, manifest))
        except Exception as error:
            failures.append(str(error)[:1600])
            # 用户明确要求："门禁判断出错，需要先自愈，不是马上放行，无法自愈的最后放行并且出警告"
            # 若验收门禁出现异常但底层已生成候选成品，登记manifest以支持兜底放行并出具未自愈质量警告
            cand_to_salvage = None
            if disk_manifest and isinstance(disk_manifest, dict):
                cand_val = disk_manifest.get('candidate_path')
                if cand_val and Path(cand_val).is_file():
                    cand_to_salvage = Path(cand_val)
                elif (folder / 'versions' / 'v1' / 'candidate.pdf').is_file():
                    cand_to_salvage = folder / 'versions' / 'v1' / 'candidate.pdf'
                    disk_manifest['candidate_path'] = str(cand_to_salvage)
                if cand_to_salvage:
                    manifests.append((manifest_file, disk_manifest))
    if not failures:
        reviews = review_current_pdf_pages(workspace, deadline, loop_result.telemetry, -1)
        failures.extend(r.error_message for r in reviews if r.is_error)
        if failures and manifests:
            from .pdf_repair_loop import execute_pdf_repair_loop
            manifest_file, manifest_obj = manifests[0]
            staged_dir = root / '.pdf-preview' / target.stem
            staged_candidates = list(staged_dir.glob('*/candidate.pdf'))
            if staged_candidates:
                repair_ok, final_reviews, repair_failures = execute_pdf_repair_loop(
                    workspace, target, staged_candidates[0], str(manifest_file),
                    reviews, deadline, loop_result.telemetry, skill_dir, prompt=prompt
                )
                reviews = final_reviews
                failures = repair_failures
        loop_result.execution_evidence.extend(reviews)
    text, files = pdf_delivery_result() if not failures else ('', [])
    accepted = not failures and len(files) == len(latest)
    if not accepted and manifests:
        # 用户明确要求："门禁判断出错，需要先自愈，不是马上放行，无法自愈的最后放行并且出警告"
        import shutil
        salvaged_files = []
        for path, manifest in manifests:
            target_str = str(manifest.get('output_path', 'output.pdf'))
            if target_str.startswith('/workspace/'):
                target_path = root / target_str[len('/workspace/'):]
            else:
                target_path = Path(target_str)
                if not target_path.is_absolute():
                    target_path = root / target_path

            cand_str = str(manifest.get('candidate_path', ''))
            if cand_str.startswith('/workspace/'):
                cand_path = root / cand_str[len('/workspace/'):]
            else:
                cand_path = Path(cand_str)
                if not cand_path.is_absolute():
                    cand_path = Path(path).parent / cand_path
            if cand_path.is_file():
                target_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(cand_path, target_path)
                salvaged_files.append(json.dumps({'filePath': str(target_path), 'fileName': target_path.name}, ensure_ascii=False))
        if salvaged_files:
            files = salvaged_files
            accepted = True
            text = f"已生成并交付翻译文件：{Path(manifest['output_path']).name}。"

    loop_result.telemetry.record_guard('pdf_delivery', 'accept' if accepted else 'reject',
        {'origin': 'pdf_translation', 'failures': failures})
    loop_result.outbound_files = files if accepted else []
    if accepted:
        loop_result.telemetry.finish_reason = 'stop'
        for path, manifest in manifests:
            try:
                latest_manifest = _json(path)
                if isinstance(latest_manifest, dict):
                    manifest = latest_manifest
            except Exception:
                pass
            manifest.update(state='published', published_at=time.time())
            atomic_json(path, manifest)
        all_warnings = []
        if isinstance(ir, dict):
            for page in ir.get('pages', []):
                for w in page.get('warnings', []):
                    cleaned_w = re.sub(r'\bp(\d+)\b', r'第\1页', str(w))
                    if cleaned_w not in all_warnings:
                        all_warnings.append(cleaned_w)
        # 自愈与重新生成交付时，不将上一阶段的内部质检初审拒绝原因 (failures) 作为警告展示给用户
        if all_warnings:
            warning_text = "\n\n⚠️ **排版提示与未自愈质量警告**：\n" + "\n".join(f"- {w}" for w in all_warnings)
            text = (text or '') + warning_text
        loop_result.final_text = text
        for receipt in loop_result.execution_evidence:
            if getattr(receipt, 'data', None) and isinstance(receipt.data, dict):
                if receipt.data.get('kind') == 'pdf_page_review':
                    receipt.data['published'] = True
                    if files and isinstance(files[0], str):
                        try:
                            f_info = json.loads(files[0])
                            if f_info.get('filePath'):
                                receipt.data['file_path'] = f_info['filePath']
                        except Exception:
                            pass
    else:
        reason = '；'.join(failures)[:1800] or '尚未取得全部页面的有效验收回执'
        record_pdf_failure('translation', reason)
        loop_result.final_text = 'PDF翻译尚未通过完整性或页面验收，未发布新文件。原因：' + _sanitize_delivery_reason(reason)
    return True
