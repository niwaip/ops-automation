"""
ReAct multi-turn agent execution loop for DeepSeek Harness (dsh).
Coordinates structured OpenAI tool calls, parallel tool dispatch, Nudge nudging,
and legacy format fallbacks.
"""

import re
import os
import json
import time
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

from .runtime_policy import RuntimePolicy
from .context_budget import ContextBudget
from .telemetry import TelemetryStats, extract_dsh_markers, strip_dsh_markers
from .tools import execute_tool, SANDBOX_TOOLS, get_sandbox_tools
from .llm import (
    call_model_proxy,
    parse_tool_calls,
    clean_output,
    is_promising_action,
    detect_unexecuted_script_leak
)
from .config import WORKSPACE_DIR, KNOWLEDGE_DIR
from .action_protocol import (
    is_internal_plan_output,
    recover_text_tool_calls,
    has_explicit_reminder_intent,
    has_explicit_reminder_time,
    detect_retrieval_mismatch_disclaimer,
)
from .deliverable_contract import (
    materialize_requested_markdown,
    materialize_script_deliverable,
    materialize_pdf_from_markdown,
    materialize_config_or_code_deliverable,
    requests_markdown_artifact,
    unwrap_outer_markdown_fence,
)
from .skill_router import is_text_only_request, is_term_negated
from .analysis_contract import build_analysis_contract, build_analysis_plan_context, supports_column_comparison
from .comparison_delivery import compile_comparison_response, COMPARISON_DELIVERY_INSTRUCTIONS
from .analysis_semantics import domain_plan_context
from .analysis_validation import validate_reply_against_contract, build_contract_termination_warning
from .tool_result import ToolResult
from .comparison_evidence import validate_execution_output
from .tool_dispatch import dispatch_tool_calls
from .sampling_guard import sampling_feedback, _is_meaningful_computational_command
from .spreadsheet_analysis_schema import ANALYSIS_INSTRUCTIONS, select_analysis_tools
from .analysis_turn import AnalysisTurn
from .agent_loop_helpers import (
    ACTION_FILLER_KEYWORDS,
    is_unclosed_or_truncated_html,
    is_explicit_code_request,
    auto_heal_unexecuted_file_writes,
    detect_passive_deflection,
    detect_unexecuted_tool_argument_leak,
    sanitize_preview,
    _extract_last_user_prompt,
    _build_fallback_report,
)


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

MAX_AGENT_ROUNDS_HARD_CEILING = int(os.getenv("DSH_MAX_AGENT_ROUNDS_CEILING", "10"))
MAX_SPREADSHEET_ROUNDS_CEILING = 4


def extract_filename_from_outbound(item: str) -> str:
    try:
        obj = json.loads(item)
        if isinstance(obj, dict) and "fileName" in obj:
            return obj["fileName"]
    except Exception:
        pass
    return Path(item).name


def detect_missing_claimed_artifacts(
    text: str,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False,
    is_search_intent: bool = False,
    turn_start_time: Optional[float] = None,
) -> List[str]:
    """
    Detects if the model claimed in text to have generated or outputted deliverable files
    that do not physically exist on disk in WORKSPACE_DIR or KNOWLEDGE_DIR.
    Strictly bypassed during read-only inspection turns (is_inspect_intent and not is_generate_intent)
    or search turns (is_search_intent and not is_generate_intent).
    """
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
        clean_name = re.sub(r'^[：:到至为在\s]+', '', clean_name).strip()
        if not clean_name:
            continue

        ext = Path(clean_name).suffix.lower()
        if ext not in DELIVERABLE_EXTS:
            continue
        if has_inline_html and clean_name in ["index.html", "presentation.html"]:
            continue

        # 非生成意图时，必须在该文件名局部存在明确的生成/保存/写入声称，或明确指称 /workspace/，避免提及外部项目文件时误触发断言
        if not is_generate_intent:
            escaped_name = re.escape(clean_name)
            claimed_for_this_file = bool(
                re.search(
                    rf'(?:已.{{0,12}}(?:生成|创建|保存|导出|写入|完成)|(?:生成|创建|保存|导出|写入|输出).{{0,12}}(?:完成|完毕|成功|至|到|为)|输出文件(?:为|是|：|:)?|保存(?:路径|在|到|至)|落盘至|保存在|已保存至|代码已写入|文件路径[：:]\s*(?:/workspace/)?)[^\n。]{{0,30}}{escaped_name}',
                    text,
                    re.I
                )
                or re.search(
                    rf'{escaped_name}[^\n。]{{0,30}}(?:已(?:生成|创建|保存|导出|写入|落盘)|已保存到工作区|已保存至|已写入)',
                    text,
                    re.I
                )
                or f"/workspace/{clean_name}" in text
                or f"./workspace/{clean_name}" in text
            )
            if not claimed_for_this_file:
                continue

        ws_file = Path(WORKSPACE_DIR) / clean_name
        kn_file = Path(KNOWLEDGE_DIR) / clean_name

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


def detect_missing_requested_deliverable(
    user_prompt: str,
    turn_start_time: float,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False
) -> Optional[str]:
    """
    Detects if the expected deliverable (from skill contract or prompt) was not created in WORKSPACE_DIR.
    Prioritizes explicit contract deliverables from the active skill.
    Strictly bypassed during read-only inspection turns (is_inspect_intent and not is_generate_intent).
    """
    if not user_prompt or is_text_only_request(user_prompt):
        return None
    if is_inspect_intent and not is_generate_intent:
        return None

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
                        return None
    except Exception:
        pass

    return req_ext


@dataclass
class AgentLoopResult:
    """Outcome of the multi-turn agent loop."""
    final_text: str = ""
    outbound_files: List[str] = field(default_factory=list)
    outbound_reminders: List[str] = field(default_factory=list)
    telemetry: TelemetryStats = field(default_factory=TelemetryStats)
    messages: List[Dict[str, Any]] = field(default_factory=list)
    execution_evidence: List[ToolResult] = field(default_factory=list)


def _check_no_tool_assertion_guard(
    reply_text: str,
    last_user_prompt: str,
    round_idx: int,
    max_rounds: int,
    start_ts: float,
    is_guide_intent: bool,
    expected_deliverables: Optional[List[str]],
    is_generate_intent: bool,
    is_inspect_intent: bool,
    executed_calls_history: Optional[List[str]] = None,
    guard_nudges_count: int = 0,
    script_execution_error: Optional[str] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    messages: Optional[List[Dict[str, Any]]] = None,
    telemetry: Optional[TelemetryStats] = None,
    execution_evidence: Optional[List[ToolResult]] = None,
    hard_ceiling: Optional[int] = None,
    is_search_intent: bool = False,
) -> Tuple[str, Optional[str], int]:
    """
    Evaluates assertion guards when model returns text without tool calls.
    Returns: (action, guard_user_message, new_max_rounds)
      action: "continue" (add message and continue loop), "break" (stop loop), or "pass" (allow completion)
    """
    effective_tools = tools if tools is not None else get_sandbox_tools()
    has_bash = bool(
        effective_tools and any(
            (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("bash", "cmd", "terminal", "sh", "exec")
            for t in effective_tools
        )
    )
    if hard_ceiling is None:
        hard_ceiling = (
            MAX_SPREADSHEET_ROUNDS_CEILING
            if (is_inspect_intent and not is_generate_intent and not expected_deliverables)
            else MAX_AGENT_ROUNDS_HARD_CEILING
        )
    # 普通问答只纠偏一次；明确的文件生成任务允许第二次、更加具体的落盘纠偏。
    # 仍受全局硬轮次上限约束，避免小模型持续规划而不执行。
    max_guard_nudges = 2 if is_generate_intent else 1
    if guard_nudges_count >= max_guard_nudges or round_idx >= hard_ceiling - 1:
        # Verification is independent of the generic filler-recovery budget.
        # A failed candidate can use a remaining normal round to repair its tool plan.
        if execution_evidence is not None and round_idx < hard_ceiling - 1:
            validation = validate_reply_against_contract(build_analysis_contract(last_user_prompt),
                reply_text, round_idx, max_rounds, execution_evidence=execution_evidence)
            if validation.comparison_error:
                return "continue", validation.feedback_message, min(hard_ceiling, max_rounds+1)
        return "pass", None, max_rounds

    bumped_max_rounds = min(hard_ceiling, max_rounds + 1)

    # 0. 内部计划与伪工具调用拦截：模型仅输出未执行的计划草稿时引导执行
    if not is_guide_intent and is_internal_plan_output(reply_text):
        print("⚡ [Harness Plan Guard] 检测到内部执行草稿，正在引导模型调用工具或输出最终结果...", flush=True)
        msg = (
            "检测到当前输出仍为内部执行计划或草稿。若需进一步操作请发起对应工具调用；"
            "若任务已完成，请直接输出最终的中文结论。"
        )
        return "continue", msg, bumped_max_rounds

    # 1. 物理产物声称断言：模型声称生成了文件，但文件物理不存在
    if not is_text_only_request(last_user_prompt) and (is_generate_intent or (not is_inspect_intent and not is_guide_intent and not is_search_intent)):
        missing = detect_missing_claimed_artifacts(
            reply_text,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent,
            is_search_intent=is_search_intent,
            turn_start_time=start_ts,
        )
        if missing:
            print(f"⚡ [Harness Artifact Assertion Guard] 检测到模型声称生成了文件 {missing}，但物理文件并不存在，正在拦截引导落盘...", flush=True)
            has_html_in_missing = any(f.endswith(".html") or f.endswith(".htm") for f in missing)
            code_block_hint = "，或者直接在回复中以完整的代码块（如 ```html\\n<!DOCTYPE html>...\\n```）输出全部源码" if has_html_in_missing else ""
            if has_bash:
                msg = (
                    f"【系统产物物理断言拦截】：你在回复中提及已生成或保存文件 {', '.join(missing)}，但当前沙箱物理文件并不存在{code_block_hint and '，且未在回复中提供完整代码块' or ''}。"
                    f"请立即调用 bash 执行代码将目标文件保存到 /workspace/ 路径下{code_block_hint}。严禁仅做口头汇报！"
                )
            else:
                msg = (
                    f"【系统产物物理断言拦截】：你在回复中提及已生成或保存文件 {', '.join(missing)}，但当前沙箱物理文件并不存在。"
                    "当前任务为只读模式（未提供写盘工具），请直接在当前回复中向用户完整输出 Markdown 格式的回答正文与分析内容，切勿声称已在本地保存文件。"
                )
            return "continue", msg, bumped_max_rounds

    # 2. HTML 代码截断拦截
    if is_unclosed_or_truncated_html(reply_text):
        print("⚠️ [Harness HTML Truncation Guard] 检测到输出的 HTML 代码达到上限被截断，立即停止并由导出器安全闭合与明确告警...", flush=True)
        return "break", None, max_rounds

    # 3. 契约交付物缺失断言：用户明确要求生成文件，但工作区尚未生成任何物理文件
    has_valid_html = ("```html" in reply_text.lower()) and not is_unclosed_or_truncated_html(reply_text)
    if not is_text_only_request(last_user_prompt) and (is_generate_intent or bool(expected_deliverables)) and not is_guide_intent and not is_search_intent:
        missing_deliverable = detect_missing_requested_deliverable(
            last_user_prompt,
            start_ts,
            expected_deliverables=expected_deliverables,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent
        )
        if not is_guide_intent and missing_deliverable:
            if missing_deliverable == ".html" and has_valid_html:
                missing_deliverable = None
            if missing_deliverable:
                print(f"⚡ [Harness Deliverable Assertion Guard] 检测到用户要求生成 {missing_deliverable} 交付物但沙箱尚未生成，正在引导执行工具落盘...", flush=True)
                if not has_bash:
                    msg = (
                        f"【系统交付物提示】：当前环境为只读模式（未提供代码执行工具），"
                        f"请直接在回复中以完整的 Markdown 格式或代码块输出 {missing_deliverable} 对应的全部正文内容。"
                    )
                elif script_execution_error:
                    msg = (
                        f"【系统脚本执行自愈提示】：检测到你在回复中提供了生成 {missing_deliverable} 的脚本代码，"
                        f"但在沙箱尝试运行该脚本生成交付物时出现异常报错：\n```\n{script_execution_error}\n```\n"
                        f"请立即通过 Function Calling 协议调用 `bash` 工具修复并运行脚本，完成物理文件落盘！严禁仅做口头解释！"
                    )
                else:
                    if missing_deliverable in [".html", ".htm"]:
                        format_write_hint = "，或直接在回复中以完整的代码块（如 ```html\n<!DOCTYPE html>...\n```）输出全部源码"
                    elif missing_deliverable in [".md", ".markdown"]:
                        format_write_hint = "，或直接在回复中以完整的 Markdown 代码块输出全部正文"
                    elif missing_deliverable in [".docx", ".xlsx", ".pdf"]:
                        format_write_hint = f"（请通过 Function Calling 协议调用 bash 工具运行 Python 脚本生成 {missing_deliverable} 文件）"
                    else:
                        format_write_hint = ""
                    msg = (
                        f"【系统交付物检查】：用户要求生成 {missing_deliverable} 文件（用户原始指令：『{last_user_prompt}』），当前工作区 (/workspace/) 中尚未检测到该物理文件。"
                        f"请立即通过 Function Calling 协议调用 `bash` 工具执行代码将完整可运行内容写入 /workspace/{format_write_hint}；不要继续输出功能规划、架构说明、伪代码，"
                        f"不要要求用户再次确认。严禁仅做口头汇报！"
                    )
                return "continue", msg, bumped_max_rounds

    # 4. 行动垫话拦截
    if not is_guide_intent and not is_text_only_request(last_user_prompt) and is_promising_action(reply_text):
        print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具调用，正在提醒模型执行工具...", flush=True)
        msg = "你提出了具体的行动计划，请直接使用工具函数实际执行该操作，不要仅输出口头承诺。"
        return "continue", msg, bumped_max_rounds

    # 5. 消极推诿拦截
    if not is_guide_intent and detect_passive_deflection(reply_text):
        print("⚡ [Harness Anti-Deflection Guard] 检测到消极推诿向用户索要链接/上下文，正在引导调用工具执行...", flush=True)
        msg = "沙箱配备了完整的联网检索与系统终端工具，请直接调用相关工具探测解决，严禁推诿索取信息。"
        return "continue", msg, bumped_max_rounds

    # 6. 未执行工具参数泄漏拦截 (Tool Argument Leakage Guard)
    if not is_guide_intent and detect_unexecuted_tool_argument_leak(reply_text):
        print("⚡ [Harness Tool Argument Leak Guard] 检测到模型输出了未执行的工具调用参数片段，正在拦截并引导重新调用...", flush=True)
        if telemetry:
            telemetry.record_guard("tool_argument_leak", "reject", "leaked_parameters")
        msg = (
            "【系统工具调用规范提示】：检测到你在回复中直接输出了工具参数片段（如 query / freshness 等键值对），"
            "但未通过标准 Function Calling 协议触发工具调用。口头输出参数无法执行检索或操作。"
            "若需查询信息或执行任务，请使用规范的 Function Calling 协议调用相应工具；若无需调用工具，请直接用完整自然语言向用户作答。"
        )
        return "continue", msg, bumped_max_rounds

    # 7. 未执行脚本泄漏拦截（若已提供完整合法 HTML 交付物则放行至导出器落盘与挂载）
    if not is_guide_intent and not is_text_only_request(last_user_prompt) and not is_explicit_code_request(last_user_prompt) and not has_valid_html and detect_unexecuted_script_leak(reply_text):
        print("⚡ [Harness Code Output Guard] 检测到模型直接输出了未执行的代码脚本或文件写入命令，正在引导执行工具落盘...", flush=True)
        if has_bash:
            msg = "检测到你输出了未执行的代码脚本或文件写入命令。请调用 bash 工具在终端实际运行脚本完成落盘，然后再向用户汇报完成。"
        else:
            msg = "检测到你输出了代码或文件命令。当前环境为只读模式，请直接输出分析结论与解答内容，无需尝试在本地写入文件。"
        return "continue", msg, bumped_max_rounds

    # 7. 提醒虚假创建断言拦截 (Reminder Assertion Guard)
    reminder_claims = [
        "已为您成功创建", "已成功创建日程", "已成功设置提醒", "已为您设置提醒",
        "已添加提醒", "已成功记录提醒", "写入日程库", "已创建提醒", "已为您定好提醒",
        "已成功创建提醒", "成功创建提醒"
    ]
    has_reminder_claim = any(c in reply_text for c in reminder_claims)
    user_wants_reminder = has_explicit_reminder_intent(last_user_prompt)
    has_time_in_user_prompt = bool(re.search(
        r'(\d+\s*[点时分秒号日周天月年]|明天|后天|大后天|下周|今晚|早上|中午|下午|晚上|半小时|一小时|\d+\s*小时后|\d+\s*分钟后|工作日|每天|每周|每月|准时|到点)',
        last_user_prompt
    ))
    executed = executed_calls_history or []
    has_executed_reminder = any("create_reminders" in call for call in executed)
    if user_wants_reminder and has_time_in_user_prompt and has_reminder_claim and not has_executed_reminder:
        print("⚡ [Harness Reminder Assertion Guard] 检测到模型口头声称已创建提醒但未调用 create_reminders 工具，正在引导调用工具...", flush=True)
        msg = (
            "【系统提醒检查】：检测到口头声称已创建提醒，但沙箱中未调用 `create_reminders` 工具。"
            "口头文字回复无法写入系统数据库与推送通知，请通过 Function Calling 协议调用 `create_reminders` 工具创建真实的系统提醒。"
        )
        return "continue", msg, bumped_max_rounds

    # 8. 检索不匹配与消极放弃拦截 (Retrieval Mismatch Guard)
    has_web_search = bool(
        tools and any(
            (isinstance(t, dict) and (t.get("name") in ["web_search", "search_web"] or t.get("function", {}).get("name") in ["web_search", "search_web"]))
            for t in tools
        )
    )
    if has_web_search and not is_guide_intent and detect_retrieval_mismatch_disclaimer(reply_text):
        print("⚡ [Harness Retrieval Mismatch Guard] 检测到模型因检索结果不匹配声称无法确认，正在拦截引导重新检索...", flush=True)
        msg = (
            "【系统检索纠错提示】：你当前的回复表明现有检索材料与用户问题不匹配，或未能找到关键有效信息。"
            "请不要直接放弃或回复无法确认！请根据用户问题的核心主体，提炼更精准的搜索词，"
            "直接调用 `web_search` 工具发起再次检索。"
        )
        return "continue", msg, bumped_max_rounds

    # 9. 任务契约与指标逐项验收拦截 (Analysis Contract & Metric Alignment Guard)
    if not is_guide_intent:
        contract = build_analysis_contract(last_user_prompt or "")
        if contract.has_metrics:
            is_sheet_listing_reply = bool(re.search(
                r'(?:工作表清单|Sheet\s*名称|主要用途与内容说明|包含\s*\d+\s*个工作表|共包含.*工作表)',
                reply_text or ""
            ))
            is_parroting_history = False
            if messages:
                for m in messages:
                    if isinstance(m, dict) and m.get("role") == "assistant":
                        c_val = m.get("content")
                        prev_text = c_val if isinstance(c_val, str) else ""
                        if is_sheet_listing_reply and ("主要用途与内容说明" in prev_text or "工作表清单" in prev_text):
                            is_parroting_history = True
                            break

            val_result = validate_reply_against_contract(
                contract=contract,
                reply_text=reply_text or "",
                round_idx=round_idx,
                max_rounds=max_rounds,
                messages=messages,
                execution_evidence=execution_evidence
            )

            if is_sheet_listing_reply or is_parroting_history or not val_result.is_pass:
                feedback = val_result.feedback_message
                if is_sheet_listing_reply or is_parroting_history:
                    all_metrics_str = "、".join(contract.get_metric_names())
                    feedback = (
                        f"【系统问答对齐与指标核算拦截】：用户明确要求核算具体指标（『{last_user_prompt}』，目标指标：{all_metrics_str}）。\n"
                        "当前回复重复罗列工作表目录或说明，未回答具体指标数据，未给出核心指标数值，严禁向用户复读目录或反问是否继续！\n"
                        "请立即调用 `read_file` 读取真实对应的数据源工作表，"
                        "或调用 `bash` 运行 Python 脚本对数据进行求值，直接给出全部各项指标的具体数值结论及数据来源。"
                    )
                print(f"⚡ [Harness Contract Guard] 拦截未完成指标核算回复 (status={val_result.status}, satisfied={val_result.satisfied_metrics}, missing={val_result.missing_metrics})", flush=True)
                return "continue", feedback, bumped_max_rounds

    # 10. 历史截断标记复读/偷懒拦截 (Truncation Parroting Guard)
    if re.search(r'(?:因历史消息长度预算超出|中间部分已自动省略|\[内容已截断\]|CONTEXT_BUDGET)', reply_text or ''):
        print("⚡ [Harness Truncation Parroting Guard] 检测到模型在当前回复中输出截断/省略占位符，正在拦截引导输出完整结果...", flush=True)
        feedback = (
            "【系统完整性拦截提示】：检测到你的回复中包含了省略/截断标记（如‘中间部分已自动省略’或‘内容已截断’）导致回答不完整。"
            "请勿使用任何省略标记，直接向用户完整、详细地输出全部内容和结果！"
        )
        return "continue", feedback, bumped_max_rounds

    feedback = sampling_feedback(reply_text,last_user_prompt,messages,telemetry,execution_evidence,is_guide_intent)
    if feedback:
        return "continue", feedback, bumped_max_rounds

    return "pass", None, max_rounds


def _is_tool_error(tool_res: Any) -> bool:
    """Checks whether tool output represents an execution error or failure via ToolResult contract."""
    from dsh_modules.tool_result import is_tool_error
    return is_tool_error(tool_res)


def _dispatch_tool_calls(*args, **kwargs):
    return dispatch_tool_calls(*args, **kwargs, execute_fn=execute_tool,
                               error_fn=_is_tool_error, preview_fn=sanitize_preview)


def _finalize_agent_text(
    reply_text: str,
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    deadline: Optional[float],
    is_guide_intent: bool,
    executed_calls_history: List[str],
    was_token_truncated: bool,
    telemetry: TelemetryStats,
    last_user_prompt: str = "",
    expected_deliverables: Optional[List[str]] = None,
    execution_evidence: Optional[List[ToolResult]] = None
) -> Tuple[str, List[str]]:
    """Finalizes agent text, requesting forced summary if needed and applying fallback reports."""
    has_pending_tool_calls = bool(parse_tool_calls(reply_text, is_guide=is_guide_intent))
    final_text = clean_output(reply_text, is_guide=is_guide_intent)
    has_internal_plan = is_internal_plan_output(reply_text)

    healed_files: List[str] = []
    has_valid_html = ("```html" in final_text.lower()) and not is_unclosed_or_truncated_html(final_text)
    has_physical_artifact = False
    try:
        if expected_deliverables and os.path.exists(WORKSPACE_DIR):
            ws_files = [f for f in os.listdir(WORKSPACE_DIR) if not f.startswith(".")]
            has_physical_artifact = any(
                any(f.endswith(ext.lower()) for f in ws_files)
                for ext in expected_deliverables
            )
    except Exception:
        pass

    is_hollow_claim = (
        not has_physical_artifact and
        len(final_text.strip()) < 220 and
        not has_valid_html and
        bool(re.search(r'(?:文件|代码|报告|文档|演示文稿|ppt|pdf|表格)?已(?:成功)?(?:生成|写入|保存|导出|落盘)|请查看(?:下方)?(?:下载)?卡片|<div\s+download-card', final_text, re.I))
    )

    is_transitional_filler = (
        len(final_text) < 120 and
        (any(kw in final_text for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(reply_text) or is_hollow_claim)
    )
    has_raw_dsml = bool(re.search(r'<[｜|]{1,2}\s*DSML\s*[｜|]{1,2}', reply_text))
    has_raw_tool = bool(re.search(r'<(?:tool_call|tool_calls)', reply_text))

    if has_pending_tool_calls or not final_text or is_transitional_filler or has_raw_dsml or has_raw_tool or has_internal_plan:
        messages.append({"role": "assistant", "content": reply_text or None})
        if is_hollow_claim:
            nudge_prompt = (
                "【双通道完整交付要求】：你已完成交付物生成，但当前聊天回复仅包含简短的文件生成通知/下载卡片提示，缺失核心正文内容。"
                "根据平台双通道交付原则，聊天对话中必须向用户呈现完整、清晰、结构化的核心成果与总结要点（例如天气明细、报告核心结论与结构化摘要）。"
                "请直接在当前回复中输出详尽的 Markdown 正文回答，严禁仅回复'已生成/请看卡片'等空话！"
            )
        else:
            nudge_prompt = "工具调用轮次已结束。请根据目前已探索和收集到的所有信息与仓库内容，直接给出深入、结构完整、详尽的最终中文回答（严禁输出中间过渡垫话或未执行的工具标签）。"
        messages.append({"role": "user", "content": nudge_prompt})
        try:
            forced_res = call_model_proxy(
                messages,
                model,
                timeout=policy.single_request_timeout,
                deadline=deadline,
                policy=policy
            )
            telemetry.record_llm_response(forced_res, is_first_round=False)
            forced_reply = forced_res.get("content", "") if isinstance(forced_res, dict) else str(forced_res)
            forced_clean = clean_output(forced_reply, is_guide=is_guide_intent) or forced_reply.strip()
            is_still_filler = (
                len(forced_clean) < 120 and
                (any(kw in forced_clean for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(forced_reply))
            )
            if forced_clean and not is_still_filler and not is_internal_plan_output(forced_clean):
                final_text = forced_clean
            elif is_transitional_filler or has_internal_plan:
                final_text = ""
        except TimeoutError:
            raise
        except Exception:
            if is_transitional_filler or has_internal_plan:
                final_text = ""

    is_terminal_filler = (
        len(final_text) < 120 and
        (any(kw in final_text for kw in ACTION_FILLER_KEYWORDS) or is_promising_action(final_text) or is_hollow_claim)
    )
    if not final_text or is_terminal_filler or is_internal_plan_output(final_text):
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")

        p_lower = (last_user_prompt or "").lower()
        user_cmd = p_lower
        if "用户指令：" in user_cmd:
            user_cmd = user_cmd.split("用户指令：")[-1].strip()
        elif "用户指令:" in user_cmd:
            user_cmd = user_cmd.split("用户指令:")[-1].strip()
        else:
            user_cmd = re.sub(r'【(?:当前轮次用户上传附件|当前会话有效附件清单)】:[^\n]+\n?', '', user_cmd).strip()

        names_non_web_format = bool(
            re.search(r'(?:pptx?|slides?|幻灯片|演示文稿|pdf|docx?|word|xlsx?|excel)', user_cmd, re.I)
        )
        has_non_html_deliverable = bool(
            expected_deliverables and any(ext.lower() in [".docx", ".xlsx", ".pdf"] for ext in expected_deliverables)
        )
        html_cues = ["html", "网页", "单页", "大屏", "看板"]
        has_html_req = (
            not names_non_web_format
            and not has_non_html_deliverable
            and (
                any(cue in user_cmd for cue in html_cues)
                or ("报告" in user_cmd and any(cue in user_cmd for cue in ["单页", "一页", "html", "网页"]))
            )
        )
        if has_html_req:
            try:
                from .html_report_fallback import materialize_html_report_fallback, is_plausible_html_file
                fallback_path = materialize_html_report_fallback(
                    prompt=last_user_prompt,
                    history=messages,
                    workspace_dir=WORKSPACE_DIR,
                    notice="本单页报告由系统基于会话中有效内容恢复生成，支持交互预览与全屏查看。"
                )
                if fallback_path and Path(fallback_path).exists() and is_plausible_html_file(Path(fallback_path)):
                    file_content = Path(fallback_path).read_text(encoding="utf-8")
                    final_text = (
                        "✨ **单页 HTML 报告已由系统基于会话内容自动整理生成！**\n"
                        f"- **输出文件**：`/workspace/{Path(fallback_path).name}`\n"
                        "- **操作提示**：您可以在下方直接**展开在线预览**、**全屏查看**，或点击**下载**保存本地使用。\n\n"
                        f"```html\n{file_content}\n```"
                    )
                    healed_files.append(fallback_path)
            except Exception as e:
                print(f"⚠️ [Harness Agent Loop] 自动编译单页 HTML 失败: {e}")

        if not final_text or is_terminal_filler or is_internal_plan_output(final_text):
            inf_cause = "model_empty_final" if executed_calls_history else "model_budget_exhausted"
            final_text = _build_fallback_report(
                messages,
                executed_calls_history,
                cause=inf_cause,
                pending_items=[f"生成目标交付物 ({', '.join(expected_deliverables)})"] if expected_deliverables else None
            )

    if was_token_truncated and "```html" not in final_text and not is_unclosed_or_truncated_html(final_text):
        truncation_suffix = (
            "\n\n---\n"
            "⚠️ **输出截断提醒（已达到模型单次 Token 上限）**\n"
            "- **状态说明**：上游模型输出达到最大长度限制提前结束。\n"
            "- **💡 通用建议**：如需获取后续完整内容，请直接回复「**继续**」，模型将从中断处接力输出。若需长篇内容，也可在提问中指定分段或分章节输出。"
        )
        if "输出截断提醒" not in final_text:
            final_text += truncation_suffix

    if not is_guide_intent and not is_text_only_request(last_user_prompt) and not is_explicit_code_request(last_user_prompt):
        final_text, extra_healed = auto_heal_unexecuted_file_writes(final_text, WORKSPACE_DIR)
        healed_files.extend(extra_healed)
        has_valid_html_final = ("```html" in final_text.lower()) and not is_unclosed_or_truncated_html(final_text)
        if extra_healed:
            sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
            sys.stdout.write(f"<<<DSH_DELTA:{json.dumps(final_text, ensure_ascii=False)}>>>\n")
            sys.stdout.flush()
        elif not has_valid_html_final and (detect_unexecuted_script_leak(final_text) or detect_unexecuted_tool_argument_leak(final_text)):
            print("⚠️ [Harness Script Leak Guard] 检测到模型输出了未执行的脚本或参数回显且未能自愈，触发安全兜底...", flush=True)
            final_text = _build_fallback_report(
                messages,
                executed_calls_history,
                cause="model_empty_final",
                trigger_evidence="模型输出了未执行的代码脚本或参数片段，自动执行自愈未通过",
                retry_advice="请直接回复「请实际在终端运行上述脚本完成落盘」"
            )

    feedback = sampling_feedback(final_text,last_user_prompt,messages,telemetry,execution_evidence,is_guide_intent)
    if feedback:
        final_text += "\n\n⚠️ **【数据覆盖度与真实性提示】**\n当前分析基于局部切片或抽样数据。\n" + feedback

    # 指标契约未完成阻碍声明（防模型在轮次耗尽时静默放行未完成的指标分析）
    if not is_guide_intent and last_user_prompt:
        contract = build_analysis_contract(last_user_prompt)
        if contract.has_metrics:
            audit_ceiling = (
                MAX_SPREADSHEET_ROUNDS_CEILING
                if not expected_deliverables
                else MAX_AGENT_ROUNDS_HARD_CEILING
            )
            val_result = validate_reply_against_contract(
                contract=contract,
                reply_text=final_text or "",
                round_idx=audit_ceiling,
                max_rounds=audit_ceiling,
                messages=messages,
                execution_evidence=execution_evidence
            )
            llm_calls = getattr(telemetry, "llm_invocations", 0) if telemetry else 0
            is_budget_exhausted = bool(llm_calls >= audit_ceiling)
            if not val_result.is_pass:
                contract_warning = build_contract_termination_warning(
                    contract=contract,
                    val_result=val_result,
                    messages=messages,
                    telemetry=telemetry,
                    is_budget_exhausted=is_budget_exhausted
                )
                if val_result.comparison_error and execution_evidence is not None:
                    # Do not publish an unsupported extreme and then disclaim it.
                    # This is a failed verification, not an alternate computed answer.
                    final_text = "本次比较结论尚未通过执行证据核验。"
                if "【指标核算未完成声明】" not in final_text:
                    final_text += contract_warning

    return final_text, healed_files


def run_agent_loop(
    messages: List[Dict[str, Any]],
    model: str,
    policy: RuntimePolicy,
    max_rounds: int,
    tools: Optional[List[Dict[str, Any]]] = None,
    deadline: Optional[float] = None,
    is_guide_intent: bool = False,
    turn_start_time: Optional[float] = None,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False,
    telemetry: Optional[TelemetryStats] = None,
    spreadsheet_analysis_required: bool = False,
    is_search_intent: bool = False,
) -> AgentLoopResult:
    """Executes the multi-turn ReAct tool calling loop up to max_rounds."""
    active_tools = tools if tools is not None else get_sandbox_tools()
    if telemetry is None:
        telemetry = TelemetryStats()
    outbound_files: List[str] = []
    outbound_reminders: List[str] = []
    executed_calls_history: List[str] = []
    reply_text = ""
    was_token_truncated = False
    start_ts = turn_start_time if turn_start_time is not None else time.time()
    last_user_prompt = _extract_last_user_prompt(messages)
    analysis_turn=AnalysisTurn(last_user_prompt) if spreadsheet_analysis_required else None
    comparison_contract = build_analysis_contract(last_user_prompt)
    comparison_required = (not is_generate_intent and not is_guide_intent
        and supports_column_comparison(comparison_contract)
        and any(t.get('function', {}).get('name') == 'compare_spreadsheet_columns' for t in active_tools))
    if comparison_required:
        messages.insert(0, {"role": "system", "content": COMPARISON_DELIVERY_INSTRUCTIONS})
    if comparison_contract.is_advisory_intent and not comparison_contract.is_explicit_calc:
        from .analysis_contract import build_advisory_guidance
        advisory_guidance = build_advisory_guidance(comparison_contract)
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = str(messages[0].get("content") or "") + advisory_guidance
        else:
            messages.insert(0, {"role": "system", "content": advisory_guidance})
    if spreadsheet_analysis_required:
        active_tools=select_analysis_tools(active_tools,last_user_prompt)
    if spreadsheet_analysis_required:
        messages[0]["content"] = str(messages[0].get("content") or "") + ANALYSIS_INSTRUCTIONS + domain_plan_context(last_user_prompt)
    requirements = build_analysis_plan_context(last_user_prompt) if is_inspect_intent and not is_guide_intent else ""
    if requirements:
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = str(messages[0].get("content") or "") + requirements
        else:
            messages.insert(0, {"role": "system", "content": requirements})
    execution_evidence: List[ToolResult] = []
    guard_nudges_count = 0
    is_pure_spreadsheet_or_inspect = (
        spreadsheet_analysis_required
        or comparison_required
        or (is_inspect_intent and not is_generate_intent and not expected_deliverables)
    )
    task_ceiling = MAX_SPREADSHEET_ROUNDS_CEILING if is_pure_spreadsheet_or_inspect else MAX_AGENT_ROUNDS_HARD_CEILING
    max_rounds = min(max_rounds, task_ceiling)

    round_idx = 0
    while round_idx < max_rounds:
        if round_idx > 0:
            if getattr(policy, "thinking", False):
                policy.thinking = False
                policy.reasoning_effort = None
            if active_tools:
                print(f"⏳ [Harness Agent] 正在结合前序采集证据进行深入推理与规划 (第 {round_idx + 1} 轮)...", flush=True)
            else:
                print(f"⏳ [Harness Agent] 正在根据执行结果汇总交付物 (第 {round_idx + 1} 轮)...", flush=True)
        if deadline is not None and deadline - time.monotonic() <= 0:
            print(f"⚠️ [Harness Timeout] 总任务执行已达到硬截止时间 ({policy.total_task_timeout}s)，立即终止", flush=True)
            raise TimeoutError(f"Task total execution deadline ({policy.total_task_timeout}s) exceeded")

        llm_res = call_model_proxy(
            messages,
            model,
            tools=active_tools,
            timeout=policy.single_request_timeout,
            deadline=deadline,
            policy=policy,
            stream_deltas=False if spreadsheet_analysis_required or comparison_required else None,
            tool_choice="required" if active_tools and (
                (spreadsheet_analysis_required and analysis_turn.response(execution_evidence) is None)
                or (comparison_required and compile_comparison_response(comparison_contract,execution_evidence)[0] is None)) else None
        )
        reply_text = (llm_res.get("content") or "") if isinstance(llm_res, dict) else str(llm_res or "")
        structured_calls = list(llm_res.get("tool_calls") or []) if isinstance(llm_res, dict) else []

        telemetry.record_llm_response(llm_res, is_first_round=(round_idx == 0))
        if isinstance(llm_res, dict) and llm_res.get("finish_reason") == "length":
            was_token_truncated = True

        # 混合兼容降级：若 structured_calls 为空但模型文本中含有 XML/DSML tool_call 标签
        if not structured_calls and reply_text:
            legacy_calls = parse_tool_calls(reply_text, is_guide=is_guide_intent)
            if legacy_calls:
                has_reminder_intent = has_explicit_reminder_intent(last_user_prompt)
                for i, lc in enumerate(legacy_calls):
                    raw_c_name = str(lc.get("name", "")).strip()
                    c_name = re.sub(r'^[a-zA-Z0-9_\-]+[:.]', '', raw_c_name).lower()
                    if c_name == "search_web":
                        c_name = "web_search"
                    if c_name in (
                        "create_reminders", "create_reminder", "set_reminder", "set_reminders",
                        "add_reminder", "add_reminders", "remind", "reminder",
                        "update_reminders", "delete_reminders"
                    ):
                        if not has_reminder_intent:
                            print(f"⚠️ [Harness Security Guard] 过滤未授权的文本/旧协议提醒工具调用: {raw_c_name}", flush=True)
                            continue
                    structured_calls.append({
                        "id": f"call_legacy_{round_idx}_{i}",
                        "type": "function",
                        "function": {
                            "name": c_name or raw_c_name,
                            "arguments": json.dumps(lc.get("params", {}), ensure_ascii=False)
                        }
                    })

        # 小模型协议适配：恢复明确计划中的安全只读调用，以及参数受限的 Markdown 写入调用。
        # bash 等通用可变更工具不会通过此路径自动执行。
        if not structured_calls and reply_text:
            structured_calls = recover_text_tool_calls(
                reply_text,
                user_prompt=last_user_prompt,
                round_idx=round_idx,
            )
            if structured_calls:
                print(
                    "⚡ [Harness Protocol Recovery] 已将小模型文本动作转换为受控结构化工具调用...",
                    flush=True,
                )

        # 若当轮无任何工具调用
        if not structured_calls:
            if comparison_required:
                compiled, error = compile_comparison_response(comparison_contract, execution_evidence)
                telemetry.record_guard('comparison_evidence', 'reject' if error else 'accept', error)
                if error and round_idx < task_ceiling - 1:
                    max_rounds = min(task_ceiling, max_rounds+1)
                    messages.append({'role':'assistant', 'content':reply_text})
                    messages.append({'role':'user', 'content':'【系统比较证据验收】：'+error+COMPARISON_DELIVERY_INSTRUCTIONS})
                    round_idx += 1
                    continue
                break
            if spreadsheet_analysis_required:
                response=analysis_turn.response(execution_evidence,reply_text)
                error=None if response else analysis_turn.feedback(execution_evidence)
                telemetry.record_guard("spreadsheet_evidence", "reject" if error else "accept", error)
                if error and round_idx < task_ceiling - 1:
                    max_rounds = min(task_ceiling, max_rounds+1)
                    messages.append({"role":"assistant","content":reply_text})
                    messages.append({"role":"user","content":error})
                    round_idx += 1
                    continue
                break
            # Markdown 是声明式产物：当模型已经给出完整正文时，由运行时安全编译落盘，
            # 不再要求小模型拼接 bash/heredoc 命令。
            markdown_path, created_now = materialize_requested_markdown(
                last_user_prompt,
                reply_text,
                WORKSPACE_DIR,
                turn_start_time=start_ts,
            )
            if markdown_path:
                outbound_payload = json.dumps(
                    {"filePath": markdown_path, "fileName": Path(markdown_path).name},
                    ensure_ascii=False,
                )
                if outbound_payload not in outbound_files:
                    outbound_files.append(outbound_payload)
                if created_now:
                    print(
                        f"✨ [Harness Artifact Compiler] 已将最终正文编译为 Markdown 文件: {markdown_path}",
                        flush=True,
                    )

            # 物理代码产物（.docx, .xlsx, .pdf 等）：当模型在正文中输出了完整 Python 脚本时，
            # 自动提取并安全执行落盘，避免因小模型漏发原生 tool_calls 导致交付失败。
            script_execution_error: Optional[str] = None
            if expected_deliverables and any(ext.lower() in [".docx", ".xlsx", ".pdf"] for ext in expected_deliverables):
                script_artifact_path, script_err = materialize_script_deliverable(
                    reply_text=reply_text,
                    workspace_dir=WORKSPACE_DIR,
                    expected_deliverables=expected_deliverables,
                    turn_start_time=start_ts,
                )
                if script_artifact_path:
                    outbound_payload = json.dumps(
                        {"filePath": script_artifact_path, "fileName": Path(script_artifact_path).name},
                        ensure_ascii=False,
                    )
                    if outbound_payload not in outbound_files:
                        outbound_files.append(outbound_payload)
                    executed_calls_history.append("bash")
                    print(
                        f"✨ [Harness Deliverable Compiler] 检测到模型在正文中输出了生成脚本，已自动安全执行落盘: {script_artifact_path}",
                        flush=True,
                    )
                elif script_err:
                    script_execution_error = script_err

            if expected_deliverables and any(ext.lower() == ".pdf" for ext in expected_deliverables):
                pdf_artifact_path = materialize_pdf_from_markdown(
                    prompt=last_user_prompt,
                    workspace_dir=WORKSPACE_DIR,
                    turn_start_time=start_ts,
                    expected_deliverables=expected_deliverables,
                    final_text=reply_text,
                )
                if pdf_artifact_path:
                    outbound_payload = json.dumps(
                        {"filePath": pdf_artifact_path, "fileName": Path(pdf_artifact_path).name},
                        ensure_ascii=False,
                    )
                    if outbound_payload not in outbound_files:
                        outbound_files.append(outbound_payload)
                    executed_calls_history.append("bash")

            if not is_text_only_request(last_user_prompt):
                tech_artifacts_mid = materialize_config_or_code_deliverable(
                    prompt=last_user_prompt,
                    final_text=reply_text,
                    workspace_dir=WORKSPACE_DIR,
                    turn_start_time=start_ts,
                )
                for ta in tech_artifacts_mid:
                    outbound_payload = json.dumps(
                        {"filePath": ta, "fileName": Path(ta).name},
                        ensure_ascii=False,
                    )
                    ta_name = Path(ta).name.lower()
                    if outbound_payload not in outbound_files and not any(extract_filename_from_outbound(existing).lower() == ta_name for existing in outbound_files):
                        outbound_files.append(outbound_payload)

            action, guard_msg, max_rounds = _check_no_tool_assertion_guard(
                reply_text=reply_text,
                last_user_prompt=last_user_prompt,
                round_idx=round_idx,
                max_rounds=max_rounds,
                start_ts=start_ts,
                is_guide_intent=is_guide_intent,
                expected_deliverables=expected_deliverables,
                is_generate_intent=is_generate_intent,
                is_inspect_intent=is_inspect_intent,
                executed_calls_history=executed_calls_history,
                guard_nudges_count=guard_nudges_count,
                script_execution_error=script_execution_error,
                tools=active_tools,
                messages=messages,
                telemetry=telemetry,
                execution_evidence=execution_evidence,
                hard_ceiling=task_ceiling,
                is_search_intent=is_search_intent,
            )
            if action == "continue":
                guard_nudges_count += 1
                messages.append({"role": "assistant", "content": reply_text})
                messages.append({"role": "user", "content": guard_msg})
                round_idx += 1
                continue
            elif action == "break":
                break
            else:
                break

        # 记录助手消息
        cleaned_content = clean_output(reply_text, is_guide=is_guide_intent).strip() if reply_text else ""
        messages.append({
            "role": "assistant",
            "content": cleaned_content if cleaned_content else None,
            "tool_calls": structured_calls
        })

        # 工具调用属于沙箱内部流程，调用前重置任何未决的前端打字机内容
        sys.stdout.write("<<<DSH_DELTA_RESET>>>\n")
        sys.stdout.flush()

        # 执行工具调用
        is_file_sent = _dispatch_tool_calls(
            structured_calls=structured_calls,
            round_idx=round_idx,
            messages=messages,
            telemetry=telemetry,
            policy=policy,
            executed_calls_history=executed_calls_history,
            outbound_files=outbound_files,
            deadline=deadline,
            is_guide_intent=is_guide_intent,
            outbound_reminders=outbound_reminders,
            last_user_prompt=last_user_prompt,
            execution_evidence=execution_evidence,
            allowed_tool_names=[t.get("function", {}).get("name", t.get("name", ""))
                                for t in active_tools]
        )

        if analysis_turn:
            completed=analysis_turn.complete(execution_evidence,telemetry,
                [t.get('function',{}).get('name') for t in active_tools],deadline)
            if analysis_turn.may_finish(execution_evidence):
                break
            messages.append({'role':'user','content':analysis_turn.feedback(execution_evidence)})
            if completed:
                messages.append({'role':'user','content':'【程序注册关系补算回执】\n'+
                    '\n'.join(r.render_text() for r in completed)})

        # A weather lookup already returns current conditions plus forecast, and a successful
        # reminder mutation may not be repeated. Remove only these single-use capabilities
        # from later rounds. Search/read tools remain available because different arguments
        # can represent legitimate multi-step research.
        single_use_tools = {
            "weather",
            "create_reminders",
            "create_reminder",
            "update_reminder",
            "update_reminders",
            "delete_reminder",
            "delete_reminders",
        }
        executed_names = {
            call_sig.split(":", 1)[0]
            for call_sig in executed_calls_history
            if ":" in call_sig and not call_sig.startswith("err:")
        }
        exhausted = single_use_tools.intersection(executed_names)
        if exhausted:
            active_tools = [
                tool for tool in active_tools
                if tool.get("function", {}).get("name") not in exhausted
            ]

        if spreadsheet_analysis_required and execution_evidence and execution_evidence[-1].is_error:
            max_rounds=min(task_ceiling,max(max_rounds,round_idx+2))

        # 当任务需要生成物理交付物（如 PDF/Word/Excel）且尚未落盘，但模型仍处于探索/草稿阶段（例如刚调用了搜索或写入了中间文件），
        # 且轮次临近上限时，动态追加 2 轮预算，避免在最后落盘前被硬截断
        if (expected_deliverables or is_generate_intent) and round_idx >= max_rounds - 1 and round_idx < task_ceiling - 1:
            missing_deliv = detect_missing_requested_deliverable(
                last_user_prompt, start_ts,
                expected_deliverables=expected_deliverables,
                is_generate_intent=is_generate_intent,
                is_inspect_intent=is_inspect_intent
            )
            if missing_deliv:
                max_rounds = min(task_ceiling, max(max_rounds, round_idx + 2))
                print(f"⚡ [Harness Dynamic Budget] 检测到目标交付物 {missing_deliv} 尚未生成，动态追加执行轮次至 {max_rounds} (硬上限: {task_ceiling})...", flush=True)
                messages.append({
                    "role": "user",
                    "content": f"【系统阶段督促】：当前轮次临近上限，但目标交付物 {missing_deliv} 尚未生成落盘。请立即停止零散查看或临时测试，通过 bash 运行最终 Python/处理脚本将完整数据与图表直接写入 /workspace/ 目标文件！"
                })

        # 当前轮次已执行工具，重置 reply_text，防止内部工具前置垫话或执行脚本残留进入最终回复
        reply_text = ""

        if is_file_sent:
            messages.append({
                "role": "user",
                "content": "文件已成功标记并推送至即时通讯通道。请直接回复用户，告知文件已发送，请其查收即可。无需再调用任何其他工具。"
            })
            final_step = call_model_proxy(
                messages,
                model,
                timeout=policy.single_request_timeout,
                deadline=deadline
            )
            telemetry.record_llm_response(final_step, is_first_round=False)
            reply_text = (final_step.get("content") or "") if isinstance(final_step, dict) else str(final_step or "")
            break

        round_idx += 1

    if comparison_required:
        compiled, error = compile_comparison_response(comparison_contract, execution_evidence)
        telemetry.record_guard('comparison_evidence', 'reject' if error else 'accept', error)
    final_text, healed_files = ((compiled or '本次比较结论尚未通过执行证据核验。\n\n'+error, [])
        if comparison_required else (analysis_turn.render(execution_evidence,reply_text,telemetry,policy=policy,model=model,deadline=deadline), [])
        if spreadsheet_analysis_required else _finalize_agent_text(
        reply_text=reply_text,
        messages=messages,
        model=model,
        policy=policy,
        deadline=deadline,
        is_guide_intent=is_guide_intent,
        executed_calls_history=executed_calls_history,
        was_token_truncated=was_token_truncated,
        telemetry=telemetry,
        last_user_prompt=last_user_prompt,
        expected_deliverables=expected_deliverables,
        execution_evidence=execution_evidence
    ))
    if requests_markdown_artifact(last_user_prompt):
        final_text = unwrap_outer_markdown_fence(final_text)
    for hf in healed_files:
        if hf not in outbound_files:
            outbound_files.append(hf)

    # 强制总结分支也可能首次产生可交付正文，因此在最终返回前再执行一次声明式产物编译。
    markdown_path, created_now = materialize_requested_markdown(
        last_user_prompt,
        final_text,
        WORKSPACE_DIR,
        turn_start_time=start_ts,
    )
    if markdown_path:
        outbound_payload = json.dumps(
            {"filePath": markdown_path, "fileName": Path(markdown_path).name},
            ensure_ascii=False,
        )
        if outbound_payload not in outbound_files:
            outbound_files.append(outbound_payload)
        if created_now:
            print(
                f"✨ [Harness Artifact Compiler] 已将最终正文编译为 Markdown 文件: {markdown_path}",
                flush=True,
            )

    # 强制总结分支：若用户期望 PDF，且工作区存在 Markdown 稿件或正文，自动执行编译落盘
    if expected_deliverables and any(ext.lower() == ".pdf" for ext in expected_deliverables):
        pdf_path = materialize_pdf_from_markdown(
            prompt=last_user_prompt,
            workspace_dir=WORKSPACE_DIR,
            turn_start_time=start_ts,
            expected_deliverables=expected_deliverables,
            final_text=final_text,
        )
        if pdf_path:
            outbound_payload = json.dumps(
                {"filePath": pdf_path, "fileName": Path(pdf_path).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files:
                outbound_files.append(outbound_payload)
            # 语义净化：用户明确要求 PDF 且已生成 PDF 时，清除中间过渡的同名 md 外发，避免草稿泄露
            md_stem = Path(pdf_path).stem.lower()
            filtered_outbounds = []
            for item_str in outbound_files:
                try:
                    obj = json.loads(item_str)
                    fname = str(obj.get("fileName", "")).lower()
                    if fname.endswith(".md") and (fname == f"{md_stem}.md" or fname == "result.md" or fname == "report.md"):
                        continue
                except Exception:
                    pass
                filtered_outbounds.append(item_str)
            outbound_files = filtered_outbounds

    # 强制总结分支：若正文中输出了 Python 脚本块，自动执行落盘
    if expected_deliverables and any(ext.lower() in [".docx", ".xlsx", ".pdf"] for ext in expected_deliverables):
        script_artifact_path, _ = materialize_script_deliverable(
            reply_text=final_text,
            workspace_dir=WORKSPACE_DIR,
            expected_deliverables=expected_deliverables,
            turn_start_time=start_ts,
        )
        if script_artifact_path:
            outbound_payload = json.dumps(
                {"filePath": script_artifact_path, "fileName": Path(script_artifact_path).name},
                ensure_ascii=False,
            )
            if outbound_payload not in outbound_files:
                outbound_files.append(outbound_payload)

    # 强制总结分支：若涉及技术脚本或配置文件 (Dockerfile, docker-compose.yml, *.sh, *.sql, *.py)，自动提取落盘
    if not is_text_only_request(last_user_prompt):
        tech_artifacts_final = materialize_config_or_code_deliverable(
            prompt=last_user_prompt,
            final_text=final_text,
            workspace_dir=WORKSPACE_DIR,
            turn_start_time=start_ts,
        )
        for ta in tech_artifacts_final:
            outbound_payload = json.dumps(
                {"filePath": ta, "fileName": Path(ta).name},
                ensure_ascii=False,
            )
            ta_name = Path(ta).name.lower()
            if outbound_payload not in outbound_files and not any(extract_filename_from_outbound(existing).lower() == ta_name for existing in outbound_files):
                outbound_files.append(outbound_payload)

        # 语义净化：当生成了真实的技术脚本/配置文件且用户并未显式要求 md 时，清除中间草稿（如 *.py.md, *.sh.md）
        user_wants_md = bool(re.search(r"(?:\.md\b|\bmarkdown\b|md\s*文件)", last_user_prompt or "", re.I))
        has_primary_tech = any(
            extract_filename_from_outbound(f).lower().endswith((".py", ".sh", ".sql", ".yml", ".yaml"))
            or extract_filename_from_outbound(f).lower() == "dockerfile"
            for f in outbound_files
        )
        if has_primary_tech and not user_wants_md:
            cleaned_outbounds = []
            for item_str in outbound_files:
                fname = extract_filename_from_outbound(item_str).lower()
                if fname.endswith((".py.md", ".sh.md", ".sql.md")) or (fname.endswith(".md") and fname in ("result.md", "script.md")):
                    continue
                cleaned_outbounds.append(item_str)
            outbound_files = cleaned_outbounds

    # 终态物理交付物断言：若用户要求了特定文件但全流程仍未生成任何外发物理文件，进行明确诚信提示
    if not is_text_only_request(last_user_prompt) and (expected_deliverables or is_generate_intent):
        missing_final = detect_missing_requested_deliverable(
            last_user_prompt,
            start_ts,
            expected_deliverables=expected_deliverables,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent,
        )
        if missing_final and not outbound_files:
            telemetry.record_guard("deliverable_contract", "reject", f"missing_physical_file_{missing_final}")
            warning_notice = (
                f"\n\n---\n"
                f"⚠️ **【交付物落盘未完成提示】**：已为您完成前序数据核算与内容整理，但在沙箱规定轮次内未能在工作区生成目标物理文件（`{missing_final}`）。"
                f"您可参考上方核算结果，或发送指令「请直接运行脚本生成该文件」继续完成落盘。"
            )
            if "【交付物落盘未完成提示】" not in final_text:
                final_text += warning_notice

    return AgentLoopResult(
        final_text=final_text,
        outbound_files=outbound_files,
        outbound_reminders=outbound_reminders,
        telemetry=telemetry,
        messages=messages,
        execution_evidence=execution_evidence
    )
