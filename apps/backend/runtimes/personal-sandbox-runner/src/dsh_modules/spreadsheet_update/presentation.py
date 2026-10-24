"""Evidence-backed fallback when model prose cannot safely describe a published update."""
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
        text = f'已生成 `{path.name}`，已通过公式重算和交付门禁。'
        if planned.get('new_sheet'):
            text += f"\n新增工作表 `{planned['new_sheet']}`，更新 {len(preview)} 条记录"
            units = {row['unit'] for row in preview if row.get('unit')}
            if len(units) == 1:
                text += f'（单位：{units.pop()}）'
            text += '。'
        warnings = data.get('warnings') or planned.get('warnings') or []
        if warnings:
            text += '\n' + '\n'.join(str(warning) for warning in warnings)
        return text
    return None
