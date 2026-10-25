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
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

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
    find_invalid_new_workbooks,
    materialize_in_loop_deliverables,
    materialize_post_loop_deliverables,
)


MAX_AGENT_ROUNDS_HARD_CEILING = int(os.getenv("DSH_MAX_AGENT_ROUNDS_CEILING", "24"))
MAX_SPREADSHEET_ROUNDS_CEILING = 4


def extract_filename_from_outbound(item: str) -> str:
    try:
        obj = json.loads(item)
        if isinstance(obj, dict) and "fileName" in obj:
            return obj["fileName"]
    except Exception:
        pass
    return Path(item).name


def detect_missing_claimed_artifacts(*args, **kwargs):
    from .deliverable_detection import detect_missing_claimed_artifacts as detect
    return detect(*args, **kwargs, workspace=WORKSPACE_DIR, knowledge=KNOWLEDGE_DIR)


def detect_missing_requested_deliverable(*args, **kwargs):
    from .deliverable_detection import detect_missing_requested_deliverable as detect
    return detect(*args, **kwargs, workspace=WORKSPACE_DIR)



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
    consecutive_comparison_errors: int = 0,
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
    has_update_tools_effective = bool(
        effective_tools and any(
            (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
            for t in effective_tools
        )
    )
    has_plan_succeeded = bool(
        (executed_calls_history and any(
            call.startswith("plan_spreadsheet_update:") and not call.startswith("err:")
            for call in executed_calls_history
        )) or (execution_evidence and any(
            getattr(e, "is_success", False) and (
                (getattr(e, "provenance", None) or {}).get("tool") == "plan_spreadsheet_update"
                or (isinstance(getattr(e, "data", None), dict) and e.data.get("status") == "planned")
            )
            for e in execution_evidence
        ))
    )
    has_update_published = bool(
        execution_evidence and any(
            getattr(e, "is_success", False) and (
                (getattr(e, "provenance", None) or {}).get("tool") == "execute_spreadsheet_update"
                or (isinstance(getattr(e, "data", None), dict) and e.data.get("status") == "published")
            )
            for e in execution_evidence
        )
    )
    planned_run_id = None
    if execution_evidence:
        for e in reversed(execution_evidence):
            if getattr(e, "is_success", False) and isinstance(getattr(e, "data", None), dict):
                if e.data.get("status") == "planned" and ("plan_id" in e.data or "run_id" in e.data):
                    planned_run_id = e.data.get("plan_id") or e.data.get("run_id")
                    break
                elif ("run_id" in e.data or "plan_id" in e.data) and "plan" in e.data:
                    planned_run_id = e.data.get("plan_id") or e.data.get("run_id")
                    break

    # 强制执行已锁定的表格更新计划：若更新计划已成功生成但尚未落盘，坚决不允许因轮次耗尽或口头汇报而终止
    if has_update_tools_effective and has_plan_succeeded and not has_update_published:
        print("⚡ [Harness Spreadsheet Execution Guard] 检测到更新计划已锁定但未调用 execute_spreadsheet_update，正在强制推进执行...", flush=True)
        run_arg = f"(plan_id='{planned_run_id}')" if planned_run_id else ""
        msg = (
            f"【系统表格更新强制执行指令】：检测到更新计划已成功锁定（plan_id='{planned_run_id}'），但物理文件尚未生成落盘！"
            f"用户要求的是直接生成/交付更新后的表格文件，绝不能在此中断向用户索要二次确认。"
            f"请立即通过 Function Calling 协议调用 `execute_spreadsheet_update{run_arg}` 完成物理更新与文件交付！"
        )
        return "continue", msg, max(hard_ceiling or 10, round_idx + 3)

    if hard_ceiling is None:
        hard_ceiling = (
            MAX_SPREADSHEET_ROUNDS_CEILING
            if (is_inspect_intent and not is_generate_intent and not expected_deliverables and not has_update_tools_effective)
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
                new_max = min(hard_ceiling, max_rounds + 1) if round_idx >= max_rounds - 1 else max_rounds
                return "continue", validation.feedback_message, new_max
        return "pass", None, max_rounds

    bumped_max_rounds = min(hard_ceiling, max_rounds + 1)

    has_update_tools = has_update_tools_effective

    # 0. 内部计划与伪工具调用拦截：模型仅输出未执行的计划草稿时引导执行
    if not is_guide_intent and is_internal_plan_output(reply_text):
        print("⚡ [Harness Plan Guard] 检测到内部执行草稿，正在引导模型调用工具或输出最终结果...", flush=True)
        msg = (
            "检测到当前输出仍为内部执行计划或草稿。若需进一步操作请发起对应工具调用；"
            "若任务已完成，请直接输出最终的中文结论。"
        )
        return "continue", msg, bumped_max_rounds

    # 0.5 已生成 Excel 交付物的数据与公式门禁：若已落盘的新 .xlsx/.xlsm 未通过源数据一致性或公式核验，立即给出具体差异促使其修正
    invalid_workbooks = find_invalid_new_workbooks(WORKSPACE_DIR, start_ts)
    if invalid_workbooks:
        details = "；".join(
            f"{fname}（{'；'.join(issues[:4])}）" for fname, issues in invalid_workbooks
        )
        print(f"⚡ [Harness Workbook Grounding Guard] 检测到生成的 Excel 存在源数据或公式不一致: {details}", flush=True)
        msg = (
            f"【系统 Excel 数据与公式核验拦截】：检测到你本轮生成的 Excel 文件未通过源表数据一致性或公式校验：\n"
            f"- {details}\n"
            "严禁猜测或手工硬编码未求值的公式结果！请立即根据上述真实源表数值修正生成脚本，重新生成正确的 Excel 文件并在正文中同步输出准确数值。"
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
            try:
                from .delivery_claim_judge import judge_delivery_claims
                verdict = judge_delivery_claims(
                    prompt=last_user_prompt,
                    reply_text=reply_text,
                    candidate_missing=missing,
                    workspace_dir=WORKSPACE_DIR,
                    turn_start_time=start_ts,
                    model=model,
                    deadline=deadline
                )
                if verdict and not verdict.get("phantom_claim"):
                    missing = []
                elif verdict and isinstance(verdict.get("missing_items"), list):
                    missing = [str(x) for x in verdict["missing_items"] if x]
            except Exception:
                pass
        if missing:
            print(f"⚡ [Harness Artifact Assertion Guard] 检测到模型声称生成了文件 {missing}，但物理文件并不存在，正在拦截引导落盘...", flush=True)
            has_html_in_missing = any(f.endswith(".html") or f.endswith(".htm") for f in missing)
            code_block_hint = "，或者直接在回复中以完整的代码块（如 ```html\\n<!DOCTYPE html>...\\n```）输出全部源码" if has_html_in_missing else ""

            if has_bash:
                msg = (
                    f"【系统产物物理断言拦截】：你在回复中提及已生成或保存文件 {', '.join(missing)}，但当前沙箱物理文件并不存在{code_block_hint and '，且未在回复中提供完整代码块' or ''}。"
                    f"请立即调用 bash 执行代码将目标文件保存到 /workspace/ 路径下{code_block_hint}。严禁仅做口头汇报！"
                )
            elif has_update_tools and any(f.lower().endswith((".xlsx", ".xlsm")) for f in missing):
                if has_plan_succeeded:
                    run_arg = "(plan_id=上一步返回的计划ID)" if planned_run_id else ""
                    msg = (
                        f"【系统表格更新物理断言拦截】：更新计划已就绪，但物理文件尚未生成。"
                        f"请立即通过 Function Calling 协议调用 `execute_spreadsheet_update{run_arg}` 执行更新落盘！切勿仅做口头汇报！"
                    )
                else:
                    msg = (
                        f"【系统表格更新物理断言拦截】：你在回复中提及已生成或更新文件 {', '.join(missing)}，但当前工作区物理文件并不存在。"
                        f"请通过 Function Calling 协议调用 `plan_spreadsheet_update` 锁定更新计划，并调用 `execute_spreadsheet_update` 执行物理更新落盘！切勿仅做口头汇报！"
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
                    has_update_tools = bool(
                        effective_tools and any(
                            (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
                            for t in effective_tools
                        )
                    )
                    if has_update_tools and missing_deliverable in [".xlsx", ".xlsm"]:
                        if has_plan_succeeded:
                            run_arg = "(plan_id=上一步返回的计划ID)" if planned_run_id else ""
                            msg = (
                                f"【系统表格更新交付提示】：检测到更新计划已锁定，但尚未执行物理落盘。"
                                f"请立即调用 `execute_spreadsheet_update{run_arg}` 完成更新并交付！"
                            )
                        else:
                            msg = (
                                f"【系统表格更新交付提示】：检测到用户要求更新/交付 {missing_deliverable} 表格文件，当前工作区中尚未检测到更新后的物理产物。"
                                f"请通过 Function Calling 协议调用 `plan_spreadsheet_update` 规划复制与回填，并调用 `execute_spreadsheet_update` 执行落盘交付！"
                            )
                    else:
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

    reminder_delete_claims = [
        "已为您处理并取消", "已取消", "已成功取消", "已为您取消", "已删除提醒", "已为您删除", "已成功删除",
        "已停止执行，之后每日均不再触发", "已移除提醒", "已清空提醒"
    ]
    has_delete_claim = any(c in reply_text for c in reminder_delete_claims)
    is_delete_intent = bool(re.search(r'(?:删除|取消|关掉|关闭|清空|移除|撤销|停用|废弃|去掉|delete|cancel|remove)', last_user_prompt, re.I))
    has_executed_delete = any("delete_reminder" in call or "delete_reminders" in call for call in executed)
    if is_delete_intent and has_delete_claim and not has_executed_delete:
        print("⚡ [Harness Reminder Delete Guard] 检测到模型口头声称已取消/删除提醒但未调用 delete_reminder 工具，正在引导调用工具...", flush=True)
        msg = (
            "【系统提醒检查】：检测到口头声称已取消或删除提醒，但沙箱中并未实际调用 `delete_reminder` 工具。"
            "口头宣称已取消无法在系统数据库中生效，后台仍会继续按原计划推送！请立即通过 Function Calling 协议调用 `delete_reminder` 工具执行删除。"
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
                # 落地1与落地3：若专用工具连续受限（consecutive_comparison_errors >= 2）或者轮次预算已耗尽，
                # 不再死循环拦截打回，而是放行由收尾逻辑追加软性提示
                if consecutive_comparison_errors >= 2 or round_idx >= max_rounds - 1 or (hard_ceiling and round_idx >= hard_ceiling - 1):
                    return "pass", "", max_rounds
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


from .workbook_delivery_recalc import recalculate_generated_workbooks as _recalculate_generated_workbooks


def _finalize_agent_text(*args, **kwargs) -> Tuple[str, List[str]]:
    """Compatibility entry point; final presentation lives outside the loop."""
    from .final_answer import finalize_agent_text
    return finalize_agent_text(
        *args, **kwargs, call_model=call_model_proxy, workspace_dir=WORKSPACE_DIR,
        max_agent_rounds=MAX_AGENT_ROUNDS_HARD_CEILING,
        max_spreadsheet_rounds=MAX_SPREADSHEET_ROUNDS_CEILING,
    )


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
    initial_execution_evidence: Optional[List[ToolResult]] = None,
    user_prompt: Optional[str] = None,
    user_declarations: Optional[Dict[str, Any]] = None,
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
    from .spreadsheet_update.tools import reset_turn_results
    reset_turn_results()
    from .user_declarations import bind_user_declarations
    declaration = bind_user_declarations(user_declarations)
    if declaration:
        telemetry.record_guard('user_unit_confirmation', 'accept', declaration)
    last_user_prompt = user_prompt if user_prompt is not None else _extract_last_user_prompt(messages)
    analysis_turn=AnalysisTurn(last_user_prompt,model=model,deadline=deadline) if spreadsheet_analysis_required else None
    from .bounded_summary_recovery import SummaryRecovery
    summary_recovery = SummaryRecovery(last_user_prompt, WORKSPACE_DIR, deadline,
        enabled=not is_guide_intent and (spreadsheet_analysis_required or (is_generate_intent and bool(re.search(r'xlsx|Excel', last_user_prompt, re.I)))))
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

    has_active_update_tools = any(
        (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
        for t in active_tools
    )
    from .intent_contract import is_modify_intent_requested
    from .task_intent import is_spreadsheet_mutation_requested
    from .spreadsheet_update.routing import is_custom_workbook_or_row_edit
    is_update_req = (
        (is_modify_intent_requested(last_user_prompt) or is_spreadsheet_mutation_requested(last_user_prompt))
        and not is_custom_workbook_or_row_edit(last_user_prompt)
    )

    if is_update_req and has_active_update_tools and not is_guide_intent:
        from .spreadsheet_update.agent_protocol import select_update_tools, UPDATE_INSTRUCTIONS
        active_tools = select_update_tools(active_tools)
        messages.insert(0, {'role':'system', 'content':UPDATE_INSTRUCTIONS})
    elif spreadsheet_analysis_required:
        active_tools = select_analysis_tools(active_tools, last_user_prompt)
        messages[0]["content"] = str(messages[0].get("content") or "") + ANALYSIS_INSTRUCTIONS + domain_plan_context(last_user_prompt)

    requirements = build_analysis_plan_context(last_user_prompt) if is_inspect_intent and not is_guide_intent else ""
    if requirements:
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = str(messages[0].get("content") or "") + requirements
        else:
            messages.insert(0, {"role": "system", "content": requirements})
    execution_evidence: List[ToolResult] = list(initial_execution_evidence or [])
    guard_nudges_count = 0
    force_tool_choice = False
    is_pure_spreadsheet_or_inspect = (
        (spreadsheet_analysis_required and not (is_update_req and has_active_update_tools))
        or comparison_required
        or (is_inspect_intent and not is_generate_intent and not expected_deliverables and not (is_update_req and has_active_update_tools))
    )
    task_ceiling = MAX_SPREADSHEET_ROUNDS_CEILING if is_pure_spreadsheet_or_inspect else MAX_AGENT_ROUNDS_HARD_CEILING
    max_rounds = min(max_rounds, task_ceiling)

    round_idx = 0
    consecutive_tool_errors = 0
    consecutive_comparison_errors = 0
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
            # A spreadsheet model may ask a valid question before computing.
            # The evidence gate checks assertions after its choice; forcing a
            # tool call here would remove the right to clarify.
            tool_choice="required" if (
                (force_tool_choice and active_tools)
                or (active_tools and comparison_required and consecutive_comparison_errors < 2 and compile_comparison_response(comparison_contract, execution_evidence)[0] is None)
            ) else None
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

        if structured_calls:
            force_tool_choice = False

        # 若当轮无任何工具调用
        if not structured_calls:
            if summary_recovery.apply(execution_evidence, telemetry, outbound_files):
                spreadsheet_analysis_required = True
                analysis_turn = AnalysisTurn(last_user_prompt,model=model,deadline=deadline)
                break
            if comparison_required and consecutive_comparison_errors < 2:
                compiled, error = compile_comparison_response(comparison_contract, execution_evidence)
                telemetry.record_guard('comparison_evidence', 'reject' if error else 'accept', error)
                if error and round_idx < task_ceiling - 1:
                    max_rounds = min(task_ceiling, max_rounds+1)
                    messages.append({'role':'assistant', 'content':reply_text})
                    messages.append({'role':'user', 'content':'【系统比较证据验收】：'+error+COMPARISON_DELIVERY_INSTRUCTIONS})
                    round_idx += 1
                    continue
                break
            # 独立表格更新完成门禁：凡任务明确要求更新工作簿/工作表并配备更新工具，必须具备更新执行回执
            from .intent_contract import is_modify_intent_requested
            from .task_intent import is_spreadsheet_mutation_requested
            is_update_req = (
                is_modify_intent_requested(last_user_prompt)
                or is_spreadsheet_mutation_requested(last_user_prompt)
            )
            has_update_tools = bool(
                active_tools and any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
                    for t in active_tools
                )
            )
            has_exec_update_tool = bool(
                active_tools and any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() == "execute_spreadsheet_update"
                    for t in active_tools
                )
            )
            if is_update_req and has_update_tools and not is_guide_intent:
                if not has_exec_update_tool:
                    # 只读规划/预览模式：当前环境未提供 execute_spreadsheet_update 写盘工具，允许生成计划并向用户呈现预览，严禁索要不可用工具触发死锁
                    pass
                else:
                    has_update_exec = any(
                        getattr(e, 'is_success', False)
                        and isinstance(getattr(e, 'data', None), dict)
                        and e.data.get('status') == 'published'
                        and e.data.get('published_file')
                        and (Path(e.data['published_file']).exists() or (Path(WORKSPACE_DIR) / Path(e.data['published_file']).name).exists())
                        for e in execution_evidence
                    )
                    if has_update_exec:
                        if telemetry:
                            telemetry.record_guard("spreadsheet_update_evidence", "accept", "published_verified")
                    else:
                        planned_ev = next(
                            (e for e in execution_evidence if getattr(e, 'is_success', False) and (
                                getattr(e, 'name', '') == 'plan_spreadsheet_update' or (getattr(e, 'provenance', None) or {}).get('tool') == 'plan_spreadsheet_update'
                            ) and isinstance(getattr(e, 'data', None), dict) and getattr(e, 'data', {}).get('plan_id')),
                            None
                        )
                        if planned_ev:
                            p_data = planned_ev.data
                            p_id = p_data.get('plan_id')
                            p_hash = p_data.get('plan_hash')
                            r_id = p_data.get('run_id')
                            update_err = (
                                f"检测到你已成功锁定更新计划 (Plan ID: {p_id})，但尚未执行物理写盘与公式重算！\n"
                                f"严禁在此停顿输出文字，目标文件尚未真正写入物理磁盘。请立即发起工具调用：\n"
                                f"`execute_spreadsheet_update(plan_id='{p_id}')`\n"
                                f"只有该工具执行成功后新表格才会真正落盘完成交付！"
                            )
                        else:
                            update_err = (
                                "检测到任务明确要求更新工作簿/工作表并回填数据，当前仅输出了分析文本，尚未完成物理写盘！"
                                "严禁在此停顿输出文字，必须立即调用工具完成物理写盘落盘：\n"
                                "- 方式一（专有工具，推荐）：直接调用 `plan_spreadsheet_update` 提交更新意图（如：target_file、period、section、target_kind、target_unit），计划锁定后紧接着调用 `execute_spreadsheet_update` 写盘；\n"
                                "只按工具返回的具体错误修正参数；目标不明确时说明需要的信息。\n"
                                "请立即发起工具调用执行写盘！"
                            )
                        telemetry.record_guard("spreadsheet_update_evidence", "reject", update_err)
                        if round_idx < task_ceiling - 1:
                            max_rounds = min(task_ceiling, max_rounds + 1)
                            force_tool_choice = True
                        messages.append({"role": "assistant", "content": reply_text})
                        messages.append({"role": "user", "content": f"【系统表格更新门禁拦截】：{update_err}"})
                        round_idx += 1
                        continue

            if spreadsheet_analysis_required:
                if analysis_turn.is_clarification(execution_evidence, reply_text):
                    telemetry.record_guard("spreadsheet_evidence", "accept", "clarification_requested")
                    break
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
            script_execution_error = materialize_in_loop_deliverables(
                last_user_prompt=last_user_prompt,
                reply_text=reply_text,
                workspace_dir=WORKSPACE_DIR,
                start_ts=start_ts,
                expected_deliverables=expected_deliverables,
                outbound_files=outbound_files,
                executed_calls_history=executed_calls_history,
            )

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
                consecutive_comparison_errors=consecutive_comparison_errors,
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

        if execution_evidence and execution_evidence[-1].is_error:
            consecutive_tool_errors += 1
            last_tool = (execution_evidence[-1].provenance or {}).get("tool") or ""
            if last_tool in ("compare_spreadsheet_columns", "aggregate_spreadsheet", "analyze_spreadsheet", "check_spreadsheet_equations", "validate_spreadsheet_rows", "plan_spreadsheet_update"):
                consecutive_comparison_errors += 1
                if consecutive_comparison_errors >= 2:
                    if not any((t.get("function", {}).get("name") or t.get("name", "")) == "bash" for t in active_tools):
                        active_tools.extend(get_sandbox_tools(allowed_names={"bash"}))
                    if messages and messages[-1].get("role") == "tool":
                        fallback_hint = "\n\n【系统指导】专用比对工具受限，请立即编写 Python 脚本提取数据进行计算（使用 bash 运行 python3 脚本），发挥沙箱的原生代码执行优势。"
                        if fallback_hint not in messages[-1].get("content", ""):
                            messages[-1]["content"] = messages[-1].get("content", "") + fallback_hint
        elif execution_evidence and execution_evidence[-1].is_success:
            consecutive_tool_errors = 0
            last_tool = (execution_evidence[-1].provenance or {}).get("tool") or ""
            if last_tool in ("compare_spreadsheet_columns", "aggregate_spreadsheet", "analyze_spreadsheet", "check_spreadsheet_equations", "validate_spreadsheet_rows", "plan_spreadsheet_update"):
                consecutive_comparison_errors = 0

        max_consecutive_errors = int(os.getenv("DSH_MAX_CONSECUTIVE_TOOL_ERRORS", "8"))
        if consecutive_tool_errors >= max_consecutive_errors:
            print(f"⚠️ [Harness Stagnation Guard] 工具连续出现 {consecutive_tool_errors} 次执行错误且未能恢复，主动终止避免死循环", flush=True)
            break

        if execution_evidence:
            latest = execution_evidence[-1]
            if (isinstance(latest.data, dict) and latest.data.get('status') == 'needs_input'
                    and (latest.provenance or {}).get('tool') == 'plan_spreadsheet_update'):
                telemetry.record_guard('spreadsheet_update_binding', 'needs_input', latest.data['question'])
                return AgentLoopResult(final_text=latest.data['question'], telemetry=telemetry,
                                       messages=messages, execution_evidence=execution_evidence)

        # 仅在当轮尚未产生有效分析事实时，才尝试兜底恢复；严禁覆盖主模型已成功完成的分析回执
        has_completed_analysis = bool(execution_evidence and any(
            getattr(r, 'is_success', False) and isinstance(getattr(r, 'data', None), dict) and r.data.get('facts')
            for r in execution_evidence
        ))
        if not has_completed_analysis and summary_recovery.apply(execution_evidence, telemetry, outbound_files):
            spreadsheet_analysis_required = True
            analysis_turn = AnalysisTurn(last_user_prompt,model=model,deadline=deadline)
            break

        if analysis_turn:
            completed=analysis_turn.complete(execution_evidence,telemetry,
                [t.get('function',{}).get('name') for t in active_tools],deadline)
            if analysis_turn.may_finish(execution_evidence):
                if structured_calls:
                    reply_text = ""
                break
            max_rounds=analysis_turn.extend_repair_budget(
                execution_evidence,round_idx,max_rounds,task_ceiling,telemetry)
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

        if (spreadsheet_analysis_required or comparison_required or has_active_update_tools) and execution_evidence and execution_evidence[-1].is_error:
            if consecutive_tool_errors < 5:
                max_rounds = min(task_ceiling, max(max_rounds, round_idx + 2))

        # 动态推进预算：只要任务需要生成物理交付物且尚未落盘，或者工具调用成功推进了业务证据，
        # 且轮次临近上限时，动态追加执行轮次预算（最高至 task_ceiling），避免被固定硬轮次截断
        is_making_progress = bool(
            consecutive_tool_errors < 5 and (
                (has_active_update_tools and any(getattr(r, 'is_success', False) for r in (execution_evidence or [])))
                or (execution_evidence and execution_evidence[-1].is_success)
            )
        )
        if (expected_deliverables or is_generate_intent or is_making_progress) and round_idx >= max_rounds - 2 and round_idx < task_ceiling - 1:
            missing_deliv = detect_missing_requested_deliverable(
                last_user_prompt, start_ts,
                expected_deliverables=expected_deliverables,
                is_generate_intent=is_generate_intent,
                is_inspect_intent=is_inspect_intent
            )
            has_update_pending = (has_active_update_tools and not any(
                r.is_success and getattr(r.data, 'get', lambda k: None)('published_file')
                for r in (execution_evidence or []) if isinstance(getattr(r, 'data', None), dict)
            ))
            if missing_deliv or has_update_pending or is_making_progress:
                max_rounds = min(task_ceiling, max(max_rounds, round_idx + 3))
                print(f"⚡ [Harness Dynamic Budget] 检测到任务持续推进中，动态追加执行轮次至 {max_rounds} (硬上限: {task_ceiling})...", flush=True)
                has_update_tools_active = any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("plan_spreadsheet_update", "execute_spreadsheet_update")
                    for t in active_tools
                )
                has_bash_active = any(
                    (t.get("function", {}).get("name") or t.get("name", "")).lower() in ("bash", "cmd", "terminal", "sh", "exec")
                    for t in active_tools
                )
                if has_update_tools_active and (missing_deliv in [".xlsx", ".xlsm"] or has_update_pending):
                    nudge_msg = f"【系统阶段督促】：当前轮次临近上限，但目标交付物尚未生成落盘。请调用 `plan_spreadsheet_update` 规划并调用 `execute_spreadsheet_update` 执行落盘！"
                elif has_bash_active and missing_deliv:
                    nudge_msg = f"【系统阶段督促】：当前轮次临近上限，但目标交付物 {missing_deliv} 尚未生成落盘。请立即停止零散查看或临时测试，通过 bash 运行最终 Python/处理脚本将完整数据与图表直接写入 /workspace/ 目标文件！"
                else:
                    nudge_msg = f"【系统阶段督促】：当前轮次临近上限，请基于已有执行证据抓紧完成最终操作或给出明确结论。"
                if round_idx >= max_rounds - 2:
                    messages.append({
                        "role": "user",
                        "content": nudge_msg
                    })

        # 当前轮次已执行工具，重置 reply_text，防止内部工具前置垫话或执行脚本残留进入最终回复
        # 但在重置前，若当前轮次伴随工具调用输出了完整 HTML 代码块或未执行的脚本/命令，执行自愈落盘
        if reply_text and ("```html" in reply_text.lower() or "cat" in reply_text or "write_file" in reply_text):
            try:
                from .agent_loop_helpers import auto_heal_unexecuted_file_writes
                _, mid_healed = auto_heal_unexecuted_file_writes(reply_text, WORKSPACE_DIR)
                if mid_healed:
                    print(f"✨ [Harness Auto-Heal] 工具轮次中成功自愈落盘产物: {mid_healed}", flush=True)
                m_mid_html = re.search(r'```html\s*\n(<!DOCTYPE html[\s\S]*?</html>)\s*```', reply_text, re.I)
                if not m_mid_html:
                    m_mid_html = re.search(r'```html\s*\n(<html[\s\S]*?</html>)\s*```', reply_text, re.I)
                if m_mid_html:
                    h_code = m_mid_html.group(1).strip()
                    if len(h_code) > 150:
                        out_html = Path(WORKSPACE_DIR) / "index.html"
                        out_html.write_text(h_code, encoding="utf-8")
                        print(f"✨ [Harness Auto-Heal] 工具轮次中成功物化 HTML 代码块至工作区: {out_html}", flush=True)
            except Exception as e:
                print(f"⚠️ [Harness Auto-Heal] 工具轮次物化产物异常: {e}", flush=True)

        reply_text = ""

        if is_file_sent:
            messages.append({
                "role": "user",
                "content": "文件已成功标记并推送至即时通讯通道。请直接回复用户告知文件已发送，并简要概述核心结论或关键统计数值（无需再调用任何其他工具）。"
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

    compiled_comparison = None
    if comparison_required:
        if consecutive_comparison_errors >= 2 and reply_text and len(reply_text.strip()) > 10 and not detect_unexecuted_script_leak(reply_text):
            soft_tip = "\n\n---\n💡 **提示**：本结论由模型直接解读与呈现，未完全通过结构化列比对回执（专用比对工具连续校验受限，已自动退避至通用计算）。"
            compiled_comparison = reply_text.strip() + soft_tip
        else:
            compiled, error = compile_comparison_response(comparison_contract, execution_evidence)
            telemetry.record_guard('comparison_evidence', 'reject' if error else 'accept', error)
            if compiled:
                compiled_comparison = compiled
            else:
                # 降级处理：仅在模型实际进行了工具调用/证据探索后（有执行证据或工具调用历史），才执行软性角标降级；
                # 若模型完全未调用任何工具凭空口算（0工具调用），仍按规则拦截虚假口算。
                has_tool_execution = bool(executed_calls_history or execution_evidence)
                has_substantive_reply = bool(
                    has_tool_execution and reply_text and len(reply_text.strip()) > 10
                    and "指标核算未完成声明" not in reply_text
                    and not detect_unexecuted_script_leak(reply_text)
                )
                successful_receipts = [
                    r for r in (execution_evidence or [])
                    if getattr(r, "is_success", False) and getattr(r, "data", {}).get("kind") == "column_comparison"
                ]
                soft_tip = f"\n\n---\n💡 **提示**：本结论由模型直接解读与呈现，未完全通过结构化列比对回执（{error or '数据对齐存在轻微瑕疵'}）。"
                if has_substantive_reply:
                    compiled_comparison = reply_text.strip() + soft_tip
                elif successful_receipts:
                    from .report_presentation import comparison_overview
                    compiled_comparison = comparison_overview(successful_receipts) + soft_tip
                else:
                    from .analysis_validation import ContractValidationResult, build_contract_termination_warning
                    val_result = ContractValidationResult(
                        status="failed",
                        satisfied_metrics=[],
                        missing_metrics=[m.name for m in comparison_contract.metrics] if comparison_contract.metrics else [],
                        comparison_error=error
                    )
                    contract_warning = build_contract_termination_warning(
                        contract=comparison_contract,
                        val_result=val_result,
                        messages=messages,
                        telemetry=telemetry,
                        is_budget_exhausted=True
                    )
                    compiled_comparison = "本次比较结论尚未通过执行证据核验。" + contract_warning

    final_text, healed_files = ((compiled_comparison, [])
        if comparison_required and compiled_comparison else (analysis_turn.render(execution_evidence,reply_text,telemetry,policy=policy,model=model,deadline=deadline), [])
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
        execution_evidence=execution_evidence,
        turn_start_time=start_ts
    ))
    if requests_markdown_artifact(last_user_prompt):
        final_text = unwrap_outer_markdown_fence(final_text)
    for hf in healed_files:
        if hf not in outbound_files:
            outbound_files.append(hf)

    outbound_files = materialize_post_loop_deliverables(
        last_user_prompt=last_user_prompt,
        final_text=final_text,
        workspace_dir=WORKSPACE_DIR,
        start_ts=start_ts,
        expected_deliverables=expected_deliverables,
        outbound_files=outbound_files,
    )

    # 交付前对本轮生成/导出的带公式 Excel 进行无头重算以补齐缓存值
    _recalculate_generated_workbooks(WORKSPACE_DIR, turn_start_time=start_ts)

    from .workbook_delivery import quarantine_invalid_deliverables
    final_text, outbound_files, rejected = quarantine_invalid_deliverables(
        WORKSPACE_DIR, start_ts, final_text, outbound_files)
    if rejected:
        telemetry.record_guard("workbook_delivery", "reject", rejected)
    else:
        from .deliverable_detection import is_new_deliverable
        ws_root = Path(WORKSPACE_DIR)
        has_valid_xlsx = any(
            extract_filename_from_outbound(f).lower().endswith((".xlsx", ".xlsm"))
            for f in outbound_files
        ) or (
            ws_root.is_dir() and any(
                p.suffix.lower() in (".xlsx", ".xlsm") and is_new_deliverable(p, start_ts)
                for p in ws_root.iterdir() if p.is_file() and not p.name.startswith(".")
            )
        )
        if has_valid_xlsx:
            telemetry.record_guard("workbook_delivery", "accept", "verified_workbook_deliverable")

    # 终态物理交付物断言：若用户要求了特定文件但全流程仍未生成任何外发物理文件（且非被 workbook_delivery 拦截的错误文件），进行明确诚信提示
    if not rejected and not is_text_only_request(last_user_prompt) and (expected_deliverables or is_generate_intent):
        missing_final = detect_missing_requested_deliverable(
            last_user_prompt,
            start_ts,
            expected_deliverables=expected_deliverables,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent,
        )
        if missing_final and not outbound_files:
            telemetry.record_guard("deliverable_contract", "reject", f"missing_physical_file_{missing_final}")
            has_planned_update = any(
                getattr(ev, "is_success", False)
                and isinstance(getattr(ev, "data", None), dict)
                and ev.data.get("status") == "planned"
                for ev in (execution_evidence or [])
            )
            already_disclosed = bool(re.search(
                r"尚未生成|未生成|未能生成|无法生成|未完成物理落盘|【重要提示：目标交付物尚未生成落盘】|【交付物落盘未完成提示】|⚠️",
                final_text or "",
            ))
            if has_planned_update:
                warning_notice = (
                    f"> ⚠️ **【重要提示：目标交付物尚未生成落盘】**\n"
                    f"> 本轮已完成前序数据核算与方案规划，但目标文件（`{missing_final}`）未在沙箱内完成物理落盘。\n"
                    f"> **下一步操作**：您可直接回复 **「继续执行更新并生成表格」** 立即完成文件生成与交付。\n\n---\n\n"
                )
                if not already_disclosed:
                    final_text = warning_notice + final_text
            elif not already_disclosed:
                warning_notice = (
                    f"> ⚠️ **【重要提示：目标交付物尚未生成落盘】**\n"
                    f"> 目标文件（`{missing_final}`）尚未在沙箱内完成物理落盘，请根据下方说明补充条件或重试生成。\n\n---\n\n"
                )
                final_text = warning_notice + final_text

    try:
        from .delivery_reconciliation import reconcile_delivery_presentation
        final_text = reconcile_delivery_presentation(
            final_text,
            WORKSPACE_DIR,
            messages=messages,
            prompt=last_user_prompt,
            turn_start_time=start_ts
        )
    except Exception as e:
        logger.warning("Delivery reconciliation error in agent loop: %s", e)

    # Final success claims must be checked even when intent routing or nudge budgets skipped guards.
    missing_claims = [] if (rejected and not outbound_files) else detect_missing_claimed_artifacts(
        final_text, is_generate_intent=True, turn_start_time=start_ts, verify_claims_only=True)
    if missing_claims:
        try:
            from .delivery_claim_judge import judge_delivery_claims
            verdict = judge_delivery_claims(
                prompt=last_user_prompt,
                reply_text=final_text,
                candidate_missing=missing_claims,
                workspace_dir=WORKSPACE_DIR,
                turn_start_time=start_ts,
                model=model,
                deadline=deadline
            )
            if verdict and not verdict.get("phantom_claim"):
                logger.info("DeliveryClaimJudge dismissed missing claims %s: %s", missing_claims, verdict.get("reason"))
                missing_claims = []
            elif verdict and isinstance(verdict.get("missing_items"), list):
                missing_claims = [str(x) for x in verdict["missing_items"] if x]
        except Exception as e:
            logger.warning("DeliveryClaimJudge error in terminal verification: %s", e)

    if missing_claims:
        telemetry.record_guard("artifact_delivery", "reject", {"missing_files": missing_claims})
        final_text = "本次文件生成未完成，以下文件尚未生成可用的交付版本：" + "、".join(
            f"`{name}`" for name in missing_claims) + "。当前无法提供这些文件的下载。"

    return AgentLoopResult(
        final_text=final_text,
        outbound_files=outbound_files,
        outbound_reminders=outbound_reminders,
        telemetry=telemetry,
        messages=messages,
        execution_evidence=execution_evidence
    )
