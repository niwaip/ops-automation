"""Select native workbook updates from the reviewed task, including short follow-ups."""
from ..task_intent import is_spreadsheet_mutation_requested


def is_workbook_update(prompt, admission=None, history=None):
    admission = admission or {}
    if admission.get('task_mode') == 'consult':
        return False
    request = prompt.split('用户指令：')[-1]
    texts = [request]
    if admission.get('instruction_relation') == 'followup':
        # If task contract in a followup turn declares an Excel artifact deliverable, it is a workbook update
        if (admission.get('output_mode') == 'artifact' and
                any(t.lower().endswith(('.xlsx', '.xlsm')) for t in admission.get('artifact_types', []))):
            return True
        texts.extend(item.get('quote', '') for item in admission.get('requirements', []))
        # In a followup turn, consider previous user prompts from the session history
        for item in reversed(history or []):
            if item.get('role') != 'user':
                continue
            previous = item.get('content', '').split('用户指令：')[-1]
            if previous and previous != request:
                texts.append(previous)
    return any(is_spreadsheet_mutation_requested(text) for text in texts)
