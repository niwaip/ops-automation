"""Select native workbook updates from the reviewed task, including short follow-ups."""
from ..task_intent import is_spreadsheet_mutation_requested


def is_workbook_update(prompt, admission=None, history=None):
    admission = admission or {}
    if admission.get('task_mode') == 'consult':
        return False
    request = prompt.split('用户指令：')[-1]
    texts = [request]
    if admission.get('instruction_relation') == 'followup':
        texts.extend(item['quote'] for item in admission.get('requirements', []))
        from ..user_declarations import direct_unit_reply
        if direct_unit_reply(request):
            # A reviewer may retain only the new unit requirement. Recover the
            # immediate user task, skipping previous unit-only replies, never
            # taking instructions from assistant text or attachments.
            for item in reversed(history or []):
                if item.get('role') != 'user':
                    continue
                previous = item['content'].split('用户指令：')[-1]
                if previous == request or direct_unit_reply(previous):
                    continue
                texts.append(previous)
                break
    return any(is_spreadsheet_mutation_requested(text) for text in texts)
