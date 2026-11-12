"""Resolve bounded workbook translation requests from reviewed follow-up intent."""
from pathlib import Path
import re


RETRY = re.compile(r'\s*(?:请|麻烦)?\s*(?:重新生成|再次生成|再生成|重试生成|重试|继续)\s*[。！!]?\s*', re.I)
EXCLUDED = re.compile(r'仅|只(?:翻译|处理)|工作表|sheet\b|第.{0,8}(?:行|列)|单元格|摘要|总结|计算|合并|删除|邮件|发送|搜索|联网|表名|不要|术语表|不翻译|保留原文', re.I)


def translation_language(prompt):
    request = (prompt or '').split('用户指令：')[-1]
    languages = re.findall(r'中文|英文|英语|日文|日语|\bzh-CN\b|\ben-US\b|\bja-JP\b', request, re.I)
    if not languages:
        return None
    value = languages[-1].lower()
    return 'zh-CN' if value in ('中文', 'zh-cn') else 'ja-JP' if value in ('日文', '日语', 'ja-jp') else 'en-US'


def translation_request(skill, files, prompt, history=None):
    admission = getattr(skill, 'admission', None) or {}
    if (len(files or []) != 1 or Path(files[0]).suffix.lower() != '.xlsx'
            or admission.get('task_mode') != 'execute' or admission.get('output_mode') != 'artifact'):
        return None
    request = (prompt or '').split('用户指令：')[-1].strip()
    retry = bool(RETRY.fullmatch(request))
    if retry:
        if (admission.get('instruction_relation') != 'followup'
                or admission.get('skill_invocation', {}).get('mode') == 'execute'):
            return None
        # Inherit the most recent actual task, never an older unrelated request.
        request = next((str(item.get('content', '')).split('用户指令：')[-1].strip()
                        for item in reversed(history or []) if item.get('role') == 'user'
                        and not RETRY.fullmatch(str(item.get('content', '')).split('用户指令：')[-1].strip())), '')
        requirements = admission.get('requirements', [])
        quotes = [item.get('quote', '') for item in requirements
                  if not RETRY.fullmatch(item.get('quote', ''))]
        # The intent reviewer may quote only "重新生成". The actual latest user
        # task remains authoritative; it need not be echoed again by the model.
        if not requirements or any(not quote or quote not in request for quote in quotes):
            return None
    selected = getattr(skill, 'skill_id', None)
    if selected != 'xlsx' and not (retry and selected is None):
        return None
    if (not re.search(r'翻译|译成|译为|translate|translation', request, re.I)
            or not translation_language(request) or EXCLUDED.search(request)):
        return None
    outputs = getattr(skill, 'deliverables', None) or []
    if len(outputs) > 1 or any(not str(item).lower().endswith('.xlsx') for item in outputs):
        return None
    return request
