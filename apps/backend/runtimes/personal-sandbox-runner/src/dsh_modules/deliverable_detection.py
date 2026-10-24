"""Detect current deliverables without mistaking uploaded inputs for outputs."""
import re
from pathlib import Path
from typing import Optional, List
from .config import WORKSPACE_DIR as DEFAULT_WORKSPACE, KNOWLEDGE_DIR as DEFAULT_KNOWLEDGE
from .agent_loop_helpers import is_unclosed_or_truncated_html
from .skill_router import is_text_only_request, is_term_negated


def is_new_deliverable(path, turn_start_time, *, require_update_receipt=False):
    from .file_tools import is_protected_session_file
    from .workbook_delivery import deliverable_is_valid
    from .spreadsheet_update.delivery import is_verified_update_file
    if is_protected_session_file(path) or path.stat().st_mtime < turn_start_time - 2.0:
        return False
    if require_update_receipt and not is_verified_update_file(path):
        return False
    return deliverable_is_valid(path)


def detect_missing_requested_deliverable(
    user_prompt: str,
    turn_start_time: float,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False,
    workspace=None
) -> Optional[str]:
    """
    Detects if the expected deliverable (from skill contract or prompt) was not created in WORKSPACE_DIR.
    Prioritizes explicit contract deliverables from the active skill.
    Strictly bypassed during read-only inspection turns (is_inspect_intent and not is_generate_intent).
    """
    WORKSPACE_DIR = workspace or DEFAULT_WORKSPACE
    if not user_prompt or is_text_only_request(user_prompt):
        return None
    if is_inspect_intent and not is_generate_intent:
        return None

    from .task_intent import is_spreadsheet_mutation_requested
    requires_update = is_spreadsheet_mutation_requested(user_prompt)
    ws_path = Path(WORKSPACE_DIR)

    # 1. 契约驱动优先：若技能已明确声明产物交付契约 (如 ['.pdf'], ['.docx'], ['.xlsx'], ['.html'], ['Dockerfile'], ['analyze_nginx_logs.sh'])
    if expected_deliverables:
        # 对于包含多选一备选格式的演示文稿类契约（如 guizang-ppt 兼容 .pptx 与 .html）
        has_presentation_alt = (
            any(ext.lower() in [".pptx", ".ppt"] for ext in expected_deliverables)
            and any(ext.lower() in [".html", ".htm"] for ext in expected_deliverables)
        )
        if has_presentation_alt and ws_path.exists():
            try:
                for p in ws_path.iterdir():
                    if p.is_file() and p.suffix.lower() in [".pptx", ".ppt", ".html", ".htm"] and p.stat().st_size > 0:
                        if p.stat().st_mtime >= turn_start_time - 2.0:
                            return None
            except Exception:
                pass

        from .artifact_exporter import ArtifactExporter
        for req_item in expected_deliverables:
            if is_term_negated(user_prompt, req_item) or is_term_negated(user_prompt, req_item.lstrip(".")):
                continue
            found = False
            if ws_path.exists():
                try:
                    for p in ws_path.iterdir():
                        if not p.is_file() or p.stat().st_size <= 0:
                            continue
                        if p.stat().st_mtime < turn_start_time - 2.0:
                            continue
                        if ArtifactExporter.is_temporary_file(p.name):
                            continue
                        from .workbook_delivery import deliverable_is_valid
                        if not is_new_deliverable(p, turn_start_time, require_update_receipt=requires_update and p.suffix.lower() in ('.xlsx', '.xlsm')):
                            continue
                        if req_item.startswith(".") or req_item.lower() in ["pdf", "docx", "xlsx", "pptx", "html", "md"]:
                            norm_ext = req_item if req_item.startswith(".") else f".{req_item}"
                            if p.suffix.lower() == norm_ext.lower():
                                found = True
                                break
                        else:
                            if p.name.lower() == req_item.lower() or p.name.lower().endswith(req_item.lower()):
                                found = True
                                break
                except Exception:
                    pass
            if not found:
                return req_item
        return None

    # 2. 兜底回退：无契约声明时，根据提示词探测期望产物后缀（必须有明确的生成/导出谓词，不能仅因出现名词就判定为生成）
    lower = user_prompt.lower()
    is_markdown_table = (
        re.search(r'(?:markdown|文本|聊天|对话|正文)?\s*(?:对比表格|表格对比|markdown\s*表格)', lower)
        and not any(ext in lower for ext in [".xlsx", ".xls", "excel", "工作簿", "导出表格", "下载表格", "生成表格文件"])
    )

    req_ext = None
    if (
        re.search(r'(?:做成|制作|生成|导出|做个|建个|创建|转为|转成)[^，。\n]{0,8}(?:pdf)', lower) or
        any(k in lower for k in ["生成pdf", "导出pdf", "转为pdf", "转成pdf", "生成一页的pdf", "生成一份pdf", "制作pdf", "导出为pdf", "做个pdf"])
    ):
        req_ext = ".pdf"
    elif not is_markdown_table and (
        re.search(r'(?:做成|制作|生成|导出|做个|建个|创建|整理成)[^，。\n]{0,8}(?:excel|xlsx|表格|表单)', lower) or
        any(k in lower for k in ["生成excel", "导出excel", "做成excel", "制作excel", "做个excel", "导出xlsx", "生成xlsx", "做个表", "生成表格"])
    ):
        req_ext = ".xlsx"
    elif (
        re.search(r'(?:做成|制作|生成|导出|做个|建个|创建|整理成)[^，。\n]{0,8}(?:word|docx|文档)', lower) or
        any(k in lower for k in ["生成word", "导出word", "做成word", "制作word", "做个word", "导出docx", "生成docx"])
    ):
        req_ext = ".docx"
    elif (
        re.search(r'(?:做成|制作|生成|导出|做个|建个|创建|整理成|汇总成|总结成)[^，。\n]{0,8}(?:ppt|pptx|幻灯片|演示文稿)', lower) or
        any(k in lower for k in ["生成ppt", "导出ppt", "做成ppt", "制作ppt", "做个ppt", "导出pptx", "生成pptx", "一张ppt", "一份ppt"])
    ):
        req_ext = ".html"
    elif (
        re.search(r'(?:输出|生成|创建|导出|保存|写入|制作|做成)[^，。\n]{0,16}(?:\.md\b|\bmarkdown\b|\bmd\b)', lower, re.I) or
        re.search(r'(?:\.md\b|\bmarkdown\b|\bmd\b)\s*(?:格式)?\s*文件', lower, re.I)
    ):
        req_ext = ".md"
    elif (
        any(k in lower for k in ["生成html", "导出html", "做成html", "制作html", "html报告", "生成网页", "做个网页", "生成单页", "网页游戏", "html游戏", "五子棋", "贪吃蛇", "原型", "看板", "大屏"]) or
        (any(v in lower for v in ["生成", "做个", "做成", "制作", "创建", "输出", "开发"]) and any(n in lower for n in ["网页", "单页", "html", "游戏", "页面"]))
    ):
        req_ext = ".html"

    if not req_ext or is_term_negated(lower, req_ext) or is_term_negated(lower, req_ext.lstrip(".")):
        return None

    # 检查工作区是否存在该类型的新文件 (mtime >= turn_start_time - 2.0)
    if not ws_path.exists():
        return req_ext

    try:
        from .artifact_exporter import ArtifactExporter
        for p in ws_path.iterdir():
            if p.is_file() and p.suffix.lower() == req_ext and p.stat().st_size > 0:
                if p.stat().st_mtime >= turn_start_time - 2.0:
                    if not ArtifactExporter.is_temporary_file(p.name):
                        from .workbook_delivery import deliverable_is_valid
                        if is_new_deliverable(p, turn_start_time, require_update_receipt=requires_update and p.suffix.lower() in ('.xlsx', '.xlsm')):
                            return None
    except Exception:
        pass

    return req_ext



CLAIM_PATTERNS = [
    "已生成", "已经生成", "生成了", "输出了", "输出文件", "保存到", "已保存", "已经保存",
    "保存至", "输出为", "保存在", "写入了", "创建了", "落盘至", "生成完毕", "导出为",
    "导出了", "已导出", "保存路径", "文件已生成", "文档已生成",
    "写入文件", "写入到", "写入至", "代码写入", "已更新", "更新了", "修复并保存", "修改并保存", "write_file"
]

DELIVERABLE_EXTS = {
    ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf",
    ".html", ".csv", ".json", ".md", ".py", ".sh", ".txt", ".png", ".jpg"
}

def detect_missing_claimed_artifacts(
    text: str,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False,
    is_search_intent: bool = False,
    turn_start_time: Optional[float] = None,
    verify_claims_only: bool = False,
    workspace=None,
    knowledge=None,
) -> List[str]:
    """
    Detects if the model claimed in text to have generated or outputted deliverable files
    that do not physically exist on disk in WORKSPACE_DIR or KNOWLEDGE_DIR.
    Strictly bypassed during read-only inspection turns (is_inspect_intent and not is_generate_intent)
    or search turns (is_search_intent and not is_generate_intent).
    """
    WORKSPACE_DIR = workspace or DEFAULT_WORKSPACE
    KNOWLEDGE_DIR = knowledge or DEFAULT_KNOWLEDGE
    if not text or (is_inspect_intent and not is_generate_intent) or (is_search_intent and not is_generate_intent):
        return []

    has_claim_pattern = any(k in text for k in CLAIM_PATTERNS) or bool(
        re.search(
            r'(?:已.{0,10}(?:生成|创建|保存|导出|写入|完成)|'
            r'(?:生成|创建|保存|导出|写入|输出).{0,10}(?:完成|完毕|成功|至|到)|'
            r'下载并在本地|/workspace/|/knowledge/)',
            text,
            re.I
        )
    )
    if not is_generate_intent and not has_claim_pattern:
        return []

    # 提取被引号/书名号包裹的文件名（允许合理文件名，但不跨越冒号或整句命令提示）
    quoted_pattern = r'(?:《|【|“|"|\'|`)([a-zA-Z0-9_\-\u4e00-\u9fa5\.\/ ]*?[a-zA-Z0-9_\-\u4e00-\u9fa5]+\.(?:docx?|xlsx?|pptx?|pdf|html|csv|json|md|py|sh|txt|png|jpg))(?:》|】|”|"|\'|`)'
    # 提取未带引号的文件名（以路径或空白/标点分隔，不含空格）
    unquoted_pattern = r'(?:(?:/workspace/|/knowledge/|\./workspace/)|\b)([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.(?:docx?|xlsx?|pptx?|pdf|html|csv|json|md|py|sh|txt|png|jpg))\b'

    found_names = re.findall(quoted_pattern, text) + re.findall(unquoted_pattern, text)
    if not found_names:
        return []

    missing: List[str] = []
    has_inline_html = ("```html" in text.lower()) and not is_unclosed_or_truncated_html(text)

    for name in found_names:
        clean_name = name.strip()
        if not clean_name:
            continue
        clean_name = re.sub(r'^(?:\./|/)?(?:workspace/|knowledge/)?', '', clean_name)
        if ":" in clean_name or "：" in clean_name:
            clean_name = re.split(r'[:：]', clean_name)[-1].strip()
        clean_name = re.sub(r'^(?:\./|/)?(?:workspace/|knowledge/)?', '', clean_name)
        for pfx in sorted(CLAIM_PATTERNS, key=len, reverse=True):
            if clean_name.startswith(pfx):
                clean_name = clean_name[len(pfx):].strip()
        clean_name = re.sub(r'^(?:(?:文件名|文件名称|文档名|表格名|报告名)(?:称)?(?:为|叫|是|：|:)?|文件(?:为|叫|是|：|:)|名称(?:为|叫|是|：|:)|命名(?:为)?|名字(?:为|叫|是|：|:)|[：:到至为在\s])+', '', clean_name).strip()
        if not clean_name:
            continue

        ext = Path(clean_name).suffix.lower()
        if ext not in DELIVERABLE_EXTS:
            continue
        if has_inline_html and clean_name in ["index.html", "presentation.html"]:
            continue

        escaped_name = re.escape(clean_name)

        # 排除明确作为输入源、引用源或前置资料的文件名（如“基于/根据/参考...《文件名》”）
        is_source_reference = bool(
            re.search(
                rf'(?:基于|根据|参考|依据|结合|来源|原始|上传的?|输入|读取|解析|查看|分析|引用)[^\n。，,]{{0,25}}(?:《|【|“|"|\'|`|\s)?{escaped_name}',
                text,
                re.I
            )
            or re.search(
                rf'{escaped_name}(?:》|】|”|"|\'|`|\s)?[^\n。，,]{{0,25}}(?:的内容|的数据|中提到|中记录|作为输入|作为参考|原始数据|附件|中指出)',
                text,
                re.I
            )
        )
        if is_source_reference:
            continue

        # 必须在该文件名局部存在明确的生成/保存/写入声称，或保存至 /workspace/，避免提及外部/参考文件时误触发断言
        claimed_for_this_file = bool(
            (is_generate_intent and not verify_claims_only and (f"/workspace/{clean_name}" in text or f"./workspace/{clean_name}" in text))
            or re.search(
                rf'(?:已.{{0,12}}(?:生成|创建|保存|导出|写入|完成)|(?:生成|创建|保存|导出|写入|输出|映射|回填|更新).{{0,12}}(?:完成|完毕|成功|至|到|为|了)|输出文件(?:为|是|：|:)?|保存(?:路径|在|到|至)|落盘至|保存在|已保存至|代码已写入|文件路径[：:]\s*(?:/workspace/)?)[^\n。]{{0,30}}{escaped_name}',
                text,
                re.I
            )
            or re.search(
                rf'{escaped_name}[^\n。]{{0,30}}(?:已(?:生成|创建|保存|导出|写入|落盘|更新|修改)|已保存到工作区|已保存至|已写入|新建(?:的|了)?.*工作表|created|saved|written)',
                text,
                re.I
            )
            or re.search(
                rf'(?:保存至|生成至|落盘至|输出至|写入至|保存到|更新至|映射至)\s*`?/(?:workspace|knowledge)/{escaped_name}',
                text,
                re.I
            )
        )
        if not claimed_for_this_file:
            continue

        ws_file = Path(WORKSPACE_DIR) / clean_name
        kn_file = Path(KNOWLEDGE_DIR) / clean_name
        raw_path = Path(name.strip())
        if raw_path.is_absolute():
            resolved = raw_path.resolve()
            if resolved.is_relative_to(Path(WORKSPACE_DIR).resolve()):
                ws_file = resolved
            elif resolved.is_relative_to(Path(KNOWLEDGE_DIR).resolve()):
                kn_file = resolved

        exists_and_nonempty = (
            (ws_file.exists() and ws_file.is_file() and ws_file.stat().st_size > 0) or
            (kn_file.exists() and kn_file.is_file() and kn_file.stat().st_size > 0)
        )
        if exists_and_nonempty and is_generate_intent and turn_start_time is not None:
            target_p = ws_file if (ws_file.exists() and ws_file.is_file()) else kn_file
            if target_p.exists() and target_p.stat().st_mtime < turn_start_time - 2.0:
                exists_and_nonempty = False

        if not exists_and_nonempty and clean_name not in missing:
            missing.append(clean_name)

    return missing

