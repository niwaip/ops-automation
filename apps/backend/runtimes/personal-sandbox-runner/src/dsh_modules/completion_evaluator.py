"""
Completion Evaluator and Unified Office Task Acceptance.
Implements multi-dimensional acceptance (Calculation, Deliverables/Artifacts, and Compliance)
as an exit barrier, decoupling business checks from the lightweight ReAct loop.
"""

from dataclasses import dataclass
import json
import os
import re
import time
from typing import Any, Dict, List, Literal, Optional, Tuple

from .analysis_contract import build_analysis_contract
from .analysis_validation import validate_reply_against_contract
from .deliverable_detection import detect_missing_claimed_artifacts, detect_missing_requested_deliverable
from .action_protocol import (
    is_internal_plan_output,
    has_explicit_reminder_intent,
    detect_retrieval_mismatch_disclaimer,
)
from .agent_loop_helpers import (
    detect_passive_deflection,
    detect_unexecuted_tool_argument_leak,
    find_invalid_new_workbooks,
    is_explicit_code_request,
    is_unclosed_or_truncated_html,
)
from .html_report_fallback import detect_mock_or_placeholder_html
from .llm import is_promising_action, detect_unexecuted_script_leak
from .sampling_guard import sampling_feedback, check_zero_tool_calculation_guard
from .skill_router import is_text_only_request
from .tools import get_sandbox_tools

WORKSPACE_DIR = os.environ.get("WORKSPACE_DIR", "/workspace")
MAX_AGENT_ROUNDS_HARD_CEILING = 24
MAX_SPREADSHEET_ROUNDS_CEILING = 12


@dataclass
class CompletionDecision:
    action: Literal["pass", "continue", "break"]
    guard_msg: Optional[str] = None
    max_rounds: int = 0
    category: str = "pass"
    details: Optional[Dict[str, Any]] = None

    def __iter__(self):
        return iter((self.action, self.guard_msg, self.max_rounds))


def extract_evidence_summary(execution_evidence: List[Any], prompt: Optional[str] = None) -> str:
    """Extracts a concise, structured facts summary for downstream delivery tools to consume."""
    if not execution_evidence:
        return ""

    target_evidence = execution_evidence
    if prompt:
        try:
            from .analysis_fact_selection import authoritative_receipts
            auth = authoritative_receipts(execution_evidence, prompt)
            if auth:
                target_evidence = auth
        except Exception:
            target_evidence = execution_evidence

    # Deduplicate facts: later authoritative runs on the same workbook supersede exploratory ones
    latest_by_wb: Dict[Any, Any] = {}
    for e in target_evidence:
        if getattr(e, "is_success", False) and isinstance(getattr(e, "data", None), dict) and e.data.get("facts"):
            wb_id = (getattr(e, "provenance", None) or {}).get("workbook_id") or id(e)
            latest_by_wb[wb_id] = e

    active_evidence = list(latest_by_wb.values()) if latest_by_wb else [e for e in target_evidence if getattr(e, "is_success", False)]

    facts_dict: Dict[str, str] = {}
    row_summaries: List[str] = []

    for e in active_evidence:
        data = getattr(e, "data", None)
        if isinstance(data, dict):
            facts = data.get("facts") or []
            for f in facts:
                if isinstance(f, dict):
                    lbl = f.get("label") or f.get("metric") or f.get("id")
                    val = f.get("value")
                    unit = f.get("unit") or ""
                    if lbl and val is not None:
                        key = str(f.get("id") or lbl)
                        facts_dict[key] = f"- {lbl}: {val} {unit}".strip()
            rows = data.get("rows")
            if isinstance(rows, list) and rows and len(rows) <= 15:
                row_summaries.append(f"- 聚合明细 ({len(rows)} 组): " + json.dumps(rows, ensure_ascii=False))

    facts_summary = list(facts_dict.values())
    if len(facts_summary) > 12:
        facts_summary = facts_summary[-12:]

    if row_summaries:
        facts_summary.extend(row_summaries[-2:])

    return "\n".join(facts_summary)


def evaluate_tool_execution_turn(
    analysis_turn: Any,
    execution_evidence: List[Any],
    active_tools: List[Dict[str, Any]],
    deadline: Optional[float],
    telemetry: Any,
    has_visual_or_deliverable: bool,
    outbound_files: List[str],
    reply_text: str,
    round_idx: int,
    max_rounds: int,
    task_ceiling: int,
    last_user_prompt: Optional[str] = None,
    expected_deliverables: Optional[List[str]] = None,
    start_ts: Optional[float] = None,
    workspace_dir: Optional[str] = None,
) -> Tuple[bool, Optional[str], int]:
    """
    Evaluates whether tool execution has satisfied the analysis phase and whether
    a multi-phase task needs to transition into the deliverable generation phase.
    Returns:
        (should_finish: bool, transition_prompt: Optional[str], next_max_rounds: int)
    """
    if not analysis_turn:
        return True, None, max_rounds

    try:
        may_finish = analysis_turn.may_finish(execution_evidence, reply_text=reply_text)
    except TypeError:
        may_finish = analysis_turn.may_finish(execution_evidence)
    if not may_finish:
        return False, None, max_rounds

    effective_workspace = workspace_dir or os.environ.get("WORKSPACE_DIR", "/workspace")

    # 1. 物理外发文件实质性核验（必须在磁盘上真实存在且大小 > 0）
    has_physical_outbound = False
    if outbound_files:
        for f in outbound_files:
            p = f if os.path.isabs(f) else os.path.join(effective_workspace, f)
            if os.path.exists(p) and os.path.isfile(p) and os.path.getsize(p) > 0:
                has_physical_outbound = True
                break

    # 2. HTML 交付物实质性核验（不能为截断、空占位或无数据）
    has_valid_html = False
    facts_text = extract_evidence_summary(execution_evidence, prompt=last_user_prompt)
    fact_nums = re.findall(r':\s*([0-9]+(?:\.[0-9]+)?)', facts_text) if facts_text else []

    if reply_text and ("```html" in reply_text.lower() or "<!doctype html" in reply_text.lower()):
        if not is_unclosed_or_truncated_html(reply_text) and not detect_mock_or_placeholder_html(reply_text):
            clean_t = reply_text.lower()
            has_data_structure = bool(
                re.search(r'<(?:table|canvas|svg)\b', clean_t)
                or re.search(r'\b(?:chart|echarts|datasets|data:\s*\[)\b', clean_t)
                or re.search(r'\b\d+(?:\.\d+)?\b', clean_t)
            )
            if has_data_structure:
                if fact_nums and not any(num in reply_text for num in fact_nums):
                    has_valid_html = False
                else:
                    has_valid_html = True

    index_html_path = os.path.join(effective_workspace, "index.html")
    if (os.path.isfile(index_html_path) and os.path.getsize(index_html_path) > 0
            and start_ts is not None and os.path.getmtime(index_html_path) >= start_ts):
        try:
            with open(index_html_path, "r", encoding="utf-8", errors="ignore") as f:
                head_part = f.read(65536)
            if not detect_mock_or_placeholder_html(head_part):
                if fact_nums and not any(num in head_part for num in fact_nums):
                    pass
                else:
                    has_valid_html = True
        except Exception:
            pass

    # 3. 契约交付物缺漏检查
    is_deliverable_satisfied = True
    if last_user_prompt:
        try:
            missing = detect_missing_requested_deliverable(
                last_user_prompt,
                start_ts or 0.0,
                expected_deliverables=expected_deliverables,
                is_generate_intent=True,
                workspace=effective_workspace,
            )
            if missing:
                if missing == ".html" and has_valid_html:
                    is_deliverable_satisfied = True
                else:
                    is_deliverable_satisfied = False
        except Exception:
            pass

    has_delivered = is_deliverable_satisfied and (has_physical_outbound or has_valid_html)

    if has_visual_or_deliverable and not has_delivered:
        new_max = min(task_ceiling, max(max_rounds, round_idx + 2)) if round_idx < task_ceiling - 1 else max_rounds
        facts_text = extract_evidence_summary(execution_evidence, prompt=last_user_prompt)
        facts_block = f"\n【已核验确定性数据事实（供直接绑定，严禁篡改）】\n{facts_text}\n" if facts_text else ""

        transition_msg = (
            "【表格数据核算完成，请执行可视化呈现与交付阶段】\n"
            "内部分析引擎已精准计算出聚合与过滤结果。"
            f"{facts_block}"
            "现在请进入第二阶段：严格使用上述核算得到的事实数据（严禁臆测或篡改数值），"
            "生成符合用户要求的数据看板、HTML 图表或目标交付物。\n"
            "请直接输出完整的 ```html ... ``` 代码块，或调用相关工具生成落地文件。"
        )
        return False, transition_msg, new_max

    return True, None, max_rounds


def evaluate_no_tool_turn(
    reply_text: str,
    last_user_prompt: str,
    round_idx: int,
    max_rounds: int,
    start_ts: float,
    is_guide_intent: bool = False,
    expected_deliverables: Optional[List[str]] = None,
    is_generate_intent: bool = False,
    is_inspect_intent: bool = False,
    executed_calls_history: Optional[List[str]] = None,
    guard_nudges_count: int = 0,
    script_execution_error: Optional[str] = None,
    tools: Optional[List[Dict[str, Any]]] = None,
    messages: Optional[List[Dict[str, Any]]] = None,
    telemetry: Optional[Any] = None,
    execution_evidence: Optional[List[Any]] = None,
    hard_ceiling: Optional[int] = None,
    is_search_intent: bool = False,
    consecutive_comparison_errors: int = 0,
    model: Optional[str] = None,
    deadline: Optional[float] = None,
    workspace_dir: Optional[str] = None,
) -> CompletionDecision:
    """
    Evaluates assertion guards when model returns text without tool calls.
    Returns: CompletionDecision (action: "continue", "break", or "pass")
    """
    effective_workspace = workspace_dir or os.environ.get("WORKSPACE_DIR", "/workspace")
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
    has_execute_update_tool = bool(
        effective_tools and any(
            (t.get("function", {}).get("name") or t.get("name", "")).lower() == "execute_spreadsheet_update"
            for t in effective_tools
        )
    )
    is_preview_only_intent = bool(
        re.search(r"预览|仅.*计划|只.*计划|不.*(执行|写入|保存|修改)|草案|方案", last_user_prompt or "")
    )

    if hard_ceiling is None:
        hard_ceiling = (
            MAX_SPREADSHEET_ROUNDS_CEILING
            if (is_inspect_intent and not is_generate_intent and not expected_deliverables and not has_update_tools_effective)
            else MAX_AGENT_ROUNDS_HARD_CEILING
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

    # 强制执行已锁定的表格更新计划：仅在具备 execute_spreadsheet_update 且非只读预览模式下强制推进
    if has_execute_update_tool and not is_preview_only_intent and has_plan_succeeded and not has_update_published:
        if round_idx >= MAX_AGENT_ROUNDS_HARD_CEILING - 1:
            print("⚠️ [Harness Spreadsheet Execution Guard] 已达硬上限轮次，无法继续追加执行轮次", flush=True)
            return CompletionDecision("break", None, MAX_AGENT_ROUNDS_HARD_CEILING, category="hard_ceiling_reached")

        bumped_budget = min(MAX_AGENT_ROUNDS_HARD_CEILING, max(hard_ceiling or 10, round_idx + 3))
        print("⚡ [Harness Spreadsheet Execution Guard] 检测到更新计划已锁定但未调用 execute_spreadsheet_update，正在强制推进执行...", flush=True)
        run_arg = f"(plan_id='{planned_run_id}')" if planned_run_id else ""
        msg = (
            f"【系统表格更新强制执行指令】：检测到更新计划已成功锁定（plan_id='{planned_run_id}'），但物理文件尚未生成落盘！"
            f"用户要求的是直接生成/交付更新后的表格文件，绝不能在此中断向用户索要二次确认。"
            f"请立即通过 Function Calling 协议调用 `execute_spreadsheet_update{run_arg}` 完成物理更新与文件交付！"
        )
        return CompletionDecision("continue", msg, bumped_budget, category="spreadsheet_update_force")

    max_guard_nudges = 2 if is_generate_intent else 1
    if guard_nudges_count >= max_guard_nudges or round_idx >= hard_ceiling - 1:
        if execution_evidence is not None and round_idx < hard_ceiling - 1:
            validation = validate_reply_against_contract(build_analysis_contract(last_user_prompt),
                reply_text, round_idx, max_rounds, execution_evidence=execution_evidence)
            if validation.comparison_error:
                new_max = min(hard_ceiling, max_rounds + 1) if round_idx >= max_rounds - 1 else max_rounds
                return CompletionDecision("continue", validation.feedback_message, new_max, category="contract_repair")
        return CompletionDecision("pass", None, max_rounds)

    bumped_max_rounds = min(hard_ceiling, max_rounds + 1)

    # 0. 内部计划与伪工具调用拦截
    if not is_guide_intent and is_internal_plan_output(reply_text):
        print("⚡ [Harness Plan Guard] 检测到内部执行草稿，正在引导模型调用工具或输出最终结果...", flush=True)
        msg = (
            "检测到当前输出仍为内部执行计划或草稿。若需进一步操作请发起对应工具调用；"
            "若任务已完成，请直接输出最终的中文结论。"
        )
        return CompletionDecision("continue", msg, bumped_max_rounds, category="internal_plan")

    # 0.5 已生成 Excel 交付物的数据与公式门禁
    invalid_workbooks = find_invalid_new_workbooks(effective_workspace, start_ts)
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
        return CompletionDecision("continue", msg, bumped_max_rounds, category="workbook_grounding")

    # 1. 物理产物声称断言
    if not is_text_only_request(last_user_prompt) and (is_generate_intent or (not is_inspect_intent and not is_guide_intent and not is_search_intent)):
        missing = detect_missing_claimed_artifacts(
            reply_text,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent,
            is_search_intent=is_search_intent,
            turn_start_time=start_ts,
            workspace=effective_workspace,
        )
        if missing:
            try:
                from .delivery_claim_judge import judge_delivery_claims
                verdict = judge_delivery_claims(
                    prompt=last_user_prompt,
                    reply_text=reply_text,
                    candidate_missing=missing,
                    workspace_dir=effective_workspace,
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
            elif has_update_tools_effective and any(f.lower().endswith((".xlsx", ".xlsm")) for f in missing):
                if has_execute_update_tool:
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
                        f"【系统表格更新物理断言拦截】：你在回复中提及已生成或更新文件 {', '.join(missing)}，但当前环境仅支持规划更新（未授权物理写入工具）。"
                        "请向用户完整汇报更新方案或计划明细，切勿声称已生成物理更新文件。"
                    )
            else:
                msg = (
                    f"【系统产物物理断言拦截】：你在回复中提及已生成或保存文件 {', '.join(missing)}，但当前沙箱物理文件并不存在。"
                    "当前任务为只读模式（未提供写盘工具），请直接在当前回复中向用户完整输出 Markdown 格式的回答正文与分析内容，切勿声称已在本地保存文件。"
                )
            return CompletionDecision("continue", msg, bumped_max_rounds, category="artifact_assertion")

    # 2. HTML 代码截断拦截
    if is_unclosed_or_truncated_html(reply_text):
        print("⚠️ [Harness HTML Truncation Guard] 检测到输出的 HTML 代码达到上限被截断，立即停止并由导出器安全闭合与明确告警...", flush=True)
        return CompletionDecision("break", None, max_rounds, category="html_truncation")

    # 2.5 虚假/未填充占位符 HTML 交付物拦截
    if not is_guide_intent and ("```html" in (reply_text or "").lower() or "<!doctype html" in (reply_text or "").lower()):
        placeholder_issue = detect_mock_or_placeholder_html(reply_text or "")
        if placeholder_issue:
            print(f"⚡ [Harness Mock Deliverable Guard] 检测到输出的 HTML 包含占位符或未计算标记 ({placeholder_issue})，正在引导模型调用工具计算真实数据...", flush=True)
            msg = (
                f"【系统真实数据交付拦截提示】：检测到你生成的 HTML 页面中包含未填充的占位数据或推脱说明（{placeholder_issue}），"
                f"并未呈现真实从附件中计算的数据结果！\n"
                f"沙箱具备完整的终端与 Python 计算环境，严禁交付空模板、0值占位或口头示意代码！\n"
                f"请立即通过 Function Calling 协议调用 `bash` 运行 Python 脚本读取相关附件（如 Excel），"
                f"完成数据过滤与聚合计算，并将真实计算出的数值与图表完整写入 HTML 代码块中落盘交付！"
            )
            return CompletionDecision("continue", msg, bumped_max_rounds, category="placeholder_html")

    # 2.8 表格数据核算零工具调用拦截
    zero_tool_issue = check_zero_tool_calculation_guard(
        reply_text=reply_text,
        last_user_prompt=last_user_prompt,
        executed_calls_history=executed_calls_history,
        execution_evidence=execution_evidence,
        is_guide_intent=is_guide_intent,
    )
    if zero_tool_issue:
        print("⚡ [Harness Zero-Tool Calculation Guard] 检测到任务涉及表格数据核算但未执行任何分析工具，正在拦截引导计算...", flush=True)
        return CompletionDecision("continue", zero_tool_issue, bumped_max_rounds, category="zero_tool_calculation")

    # 3. 契约交付物缺失断言
    has_valid_html = ("```html" in reply_text.lower()) and not is_unclosed_or_truncated_html(reply_text)
    if not is_text_only_request(last_user_prompt) and (is_generate_intent or bool(expected_deliverables)) and not is_guide_intent and not is_search_intent:
        missing_deliverable = detect_missing_requested_deliverable(
            last_user_prompt,
            start_ts,
            expected_deliverables=expected_deliverables,
            is_generate_intent=is_generate_intent,
            is_inspect_intent=is_inspect_intent,
            workspace=effective_workspace,
        )
        if not is_guide_intent and missing_deliverable:
            if missing_deliverable == ".html" and has_valid_html:
                missing_deliverable = None
            if missing_deliverable:
                print(f"⚡ [Harness Deliverable Assertion Guard] 检测到用户要求生成 {missing_deliverable} 交付物但沙箱尚未生成，正在引导执行工具落盘...", flush=True)
                if not has_bash:
                    if has_update_tools_effective and missing_deliverable in [".xlsx", ".xlsm"]:
                        if has_execute_update_tool:
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
                                f"【系统表格更新交付提示】：检测到用户要求更新 {missing_deliverable} 表格文件，但当前环境仅支持计划生成（未授权物理写入工具）。"
                                "请向用户完整输出计划明细或建议方案。"
                            )
                    else:
                        msg = (
                            f"【系统交付物提示】：当前环境为只读模式（未提供代码执行工具），"
                            f"请直接在回复中以完整的 Markdown 格式或代码块输出 {missing_deliverable} 对应的全部正文内容。"
                        )
                elif script_execution_error:
                    msg = (
                        f"【系统脚本执行提示】：检测到你在回复中提供了生成 {missing_deliverable} 的脚本代码，"
                        f"当前尚无成功的工具执行与交付记录：\n{script_execution_error}\n"
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
                return CompletionDecision("continue", msg, bumped_max_rounds, category="deliverable_missing")

    # 4. 行动垫话拦截
    if not is_guide_intent and not is_text_only_request(last_user_prompt) and is_promising_action(reply_text):
        print("⚡ [Harness Action Nudge] 检测到模型表达了后续执行意图但遗漏了工具调用，正在提醒模型执行工具...", flush=True)
        msg = "你提出了具体的行动计划，请直接使用工具函数实际执行该操作，不要仅输出口头承诺。"
        return CompletionDecision("continue", msg, bumped_max_rounds, category="promising_action")

    # 5. 消极推诿拦截
    if not is_guide_intent and detect_passive_deflection(reply_text):
        print("⚡ [Harness Anti-Deflection Guard] 检测到消极推诿向用户索要链接/上下文，正在引导调用工具执行...", flush=True)
        msg = "沙箱配备了完整的联网检索与系统终端工具，请直接调用相关工具探测解决，严禁推诿索取信息。"
        return CompletionDecision("continue", msg, bumped_max_rounds, category="passive_deflection")

    # 6. 未执行工具参数泄漏拦截
    if not is_guide_intent and detect_unexecuted_tool_argument_leak(reply_text):
        print("⚡ [Harness Tool Argument Leak Guard] 检测到模型输出了未执行的工具调用参数片段，正在拦截并引导重新调用...", flush=True)
        if telemetry:
            telemetry.record_guard("tool_argument_leak", "reject", "leaked_parameters")
        msg = (
            "【系统工具调用规范提示】：检测到你在回复中直接输出了工具参数片段（如 query / freshness 等键值对），"
            "但未通过标准 Function Calling 协议触发工具调用。口头输出参数无法执行检索或操作。"
            "若需查询信息或执行任务，请使用规范的 Function Calling 协议调用相应工具；若无需调用工具，请直接用完整自然语言向用户作答。"
        )
        return CompletionDecision("continue", msg, bumped_max_rounds, category="tool_argument_leak")

    # 7. 未执行脚本泄漏拦截
    if not is_guide_intent and not is_text_only_request(last_user_prompt) and not is_explicit_code_request(last_user_prompt) and not has_valid_html and detect_unexecuted_script_leak(reply_text):
        print("⚡ [Harness Code Output Guard] 检测到模型直接输出了未执行的代码脚本或文件写入命令，正在引导执行工具落盘...", flush=True)
        if has_bash:
            msg = "检测到你输出了未执行的代码脚本或文件写入命令。请调用 bash 工具在终端实际运行脚本完成落盘，然后再向用户汇报完成。"
        else:
            msg = "检测到你输出了代码或文件命令。当前环境为只读模式，请直接输出分析结论与解答内容，无需尝试在本地写入文件。"
        return CompletionDecision("continue", msg, bumped_max_rounds, category="script_leak")

    # 7.5 提醒虚假创建与删除断言拦截
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
        return CompletionDecision("continue", msg, bumped_max_rounds, category="reminder_claim")

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
        return CompletionDecision("continue", msg, bumped_max_rounds, category="reminder_delete")

    # 8. 检索不匹配与消极放弃拦截
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
        return CompletionDecision("continue", msg, bumped_max_rounds, category="retrieval_mismatch")

    # 9. 任务契约与指标逐项验收拦截
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
                if consecutive_comparison_errors >= 2 or round_idx >= max_rounds - 1 or (hard_ceiling and round_idx >= hard_ceiling - 1):
                    return CompletionDecision("pass", "", max_rounds, category="contract_exhausted")
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
                return CompletionDecision("continue", feedback, bumped_max_rounds, category="contract_failed")

    # 10. 历史截断标记复读/偷懒拦截
    if re.search(r'(?:因历史消息长度预算超出|中间部分已自动省略|\[内容已截断\]|CONTEXT_BUDGET)', reply_text or ''):
        print("⚡ [Harness Truncation Parroting Guard] 检测到模型在当前回复中输出截断/省略占位符，正在拦截引导输出完整结果...", flush=True)
        feedback = (
            "【系统完整性拦截提示】：检测到你的回复中包含了省略/截断标记（如‘中间部分已自动省略’或‘内容已截断’）导致回答不完整。"
            "请勿使用任何省略标记，直接向用户完整、详细地输出全部内容和结果！"
        )
        return CompletionDecision("continue", feedback, bumped_max_rounds, category="truncation_parroting")

    feedback = sampling_feedback(reply_text, last_user_prompt, messages, telemetry, execution_evidence, is_guide_intent)
    if feedback:
        return CompletionDecision("continue", feedback, bumped_max_rounds, category="sampling_feedback")

    return CompletionDecision("pass", None, max_rounds, category="all_passed")
