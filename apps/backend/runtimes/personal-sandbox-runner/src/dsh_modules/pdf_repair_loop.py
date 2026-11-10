"""Governs page-aware focused repair rounds under unified task budget and termination rules."""
import hashlib
import json
from pathlib import Path
import shutil
import time
from typing import Dict, List, Any, Tuple, Optional

from .pdf_issue_triage import triage_review_issues
from .pdf_review_contract import extract_review_issues
from .tool_result import ToolResult


def _digest(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def execute_pdf_repair_loop(
    workspace: str,
    target: Path,
    staged: Path,
    manifest_path: str,
    initial_reviews: List[Any],
    deadline: Optional[float],
    telemetry: Any,
    skill_dir: str,
    prompt: str = "",
    *,
    _render_func = None
) -> Tuple[bool, List[Any], List[str]]:
    """Runs focused repair on failing PDF pages without full document re-execution.

    Returns:
        (success: bool, final_reviews: List[ToolResult], failures: List[str])
    """
    root = Path(workspace).resolve()
    target = Path(target).resolve()
    folder = Path(manifest_path).parent
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    ir_path = folder / 'translated.ir.json'
    if not ir_path.is_file():
        return False, initial_reviews, ['缺少 translated.ir.json，无法执行局部修复']

    ir = json.loads(ir_path.read_text(encoding='utf-8'))
    cand_dir = Path(manifest.get('candidate_path') or '').parent if manifest.get('candidate_path') else None
    page_map = None
    for pm_candidate in [
        (cand_dir / 'page-map.json') if cand_dir else None,
        folder / 'versions' / 'v1' / 'page-map.json',
        folder / 'page-map.json',
    ]:
        if pm_candidate and pm_candidate.is_file():
            page_map = json.loads(pm_candidate.read_text(encoding='utf-8'))
            break

    from pdf_translation.model_gateway import ModelGateway
    from .pdf_preview_tool import inspect_pdf_page, _RENDERS

    current_reviews = list(initial_reviews)
    history_issues_by_node = {}

    context = {
        'schema_version': manifest.get('schema_version'),
        'job_id': manifest.get('job_id'),
        'parent_run_id': manifest.get('parent_run_id'),
    }

    effective_deadline = deadline if deadline is not None else (time.monotonic() + 300)
    gateway = ModelGateway(folder, context, effective_deadline)

    for repair_round in range(1, 4):
        # 1. 检查失败项
        failing = [r for r in current_reviews if getattr(r, 'is_error', False)]
        if not failing:
            telemetry.record_guard('pdf_repair_loop', 'success', {'rounds': repair_round - 1})
            return True, current_reviews, []

        if deadline is not None and deadline - time.monotonic() <= 45:
            telemetry.record_guard('pdf_repair_loop', 'terminate', {'reason': 'budget_exhausted'})
            return False, current_reviews, ['修复超时：剩余预算不足以完成最小必要修复']

        # 2. 收集 issue 并分类
        collected_issues = []
        for r in failing:
            # 过滤网络/服务不可用等临时服务异常，防止服务超时被误判为版面缺陷引发破坏性重排
            if getattr(r, 'error_code', '') == 'pdf_review_unavailable':
                continue
            p_num = getattr(r, 'page', None) or (r.data or {}).get('page') or (getattr(r, 'provenance', None) or {}).get('page') or 1
            text_desc = getattr(r, 'error_message', '') or getattr(r, 'text', '') or ''
            collected_issues.extend(extract_review_issues(text_desc, page_number=p_num))

        triage = triage_review_issues(collected_issues, ir, page_map)

        if triage['unrecoverable']:
            reason = triage['unrecoverable_reason'] or '不可恢复错误'
            telemetry.record_guard('pdf_repair_loop', 'terminate', {'reason': reason})
            return False, current_reviews, [reason]

        nodes_to_fix = set(triage['nodes_to_retranslate'])
        tables_to_fix = set(triage['tables_to_rebuild'])
        pages_to_fix = set(triage.get('pages_to_relayout', []))

        if not nodes_to_fix and not tables_to_fix and not pages_to_fix:
            telemetry.record_guard('pdf_repair_loop', 'terminate', {'reason': 'no_actionable_repair_targets'})
            remaining = [getattr(r, 'error_message', '') or getattr(r, 'text', '') or '存在无法自动定位修复的版面缺陷' for r in failing]
            return False, current_reviews, remaining

        # 3. 检查非收敛
        non_convergent = False
        for nid in nodes_to_fix:
            history = history_issues_by_node.setdefault(nid, [])
            if history and history[-1] == 'translation':
                non_convergent = True
                break
            history.append('translation')
        for tid in tables_to_fix:
            history = history_issues_by_node.setdefault(tid, [])
            if history and history[-1] == 'table':
                non_convergent = True
                break
            history.append('table')
        for pid in pages_to_fix:
            history = history_issues_by_node.setdefault(pid, [])
            if history and history[-1] == 'layout':
                non_convergent = True
                break
            history.append('layout')

        if non_convergent:
            telemetry.record_guard('pdf_repair_loop', 'terminate', {'reason': 'non_convergent'})
            return False, current_reviews, ['检测到相同节点连续发生未收敛缺陷，停止重试']

        telemetry.record_guard('pdf_repair_round', 'start', {
            'round': repair_round,
            'nodes': list(nodes_to_fix),
            'tables': list(tables_to_fix),
            'pages': list(pages_to_fix)
        })

        # 4. 执行版面重构、表格重建与局部重译
        if pages_to_fix:
            try:
                from pdf_translation.layout_analyzer import _analyze_page_worker, validate_ir
                for pid in pages_to_fix:
                    page = next((p for p in ir.get('pages', []) if p['id'] == pid), None)
                    if not page:
                        continue
                    old_nodes = [n for n in ir.get('nodes', []) if n.get('page_id') == pid]
                    trans_dict = ir.setdefault('translations', {})
                    text_to_trans = {}
                    old_sub_ids = set()
                    for n in old_nodes:
                        old_sub_ids.add(n['id'])
                        if n.get('text') and n['id'] in trans_dict:
                            text_to_trans[n['text']] = trans_dict[n['id']]
                        for c in n.get('cells', []):
                            old_sub_ids.add(c['id'])
                            if c.get('text') and c['id'] in trans_dict:
                                text_to_trans[c['text']] = trans_dict[c['id']]
                        for u in n.get('legend_units', []):
                            old_sub_ids.add(u['id'])
                            if u.get('text') and u['id'] in trans_dict:
                                text_to_trans[u['text']] = trans_dict[u['id']]

                    cols, new_nodes = _analyze_page_worker(page, ir, gateway, folder, deadline)
                    # 保护：严禁将已有正文的页面无声降级为纯截图
                    old_text_nodes = [n for n in old_nodes if n.get('type') in ('paragraph', 'heading', 'list', 'title') and n.get('text', '').strip()]
                    new_text_nodes = [n for n in new_nodes if n.get('type') in ('paragraph', 'heading', 'list', 'title') and n.get('text', '').strip()]
                    if old_text_nodes and not new_text_nodes:
                        print(f"⚠️ [修复保护] 页面 {pid} 重排后原正文丢失（原 {len(old_text_nodes)} 个正文节点被误转为纯图），触发保底正文布局保护", flush=True)
                        from pdf_translation.layout_analyzer import build_fallback_nodes
                        new_nodes = build_fallback_nodes(page, ir)

                    page['columns'] = cols
                    # 替换该页节点集 (原地保持原页面相对位置，严禁追加到文档末尾)
                    first_node_idx = next((i for i, n in enumerate(ir.get('nodes', [])) if n.get('page_id') == pid), len(ir.get('nodes', [])))
                    remaining_nodes = [n for n in ir.get('nodes', []) if n.get('page_id') != pid]
                    ir['nodes'] = remaining_nodes[:first_node_idx] + new_nodes + remaining_nodes[first_node_idx:]
                    # 原地更新 reading_order
                    old_node_ids = {n['id'] for n in old_nodes}
                    first_ro_idx = next((i for i, nid in enumerate(ir.get('reading_order', [])) if nid in old_node_ids), len(ir.get('reading_order', [])))
                    remaining_ro = [nid for nid in ir.get('reading_order', []) if nid not in old_node_ids]
                    ir['reading_order'] = remaining_ro[:first_ro_idx] + [n['id'] for n in new_nodes] + remaining_ro[first_ro_idx:]

                    # 收集新节点的所有 sub_ids (含表格单元格与图例单元)
                    new_sub_ids = set()
                    for n in new_nodes:
                        new_sub_ids.add(n['id'])
                        for c in n.get('cells', []):
                            new_sub_ids.add(c['id'])
                        for u in n.get('legend_units', []):
                            new_sub_ids.add(u['id'])

                    # 原子清理旧 ID 防止残留
                    for old_sub_id in old_sub_ids:
                        if old_sub_id not in new_sub_ids:
                            trans_dict.pop(old_sub_id, None)

                    # 遍历新节点，沿用既有翻译，仅新增或变更文本节点加入待译列表
                    for n in new_nodes:
                        ntype = n.get('type')
                        if ntype == 'table':
                            for c in n.get('cells', []):
                                cid = c['id']
                                ctext = c.get('text', '').strip()
                                if ctext and ctext in text_to_trans and text_to_trans[ctext]:
                                    trans_dict[cid] = text_to_trans[ctext]
                                else:
                                    trans_dict.pop(cid, None)
                                    if ctext:
                                        nodes_to_fix.add(cid)
                        elif n.get('legend_units'):
                            for u in n['legend_units']:
                                uid = u['id']
                                utext = u.get('text', '').strip()
                                if utext and utext in text_to_trans and text_to_trans[utext]:
                                    trans_dict[uid] = text_to_trans[utext]
                                else:
                                    trans_dict.pop(uid, None)
                                    if utext:
                                        nodes_to_fix.add(uid)
                        else:
                            nid = n['id']
                            ntext = n.get('text', '').strip()
                            if ntext and ntext in text_to_trans and text_to_trans[ntext]:
                                trans_dict[nid] = text_to_trans[ntext]
                            else:
                                trans_dict.pop(nid, None)
                                if ntype in ('paragraph', 'caption', 'title', 'heading', 'footnote', 'list') and ntext:
                                    nodes_to_fix.add(nid)
                    validate_ir(ir)
                from pdf_translation.asset_extractor import extract_assets
                ir = extract_assets(ir, folder)
            except Exception as e:
                return False, current_reviews, [f'版面重排失败: {str(e)[:400]}']
        if tables_to_fix:
            try:
                from pdf_translation.table_rebuild import rebuild_tables
                old_cell_data = {}
                trans_dict = ir.setdefault('translations', {})
                for n in ir.get('nodes', []):
                    if n.get('id') in tables_to_fix or n.get('native_table_id') in tables_to_fix:
                        for c in n.get('cells', []):
                            old_cid = c['id']
                            ctext = c.get('text', '').strip()
                            old_cell_data[old_cid] = (ctext, trans_dict.pop(old_cid, None))

                ir = rebuild_tables(ir, list(tables_to_fix))
                # 表格单元格全部加入重译列表（若文字与重建前一致且已有翻译则复用，否则重译）
                for n in ir.get('nodes', []):
                    if n.get('id') in tables_to_fix or n.get('native_table_id') in tables_to_fix:
                        for c in n.get('cells', []):
                            cid = c['id']
                            ctext = c.get('text', '').strip()
                            matched_trans = next((trans for _, (old_txt, trans) in old_cell_data.items() if old_txt == ctext and trans), None)
                            if matched_trans:
                                trans_dict[cid] = matched_trans
                            elif ctext:
                                nodes_to_fix.add(cid)
            except Exception as e:
                return False, current_reviews, [f'表格重建失败: {str(e)[:400]}']

        # 保底补偿：确保整本 IR 中任何需要翻译且当前缺失/为空的有效文本单元加入待译集合
        from pdf_translation.contracts import text_units
        valid_units = list(text_units(ir))
        trans_dict = ir.setdefault('translations', {})
        for u in valid_units:
            uid = u['id']
            if not trans_dict.get(uid) or not str(trans_dict.get(uid, '')).strip():
                nodes_to_fix.add(uid)

        if nodes_to_fix:
            from pdf_translation.node_repair import repair_nodes
            try:
                ir = repair_nodes(ir, list(nodes_to_fix), gateway, folder, deadline,
                                  lang=manifest.get('lang', 'zh-CN'), feedback_map=None)
            except Exception as error:
                return False, current_reviews, [f'局部译文核对失败: {str(error)[:400]}']

        # 保护：清理已不存在于有效文本单元中的孤立翻译条目，防止意外 ID 污染
        valid_unit_ids = {u['id'] for u in text_units(ir)}
        for tid in list(trans_dict.keys()):
            if tid not in valid_unit_ids:
                trans_dict.pop(tid, None)
        # 若仍有极少数单元因模型重译失败而为空，按原文安全回退保底放行
        for u in text_units(ir):
            uid = u['id']
            if not trans_dict.get(uid) or not str(trans_dict.get(uid, '')).strip():
                trans_dict[uid] = u['text']

        # 5. 整本重新渲染
        ver_dir = folder / 'versions' / f'v{repair_round + 1}'
        try:
            if _render_func is not None:
                cand_pdf, render_qa = _render_func(ir, ver_dir, manifest.get('layout', 'balanced'))
            else:
                from pdf_translation.html_renderer import render_document
                cand_pdf, render_qa = render_document(ir, ver_dir, manifest.get('layout', 'balanced'))
        except Exception as e:
            return False, current_reviews, [f'重渲染失败: {str(e)[:400]}']

        # 重新执行译文完整性校验并刷新 translation-qa.json 与 manifest
        from pdf_translation.translation_validation import validate_translation
        target_lang = ir.get('target_language', manifest.get('lang', 'zh-CN'))
        new_trans_qa = validate_translation(ir, target_lang)
        (folder / 'translation-qa.json').write_text(json.dumps(new_trans_qa, ensure_ascii=False, indent=2), encoding='utf-8')
        if not new_trans_qa.get('valid', True):
            print(f"⚠️ [修复校验警告] 修复后译文完整性校验存在未匹配项目: {new_trans_qa.get('errors')}", flush=True)

        # 保存更新的 IR 与 manifest
        (folder / 'translated.ir.json').write_text(json.dumps(ir, ensure_ascii=False, indent=2), encoding='utf-8')
        manifest.update(
            candidate_path=str(cand_pdf),
            candidate_sha256=_digest(cand_pdf),
            translated_ir_sha256=_digest(folder / 'translated.ir.json'),
            translation_qa_sha256=_digest(folder / 'translation-qa.json'),
            page_count=render_qa['page_count']
        )
        (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

        # 6. 为重排后的 PDF 创建新的 staging 预览图与状态注册
        from .pdf_external_delivery import _stage_and_check
        from .pdf_preview_tool import register_pdf_render
        new_data, new_staged = _stage_and_check(target, root, skill_dir, prompt, deadline, staged_input=cand_pdf)
        new_data['translation_manifest'] = manifest_path
        new_data['user_prompt'] = prompt + '\n译文允许自然跨页；图中原标签以附加中文图例翻译。必须检查阅读顺序与图注关联。'
        register_pdf_render(new_data, new_staged)
        new_render_receipt = ToolResult.success(
            data=dict(new_data),
            provenance={'tool': 'render_pdf', 'execution_origin': 'pdf_repair_loop'}
        )
        telemetry.record_tool_call('render_pdf', {'file_path': str(target)}, new_render_receipt.status)
        telemetry.record_execution_result(new_render_receipt)

        # 7. 读取新的 page_map 并按页哈希对比复核
        new_page_map_path = ver_dir / 'page-map.json'
        new_page_map = json.loads(new_page_map_path.read_text(encoding='utf-8')) if new_page_map_path.is_file() else None

        old_page_hashes = {p['page']: p['sha256'] for p in (page_map or {}).get('pages', [])}
        new_page_hashes = {p['page']: p['sha256'] for p in (new_page_map or {}).get('pages', [])}

        next_reviews = [new_render_receipt]
        reused_count = 0
        total_p = render_qa['page_count']
        render_state = _RENDERS.get(str(target))

        for p_idx in range(1, total_p + 1):
            old_h = old_page_hashes.get(p_idx)
            new_h = new_page_hashes.get(p_idx)
            prev_rev = next((r for r in current_reviews if (getattr(r, 'page', None) or (r.data or {}).get('page')) == p_idx), None)

            # 若页内容 hash 未变化，且上一轮已 PASS，且未包含本次修复的节点：复用上一轮结论并绑定新版本哈希
            nodes_on_p = set(next((p['nodes'] for p in (new_page_map or {}).get('pages', []) if p['page'] == p_idx), []))
            p_src_ids = {n.get('page_id') for n in ir.get('nodes', []) if n.get('id') in nodes_on_p}
            affected_by_repair = bool(nodes_on_p.intersection(nodes_to_fix | tables_to_fix)) or bool(p_src_ids.intersection(pages_to_fix))

            if old_h and new_h and old_h == new_h and prev_rev and not prev_rev.is_error and not affected_by_repair:
                prev_data = dict(prev_rev.data or {})
                new_sha = new_data.get('sha256')
                if new_sha:
                    prev_data['sha256'] = new_sha
                    prev_data['evidence_id'] = f"pdf:{new_sha}:page:{p_idx}"
                prev_text = getattr(prev_rev, 'text_representation', getattr(prev_rev, 'text', ''))
                reused_rev = ToolResult.success(
                    data=prev_data,
                    text=prev_text,
                    provenance=dict(prev_rev.provenance or {}, version_reused=True)
                )
                setattr(reused_rev, 'page', p_idx)
                next_reviews.append(reused_rev)
                reused_count += 1
                if render_state:
                    render_state['reviewed'].add(p_idx)
            else:
                # 重新审阅受影响页
                events = []
                rev_res = inspect_pdf_page({'file_path': str(target), 'page': p_idx}, workspace,
                                           min(deadline or float('inf'), time.monotonic() + 40), events).tool_result
                # 防幻觉波动：非翻译模式下，若该页未发生任何物理改变且未被修复触及，防翻转；翻译模式下以当前审阅结论为准
                is_trans = bool(manifest.get('schema_version', '').startswith('pdf-translation') or manifest.get('engine') or manifest.get('lang'))
                if not is_trans and old_h and new_h and old_h == new_h and not affected_by_repair and prev_rev and prev_rev.is_error:
                    if not rev_res.is_error:
                        # 维持上一轮失败判定，防止未自愈页面被侥幸放行
                        rev_res = prev_rev
                setattr(rev_res, 'page', p_idx)
                next_reviews.append(rev_res)
                if not rev_res.is_error and render_state:
                    render_state['reviewed'].add(p_idx)

        if render_state and len(render_state['reviewed']) == total_p and not render_state['data'].get('published'):
            if Path(new_staged).is_file():
                import os
                os.replace(new_staged, target)
                render_state['data']['published'] = True
                # 为合格凭证同步标注 published=True，确保下游 publication 审计核验一致
                for r in next_reviews:
                    if getattr(r, 'data', None) and isinstance(r.data, dict) and r.data.get('kind') == 'pdf_page_review':
                        r.data['published'] = True
                        r.data['file_path'] = str(target)

        if reused_count > 0:
            telemetry.record_guard('pdf_review_reused', 'reuse', {'reused_pages': reused_count})

        current_reviews = next_reviews
        page_map = new_page_map

    # 超过 3 轮仍有失败
    remaining_failures = [r.error_message for r in current_reviews if getattr(r, 'is_error', False)]
    return False, current_reviews, remaining_failures
