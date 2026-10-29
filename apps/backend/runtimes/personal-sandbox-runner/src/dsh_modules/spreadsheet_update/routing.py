"""Select native workbook updates from the reviewed task, including short follow-ups."""
import re
from ..task_intent import is_spreadsheet_mutation_requested

CUSTOM_WORKBOOK_OR_ROW_EDIT_RE = re.compile(
    r"(?:"
    r"删除[^\n。；;]{0,30}(?:第\s*\d+\s*行|一条|一行|记录|明细|一列|第\s*\d+\s*列)"
    r"|新增[^\n。；;]{0,30}(?:一条|一行|记录|明细|第\s*\d+\s*列|一列|公式列)"
    r"|(?:把|将|对)[^\n。；;]{1,40}(?:改为|改成|修改为|更新为|调整为|替换为|设为)"
    r"|(?:修改|更新|变更|替换|调整)[^\n。；;]{1,30}(?:为|成)[^\n。；;]{1,30}"
    r"|(?:那条|该条|第\s*\d+\s*行|刚才|新增|单元格|表头|列名|字段)[^\n。；;]{0,40}(?:修改|改为|改成|更新为|替换为)"
    r"|在(?:原附件)?副本中[^\n。；;]{0,20}(?:执行|修改|删除|新增|编辑|操作)"
    r"|原附件不改"
    r"|柱形图|柱状图|折线图|饼图|散点图|条件格式|冻结表头|高亮|合并单元格"
    r"|重命名[^\n。；;]{0,20}(?:列|工作表|sheet|表头)"
    r"|生成新的\s*(?:Excel|工作簿|三工作表|多工作表|[A-Za-z0-9_\-\u4e00-\u9fa5]+\.xlsx)"
    r")",
    re.I,
)
TEMPLATE_BACKFILL_RE = re.compile(
    r"复制[^\n。；;]{0,25}(?:sheet|工作表)[^\n。；;]{0,40}(?:更新|回填|预测|计划|实绩)",
    re.I,
)


def is_custom_workbook_or_row_edit(text: str, admission: dict = None) -> bool:
    """True when the prompt requests row/column CRUD, cell edits, custom styling/charts,
    or workbook generation, rather than template sheet duplication + aggregate forecast/plan backfill."""
    if not text:
        return False
    req = text.split('用户指令：')[-1]
    if TEMPLATE_BACKFILL_RE.search(req):
        return False
    if CUSTOM_WORKBOOK_OR_ROW_EDIT_RE.search(req):
        return True
    if admission and isinstance(admission, dict):
        for r in admission.get('requirements', []):
            q = r.get('quote', '')
            if q and CUSTOM_WORKBOOK_OR_ROW_EDIT_RE.search(q):
                return True
    return False


def is_workbook_update(prompt, admission=None, history=None):
    admission = admission or {}
    if admission.get('task_mode') == 'consult':
        return False
    request = prompt.split('用户指令：')[-1]
    if is_custom_workbook_or_row_edit(request, admission):
        return False
    texts = [request]
    if admission.get('instruction_relation') == 'followup':
        texts.extend(item.get('quote', '') for item in admission.get('requirements', []))
        # In a followup turn, consider previous user prompts from the session history
        for item in reversed(history or []):
            if item.get('role') != 'user':
                continue
            previous = item.get('content', '').split('用户指令：')[-1]
            if previous and previous != request:
                texts.append(previous)
        if any(is_custom_workbook_or_row_edit(t, admission) for t in texts):
            return False
        # If task contract in a followup turn declares an Excel artifact deliverable, it is a workbook update
        if (admission.get('output_mode') == 'artifact' and
                any(t.lower().endswith(('.xlsx', '.xlsm')) for t in admission.get('artifact_types', []))):
            return True
    return any(is_spreadsheet_mutation_requested(text) and not is_custom_workbook_or_row_edit(text, admission) for text in texts)
