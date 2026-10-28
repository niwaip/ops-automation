"""Bounded final-summary input, independent of the full tool-selection conversation."""
import json


def build_summary_messages(prompt, messages, evidence=None, max_chars=18000):
    records = []
    for receipt in (evidence or [])[-6:]:
        data = getattr(receipt, 'data', None)
        if not getattr(receipt, 'is_success', False):
            continue
        if isinstance(data, dict):
            selected = {k: data[k] for k in ('status', 'summary', 'rows', 'warnings', 'reconciliations',
                        'published_file', 'evidence_id', 'amount_unit', 'coverage') if k in data}
            text = json.dumps(selected or data, ensure_ascii=False, default=str)
        else:
            text = str(data or '')
        records.append(text[:6000])
    if not records:
        records = [str(m.get('content') or '')[:6000] for m in messages[-6:]
                   if m.get('role') in ('tool', 'assistant') and m.get('content')]
    context = '\n\n'.join(records)[-max_chars:]
    return [
        {'role': 'system', 'content': '根据已执行结果给出简短最终答复：结果、重要警告、必要下一步。'
         '不重写完整报告，不添加新数字或成功声明。材料不足时明确说明，不补造。'},
        {'role': 'user', 'content': '用户要求：' + str(prompt)[:3000] + '\n已执行结果（可能为节选）：\n' + context},
    ]
