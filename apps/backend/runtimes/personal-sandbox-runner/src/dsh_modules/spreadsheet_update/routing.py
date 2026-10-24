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
        # In a followup turn, also consider the immediate previous user task from history
        for item in reversed(history or []):
            if item.get('role') != 'user':
                continue
            previous = item['content'].split('用户指令：')[-1]
            if previous != request:
                texts.append(previous)
                break
    return any(is_spreadsheet_mutation_requested(text) for text in texts)
