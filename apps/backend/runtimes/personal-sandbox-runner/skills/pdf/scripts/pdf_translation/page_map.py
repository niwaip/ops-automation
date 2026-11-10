"""Build and query the mapping from document IR nodes to rendered PDF pages."""
import hashlib
import json
from pathlib import Path
import re
from typing import Dict, List, Any


def normalize_fragment(text: str) -> str:
    return re.sub(r'[\s\u3000\t\r\n]+', '', text or '')


def build_page_map(pdf_path: Path, ir: Dict[str, Any]) -> Dict[str, Any]:
    """Inspects candidate PDF pages and maps IR nodes/tables to output page numbers."""
    import pdfplumber

    pdf_path = Path(pdf_path)
    translations = ir.get('translations', {})
    nodes = ir.get('nodes', [])

    page_records = []
    node_to_pages = {}

    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        page_texts = []
        page_hashes = []
        for p in pdf.pages:
            raw = p.extract_text() or ''
            norm = normalize_fragment(raw)
            page_texts.append(norm)
            page_hashes.append(hashlib.sha256(norm.encode('utf-8')).hexdigest())

    for page_idx, norm_text in enumerate(page_texts, start=1):
        matched_nodes = []
        matched_tables = []
        p_hash = page_hashes[page_idx - 1]

        for node in nodes:
            nid = node['id']
            ntype = node.get('type')

            if ntype == 'table':
                # 表格单元格匹配
                cells = node.get('cells', [])
                cell_matches = 0
                for cell in cells:
                    trans = translations.get(cell['id'], cell.get('text', ''))
                    frag = normalize_fragment(trans)
                    if len(frag) >= 3 and frag in norm_text:
                        cell_matches += 1
                if cell_matches >= 2 or (len(cells) <= 2 and cell_matches >= 1):
                    matched_tables.append(node.get('native_table_id') or nid)
                    matched_nodes.append(nid)
                    node_to_pages.setdefault(nid, []).append(page_idx)
            elif ntype in ('figure', 'formula'):
                legend = node.get('display')
                if not legend and node.get('legend_units'):
                    legend = ' '.join(translations.get(u['id'], u.get('text', '')) for u in node['legend_units'])
                frag = normalize_fragment(legend or '')
                if len(frag) >= 4 and frag in norm_text:
                    matched_nodes.append(nid)
                    node_to_pages.setdefault(nid, []).append(page_idx)
            else:
                display = translations.get(nid, node.get('text', ''))
                frag = normalize_fragment(display)
                if not frag:
                    continue
                # 短文本完全匹配，长文本滑动分片匹配
                src_p_num = int(re.sub(r'\D', '', node.get('page_id', '0')) or 0)
                if len(frag) <= 20:
                    # 对于极短文本 (<=5字)，避免跨越过远物理页面发生子串碰撞误匹配
                    if frag in norm_text and (len(frag) > 5 or abs(src_p_num - page_idx) <= 3):
                        matched_nodes.append(nid)
                        node_to_pages.setdefault(nid, []).append(page_idx)
                else:
                    head, tail = frag[:20], frag[-20:]
                    mid = frag[len(frag) // 2 - 10: len(frag) // 2 + 10]
                    if head in norm_text or tail in norm_text or mid in norm_text:
                        matched_nodes.append(nid)
                        node_to_pages.setdefault(nid, []).append(page_idx)

        # 保持节点顺序与 IR reading_order 一致
        reading_order = ir.get('reading_order', [n['id'] for n in nodes])
        order_index = {nid: i for i, nid in enumerate(reading_order)}
        matched_nodes = sorted(list(dict.fromkeys(matched_nodes)), key=lambda x: order_index.get(x, 99999))
        matched_tables = list(dict.fromkeys(matched_tables))

        page_records.append({
            'page': page_idx,
            'sha256': p_hash,
            'nodes': matched_nodes,
            'tables': matched_tables
        })

    # 为没有直接命中的 figure/formula 节点按邻近节点推断页面
    for node in nodes:
        nid = node['id']
        if nid not in node_to_pages and node.get('type') in ('figure', 'formula'):
            idx = next((i for i, n in enumerate(nodes) if n['id'] == nid), None)
            if idx is not None:
                prev_p = next((node_to_pages[nodes[i]['id']][-1] for i in range(idx - 1, -1, -1) if nodes[i]['id'] in node_to_pages), None)
                next_p = next((node_to_pages[nodes[i]['id']][0] for i in range(idx + 1, len(nodes)) if nodes[i]['id'] in node_to_pages), None)
                target_p = prev_p or next_p or 1
                node_to_pages[nid] = [target_p]
                if target_p <= len(page_records):
                    page_records[target_p - 1]['nodes'].append(nid)

    return {
        'version': 1,
        'page_count': total_pages,
        'pages': page_records,
        'node_to_pages': node_to_pages
    }
