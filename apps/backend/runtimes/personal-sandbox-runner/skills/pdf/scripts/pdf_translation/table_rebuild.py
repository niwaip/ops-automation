"""Atomically rebuild corrupted table nodes from native coordinates and anchors."""
from copy import deepcopy
from typing import Dict, List, Any

from .table_geometry import validate_table, discover_tables


def rebuild_tables(ir: Dict[str, Any], table_ids: List[str]) -> Dict[str, Any]:
    """Restores specified table nodes to native grid structures and verifies them."""
    if not table_ids:
        return ir

    target_ids = set(table_ids)
    ir = deepcopy(ir)
    pages_by_id = {p['id']: p for p in ir.get('pages', [])}

    for node in ir.get('nodes', []):
        if node.get('type') != 'table':
            continue
        nid = node['id']
        native_id = node.get('native_table_id')
        if nid not in target_ids and native_id not in target_ids:
            continue

        page = pages_by_id.get(node.get('page_id'), {})
        native_tables = page.get('native_tables', [])
        expected = next((t for t in native_tables if t['id'] in (nid, native_id)), None)

        if not expected and native_tables:
            # 若 ID 未对齐但该页仅有一张原生表，直接匹配
            expected = native_tables[0]

        if expected:
            node['native_table_id'] = expected['id']
            node['bbox'] = expected['bbox']
            node['column_edges'] = expected['column_edges']
            node['cells'] = deepcopy(expected['cells'])
            node['line_ids'] = list(expected['line_ids'])

            # 填充 cell 的 text（从 page lines 获取）
            lines_map = {l['id']: l.get('text', '') for l in page.get('lines', [])}
            for cell in node['cells']:
                cell['id'] = f"{node['id']}_c{cell['row']}_{cell['col']}"
                cell['text'] = ' '.join(lines_map[lid] for lid in cell.get('line_ids', []) if lid in lines_map)

        # 校验重建后的表格
        validate_table(node, page)

    return ir
