"""Evidence-backed presentation for published updates grounded in execution facts."""
from collections import defaultdict
from pathlib import Path

from .delivery import is_verified_update_file


def render_published_update(evidence, workspace):
    for item in reversed(evidence or []):
        data = getattr(item, 'data', None)
        if (not getattr(item, 'is_success', False) or not isinstance(data, dict)
                or (item.provenance or {}).get('tool') != 'execute_spreadsheet_update'
                or data.get('status') != 'published' or not data.get('published_file')):
            continue
        path = Path(data['published_file']).resolve()
        if not path.is_relative_to(Path(workspace).resolve()):
            cand = Path(workspace).resolve() / path.name
            if cand.exists():
                path = cand
            else:
                continue
        if not is_verified_update_file(path):
            continue
        planned = next((record.data for record in reversed(evidence)
                        if getattr(record, 'is_success', False) and isinstance(record.data, dict)
                        and record.data.get('status') == 'planned'
                        and record.data.get('plan_id') == data.get('plan_id')), {})
        preview = planned.get('preview', [])
        lines = [f'已生成 `{path.name}`，已通过公式重算和交付门禁。']

        unit_str = ""
        units = {row['unit'] for row in preview if isinstance(row, dict) and row.get('unit')}
        if len(units) == 1:
            unit_str = f'（单位：{next(iter(units))}）'
        elif units:
            unit_str = f"（单位：{', '.join(sorted(units))}）"

        if planned.get('new_sheet'):
            lines.append(f"新增工作表 `{planned['new_sheet']}`，更新 {len(preview)} 条记录{unit_str}。")

        # Group preview by section using operations map
        op_map = {op.get('coordinate'): op for op in planned.get('operations', []) if isinstance(op, dict)}
        by_sec = defaultdict(list)
        for r in preview:
            if not isinstance(r, dict):
                continue
            coord = r.get('coordinate')
            op = op_map.get(coord, {})
            sec = r.get('section') or op.get('region_id') or ''
            old_v = r.get('old_value') or op.get('old_value')
            item = dict(r)
            if old_v is not None and 'old_value' not in item:
                item['old_value'] = old_v
            by_sec[sec].append(item)

        if len(by_sec) > 1 or (len(by_sec) == 1 and next(iter(by_sec.keys()))):
            for sec, rows in by_sec.items():
                sec_title = f"【{sec}】" if sec else ""
                sec_unit = rows[0].get('unit') or ''
                u_label = f"（单位：{sec_unit}）" if sec_unit else ""
                lines.append(f"\n#### {sec_title}区块回填结果{u_label}")
                lines.append("| 部门编号 | 单元格 | 更新预测值 | 原预测值 |")
                lines.append("|---------|--------|-----------|---------|")
                for r in rows:
                    old_v = r.get('old_value')
                    old_display = f"{old_v}" if old_v not in (None, '') else '-'
                    lines.append(f"| {r.get('key')} | {r.get('coordinate')} | {r.get('value')} | {old_display} |")
        elif preview and len(preview) > 1 and all(isinstance(r, dict) and 'key' in r for r in preview):
            lines.append("\n| 业务键 | 单元格 | 更新值 | 原值 |")
            lines.append("|--------|--------|-------|------|")
            for r in preview:
                old_v = r.get('old_value')
                old_display = f"{old_v}" if old_v not in (None, '') else '-'
                lines.append(f"| {r.get('key')} | {r.get('coordinate')} | {r.get('value')} | {old_display} |")

        warnings = data.get('warnings') or planned.get('warnings') or []
        if warnings:
            lines.append('\n### ⚠️ 提示与对账说明')
            lines.extend(f'- {w}' for w in warnings)

        return '\n'.join(lines)
    return None
