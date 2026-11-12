"""Bounded final-summary input, independent of the full tool-selection conversation."""
import json


def build_summary_messages(prompt, messages, evidence=None, max_chars=18000, system_instruction=None):
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

    if system_instruction:
        sys_content = system_instruction
    else:
        sys_content = (
            '请根据已执行结果面向用户给出清晰、专业、完整的最终交付答复：'
            '说明任务完成情况、核心成果与关键内容摘要，并给出实用的使用或检查建议。'
            '严禁忽略完成成果仅输出警告，严禁生硬堆砌底层技术指令。'
        )

    return [
        {'role': 'system', 'content': sys_content},
        {'role': 'user', 'content': '用户要求：' + str(prompt)[:3000] + '\n已执行结果（可能为节选）：\n' + context},
    ]
