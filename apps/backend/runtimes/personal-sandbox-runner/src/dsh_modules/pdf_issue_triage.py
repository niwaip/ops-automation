"""Triage structured review issues and map them to actionable document nodes and IR regions."""
import re
from typing import Dict, List, Any, Optional


def normalize_text(text: str) -> str:
    cleaned = re.sub(r'^[.…·•\-—:："\'“”‘’（）()\[\]【】\s]+|[.…·•\-—:："\'“”‘’（）()\[\]【】\s]+$', '', str(text or ''))
    return re.sub(r'[\s\u3000\t\r\n]+', '', cleaned)


def _quote_in_text(raw_quote: str, target_text: str) -> bool:
    norm_q = normalize_text(raw_quote)
    norm_t = normalize_text(target_text)
    if not norm_q or not norm_t:
        return False
    if norm_q in norm_t:
        return True
    # 剥离标点与省略号后再做子串及分段匹配
    alnum_q = re.sub(r'[.…·•\-—:：，,。；;！!？?（）()\[\]【】"\'“”‘’]+', '', norm_q)
    alnum_t = re.sub(r'[.…·•\-—:：，,。；;！!？?（）()\[\]【】"\'“”‘’]+', '', norm_t)
    if len(alnum_q) >= 4 and alnum_q in alnum_t:
        return True
    for seg in re.split(r'(?:\.{2,}|…+)', str(raw_quote or '')):
        norm_seg = normalize_text(seg)
        if len(norm_seg) >= 5 and norm_seg in norm_t:
            return True
    return False


def triage_review_issues(issues: List[Dict[str, Any]], ir: Dict[str, Any], page_map: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Classifies issues and maps each to target IR node IDs, table IDs, or source pages."""
    nodes_by_id = {n['id']: n for n in ir.get('nodes', [])}
    translations = ir.get('translations', {})

    nodes_to_retranslate = set()
    tables_to_rebuild = set()
    pages_to_relayout = set()
    render_tweaks = []

    unrecoverable = False
    unrecoverable_reason = None

    page_records = {p['page']: p for p in (page_map or {}).get('pages', [])}

    for issue in issues:
        kind = issue.get('kind', 'layout')
        page_num = issue.get('page', 1)
        evidence = issue.get('evidence', '')
        quote = issue.get('quote', '')
        anchor = issue.get('anchor', '')

        # 检查是否为不可恢复错误
        if kind == 'unrecoverable' or re.search(r'扫描件|无法识别|引擎未启用|文件损坏|源文件不完整', evidence):
            unrecoverable = True
            unrecoverable_reason = evidence or '检测到不可恢复的源文件或系统错误'
            break

        cand_node_ids = page_records.get(page_num, {}).get('nodes', [])
        cand_tables = page_records.get(page_num, {}).get('tables', [])

        norm_quote = normalize_text(quote)
        norm_anchor = normalize_text(anchor)
        target_node = None

        if kind == 'table':
            # 表格问题：精确锁定表格节点
            matched_table_id = None

            table_candidates = []
            for tid in cand_tables:
                node = nodes_by_id.get(tid) or next((n for n in ir.get('nodes', []) if n.get('native_table_id') == tid), None)
                table_candidates.append((tid, node))
            if not table_candidates:
                for nid in cand_node_ids:
                    node = nodes_by_id.get(nid, {})
                    if node.get('type') == 'table':
                        table_candidates.append((nid, node))

            # 1. 优先通过 anchor 匹配表格 ID
            if norm_anchor:
                for tid, node in table_candidates:
                    node_id = node.get('id', '') if node else ''
                    if norm_anchor in (normalize_text(tid), normalize_text(node_id)):
                        matched_table_id = tid
                        break
            # 2. 通过 quote 或 anchor 文本匹配表格正文或单元格
            if not matched_table_id and (norm_quote or norm_anchor):
                q = quote or anchor
                for tid, node in table_candidates:
                    if node:
                        tbl_txt = node.get('text', '') + ' ' + ' '.join(c.get('text', '') for c in node.get('cells', []))
                        if _quote_in_text(q, tbl_txt):
                            matched_table_id = tid
                            break
            # 3. 若当前页只有唯一表格候选，直接锁定
            if not matched_table_id and len(table_candidates) == 1:
                matched_table_id = table_candidates[0][0]
            # 4. 尝试从 evidence 中提取表格 ID
            if not matched_table_id and evidence:
                for tid, node in table_candidates:
                    if tid in evidence or (node and node.get('id') in evidence):
                        matched_table_id = tid
                        break

            if matched_table_id:
                tables_to_rebuild.add(matched_table_id)
            else:
                # 无法精确定位表格，降级为源页布局重试，严禁随意篡改第一张表格
                source_p = next((n['page_id'] for n in [nodes_by_id.get(nid) for nid in cand_node_ids] if n), f'p{page_num}')
                pages_to_relayout.add(source_p)
            continue

        # 对 translation 或 layout，尝试通过 quote/anchor 定位具体的 node
        if norm_quote or norm_anchor:
            search_nodes = [nodes_by_id[nid] for nid in cand_node_ids if nid in nodes_by_id] or ir.get('nodes', [])
            for n in search_nodes:
                nid = n['id']
                trans = translations.get(nid, n.get('text', ''))
                src_txt = n.get('text', '')
                if _quote_in_text(quote, trans) or _quote_in_text(quote, src_txt) or \
                   _quote_in_text(anchor, trans) or _quote_in_text(anchor, src_txt):
                    target_node = n
                    break

        if kind == 'translation':
            if target_node:
                nodes_to_retranslate.add(target_node['id'])
            else:
                # 若无法精确定位，将该成品页上的文本节点都加入候选
                for nid in cand_node_ids:
                    if nodes_by_id.get(nid, {}).get('type') in ('paragraph', 'caption', 'title', 'heading', 'footnote'):
                        nodes_to_retranslate.add(nid)
        elif kind == 'render':
            if target_node and target_node.get('type') in ('paragraph', 'caption', 'title', 'heading', 'footnote') and \
                    re.search(r'粘连|括号|标点|未闭合|数字|脚注|重译|漏译|语病|乱码', evidence):
                nodes_to_retranslate.add(target_node['id'])
            render_tweaks.append({
                'page': page_num,
                'node_id': target_node['id'] if target_node else None,
                'evidence': evidence
            })
        else:  # layout
            # 纯留白/空白偏大属于不可通过重构自动修复的主观排版抱怨，不作为可执行版面重构目标
            if not target_node and re.search(r'留白|空白较多|版面空旷|间距较大', evidence + anchor):
                continue
            # 纯折行/词内换行/字间距微调属于排版行内微排版建议，无法通过整页重排修复，严禁触发重构
            if not target_node and re.search(r'断开在|移至下一行|词内断开|词内换行|跨行断开|调整字间距|建议若版面允许', evidence + anchor):
                continue
            if target_node and target_node.get('type') in ('paragraph', 'caption', 'title', 'heading', 'footnote') and \
                    re.search(r'粘连|括号|标点|未闭合|数字|脚注|重译|漏译|语病|乱码', evidence):
                nodes_to_retranslate.add(target_node['id'])
            if target_node:
                t_src_num = int(re.sub(r'\D', '', target_node.get('page_id', '0')) or 0)
                if abs(t_src_num - page_num) <= 3:
                    pages_to_relayout.add(target_node['page_id'])
                else:
                    pages_to_relayout.add(f'p{page_num}')
            else:
                from collections import Counter
                src_pages = [nodes_by_id[nid]['page_id'] for nid in cand_node_ids
                             if nid in nodes_by_id and abs(int(re.sub(r'\D', '', nodes_by_id[nid]['page_id']) or 0) - page_num) <= 3]
                if src_pages:
                    src_page_id = Counter(src_pages).most_common(1)[0][0]
                else:
                    src_page_id = f'p{page_num}'
                pages_to_relayout.add(src_page_id)

    return {
        'unrecoverable': unrecoverable,
        'unrecoverable_reason': unrecoverable_reason,
        'nodes_to_retranslate': sorted(list(nodes_to_retranslate)),
        'tables_to_rebuild': sorted(list(tables_to_rebuild)),
        'pages_to_relayout': sorted(list(pages_to_relayout)),
        'render_tweaks': render_tweaks,
        'raw_issues': issues
    }
